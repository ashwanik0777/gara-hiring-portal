import {
  ApplicationStatus,
  AttendanceStatus,
  CheckpointStatus,
  EmployeeStatus,
  EvaluationStatus,
  InterviewStatus,
  LeaveRequestStatus,
  Prisma,
  Role,
  TaskStatus,
} from "@prisma/client";
import { prisma } from "@/lib/db";
import { assertPermission, type AuthenticatedUser } from "@/lib/auth/guards";
import { ForbiddenError } from "@/lib/errors";
import { atBusinessTime, businessDateKey } from "@/lib/time/business-time";
import { toUtcDateOnly } from "@/features/attendance/services/attendance-dates";
import { addDaysToKey } from "@/features/automation/schedule";
import { describeApplicationStage } from "@/features/applications/stage-labels";
import { INTERVIEW_CLOSED_APPLICATION_STATUSES } from "@/features/recruitment/schemas";
import { RECRUITMENT_STAFF_ROLES } from "@/features/recruitment/services/application-access";
import { recruitmentService } from "@/features/recruitment/services/recruitment-service";
import { resolveEvaluationAccess } from "@/features/internship-evaluation/services/enrollment-access";

/*
 * Data for the role-specific staff overviews. Every loader authorizes on its own (role +
 * granular permission, the same rules as the matching module), reads only what its section
 * shows and never includes the viewer's own application, evaluation or leave.
 */

const DECISION_ROLES: Role[] = [Role.ADMIN, Role.HR];

/** Interview statuses that still describe a planned session. */
const PLANNED_INTERVIEW_STATUSES: InterviewStatus[] = [InterviewStatus.SCHEDULED, InterviewStatus.RESCHEDULED];

/** Evaluations that are not finalized yet. */
const OPEN_EVALUATION_STATUSES: EvaluationStatus[] = [
  EvaluationStatus.PENDING_TRIGGER,
  EvaluationStatus.IN_PROGRESS,
  EvaluationStatus.UNDER_REVIEW,
];

/** Active pipeline stages shown on the HR overview, in pipeline order. */
export const PIPELINE_SNAPSHOT_STAGES: ApplicationStatus[] = [
  ApplicationStatus.SUBMITTED,
  ApplicationStatus.SCREENING,
  ApplicationStatus.SHORTLISTED,
  ApplicationStatus.INTERVIEW_SCHEDULED,
  ApplicationStatus.INTERVIEWED,
  ApplicationStatus.EVALUATION_SELECTED,
  ApplicationStatus.OFFERED,
  ApplicationStatus.OFFER_ACCEPTED,
];

export const UPCOMING_INTERVIEW_DAYS = 7;
const LIST_LIMIT = 8;
const TEAM_LIMIT = 25;
const INTERN_LIMIT = 20;

export interface ListResult<T> {
  total: number;
  items: T[];
}

export interface StaffInterviewItem {
  id: string;
  applicationId: string;
  referenceCode: string;
  candidateName: string;
  openingTitle: string;
  roundNumber: number;
  roundName: string;
  scheduledAt: string;
  durationMinutes: number;
  meetingLink: string | null;
  interviewerName: string | null;
  hasFeedback: boolean;
}

export interface PipelineStageCount {
  status: ApplicationStatus;
  label: string;
  count: number;
}

export interface AwayTodayItem {
  id: string;
  employeeName: string;
  designation: string;
  leaveType: string;
  endDate: string;
}

export interface EvaluationCohortCounts {
  waitingToStart: number;
  inProgress: number;
  underReview: number;
}

export interface SupervisedInternItem {
  enrollmentId: string;
  internName: string;
  openingTitle: string;
  status: EvaluationStatus;
  startDate: string | null;
  checkpointsReviewed: number;
  checkpointsTotal: number;
  checkpointsToReview: number;
  tasksToReview: number;
  reportsToReview: number;
}

export type TeamMemberToday =
  | { kind: "ON_LEAVE"; leaveType: string }
  | { kind: "CHECKED_IN"; at: string }
  | { kind: "CHECKED_OUT"; at: string }
  | { kind: "MARKED"; status: AttendanceStatus }
  | { kind: "NOT_CHECKED_IN" };

