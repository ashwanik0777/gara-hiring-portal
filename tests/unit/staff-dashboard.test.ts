import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  ApplicationStatus,
  AttendanceStatus,
  CheckpointStatus,
  EmployeeStatus,
  EvaluationStatus,
  InterviewStatus,
  Role,
  TaskStatus,
} from "@prisma/client";

const { db } = vi.hoisted(() => {
  const fn = () => vi.fn();
  return {
    db: {
      subAdminPermission: { findUnique: fn() },
      interviewSchedule: { count: fn(), findMany: fn() },
      internshipEnrollment: { count: fn(), findMany: fn(), groupBy: fn() },
      employee: { findUnique: fn(), count: fn(), findMany: fn() },
      leaveRequest: { count: fn(), findMany: fn() },
      attendanceRecord: { findMany: fn() },
      application: { groupBy: fn() },
    },
  };
});

vi.mock("@/lib/db", () => ({ prisma: db }));

import { ForbiddenError } from "@/lib/errors";
import type { AuthenticatedUser } from "@/lib/auth/guards";
import {
  DEFAULT_HR_PERMISSIONS,
  DEFAULT_MANAGER_PERMISSIONS,
  DEFAULT_MENTOR_PERMISSIONS,
  type SubAdminPermissions,
} from "@/lib/auth/permissions";
import {
  getStaffModuleAccess,
  getStaffWorkspaces,
  listAccessibleStaffModules,
} from "@/features/staff-dashboard/workspace";
import { staffDashboardService } from "@/features/staff-dashboard/services/staff-dashboard-service";
import {
  MyInterviewsSection,
  SupervisedInternsSection,
} from "@/features/staff-dashboard/components/staff-dashboard-sections";

const NOW = new Date("2026-10-26T06:00:00.000Z"); // 11:30 in Asia/Kolkata
const TODAY_START = new Date("2026-10-25T18:30:00.000Z");
const TODAY_END = new Date("2026-10-26T18:30:00.000Z");

function staff(id: string, roles: Role[]): AuthenticatedUser {
  return { id, email: `${id}@example.com`, name: `${id} Staff`, roles };
}

const NO_PERMISSIONS: SubAdminPermissions = {
  canApplications: false,
  canOpenings: false,
  canInterviews: false,
  canEvaluations: false,
  canEmployees: false,
  canAttendance: false,
  canLeave: false,
  canPayroll: false,
  canReports: false,
  canManageSubAdmins: false,
};

const customPermissions = new Map<string, Partial<SubAdminPermissions>>();

beforeEach(() => {
  vi.resetAllMocks();
  customPermissions.clear();
  db.subAdminPermission.findUnique.mockImplementation(async (args: { where: { userId: string } }) => {
    const custom = customPermissions.get(args.where.userId);
    return custom ? { id: "perm", userId: args.where.userId, ...NO_PERMISSIONS, ...custom } : null;
  });
});

describe("Staff workspaces and module access", () => {
  it("orders workspaces by seniority and shows administrators the HR workspace", () => {
    expect(getStaffWorkspaces([Role.MENTOR, Role.INTERVIEWER, Role.MANAGER])).toEqual(["MANAGER", "INTERVIEWER", "MENTOR"]);
    expect(getStaffWorkspaces([Role.ADMIN])).toEqual(["HR"]);
    expect(getStaffWorkspaces([Role.CANDIDATE])).toEqual([]);
  });

  it("hides modules whose service would refuse the role, even with the permission granted", () => {
    const everything = { ...NO_PERMISSIONS, canApplications: true, canInterviews: true, canEvaluations: true, canPayroll: true };
    const mentor = getStaffModuleAccess([Role.MENTOR], everything);
    expect(mentor.applications).toBe(false);
    expect(mentor.interviews).toBe(false);
    expect(mentor.payroll).toBe(false);
    expect(mentor.evaluations).toBe(true);

    const manager = getStaffModuleAccess([Role.MANAGER], { ...DEFAULT_MANAGER_PERMISSIONS, canPayroll: true });
    expect(manager.payroll).toBe(false);
    expect(manager.applications).toBe(true);

    const hr = getStaffModuleAccess([Role.HR], { ...DEFAULT_HR_PERMISSIONS, canPayroll: true });
    expect(hr.payroll).toBe(true);
  });

  it("lists only the mentor's evaluation module with the default mentor permissions", () => {
    const modules = listAccessibleStaffModules(getStaffModuleAccess([Role.MENTOR], DEFAULT_MENTOR_PERMISSIONS));
    expect(modules.map((module) => module.key)).toEqual(["evaluations"]);
  });
});

