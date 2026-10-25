import {
  ApplicationStatus,
  CheckpointStatus,
  ConversionOfferStatus,
  ConversionReviewOutcome,
  ConversionReviewStatus,
  EvaluationStatus,
  InterviewStatus,
  LeaveRequestStatus,
  OfferStatus,
  Prisma,
  RegularizationStatus,
  Role,
} from "@prisma/client";
import { prisma } from "@/lib/db";
import type { AuthenticatedUser } from "@/lib/auth/guards";
import { getUserPermissions, type SubAdminPermissions } from "@/lib/auth/permissions";
import { logger } from "@/lib/logging/logger";
import { BUSINESS_TIME_ZONE, businessDateKey } from "@/lib/time/business-time";
import { RECRUITMENT_STAFF_ROLES } from "@/features/recruitment/services/application-access";
import {
  resolveEvaluationAccess,
  type EvaluationAccess,
} from "@/features/internship-evaluation/services/enrollment-access";
import { addDaysToKey, calendarDayKey, utcMidnight } from "../schedule";
import { hasStaffRole, staffPortalBase } from "../staff-recipients";
import type {
  ActionCenterItem,
  ActionCenterResult,
  ActionCenterSection,
  ActionCenterSectionKey,
} from "../types";

/** Roles with recruitment, evaluation and employee decision authority (HR and Admin). */
const DECISION_ROLES: Role[] = [Role.ADMIN, Role.HR];

/** Number of example items shown per section. */
export const ACTION_CENTER_TOP_ITEMS = 3;

/** Interviews that still need feedback once their start time has passed. */
const FEEDBACK_PENDING_INTERVIEW_STATUSES: InterviewStatus[] = [
  InterviewStatus.SCHEDULED,
  InterviewStatus.RESCHEDULED,
  InterviewStatus.COMPLETED,
];

interface ActionCenterContext {
  user: AuthenticatedUser;
  permissions: SubAdminPermissions;
  evaluationAccess: EvaluationAccess | null;
  isDecisionMaker: boolean;
  base: string;
  now: Date;
  /** Today's business date (`YYYY-MM-DD`). */
  todayKey: string;
  includeItems: boolean;
}

interface SectionLoad {
  count: number;
  items: ActionCenterItem[];
}

interface SectionDefinition {
  key: ActionCenterSectionKey;
  title: string;
  description: string;
  /** Page path below the portal root (e.g. "/leave"). */
  path: string;
  allowed: (ctx: ActionCenterContext) => boolean;
  load: (ctx: ActionCenterContext) => Promise<SectionLoad>;
}

const calendarDayFormat = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

function businessDayFormat(): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: BUSINESS_TIME_ZONE,
  });
}

function businessDateTimeFormat(): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: BUSINESS_TIME_ZONE,
  });
}

/** A calendar day stored at UTC midnight (leave dates, review dates, effective dates). */
function formatCalendarDay(date: Date | null): string {
  return date ? calendarDayFormat.format(date) : "date not set";
}

/** An instant (e.g. when something was submitted), shown as a business-time date. */
function formatBusinessDay(date: Date): string {
  return businessDayFormat().format(date);
}

/** Runs the count and, when requested, the small top-items query in parallel. */
async function countWithTop<T>(
  ctx: ActionCenterContext,
  count: () => Promise<number>,
  top: () => Promise<T[]>,
  toItem: (row: T) => ActionCenterItem
): Promise<SectionLoad> {
  const [total, rows] = await Promise.all([count(), ctx.includeItems ? top() : Promise.resolve<T[]>([])]);
  return { count: total, items: rows.map(toItem) };
}

/** Staff never see their own records in their work queues (separation of duties). */
function notOwnApplication(user: AuthenticatedUser): Prisma.ApplicationWhereInput {
  return { candidate: { userId: { not: user.id } } };
}