export interface TeamMemberItem {
  employeeId: string;
  name: string;
  employeeCode: string;
  designation: string;
  department: string;
  status: EmployeeStatus;
  /** Null when the viewer may not see attendance or leave. */
  today: TeamMemberToday | null;
}

export interface MyTeamResult {
  /** False when no employee record is linked to the viewer, so no reporting line exists. */
  hasEmployeeRecord: boolean;
  total: number;
  members: TeamMemberItem[];
}

/** Start and end (exclusive) of the business day containing `now`, plus its key. */
function businessDayBounds(now: Date): { start: Date; end: Date; key: string } {
  const key = businessDateKey(now);
  return { key, start: atBusinessTime(key, 0), end: atBusinessTime(addDaysToKey(key, 1), 0) };
}

const interviewSelect = {
  id: true,
  roundNumber: true,
  roundName: true,
  scheduledAt: true,
  durationMinutes: true,
  meetingLink: true,
  interviewer: { select: { name: true } },
  feedback: { select: { id: true } },
  application: {
    select: {
      id: true,
      referenceCode: true,
      opening: { select: { title: true } },
      candidate: { select: { user: { select: { name: true } } } },
    },
  },
} satisfies Prisma.InterviewScheduleSelect;

type InterviewRow = Prisma.InterviewScheduleGetPayload<{ select: typeof interviewSelect }>;

function toInterviewItem(row: InterviewRow): StaffInterviewItem {
  return {
    id: row.id,
    applicationId: row.application.id,
    referenceCode: row.application.referenceCode,
    candidateName: row.application.candidate.user.name,
    openingTitle: row.application.opening.title,
    roundNumber: row.roundNumber,
    roundName: row.roundName,
    scheduledAt: row.scheduledAt.toISOString(),
    durationMinutes: row.durationMinutes,
    meetingLink: row.meetingLink,
    interviewerName: row.interviewer?.name ?? null,
    hasFeedback: Boolean(row.feedback),
  };
}

/** Interviews on applications that are still open, never the viewer's own application. */
function openApplicationFilter(user: AuthenticatedUser): Prisma.ApplicationWhereInput {
  return {
    status: { notIn: [...INTERVIEW_CLOSED_APPLICATION_STATUSES] },
    candidate: { userId: { not: user.id } },
  };
}

export class StaffDashboardService {
  /**
   * Interviews the viewer runs from the start of today up to `UPCOMING_INTERVIEW_DAYS`
   * ahead. Today's finished sessions stay listed so missing feedback is visible.
   */
  async getMyUpcomingInterviews(user: AuthenticatedUser, now: Date = new Date()): Promise<ListResult<StaffInterviewItem>> {
    await assertPermission(user, "canInterviews", { roles: RECRUITMENT_STAFF_ROLES });

    const today = businessDayBounds(now);
    const where: Prisma.InterviewScheduleWhereInput = {
      interviewerId: user.id,
      status: { in: [...PLANNED_INTERVIEW_STATUSES, InterviewStatus.COMPLETED] },
      scheduledAt: { gte: today.start, lt: atBusinessTime(addDaysToKey(today.key, UPCOMING_INTERVIEW_DAYS + 1), 0) },
      application: openApplicationFilter(user),
      // Completed sessions only matter today (feedback); later ones are planned by definition.
      OR: [{ status: { in: PLANNED_INTERVIEW_STATUSES } }, { scheduledAt: { lt: today.end } }],
    };

    const [total, rows] = await Promise.all([
      prisma.interviewSchedule.count({ where }),
      prisma.interviewSchedule.findMany({ where, orderBy: { scheduledAt: "asc" }, take: LIST_LIMIT, select: interviewSelect }),
    ]);
    return { total, items: rows.map(toInterviewItem) };
  }

  /** Every interview on today's business day, for HR and administrators. */
  async getTodaysInterviewSchedule(user: AuthenticatedUser, now: Date = new Date()): Promise<ListResult<StaffInterviewItem>> {
    await assertPermission(user, "canInterviews", { roles: DECISION_ROLES });

    const today = businessDayBounds(now);
    const where: Prisma.InterviewScheduleWhereInput = {
      status: { in: [...PLANNED_INTERVIEW_STATUSES, InterviewStatus.COMPLETED] },
      scheduledAt: { gte: today.start, lt: today.end },
      application: openApplicationFilter(user),
    };

    const [total, rows] = await Promise.all([
      prisma.interviewSchedule.count({ where }),
      prisma.interviewSchedule.findMany({ where, orderBy: { scheduledAt: "asc" }, take: LIST_LIMIT, select: interviewSelect }),
    ]);
    return { total, items: rows.map(toInterviewItem) };
  }