function interviewRow(overrides: Partial<{ id: string; scheduledAt: Date; feedback: { id: string } | null }> = {}) {
  return {
    id: overrides.id ?? "int-1",
    roundNumber: 2,
    roundName: "Technical",
    scheduledAt: overrides.scheduledAt ?? new Date("2026-10-26T09:00:00.000Z"),
    durationMinutes: 45,
    meetingLink: "https://meet.example.com/abc",
    interviewer: { name: "Ravi Interviewer" },
    feedback: overrides.feedback ?? null,
    application: {
      id: "app-1",
      referenceCode: "GARA-2026-APP-0001",
      opening: { title: "Frontend Intern" },
      candidate: { user: { name: "Asha Candidate" } },
    },
  };
}

describe("Interviewer overview data", () => {
  it("lists only the viewer's own interviews on open applications, from the start of today", async () => {
    db.interviewSchedule.count.mockResolvedValue(1);
    db.interviewSchedule.findMany.mockResolvedValue([interviewRow()]);

    const result = await staffDashboardService.getMyUpcomingInterviews(staff("iv-1", [Role.INTERVIEWER]), NOW);

    const where = db.interviewSchedule.findMany.mock.calls[0][0].where;
    expect(where.interviewerId).toBe("iv-1");
    expect(where.scheduledAt.gte).toEqual(TODAY_START);
    expect(where.application.candidate).toEqual({ userId: { not: "iv-1" } });
    expect(where.application.status.notIn).toEqual(
      expect.arrayContaining([ApplicationStatus.REJECTED, ApplicationStatus.WITHDRAWN, ApplicationStatus.HIRED])
    );
    expect(result).toEqual({
      total: 1,
      items: [
        expect.objectContaining({
          applicationId: "app-1",
          candidateName: "Asha Candidate",
          roundName: "Technical",
          hasFeedback: false,
        }),
      ],
    });
  });

  it("refuses mentors, whose role cannot open interviews", async () => {
    customPermissions.set("mentor-1", { canInterviews: true, canEvaluations: true });
    await expect(
      staffDashboardService.getMyUpcomingInterviews(staff("mentor-1", [Role.MENTOR]), NOW)
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(db.interviewSchedule.findMany).not.toHaveBeenCalled();
  });

  it("limits the whole-day schedule to HR and administrators, bounded to today's business day", async () => {
    await expect(
      staffDashboardService.getTodaysInterviewSchedule(staff("iv-1", [Role.INTERVIEWER]), NOW)
    ).rejects.toBeInstanceOf(ForbiddenError);

    db.interviewSchedule.count.mockResolvedValue(0);
    db.interviewSchedule.findMany.mockResolvedValue([]);
    await staffDashboardService.getTodaysInterviewSchedule(staff("hr-1", [Role.HR]), NOW);
    const where = db.interviewSchedule.findMany.mock.calls[0][0].where;
    expect(where.scheduledAt).toEqual({ gte: TODAY_START, lt: TODAY_END });
    expect(where.interviewerId).toBeUndefined();
  });

  it("marks finished interviews without feedback and offers the meeting link only before they end", async () => {
    db.interviewSchedule.count.mockResolvedValue(2);
    db.interviewSchedule.findMany.mockResolvedValue([
      interviewRow({ id: "past", scheduledAt: new Date("2026-10-26T03:00:00.000Z") }),
      interviewRow({ id: "later", scheduledAt: new Date("2026-10-26T09:00:00.000Z") }),
    ]);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    try {
      render(await MyInterviewsSection({ user: staff("iv-1", [Role.INTERVIEWER]), base: "/subadmin" }));
    } finally {
      vi.useRealTimers();
    }

    expect(screen.getByRole("heading", { name: "My interviews" })).toBeTruthy();
    expect(screen.getByText("Feedback due")).toBeTruthy();
    expect(screen.getAllByRole("link", { name: /Join the meeting/ })).toHaveLength(1);
    expect(screen.getAllByRole("link", { name: "Open the application of Asha Candidate" })[0].getAttribute("href")).toBe(
      "/subadmin/applications/app-1"
    );
  });

  it("hides the interviews section for roles that may not use it", async () => {
    customPermissions.set("mentor-1", { canEvaluations: true });
    expect(await MyInterviewsSection({ user: staff("mentor-1", [Role.MENTOR]), base: "/subadmin" })).toBeNull();
  });
});

describe("Mentor overview data", () => {
  it("lists only evaluations the viewer supervises, with what waits for their review", async () => {
    db.internshipEnrollment.count.mockResolvedValue(1);
    db.internshipEnrollment.findMany.mockResolvedValue([
      {
        id: "enr-1",
        status: EvaluationStatus.IN_PROGRESS,
        startDate: new Date("2026-10-20T00:00:00.000Z"),
        user: { name: "Neha Intern" },
        application: { opening: { title: "Data Intern" } },
        checkpoints: [
          { status: CheckpointStatus.REVIEWED },
          { status: CheckpointStatus.SUBMITTED },
          { status: CheckpointStatus.PENDING },
        ],
        _count: { tasks: 2, progressReports: 1 },
      },
    ]);

    const result = await staffDashboardService.getMySupervisedInterns(staff("mentor-1", [Role.MENTOR]));

    const args = db.internshipEnrollment.findMany.mock.calls[0][0];
    expect(args.where).toEqual(
      expect.objectContaining({ supervisorId: "mentor-1", userId: { not: "mentor-1" } })
    );
    expect(args.select._count.select.tasks).toEqual({ where: { status: TaskStatus.SUBMITTED } });
    expect(result.items[0]).toEqual(
      expect.objectContaining({
        internName: "Neha Intern",
        checkpointsReviewed: 1,
        checkpointsTotal: 3,
        checkpointsToReview: 1,
        tasksToReview: 2,
        reportsToReview: 1,
      })
    );
  });

  it("refuses staff without evaluation access", async () => {
    customPermissions.set("mentor-2", { canEvaluations: false });
    await expect(
      staffDashboardService.getMySupervisedInterns(staff("mentor-2", [Role.MENTOR]))
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("keeps the whole evaluation cohort for HR and administrators", async () => {
    await expect(staffDashboardService.getEvaluationCohort(staff("mentor-1", [Role.MENTOR]))).rejects.toBeInstanceOf(
      ForbiddenError
    );

    db.internshipEnrollment.groupBy.mockResolvedValue([
      { status: EvaluationStatus.IN_PROGRESS, _count: { status: 4 } },
      { status: EvaluationStatus.UNDER_REVIEW, _count: { status: 1 } },
    ]);
    await expect(staffDashboardService.getEvaluationCohort(staff("hr-1", [Role.HR]))).resolves.toEqual({
      waitingToStart: 0,
      inProgress: 4,
      underReview: 1,
    });
  });

  it("hides the interns section for non-mentors who supervise nobody, but shows mentors an empty state", async () => {
    db.internshipEnrollment.count.mockResolvedValue(0);
    db.internshipEnrollment.findMany.mockResolvedValue([]);
    expect(
      await SupervisedInternsSection({ user: staff("mgr-1", [Role.MANAGER]), base: "/subadmin", hideWhenEmpty: true })
    ).toBeNull();

    render(await SupervisedInternsSection({ user: staff("mentor-1", [Role.MENTOR]), base: "/subadmin", hideWhenEmpty: false }));
    expect(screen.getByText("No interns assigned to you")).toBeTruthy();
  });

  it("shows a friendly notice instead of failing the page when a section query fails", async () => {
    db.internshipEnrollment.count.mockRejectedValue(new Error("connection reset"));
    db.internshipEnrollment.findMany.mockRejectedValue(new Error("connection reset"));

    render(await SupervisedInternsSection({ user: staff("mentor-1", [Role.MENTOR]), base: "/subadmin", hideWhenEmpty: false }));
    expect(screen.getByRole("alert").textContent).toContain("could not be loaded");
    expect(document.body.textContent).not.toContain("connection reset");
  });
});

describe("Manager overview data", () => {
  it("reports when the manager has no employee record instead of guessing a team", async () => {
    db.employee.findUnique.mockResolvedValue(null);
    await expect(staffDashboardService.getMyTeam(staff("mgr-1", [Role.MANAGER]), NOW)).resolves.toEqual({
      hasEmployeeRecord: false,
      total: 0,
      members: [],
    });
    expect(db.employee.findMany).not.toHaveBeenCalled();
  });

  it("lists direct reports with today's leave and attendance", async () => {
    db.employee.findUnique.mockResolvedValue({ id: "emp-mgr" });
    db.employee.count.mockResolvedValue(3);
    db.employee.findMany.mockResolvedValue([
      { id: "e1", employeeCode: "E1", designation: "Engineer", department: "Tech", status: EmployeeStatus.ACTIVE, user: { name: "A" } },
      { id: "e2", employeeCode: "E2", designation: "Engineer", department: "Tech", status: EmployeeStatus.ACTIVE, user: { name: "B" } },
      { id: "e3", employeeCode: "E3", designation: "Analyst", department: "Ops", status: EmployeeStatus.PROBATION, user: { name: "C" } },
    ]);
    db.leaveRequest.findMany.mockResolvedValue([{ employeeId: "e1", leaveType: { name: "Casual Leave" } }]);
    db.attendanceRecord.findMany.mockResolvedValue([
      { employeeId: "e2", status: AttendanceStatus.PRESENT, checkInTime: new Date("2026-10-26T03:45:00.000Z"), checkOutTime: null },
    ]);

    const result = await staffDashboardService.getMyTeam(staff("mgr-1", [Role.MANAGER]), NOW);

    expect(db.employee.findMany.mock.calls[0][0].where).toEqual({
      managerId: "emp-mgr",
      status: { not: EmployeeStatus.EXITED },
      userId: { not: "mgr-1" },
    });
    expect(db.attendanceRecord.findMany.mock.calls[0][0].where).toEqual({
      employeeId: { in: ["e1", "e2", "e3"] },
      date: new Date("2026-10-26T00:00:00.000Z"),
    });
    expect(result.members.map((member) => member.today)).toEqual([
      { kind: "ON_LEAVE", leaveType: "Casual Leave" },
      { kind: "CHECKED_IN", at: "2026-10-26T03:45:00.000Z" },
      { kind: "NOT_CHECKED_IN" },
    ]);
  });

  it("does not read attendance or leave without those permissions", async () => {
    customPermissions.set("mgr-2", { canEmployees: true });
    db.employee.findUnique.mockResolvedValue({ id: "emp-mgr" });
    db.employee.count.mockResolvedValue(1);
    db.employee.findMany.mockResolvedValue([
      { id: "e1", employeeCode: "E1", designation: "Engineer", department: "Tech", status: EmployeeStatus.ACTIVE, user: { name: "A" } },
    ]);

    const result = await staffDashboardService.getMyTeam(staff("mgr-2", [Role.MANAGER]), NOW);

    expect(db.leaveRequest.findMany).not.toHaveBeenCalled();
    expect(db.attendanceRecord.findMany).not.toHaveBeenCalled();
    expect(result.members[0].today).toBeNull();
  });

  it("requires the employees permission for the team list and the leave permission for who is away", async () => {
    customPermissions.set("iv-2", { canInterviews: true });
    await expect(staffDashboardService.getMyTeam(staff("iv-2", [Role.INTERVIEWER]), NOW)).rejects.toBeInstanceOf(
      ForbiddenError
    );
    await expect(staffDashboardService.getAwayToday(staff("iv-2", [Role.INTERVIEWER]), NOW)).rejects.toBeInstanceOf(
      ForbiddenError
    );
  });
});

describe("HR overview data", () => {
  it("builds the pipeline from the scoped queue counts in pipeline order", async () => {
    db.application.groupBy.mockResolvedValue([
      { status: ApplicationStatus.SUBMITTED, _count: { status: 5 } },
      { status: ApplicationStatus.OFFERED, _count: { status: 2 } },
      { status: ApplicationStatus.REJECTED, _count: { status: 9 } },
    ]);

    const result = await staffDashboardService.getPipelineSnapshot(staff("hr-1", [Role.HR]));

    expect(result.total).toBe(7);
    expect(result.stages[0]).toEqual(expect.objectContaining({ status: ApplicationStatus.SUBMITTED, count: 5 }));
    expect(result.stages.find((stage) => stage.status === ApplicationStatus.OFFERED)?.count).toBe(2);
    expect(result.stages.some((stage) => stage.status === ApplicationStatus.REJECTED)).toBe(false);
  });

  it("lists approved leave covering today", async () => {
    db.leaveRequest.count.mockResolvedValue(0);
    db.leaveRequest.findMany.mockResolvedValue([]);
    await staffDashboardService.getAwayToday(staff("hr-1", [Role.HR]), NOW);
    const where = db.leaveRequest.findMany.mock.calls[0][0].where;
    const today = new Date("2026-10-26T00:00:00.000Z");
    expect(where).toEqual(
      expect.objectContaining({ status: "APPROVED", startDate: { lte: today }, endDate: { gte: today } })
    );
  });

  it("uses interview statuses that describe planned or finished sessions only", async () => {
    db.interviewSchedule.count.mockResolvedValue(0);
    db.interviewSchedule.findMany.mockResolvedValue([]);
    await staffDashboardService.getTodaysInterviewSchedule(staff("hr-1", [Role.HR]), NOW);
    expect(db.interviewSchedule.findMany.mock.calls[0][0].where.status.in).not.toContain(InterviewStatus.CANCELLED);
  });
});