const SECTIONS: SectionDefinition[] = [
  {
    key: "applicationsAwaitingScreening",
    title: "Applications awaiting screening",
    description: "New applications that have not been screened yet.",
    path: "/applications?status=SUBMITTED",
    allowed: (ctx) => ctx.isDecisionMaker && ctx.permissions.canApplications,
    load: (ctx) => {
      const where: Prisma.ApplicationWhereInput = {
        status: ApplicationStatus.SUBMITTED,
        isArchived: false,
        ...notOwnApplication(ctx.user),
      };
      return countWithTop(
        ctx,
        () => prisma.application.count({ where }),
        () =>
          prisma.application.findMany({
            where,
            orderBy: { createdAt: "asc" },
            take: ACTION_CENTER_TOP_ITEMS,
            select: {
              id: true,
              createdAt: true,
              opening: { select: { title: true } },
              candidate: { select: { user: { select: { name: true } } } },
            },
          }),
        (row) => ({
          id: row.id,
          label: row.candidate.user.name,
          detail: `${row.opening.title} · applied ${formatBusinessDay(row.createdAt)}`,
          href: `${ctx.base}/applications/${row.id}`,
        })
      );
    },
  },
  {
    key: "interviewsAwaitingFeedback",
    title: "Interviews awaiting feedback",
    description: "Interviews that have taken place without recorded feedback.",
    path: "/interviews",
    allowed: (ctx) =>
      ctx.user.roles.some((role) => RECRUITMENT_STAFF_ROLES.includes(role)) && ctx.permissions.canInterviews,
    load: (ctx) => {
      const where: Prisma.InterviewScheduleWhereInput = {
        status: { in: FEEDBACK_PENDING_INTERVIEW_STATUSES },
        scheduledAt: { lte: ctx.now },
        feedback: { is: null },
        application: notOwnApplication(ctx.user),
        // HR and Admin may record feedback for any round; everyone else only for their own.
        ...(ctx.isDecisionMaker ? {} : { interviewerId: ctx.user.id }),
      };
      const dateTime = businessDateTimeFormat();
      return countWithTop(
        ctx,
        () => prisma.interviewSchedule.count({ where }),
        () =>
          prisma.interviewSchedule.findMany({
            where,
            orderBy: { scheduledAt: "asc" },
            take: ACTION_CENTER_TOP_ITEMS,
            select: {
              id: true,
              roundName: true,
              scheduledAt: true,
              application: { select: { candidate: { select: { user: { select: { name: true } } } } } },
            },
          }),
        (row) => ({
          id: row.id,
          label: row.application.candidate.user.name,
          detail: `${row.roundName} · ${dateTime.format(row.scheduledAt)}`,
          href: `${ctx.base}/interviews`,
        })
      );
    },
  },
  {
    key: "checkpointsAwaitingReview",
    title: "Checkpoints awaiting review",
    description: "Evaluation checkpoints interns have submitted for review.",
    path: "/evaluations",
    allowed: (ctx) => ctx.evaluationAccess !== null,
    load: (ctx) => {
      const where: Prisma.EvaluationCheckpointWhereInput = {
        status: CheckpointStatus.SUBMITTED,
        enrollment: {
          status: EvaluationStatus.IN_PROGRESS,
          userId: { not: ctx.user.id },
          ...(ctx.evaluationAccess?.scope === "ALL" ? {} : { supervisorId: ctx.user.id }),
        },
      };
      return countWithTop(
        ctx,
        () => prisma.evaluationCheckpoint.count({ where }),
        () =>
          prisma.evaluationCheckpoint.findMany({
            where,
            orderBy: { updatedAt: "asc" },
            take: ACTION_CENTER_TOP_ITEMS,
            select: {
              id: true,
              dayNumber: true,
              title: true,
              enrollmentId: true,
              enrollment: { select: { user: { select: { name: true } } } },
            },
          }),
        (row) => ({
          id: row.id,
          label: row.enrollment.user.name,
          detail: `Day ${row.dayNumber}: ${row.title}`,
          href: `${ctx.base}/evaluations/${row.enrollmentId}`,
        })
      );
    },
  },
  {
    key: "evaluationsAwaitingDecision",
    title: "Evaluations awaiting a final decision",
    description: "Evaluations under review that need a recorded outcome.",
    path: "/evaluations",
    allowed: (ctx) => ctx.evaluationAccess?.scope === "ALL",
    load: (ctx) => {
      const where: Prisma.InternshipEnrollmentWhereInput = {
        status: EvaluationStatus.UNDER_REVIEW,
        userId: { not: ctx.user.id },
      };
      return countWithTop(
        ctx,
        () => prisma.internshipEnrollment.count({ where }),
        () =>
          prisma.internshipEnrollment.findMany({
            where,
            orderBy: { updatedAt: "asc" },
            take: ACTION_CENTER_TOP_ITEMS,
            select: {
              id: true,
              user: { select: { name: true } },
              application: { select: { opening: { select: { title: true } } } },
            },
          }),
        (row) => ({
          id: row.id,
          label: row.user.name,
          detail: row.application.opening.title,
          href: `${ctx.base}/evaluations/${row.id}`,
        })
      );
    },
  },
  {
    key: "passedAwaitingJoining",
    title: "Passed evaluations awaiting joining",
    description: "Interns who passed their evaluation and have not been marked as joined.",
    path: "/evaluations",
    allowed: (ctx) => ctx.isDecisionMaker && ctx.permissions.canEmployees,
    load: (ctx) => {
      const where: Prisma.InternshipEnrollmentWhereInput = {
        status: EvaluationStatus.PASSED,
        userId: { not: ctx.user.id },
        application: { status: ApplicationStatus.EVALUATION_SELECTED, isArchived: false },
      };
      return countWithTop(
        ctx,
        () => prisma.internshipEnrollment.count({ where }),
        () =>
          prisma.internshipEnrollment.findMany({
            where,
            orderBy: { evaluatedAt: "asc" },
            take: ACTION_CENTER_TOP_ITEMS,
            select: {
              id: true,
              evaluatedAt: true,
              user: { select: { name: true } },
              application: { select: { opening: { select: { title: true } } } },
            },
          }),
        (row) => ({
          id: row.id,
          label: row.user.name,
          detail: row.evaluatedAt
            ? `${row.application.opening.title} · passed ${formatBusinessDay(row.evaluatedAt)}`
            : row.application.opening.title,
          href: `${ctx.base}/evaluations/${row.id}`,
        })
      );
    },
  },
  {
    key: "offersAwaitingResponse",
    title: "Offers awaiting the candidate's response",
    description: "Job offers that have been extended and not yet answered.",
    path: "/applications?status=OFFERED",
    allowed: (ctx) => ctx.isDecisionMaker && ctx.permissions.canEmployees,
    load: (ctx) => {
      const where: Prisma.JobOfferWhereInput = {
        status: OfferStatus.EXTENDED,
        application: notOwnApplication(ctx.user),
      };
      return countWithTop(
        ctx,
        () => prisma.jobOffer.count({ where }),
        () =>
          prisma.jobOffer.findMany({
            where,
            orderBy: { extendedAt: "asc" },
            take: ACTION_CENTER_TOP_ITEMS,
            select: {
              id: true,
              designation: true,
              extendedAt: true,
              applicationId: true,
              application: { select: { candidate: { select: { user: { select: { name: true } } } } } },
            },
          }),
        (row) => ({
          id: row.id,
          label: row.application.candidate.user.name,
          detail: row.extendedAt
            ? `${row.designation} · extended ${formatBusinessDay(row.extendedAt)}`
            : row.designation,
          href: `${ctx.base}/applications/${row.applicationId}`,
        })
      );
    },
  },
  {
    key: "acceptedOffersAwaitingJoining",
    title: "Accepted offers awaiting joining",
    description: "Candidates who accepted an offer and have not been marked as joined.",
    path: "/applications?status=OFFER_ACCEPTED",
    allowed: (ctx) => ctx.isDecisionMaker && ctx.permissions.canEmployees,
    load: (ctx) => {
      const where: Prisma.ApplicationWhereInput = {
        status: ApplicationStatus.OFFER_ACCEPTED,
        isArchived: false,
        ...notOwnApplication(ctx.user),
      };
      return countWithTop(
        ctx,
        () => prisma.application.count({ where }),
        () =>
          prisma.application.findMany({
            where,
            orderBy: { updatedAt: "asc" },
            take: ACTION_CENTER_TOP_ITEMS,
            select: {
              id: true,
              opening: { select: { title: true } },
              candidate: { select: { user: { select: { name: true } } } },
              jobOffer: { select: { expectedJoiningDate: true } },
            },
          }),
        (row) => ({
          id: row.id,
          label: row.candidate.user.name,
          detail: row.jobOffer
            ? `${row.opening.title} · joining ${formatCalendarDay(row.jobOffer.expectedJoiningDate)}`
            : row.opening.title,
          href: `${ctx.base}/applications/${row.id}`,
        })
      );
    },
  },
  {
    key: "internReviewsDue",
    title: "Intern progress reviews due",
    description: "Scheduled intern progress reviews that are due today or overdue.",
    path: "/intern-reviews",
    allowed: (ctx) => ctx.isDecisionMaker && ctx.permissions.canEmployees,
    load: (ctx) => {
      const tomorrow = utcMidnight(addDaysToKey(ctx.todayKey, 1));
      const where: Prisma.ConversionReviewWhereInput = {
        status: ConversionReviewStatus.SCHEDULED,
        scheduledFor: { lt: tomorrow },
        employee: { userId: { not: ctx.user.id } },
      };
      return countWithTop(
        ctx,
        () => prisma.conversionReview.count({ where }),
        () =>
          prisma.conversionReview.findMany({
            where,
            orderBy: { scheduledFor: "asc" },
            take: ACTION_CENTER_TOP_ITEMS,
            select: {
              id: true,
              scheduledFor: true,
              employee: { select: { user: { select: { name: true } } } },
            },
          }),
        (row) => {
          const overdue = calendarDayKey(row.scheduledFor) < ctx.todayKey;
          return {
            id: row.id,
            label: row.employee.user.name,
            detail: overdue
              ? `Overdue since ${formatCalendarDay(row.scheduledFor)}`
              : "Due today",
            href: `${ctx.base}/intern-reviews`,
            overdue,
          };
        }
      );
    },
  },
  {
    key: "conversionsPendingEffectiveDate",
    title: "Accepted conversions pending effective date",
    description: "Accepted full-time offers that take effect automatically on their effective date.",
    path: "/intern-reviews",
    allowed: (ctx) => ctx.isDecisionMaker && ctx.permissions.canEmployees,
    load: (ctx) => {
      const where: Prisma.ConversionReviewWhereInput = {
        outcome: ConversionReviewOutcome.CONVERT,
        offerStatus: ConversionOfferStatus.ACCEPTED,
        convertedAt: null,
        employee: { userId: { not: ctx.user.id } },
      };
      return countWithTop(
        ctx,
        () => prisma.conversionReview.count({ where }),
        () =>
          prisma.conversionReview.findMany({
            where,
            orderBy: { proposedEffectiveDate: "asc" },
            take: ACTION_CENTER_TOP_ITEMS,
            select: {
              id: true,
              employeeId: true,
              proposedDesignation: true,
              proposedEffectiveDate: true,
              employee: { select: { user: { select: { name: true } } } },
            },
          }),
        (row) => ({
          id: row.id,
          label: row.employee.user.name,
          detail: `${row.proposedDesignation ?? "Full-time role"} · from ${formatCalendarDay(row.proposedEffectiveDate)}`,
          href: `${ctx.base}/employees/${row.employeeId}`,
        })
      );
    },
  },
  {
    key: "leaveRequestsPending",
    title: "Leave requests pending",
    description: "Leave requests waiting for a review.",
    path: "/leave",
    allowed: (ctx) => ctx.permissions.canLeave,
    load: (ctx) => {
      const where: Prisma.LeaveRequestWhereInput = {
        status: LeaveRequestStatus.PENDING,
        employee: { userId: { not: ctx.user.id } },
      };
      return countWithTop(
        ctx,
        () => prisma.leaveRequest.count({ where }),
        () =>
          prisma.leaveRequest.findMany({
            where,
            orderBy: { createdAt: "asc" },
            take: ACTION_CENTER_TOP_ITEMS,
            select: {
              id: true,
              startDate: true,
              endDate: true,
              leaveType: { select: { name: true } },
              employee: { select: { user: { select: { name: true } } } },
            },
          }),
        (row) => {
          const start = formatCalendarDay(row.startDate);
          const end = formatCalendarDay(row.endDate);
          return {
            id: row.id,
            label: row.employee.user.name,
            detail: `${row.leaveType.name} · ${start === end ? start : `${start} – ${end}`}`,
            href: `${ctx.base}/leave`,
          };
        }
      );
    },
  },
  {
    key: "regularizationsPending",
    title: "Attendance corrections pending",
    description: "Attendance regularization requests waiting for a review.",
    path: "/attendance",
    allowed: (ctx) => ctx.permissions.canAttendance,
    load: (ctx) => {
      const where: Prisma.AttendanceRegularizationWhereInput = {
        status: RegularizationStatus.PENDING,
        employee: { userId: { not: ctx.user.id } },
      };
      return countWithTop(
        ctx,
        () => prisma.attendanceRegularization.count({ where }),
        () =>
          prisma.attendanceRegularization.findMany({
            where,
            orderBy: { createdAt: "asc" },
            take: ACTION_CENTER_TOP_ITEMS,
            select: {
              id: true,
              attendanceRecord: { select: { date: true } },
              employee: { select: { user: { select: { name: true } } } },
            },
          }),
        (row) => ({
          id: row.id,
          label: row.employee.user.name,
          detail: `Correction for ${formatCalendarDay(row.attendanceRecord.date)}`,
          href: `${ctx.base}/attendance`,
        })
      );
    },
  },
];