  /** Applications per active stage, scoped like the application queue. */
  async getPipelineSnapshot(user: AuthenticatedUser): Promise<{ total: number; stages: PipelineStageCount[] }> {
    const { counts } = await recruitmentService.getRecruitmentStatusCounts(user);
    const stages = PIPELINE_SNAPSHOT_STAGES.map((status) => ({
      status,
      label: describeApplicationStage(status),
      count: counts[status] ?? 0,
    }));
    return { total: stages.reduce((sum, stage) => sum + stage.count, 0), stages };
  }

  /** People on approved leave today (leave dates are UTC calendar days). */
  async getAwayToday(user: AuthenticatedUser, now: Date = new Date()): Promise<ListResult<AwayTodayItem>> {
    await assertPermission(user, "canLeave");

    const today = toUtcDateOnly(now);
    const where: Prisma.LeaveRequestWhereInput = {
      status: LeaveRequestStatus.APPROVED,
      startDate: { lte: today },
      endDate: { gte: today },
      employee: { status: { not: EmployeeStatus.EXITED } },
    };

    const [total, rows] = await Promise.all([
      prisma.leaveRequest.count({ where }),
      prisma.leaveRequest.findMany({
        where,
        orderBy: { endDate: "asc" },
        take: LIST_LIMIT,
        select: {
          id: true,
          endDate: true,
          leaveType: { select: { name: true } },
          employee: { select: { designation: true, user: { select: { name: true } } } },
        },
      }),
    ]);

    return {
      total,
      items: rows.map((row) => ({
        id: row.id,
        employeeName: row.employee.user.name,
        designation: row.employee.designation,
        leaveType: row.leaveType.name,
        endDate: row.endDate.toISOString(),
      })),
    };
  }

  /** Open evaluations by status, for staff who may see every enrollment. */
  async getEvaluationCohort(user: AuthenticatedUser): Promise<EvaluationCohortCounts> {
    const access = await resolveEvaluationAccess(user);
    if (access?.scope !== "ALL") {
      throw new ForbiddenError("Administrative or HR authorization is required to view all evaluations.");
    }

    const groups = await prisma.internshipEnrollment.groupBy({
      by: ["status"],
      where: { status: { in: OPEN_EVALUATION_STATUSES }, userId: { not: user.id } },
      _count: { status: true },
    });
    const count = (status: EvaluationStatus) => groups.find((group) => group.status === status)?._count.status ?? 0;

    return {
      waitingToStart: count(EvaluationStatus.PENDING_TRIGGER),
      inProgress: count(EvaluationStatus.IN_PROGRESS),
      underReview: count(EvaluationStatus.UNDER_REVIEW),
    };
  }

  /** Open evaluations the viewer supervises, with the reviews waiting for them. */
  async getMySupervisedInterns(user: AuthenticatedUser): Promise<ListResult<SupervisedInternItem>> {
    const access = await resolveEvaluationAccess(user);
    if (!access) {
      throw new ForbiddenError("You do not have permission to view internship evaluations.");
    }

    const where: Prisma.InternshipEnrollmentWhereInput = {
      supervisorId: user.id,
      userId: { not: user.id },
      status: { in: OPEN_EVALUATION_STATUSES },
    };

    const [total, rows] = await Promise.all([
      prisma.internshipEnrollment.count({ where }),
      prisma.internshipEnrollment.findMany({
        where,
        orderBy: [{ startDate: "asc" }, { createdAt: "asc" }],
        take: INTERN_LIMIT,
        select: {
          id: true,
          status: true,
          startDate: true,
          user: { select: { name: true } },
          application: { select: { opening: { select: { title: true } } } },
          // At most seven checkpoints per evaluation, so their statuses are read directly.
          checkpoints: { select: { status: true } },
          _count: {
            select: {
              tasks: { where: { status: TaskStatus.SUBMITTED } },
              progressReports: { where: { reviewedAt: null } },
            },
          },
        },
      }),
    ]);

    return {
      total,
      items: rows.map((row) => ({
        enrollmentId: row.id,
        internName: row.user.name,
        openingTitle: row.application.opening.title,
        status: row.status,
        startDate: row.startDate?.toISOString() ?? null,
        checkpointsReviewed: row.checkpoints.filter((checkpoint) => checkpoint.status === CheckpointStatus.REVIEWED).length,
        checkpointsTotal: row.checkpoints.length,
        checkpointsToReview: row.checkpoints.filter((checkpoint) => checkpoint.status === CheckpointStatus.SUBMITTED).length,
        tasksToReview: row._count.tasks,
        reportsToReview: row._count.progressReports,
      })),
    };
  }

  /**
   * The viewer's direct reports (reporting line on the employee records). Today's leave and
   * attendance are added only when the viewer also holds the leave or attendance permission.
   */
  async getMyTeam(user: AuthenticatedUser, now: Date = new Date()): Promise<MyTeamResult> {
    const permissions = await assertPermission(user, "canEmployees");

    const self = await prisma.employee.findUnique({ where: { userId: user.id }, select: { id: true } });
    if (!self) {
      return { hasEmployeeRecord: false, total: 0, members: [] };
    }

    const where: Prisma.EmployeeWhereInput = {
      managerId: self.id,
      status: { not: EmployeeStatus.EXITED },
      userId: { not: user.id },
    };
    const [total, rows] = await Promise.all([
      prisma.employee.count({ where }),
      prisma.employee.findMany({
        where,
        orderBy: { user: { name: "asc" } },
        take: TEAM_LIMIT,
        select: {
          id: true,
          employeeCode: true,
          designation: true,
          department: true,
          status: true,
          user: { select: { name: true } },
        },
      }),
    ]);

    const ids = rows.map((row) => row.id);
    const today = toUtcDateOnly(now);
    const [leaves, attendance] = await Promise.all([
      permissions.canLeave && ids.length > 0
        ? prisma.leaveRequest.findMany({
            where: {
              employeeId: { in: ids },
              status: LeaveRequestStatus.APPROVED,
              startDate: { lte: today },
              endDate: { gte: today },
            },
            select: { employeeId: true, leaveType: { select: { name: true } } },
          })
        : Promise.resolve([]),
      permissions.canAttendance && ids.length > 0
        ? prisma.attendanceRecord.findMany({
            where: { employeeId: { in: ids }, date: today },
            select: { employeeId: true, status: true, checkInTime: true, checkOutTime: true },
          })
        : Promise.resolve([]),
    ]);

    const leaveByEmployee = new Map(leaves.map((leave) => [leave.employeeId, leave.leaveType.name]));
    const attendanceByEmployee = new Map(attendance.map((record) => [record.employeeId, record]));
    const showsToday = permissions.canLeave || permissions.canAttendance;

    const members = rows.map((row): TeamMemberItem => {
      let todayState: TeamMemberToday | null = null;
      if (showsToday) {
        const leaveType = leaveByEmployee.get(row.id);
        const record = attendanceByEmployee.get(row.id);
        if (leaveType) {
          todayState = { kind: "ON_LEAVE", leaveType };
        } else if (record?.checkOutTime) {
          todayState = { kind: "CHECKED_OUT", at: record.checkOutTime.toISOString() };
        } else if (record?.checkInTime) {
          todayState = { kind: "CHECKED_IN", at: record.checkInTime.toISOString() };
        } else if (record) {
          todayState = { kind: "MARKED", status: record.status };
        } else if (permissions.canAttendance) {
          todayState = { kind: "NOT_CHECKED_IN" };
        }
      }
      return {
        employeeId: row.id,
        name: row.user.name,
        employeeCode: row.employeeCode,
        designation: row.designation,
        department: row.department,
        status: row.status,
        today: todayState,
      };
    });

    return { hasEmployeeRecord: true, total, members };
  }

  /** True when the viewer has an employee record that is not exited (own attendance and leave). */
  async hasActiveEmployeeRecord(userId: string): Promise<boolean> {
    const record = await prisma.employee.findUnique({ where: { userId }, select: { status: true } });
    return Boolean(record && record.status !== EmployeeStatus.EXITED);
  }
}

export const staffDashboardService = new StaffDashboardService();