export interface ActionCenterOptions {
  now?: Date;
  /** Portal root for links; defaults to /admin for administrators and /subadmin otherwise. */
  portalBase?: string;
  /** False skips the top-items queries (the daily digest only needs counts). */
  includeItems?: boolean;
}

/**
 * Pending work for one staff member. Each section is included only when the viewer holds
 * the role and granular permission needed to act on it, and every query is scoped the same
 * way the matching workspace is (e.g. supervisors only see their own interns, nobody sees
 * their own application or request). A section whose query fails is returned as
 * "unavailable" instead of a misleading zero.
 */
export async function getActionCenter(
  user: AuthenticatedUser,
  options: ActionCenterOptions = {}
): Promise<ActionCenterResult> {
  if (!hasStaffRole(user.roles)) {
    return { sections: [], totalCount: 0 };
  }

  const now = options.now ?? new Date();
  const [permissions, evaluationAccess] = await Promise.all([
    getUserPermissions(user.id, user.roles),
    resolveEvaluationAccess(user),
  ]);

  const ctx: ActionCenterContext = {
    user,
    permissions,
    evaluationAccess,
    isDecisionMaker: user.roles.some((role) => DECISION_ROLES.includes(role)),
    base: options.portalBase ?? staffPortalBase(user.roles),
    now,
    todayKey: businessDateKey(now),
    includeItems: options.includeItems ?? true,
  };

  const visible = SECTIONS.filter((section) => section.allowed(ctx));
  const sections = await Promise.all(
    visible.map(async (section): Promise<ActionCenterSection> => {
      const base = {
        key: section.key,
        title: section.title,
        description: section.description,
        href: `${ctx.base}${section.path}`,
      };
      try {
        const loaded = await section.load(ctx);
        return { ...base, status: "ok", count: loaded.count, items: loaded.items };
      } catch (error) {
        logger.error("Action Center section could not be loaded", error, { section: section.key });
        return { ...base, status: "unavailable" };
      }
    })
  );

  const totalCount = sections.reduce((sum, section) => sum + (section.status === "ok" ? section.count : 0), 0);
  return { sections, totalCount };
}
