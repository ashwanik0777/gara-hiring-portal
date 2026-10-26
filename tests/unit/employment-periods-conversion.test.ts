import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  ApplicationStatus,
  EmployeeStatus,
  EvaluationStatus,
  OfferStatus,
  OpeningType,
  Role,
} from "@prisma/client";

/*
 * Product-owner decisions of 2026-10-25 (round 3):
 *  - Employment periods for every joining, exit and conversion.
 *  - Re-joining reuses the same Employee row and employee code (REJOINED period).
 *  - Intern progress review after 3 / 6 months: CONVERT, EXTEND, END_INTERNSHIP.
 *  - The intern answers a conversion offer; it takes effect on the effective date (job).
 *  - Supervisor change from the evaluation cockpit.
 * Real guards run against a mocked session and a mocked Prisma client.
 */

const { db, state } = vi.hoisted(() => {
  const state = {
    session: null as null | { user: { id: string; email: string; name: string } },
    users: {} as Record<string, { roles: string[]; name?: string }>,
  };
  const db = {
    user: { findUnique: vi.fn(), findMany: vi.fn() },
    subAdminPermission: { findUnique: vi.fn() },
    application: { findUnique: vi.fn(), updateMany: vi.fn() },
    applicationStatusHistory: { create: vi.fn() },
    internshipEnrollment: { findUnique: vi.fn(), updateMany: vi.fn() },
    employee: { findUnique: vi.fn(), create: vi.fn(), updateMany: vi.fn() },
    employmentHistory: { create: vi.fn() },
    employmentPeriod: { create: vi.fn(), updateMany: vi.fn() },
    employeeExitRecord: { create: vi.fn() },
    conversionReview: { findUnique: vi.fn(), findMany: vi.fn(), count: vi.fn(), create: vi.fn(), updateMany: vi.fn() },
    scheduledJob: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    userRole: { upsert: vi.fn(), deleteMany: vi.fn() },
    notificationOutbox: { create: vi.fn() },
    auditLog: { create: vi.fn() },
    $transaction: vi.fn(),
  };
  return { db, state };
});

vi.mock("@/lib/db", () => ({ prisma: db }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/auth", () => ({
  auth: { api: { getSession: vi.fn(async () => state.session) } },
}));
vi.mock("@/infrastructure/email/outbox-dispatch", () => ({ scheduleOutboxFlush: vi.fn() }));

import { employeeService } from "@/features/employees/services/employee-service";
import { conversionService } from "@/features/employees/services/conversion-service";
import { conversionJobHandlers } from "@/features/employees/services/conversion-jobs";
import { evaluationService } from "@/features/internship-evaluation/services/evaluation-service";
import {
  recordInternReviewOutcomeAction,
  respondToConversionOfferAction,
} from "@/features/employees/actions";
import { changeEvaluationSupervisorAction } from "@/features/internship-evaluation/actions";
import { RecordReviewOutcomeSchema } from "@/features/employees/schemas";
import {
  classifyReviewDue,
  firstReviewDate,
  nextReviewDate,
} from "@/features/employees/conversion-rules";
import { JOB_TYPES } from "@/features/automation/job-types";
import { atBusinessTime } from "@/lib/time/business-time";
import { scheduleOutboxFlush } from "@/infrastructure/email/outbox-dispatch";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import type { AuthenticatedUser } from "@/lib/auth/guards";

const HR_ID = "11111111-1111-4111-8111-111111111111";
const ADMIN_ID = "22222222-2222-4222-8222-222222222222";
const INTERN_ID = "33333333-3333-4333-8333-333333333333";
const MENTOR_ID = "44444444-4444-4444-8444-444444444444";
const APP_ID = "55555555-5555-4555-8555-555555555555";
const ENROLLMENT_ID = "66666666-6666-4666-8666-666666666666";
const EMP_ID = "77777777-7777-4777-8777-777777777777";
const NEW_SUPERVISOR_ID = "88888888-8888-4888-8888-888888888888";
const PERIOD_ID = "99999999-9999-4999-8999-999999999999";
const REVIEW_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OFFER_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const OTHER_USER_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

/** 11:30 in Asia/Kolkata on 25 Oct 2026. */
const NOW = new Date("2026-10-25T06:00:00.000Z");
const PAST_JOINING_DATE = "2025-01-06";

const hrUser: AuthenticatedUser = { id: HR_ID, name: "HR", email: "hr@gara.test", roles: [Role.HR] };
const adminUser: AuthenticatedUser = { id: ADMIN_ID, name: "Admin", email: "admin@gara.test", roles: [Role.ADMIN] };
const mentorUser: AuthenticatedUser = { id: MENTOR_ID, name: "Mentor", email: "m@gara.test", roles: [Role.MENTOR] };
const internUser: AuthenticatedUser = { id: INTERN_ID, name: "Asha", email: "asha@gara.test", roles: [Role.INTERN] };

const allPermissions = {
  canApplications: true,
  canOpenings: true,
  canInterviews: true,
  canEvaluations: true,
  canEmployees: true,
  canAttendance: true,
  canLeave: true,
  canPayroll: true,
  canReports: true,
};

function denyPermission(key: keyof typeof allPermissions) {
  db.subAdminPermission.findUnique.mockResolvedValue({ id: "perm", userId: HR_ID, ...allPermissions, [key]: false });
}

function signInAs(userId: string, roles: Role[]) {
  state.session = { user: { id: userId, email: `${userId}@gara.test`, name: "Tester" } };
  state.users[userId] = { roles };
}

function form(fields: Record<string, string>): FormData {
  const formData = new FormData();
  for (const [key, value] of Object.entries(fields)) formData.set(key, value);
  return formData;
}

beforeEach(() => {
  vi.resetAllMocks();
  state.session = null;
  state.users = {
    [MENTOR_ID]: { roles: [Role.MENTOR], name: "Mentor" },
    [NEW_SUPERVISOR_ID]: { roles: [Role.MENTOR], name: "New Mentor" },
    [INTERN_ID]: { roles: [Role.CANDIDATE], name: "Asha" },
  };
  db.$transaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => cb(db));
  db.user.findUnique.mockImplementation(async (args: { where: { id: string } }) => {
    const entry = state.users[args.where.id];
    return entry
      ? {
          id: args.where.id,
          name: entry.name ?? "User",
          email: `${args.where.id}@gara.test`,
          mustChangePassword: false,
          roles: entry.roles.map((role) => ({ role })),
        }
      : null;
  });
  db.application.updateMany.mockResolvedValue({ count: 1 });
  db.employee.updateMany.mockResolvedValue({ count: 1 });
  db.employmentPeriod.create.mockResolvedValue({ id: "period-new" });
  db.employmentPeriod.updateMany.mockResolvedValue({ count: 1 });
  db.conversionReview.create.mockImplementation(async (args: { data: { scheduledFor: Date } }) => ({
    id: "review-new",
    scheduledFor: args.data.scheduledFor,
  }));
  db.conversionReview.updateMany.mockResolvedValue({ count: 1 });
  db.conversionReview.findMany.mockResolvedValue([]);
  db.conversionReview.count.mockResolvedValue(0);
  db.scheduledJob.updateMany.mockResolvedValue({ count: 1 });
  db.userRole.deleteMany.mockResolvedValue({ count: 1 });
  db.internshipEnrollment.updateMany.mockResolvedValue({ count: 1 });
});

// ---------------------------------------------------------------------------
// Pure rules
// ---------------------------------------------------------------------------

describe("Review date rules", () => {
  it("schedules the first review 3 or 6 months after the joining day", () => {
    expect(firstReviewDate(new Date("2026-01-15"), 3)).toEqual(new Date("2026-04-15T00:00:00.000Z"));
    expect(firstReviewDate(new Date("2026-01-15"), 6)).toEqual(new Date("2026-07-15T00:00:00.000Z"));
    // Clamped to the last day of a shorter month.
    expect(firstReviewDate(new Date("2025-11-30"), 3)).toEqual(new Date("2026-02-28T00:00:00.000Z"));
  });

  it("counts an extension from the decision day in the business time zone", () => {
    // 20:00 UTC on 24 Oct is already 25 Oct in India.
    expect(nextReviewDate(new Date("2026-10-24T20:00:00.000Z"), 3)).toEqual(new Date("2027-01-25T00:00:00.000Z"));
  });

  it("classifies scheduled reviews as overdue, due this week or upcoming", () => {
    expect(classifyReviewDue(new Date("2026-10-24T00:00:00.000Z"), NOW)).toBe("OVERDUE");
    expect(classifyReviewDue(new Date("2026-10-25T00:00:00.000Z"), NOW)).toBe("DUE_THIS_WEEK");
    expect(classifyReviewDue(new Date("2026-10-31T00:00:00.000Z"), NOW)).toBe("DUE_THIS_WEEK");
    expect(classifyReviewDue(new Date("2026-11-01T00:00:00.000Z"), NOW)).toBe("UPCOMING");
  });
});

// ---------------------------------------------------------------------------
// Re-joining
// ---------------------------------------------------------------------------

const exitedProfile = (employmentType: "INTERN" | "FULL_TIME" = "FULL_TIME") => ({
  id: EMP_ID,
  employeeCode: "GAR-007",
  status: EmployeeStatus.EXITED,
  employmentType,
});

/** Row read by getEmployeeDetail after a joining (HR may read confidential details). */
function employeeDetailRow(employeeCode: string) {
  return {
    id: EMP_ID,
    employeeCode,
    department: "Engineering",
    designation: "Software Engineer",
    joiningDate: new Date(PAST_JOINING_DATE),
    status: EmployeeStatus.PROBATION,
    employmentType: "FULL_TIME",
    personalPhone: null,
    emergencyContact: null,
    internalNotes: null,
    onboardingChecklist: [],
    user: { id: INTERN_ID, name: "Asha", email: "asha@gara.test", image: null },
    manager: null,
    directReports: [],
    application: { id: APP_ID, referenceCode: "APP-3", opening: { title: "Engineer" } },
    employmentHistories: [],
    secureDocuments: [],
    exitRecords: [],
    employmentPeriods: [],
  };
}

function passedEnrollment(employeeProfile: unknown) {
  return {
    id: ENROLLMENT_ID,
    userId: INTERN_ID,
    status: EvaluationStatus.PASSED,
    application: {
      id: APP_ID,
      referenceCode: "APP-2",
      status: ApplicationStatus.EVALUATION_SELECTED,
      opening: { title: "Frontend Internship", type: OpeningType.INTERNSHIP },
      jobOffer: null,
    },
    user: { id: INTERN_ID, name: "Asha", email: "asha@gara.test", employeeProfile },
  };
}

const internJoinInput = {
  enrollmentId: ENROLLMENT_ID,
  employeeCode: "GAR-007",
  department: "Engineering",
  designation: "Frontend Intern",
  joiningDate: PAST_JOINING_DATE,
  initialStatus: EmployeeStatus.ACTIVE,
  reviewAfterMonths: 6 as const,
};

describe("Re-joining reuses the same employee row and code", () => {
  it("intern: reactivates the exited row, opens a REJOINED period and re-grants INTERN", async () => {
    db.internshipEnrollment.findUnique.mockResolvedValue(passedEnrollment(exitedProfile("FULL_TIME")));
    db.employmentPeriod.create.mockResolvedValue({ id: PERIOD_ID });
    const before = Date.now();

    const result = await employeeService.createEmployeeFromInternship(hrUser, internJoinInput);

    expect(result).toMatchObject({ employeeId: EMP_ID, rejoined: true });
    expect(db.employee.create).not.toHaveBeenCalled();
    // No code-uniqueness lookup: the existing code is kept.
    expect(db.employee.findUnique).not.toHaveBeenCalled();
    expect(db.employee.updateMany).toHaveBeenCalledWith({
      where: { id: EMP_ID, status: EmployeeStatus.EXITED },
      data: {
        employmentType: "INTERN",
        designation: "Frontend Intern",
        department: "Engineering",
        status: EmployeeStatus.ACTIVE,
        managerId: null,
        joiningDate: new Date(PAST_JOINING_DATE),
        applicationId: APP_ID,
      },
    });
    expect(db.employmentPeriod.create.mock.calls[0][0].data).toMatchObject({
      employeeId: EMP_ID,
      employmentType: "INTERN",
      startReason: "REJOINED",
      applicationId: APP_ID,
    });
    expect(db.conversionReview.create.mock.calls[0][0].data).toMatchObject({
      employeeId: EMP_ID,
      periodId: PERIOD_ID,
      reviewPeriodMonths: 6,
      scheduledFor: new Date("2025-07-06T00:00:00.000Z"),
    });

    const role = db.userRole.upsert.mock.calls[0][0];
    expect(role.where).toEqual({ userId_role: { userId: INTERN_ID, role: Role.INTERN } });
    expect(role.update.assignedAt.getTime()).toBeGreaterThanOrEqual(before);
    // The former employee's EMPLOYEE role would otherwise keep them on the employee stage.
    expect(db.userRole.deleteMany).toHaveBeenCalledWith({ where: { userId: INTERN_ID, role: Role.EMPLOYEE } });

    expect(db.employmentHistory.create.mock.calls[0][0].data).toMatchObject({
      changeType: "INTERN_REJOINED",
      previousValue: EmployeeStatus.EXITED,
    });
    const email = db.notificationOutbox.create.mock.calls[0][0].data;
    expect(email.templateName).toBe("INTERN_JOINED");
    expect(email.payload).toMatchObject({ isRejoin: true, employeeCode: "GAR-007" });
    expect(db.auditLog.create.mock.calls[0][0].data.diffPayload).toMatchObject({ isRejoin: true, periodId: PERIOD_ID });
  });

  it("keeps the existing employee code (a different code is rejected)", async () => {
    db.internshipEnrollment.findUnique.mockResolvedValue(passedEnrollment(exitedProfile()));
    await expect(
      employeeService.createEmployeeFromInternship(hrUser, { ...internJoinInput, employeeCode: "NEW-001" })
    ).rejects.toThrow(/existing employee code GAR-007 is kept/);
    expect(db.employee.updateMany).not.toHaveBeenCalled();
    expect(db.employmentPeriod.create).not.toHaveBeenCalled();
  });

  it("loses a concurrent re-join cleanly (conditional update on EXITED)", async () => {
    db.internshipEnrollment.findUnique.mockResolvedValue(passedEnrollment(exitedProfile()));
    db.employee.updateMany.mockResolvedValue({ count: 0 });
    await expect(employeeService.createEmployeeFromInternship(hrUser, internJoinInput)).rejects.toBeInstanceOf(
      ConflictError
    );
    expect(db.employmentPeriod.create).not.toHaveBeenCalled();
    expect(db.userRole.upsert).not.toHaveBeenCalled();
  });

  function acceptedApplication(employeeProfile: unknown) {
    return {
      id: APP_ID,
      referenceCode: "APP-3",
      status: ApplicationStatus.OFFER_ACCEPTED,
      candidate: { user: { id: INTERN_ID, name: "Asha", email: "asha@gara.test", employeeProfile } },
      jobOffer: { id: OFFER_ID, status: OfferStatus.ACCEPTED },
    };
  }

  const hireInput = {
    applicationId: APP_ID,
    employeeCode: "GAR-007",
    department: "Engineering",
    designation: "Software Engineer",
    joiningDate: PAST_JOINING_DATE,
    initialStatus: EmployeeStatus.PROBATION,
    personalPhone: "+91 99999 00000",
    internalNotes: "Should not overwrite earlier notes",
  };

  it("full time: reuses the row, keeps confidential details and queues EMPLOYEE_JOINED with isRejoin", async () => {
    db.application.findUnique.mockResolvedValue(acceptedApplication(exitedProfile("INTERN")));
    db.employmentPeriod.create.mockResolvedValue({ id: PERIOD_ID });
    db.employee.findUnique.mockResolvedValue(employeeDetailRow("GAR-007"));

    const detail = await employeeService.createEmployeeFromApplication(hrUser, hireInput);

    expect(detail.employeeCode).toBe("GAR-007");
    expect(db.employee.create).not.toHaveBeenCalled();
    const update = db.employee.updateMany.mock.calls[0][0];
    expect(update.where).toEqual({ id: EMP_ID, status: EmployeeStatus.EXITED });
    expect(update.data).toMatchObject({ employmentType: "FULL_TIME", applicationId: APP_ID });
    expect(update.data).not.toHaveProperty("internalNotes");
    expect(update.data).not.toHaveProperty("personalPhone");
    expect(db.employmentPeriod.create.mock.calls[0][0].data).toMatchObject({
      employmentType: "FULL_TIME",
      startReason: "REJOINED",
    });
    expect(db.userRole.deleteMany).toHaveBeenCalledWith({ where: { userId: INTERN_ID, role: Role.INTERN } });
    const email = db.notificationOutbox.create.mock.calls[0][0].data;
    expect(email.templateName).toBe("EMPLOYEE_JOINED");
    expect(email.payload).toMatchObject({ isRejoin: true });
    expect(db.employmentHistory.create.mock.calls[0][0].data.changeType).toBe("REJOINED");
  });

  it.each([EmployeeStatus.ACTIVE, EmployeeStatus.PROBATION, EmployeeStatus.ON_LEAVE])(
    "full time: still refuses while a %s record exists",
    async (status) => {
      db.application.findUnique.mockResolvedValue(
        acceptedApplication({ id: EMP_ID, employeeCode: "GAR-007", status, employmentType: "INTERN" })
      );
      await expect(employeeService.createEmployeeFromApplication(hrUser, hireInput)).rejects.toThrow(
        /already has an active employee record/
      );
      expect(db.application.updateMany).not.toHaveBeenCalled();
      expect(db.employee.updateMany).not.toHaveBeenCalled();
      expect(db.employmentPeriod.create).not.toHaveBeenCalled();
    }
  );

  it("a first full-time joining opens a JOINED period", async () => {
    db.application.findUnique.mockResolvedValue(acceptedApplication(null));
    db.employee.findUnique.mockImplementation(async (args: { where: { employeeCode?: string } }) =>
      args.where.employeeCode ? null : employeeDetailRow("ENG-1")
    );
    db.employee.create.mockResolvedValue({ id: EMP_ID });

    await employeeService.createEmployeeFromApplication(hrUser, { ...hireInput, employeeCode: "ENG-1" });

    expect(db.employee.create.mock.calls[0][0].data).toMatchObject({ employeeCode: "ENG-1", employmentType: "FULL_TIME" });
    expect(db.employmentPeriod.create.mock.calls[0][0].data).toMatchObject({
      employeeId: EMP_ID,
      employmentType: "FULL_TIME",
      startReason: "JOINED",
      applicationId: APP_ID,
    });
    expect(db.userRole.deleteMany).not.toHaveBeenCalled();
    expect(db.notificationOutbox.create.mock.calls[0][0].data.payload).not.toHaveProperty("isRejoin");
  });
});

// ---------------------------------------------------------------------------
// Exit closes the current period
// ---------------------------------------------------------------------------

describe("Exit closes the current employment period", () => {
  function currentEmployee(overrides: Record<string, unknown> = {}) {
    return {
      id: EMP_ID,
      userId: INTERN_ID,
      status: EmployeeStatus.ACTIVE,
      employmentType: "INTERN",
      designation: "Frontend Intern",
      department: "Engineering",
      joiningDate: new Date("2026-01-06T00:00:00.000Z"),
      applicationId: APP_ID,
      employmentPeriods: [{ id: PERIOD_ID, startDate: new Date("2026-01-06T00:00:00.000Z"), exitRecord: null }],
      ...overrides,
    };
  }

  it("ends the period on the last working date, links the exit record and withdraws open conversions", async () => {
    db.employee.findUnique.mockResolvedValue(currentEmployee());
    db.conversionReview.findMany.mockResolvedValue([{ id: REVIEW_ID }]);

    await employeeService.processEmployeeExit(hrUser, { employeeId: EMP_ID, lastWorkingDate: "2026-10-20" });

    expect(db.employee.updateMany).toHaveBeenCalledWith({
      where: { id: EMP_ID, status: EmployeeStatus.ACTIVE },
      data: { status: EmployeeStatus.EXITED },
    });
    expect(db.employmentPeriod.updateMany).toHaveBeenCalledWith({
      where: { id: PERIOD_ID, endDate: null },
      data: { endDate: new Date("2026-10-20"), endReason: "EXITED" },
    });
    expect(db.employeeExitRecord.create.mock.calls[0][0].data).toMatchObject({
      employeeId: EMP_ID,
      periodId: PERIOD_ID,
      lastWorkingDate: new Date("2026-10-20"),
    });
    expect(db.conversionReview.updateMany).toHaveBeenCalledWith({
      where: { employeeId: EMP_ID, status: "SCHEDULED" },
      data: { status: "CANCELLED" },
    });
    expect(db.conversionReview.updateMany).toHaveBeenCalledWith({
      where: { id: { in: [REVIEW_ID] }, convertedAt: null },
      data: { offerStatus: "WITHDRAWN" },
    });
    expect(db.scheduledJob.updateMany.mock.calls[0][0].where).toMatchObject({
      dedupeKey: { startsWith: `conversion-effective:${REVIEW_ID}` },
    });
    expect(db.auditLog.create.mock.calls[0][0].data.diffPayload).toMatchObject({ periodId: PERIOD_ID });
  });

  it("records a closed period for legacy records without one", async () => {
    db.employee.findUnique.mockResolvedValue(currentEmployee({ employmentPeriods: [] }));
    db.employmentPeriod.create.mockResolvedValue({ id: "legacy-period" });

    await employeeService.processEmployeeExit(hrUser, { employeeId: EMP_ID, lastWorkingDate: "2026-10-20" });

    expect(db.employmentPeriod.create.mock.calls[0][0].data).toMatchObject({
      employeeId: EMP_ID,
      startReason: "JOINED",
      endReason: "EXITED",
      endDate: new Date("2026-10-20"),
    });
    expect(db.employeeExitRecord.create.mock.calls[0][0].data.periodId).toBe("legacy-period");
  });

  it("rejects a last working date before the period started", async () => {
    db.employee.findUnique.mockResolvedValue(currentEmployee());
    await expect(
      employeeService.processEmployeeExit(hrUser, { employeeId: EMP_ID, lastWorkingDate: "2025-12-31" })
    ).rejects.toBeInstanceOf(ValidationError);
    expect(db.employee.updateMany).not.toHaveBeenCalled();
  });

  it("refuses a second exit for the same period and for an exited record", async () => {
    db.employee.findUnique.mockResolvedValue(
      currentEmployee({
        employmentPeriods: [{ id: PERIOD_ID, startDate: new Date("2026-01-06"), exitRecord: { id: "x-1" } }],
      })
    );
    await expect(
      employeeService.processEmployeeExit(hrUser, { employeeId: EMP_ID, lastWorkingDate: "2026-10-20" })
    ).rejects.toBeInstanceOf(ValidationError);

    db.employee.findUnique.mockResolvedValue(currentEmployee({ status: EmployeeStatus.EXITED }));
    await expect(
      employeeService.processEmployeeExit(hrUser, { employeeId: EMP_ID, lastWorkingDate: "2026-10-20" })
    ).rejects.toThrow(/already exited/);
    expect(db.employeeExitRecord.create).not.toHaveBeenCalled();
  });

  it("maps a concurrent exit on the same period to a conflict", async () => {
    db.employee.findUnique.mockResolvedValue(currentEmployee());
    db.employeeExitRecord.create.mockRejectedValue(Object.assign(new Error("Unique"), { code: "P2002" }));
    await expect(
      employeeService.processEmployeeExit(hrUser, { employeeId: EMP_ID, lastWorkingDate: "2026-10-20" })
    ).rejects.toBeInstanceOf(ConflictError);
  });
});

// ---------------------------------------------------------------------------
// Review outcome
// ---------------------------------------------------------------------------

function scheduledReview(overrides: Record<string, unknown> = {}) {
  return {
    id: REVIEW_ID,
    status: "SCHEDULED",
    periodId: PERIOD_ID,
    period: { endDate: null },
    employee: {
      id: EMP_ID,
      userId: INTERN_ID,
      status: EmployeeStatus.ACTIVE,
      employmentType: "INTERN",
      user: { name: "Asha", email: "asha@gara.test" },
    },
    ...overrides,
  };
}

const convertInput = {
  reviewId: REVIEW_ID,
  outcome: "CONVERT" as const,
  proposedDesignation: "Software Engineer",
  proposedDepartment: "Engineering",
  effectiveDate: "2026-11-01",
  initialStatus: EmployeeStatus.PROBATION,
  internalNotes: "Ready for a full-time role.",
  sharedSummary: "Great progress on the design system.",
};

describe("Recording a review outcome", () => {
  it.each([mentorUser, { ...mentorUser, roles: [Role.MANAGER] }])("rejects staff other than ADMIN / HR", async (user) => {
    await expect(conversionService.recordReviewOutcome(user, convertInput, NOW)).rejects.toBeInstanceOf(ForbiddenError);
    expect(db.conversionReview.findUnique).not.toHaveBeenCalled();
  });

  it("requires canEmployees for HR", async () => {
    denyPermission("canEmployees");
    await expect(conversionService.recordReviewOutcome(hrUser, convertInput, NOW)).rejects.toBeInstanceOf(
      ForbiddenError
    );
    expect(db.conversionReview.findUnique).not.toHaveBeenCalled();
  });

  it("never lets staff decide on their own internship", async () => {
    db.conversionReview.findUnique.mockResolvedValue(
      scheduledReview({ employee: { ...scheduledReview().employee, userId: HR_ID } })
    );
    await expect(conversionService.recordReviewOutcome(hrUser, convertInput, NOW)).rejects.toBeInstanceOf(
      ForbiddenError
    );
    expect(db.conversionReview.updateMany).not.toHaveBeenCalled();
  });

  it("validates the outcome-specific fields (no defaults)", () => {
    expect(RecordReviewOutcomeSchema.safeParse({ reviewId: REVIEW_ID }).success).toBe(false);
    const { initialStatus: _status, ...withoutStatus } = convertInput;
    void _status;
    expect(RecordReviewOutcomeSchema.safeParse(withoutStatus).success).toBe(false);
    expect(RecordReviewOutcomeSchema.safeParse({ ...convertInput, effectiveDate: "next week" }).success).toBe(false);
    expect(RecordReviewOutcomeSchema.safeParse({ reviewId: REVIEW_ID, outcome: "EXTEND" }).success).toBe(false);
    expect(
      RecordReviewOutcomeSchema.safeParse({ reviewId: REVIEW_ID, outcome: "EXTEND", nextReviewAfterMonths: "12" }).success
    ).toBe(false);
    expect(
      RecordReviewOutcomeSchema.safeParse({ reviewId: REVIEW_ID, outcome: "EXTEND", nextReviewAfterMonths: "3" }).success
    ).toBe(true);
  });

  it("rejects an effective date in the past", async () => {
    await expect(
      conversionService.recordReviewOutcome(hrUser, { ...convertInput, effectiveDate: "2026-10-24" }, NOW)
    ).rejects.toThrow(/cannot be in the past/);
    expect(db.conversionReview.findUnique).not.toHaveBeenCalled();
  });

  it("refuses a review that is no longer scheduled, or a lost race", async () => {
    db.conversionReview.findUnique.mockResolvedValue(scheduledReview({ status: "COMPLETED" }));
    await expect(conversionService.recordReviewOutcome(hrUser, convertInput, NOW)).rejects.toBeInstanceOf(ConflictError);

    db.conversionReview.findUnique.mockResolvedValue(scheduledReview());
    db.conversionReview.updateMany.mockResolvedValue({ count: 0 });
    await expect(conversionService.recordReviewOutcome(hrUser, convertInput, NOW)).rejects.toBeInstanceOf(ConflictError);
    expect(db.notificationOutbox.create).not.toHaveBeenCalled();
  });

  it("only records outcomes for current interns", async () => {
    db.conversionReview.findUnique.mockResolvedValue(
      scheduledReview({ employee: { ...scheduledReview().employee, employmentType: "FULL_TIME" } })
    );
    await expect(conversionService.recordReviewOutcome(hrUser, convertInput, NOW)).rejects.toBeInstanceOf(
      ValidationError
    );
  });

  it("CONVERT creates a pending offer, audits it and emails CONVERSION_OFFER_EXTENDED", async () => {
    db.conversionReview.findUnique.mockResolvedValue(scheduledReview());

    const result = await conversionService.recordReviewOutcome(hrUser, convertInput, NOW);

    expect(result).toMatchObject({ reviewId: REVIEW_ID, outcome: "CONVERT", nextReviewId: null });
    const update = db.conversionReview.updateMany.mock.calls[0][0];
    expect(update.where).toEqual({ id: REVIEW_ID, status: "SCHEDULED" });
    expect(update.data).toMatchObject({
      status: "COMPLETED",
      outcome: "CONVERT",
      reviewerId: HR_ID,
      offerStatus: "PENDING",
      proposedDesignation: "Software Engineer",
      proposedEffectiveDate: new Date("2026-11-01T00:00:00.000Z"),
      proposedInitialStatus: EmployeeStatus.PROBATION,
      internalNotes: "Ready for a full-time role.",
    });
    expect(db.conversionReview.create).not.toHaveBeenCalled();
    // No employment change until the intern accepts.
    expect(db.employee.updateMany).not.toHaveBeenCalled();

    const email = db.notificationOutbox.create.mock.calls[0][0].data;
    expect(email.templateName).toBe("CONVERSION_OFFER_EXTENDED");
    expect(email.payload).toEqual({
      recipientName: "Asha",
      proposedDesignation: "Software Engineer",
      proposedDepartment: "Engineering",
      effectiveDate: "2026-11-01T00:00:00.000Z",
      sharedSummary: "Great progress on the design system.",
    });
    // Internal notes never reach the intern.
    expect(JSON.stringify(email.payload)).not.toContain("Ready for a full-time role");
    expect(db.auditLog.create.mock.calls[0][0].data.action).toBe("RECORD_INTERN_REVIEW_OUTCOME");
  });

  it("EXTEND schedules the next review 3 or 6 months from the decision day", async () => {
    db.conversionReview.findUnique.mockResolvedValue(scheduledReview());

    const result = await conversionService.recordReviewOutcome(
      adminUser,
      { reviewId: REVIEW_ID, outcome: "EXTEND", nextReviewAfterMonths: 6 },
      NOW
    );

    expect(db.conversionReview.create.mock.calls[0][0].data).toMatchObject({
      employeeId: EMP_ID,
      periodId: PERIOD_ID,
      reviewPeriodMonths: 6,
      status: "SCHEDULED",
      scheduledFor: new Date("2027-04-25T00:00:00.000Z"),
    });
    expect(result.nextReviewDate).toEqual(new Date("2027-04-25T00:00:00.000Z"));
    const email = db.notificationOutbox.create.mock.calls[0][0].data;
    expect(email.templateName).toBe("INTERNSHIP_REVIEW_EXTENDED");
    expect(email.payload).toEqual({ recipientName: "Asha", nextReviewDate: "2027-04-25T00:00:00.000Z" });
  });

  it("END_INTERNSHIP records the decision without exiting the intern", async () => {
    db.conversionReview.findUnique.mockResolvedValue(scheduledReview());

    await conversionService.recordReviewOutcome(hrUser, { reviewId: REVIEW_ID, outcome: "END_INTERNSHIP" }, NOW);

    expect(db.employee.updateMany).not.toHaveBeenCalled();
    expect(db.employmentPeriod.updateMany).not.toHaveBeenCalled();
    expect(db.employeeExitRecord.create).not.toHaveBeenCalled();
    expect(db.notificationOutbox.create.mock.calls[0][0].data.templateName).toBe("INTERNSHIP_ENDING");
  });

  it("the Server Action rejects interviewers and flushes the outbox after a recorded outcome", async () => {
    signInAs(MENTOR_ID, [Role.INTERVIEWER]);
    const rejected = await recordInternReviewOutcomeAction(form({ reviewId: REVIEW_ID, outcome: "END_INTERNSHIP" }));
    expect(rejected).toEqual({ success: false, error: "Your role is not permitted to perform this action." });

    signInAs(HR_ID, [Role.HR]);
    const invalid = await recordInternReviewOutcomeAction(form({ reviewId: REVIEW_ID, outcome: "EXTEND" }));
    expect(invalid.success).toBe(false);
    if (!invalid.success) expect(invalid.fieldErrors?.nextReviewAfterMonths).toBeDefined();

    db.conversionReview.findUnique.mockResolvedValue(scheduledReview());
    const res = await recordInternReviewOutcomeAction(
      form({ reviewId: REVIEW_ID, outcome: "EXTEND", nextReviewAfterMonths: "3", internalNotes: "" })
    );
    expect(res.success).toBe(true);
    expect(scheduleOutboxFlush).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Intern answer and conversion
// ---------------------------------------------------------------------------

function pendingOffer(overrides: Record<string, unknown> = {}) {
  return {
    id: REVIEW_ID,
    outcome: "CONVERT",
    offerStatus: "PENDING",
    proposedEffectiveDate: new Date("2026-11-01T00:00:00.000Z"),
    employee: { id: EMP_ID, userId: INTERN_ID, status: EmployeeStatus.ACTIVE, employmentType: "INTERN" },
    ...overrides,
  };
}

function acceptedOffer(overrides: Record<string, unknown> = {}) {
  return {
    id: REVIEW_ID,
    outcome: "CONVERT",
    offerStatus: "ACCEPTED",
    convertedAt: null,
    proposedDesignation: "Software Engineer",
    proposedDepartment: "Platform",
    proposedEffectiveDate: new Date("2026-10-25T00:00:00.000Z"),
    proposedInitialStatus: EmployeeStatus.PROBATION,
    employee: {
      id: EMP_ID,
      userId: INTERN_ID,
      status: EmployeeStatus.ACTIVE,
      employmentType: "INTERN",
      designation: "Frontend Intern",
      department: "Engineering",
      user: { name: "Asha", email: "asha@gara.test" },
    },
    ...overrides,
  };
}

function expectFullConversion(actorId: string | null) {
  expect(db.employee.updateMany).toHaveBeenCalledWith({
    where: { id: EMP_ID, employmentType: "INTERN", status: { not: EmployeeStatus.EXITED } },
    data: {
      employmentType: "FULL_TIME",
      designation: "Software Engineer",
      department: "Platform",
      status: EmployeeStatus.PROBATION,
    },
  });
  expect(db.employmentPeriod.updateMany).toHaveBeenCalledWith({
    where: { employeeId: EMP_ID, endDate: null },
    data: { endDate: new Date("2026-10-25T00:00:00.000Z"), endReason: "CONVERTED" },
  });
  expect(db.employmentPeriod.create.mock.calls[0][0].data).toMatchObject({
    employeeId: EMP_ID,
    employmentType: "FULL_TIME",
    startReason: "CONVERTED",
    startDate: new Date("2026-10-25T00:00:00.000Z"),
  });
  const role = db.userRole.upsert.mock.calls[0][0];
  expect(role.where).toEqual({ userId_role: { userId: INTERN_ID, role: Role.EMPLOYEE } });
  expect(role.update.assignedAt).toEqual(NOW);
  expect(role.update.assignedBy).toBe(actorId);
  expect(db.userRole.deleteMany).toHaveBeenCalledWith({ where: { userId: INTERN_ID, role: Role.INTERN } });
  expect(db.employmentHistory.create.mock.calls.some((c) => c[0].data.changeType === "CONVERTED_TO_FULL_TIME")).toBe(
    true
  );
  expect(db.auditLog.create.mock.calls.some((c) => c[0].data.action === "CONVERSION_COMPLETED")).toBe(true);
  const email = db.notificationOutbox.create.mock.calls.find((c) => c[0].data.templateName === "CONVERSION_COMPLETED");
  expect(email?.[0].data.payload).toEqual({
    recipientName: "Asha",
    designation: "Software Engineer",
    department: "Platform",
    effectiveDate: "2026-10-25T00:00:00.000Z",
  });
}

describe("The intern answers their own conversion offer", () => {
  it("reports another person's review as not found and writes nothing", async () => {
    db.conversionReview.findUnique.mockResolvedValue(
      pendingOffer({ employee: { ...pendingOffer().employee, userId: OTHER_USER_ID } })
    );
    await expect(
      conversionService.respondToOffer(internUser, { reviewId: REVIEW_ID, decision: "ACCEPT" }, NOW)
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(db.conversionReview.updateMany).not.toHaveBeenCalled();
  });

  it("only answers a PENDING offer (conditional update scoped to the intern)", async () => {
    db.conversionReview.findUnique.mockResolvedValue(pendingOffer({ offerStatus: "DECLINED" }));
    await expect(
      conversionService.respondToOffer(internUser, { reviewId: REVIEW_ID, decision: "ACCEPT" }, NOW)
    ).rejects.toBeInstanceOf(ConflictError);

    db.conversionReview.findUnique.mockResolvedValue(pendingOffer());
    db.conversionReview.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      conversionService.respondToOffer(internUser, { reviewId: REVIEW_ID, decision: "ACCEPT" }, NOW)
    ).rejects.toBeInstanceOf(ConflictError);
    expect(db.conversionReview.updateMany.mock.calls[0][0].where).toEqual({
      id: REVIEW_ID,
      offerStatus: "PENDING",
      employee: { userId: INTERN_ID },
    });
    expect(db.scheduledJob.create).not.toHaveBeenCalled();
  });

  it("decline records the answer without converting or scheduling", async () => {
    db.conversionReview.findUnique.mockResolvedValue(pendingOffer());
    const result = await conversionService.respondToOffer(internUser, { reviewId: REVIEW_ID, decision: "DECLINE" }, NOW);
    expect(result).toMatchObject({ decision: "DECLINE", converted: false, scheduled: false });
    expect(db.conversionReview.updateMany.mock.calls[0][0].data).toEqual({ offerStatus: "DECLINED", offerRespondedAt: NOW });
    expect(db.employee.updateMany).not.toHaveBeenCalled();
    expect(db.scheduledJob.create).not.toHaveBeenCalled();
    expect(db.auditLog.create.mock.calls[0][0].data.action).toBe("CONVERSION_OFFER_DECLINED");
  });

  it("accepting a future effective date enqueues CONVERSION_EFFECTIVE with a dedupe key", async () => {
    db.conversionReview.findUnique.mockResolvedValue(pendingOffer());
    db.scheduledJob.findUnique.mockResolvedValue(null);

    const result = await conversionService.respondToOffer(internUser, { reviewId: REVIEW_ID, decision: "ACCEPT" }, NOW);

    expect(result).toMatchObject({ decision: "ACCEPT", converted: false, scheduled: true });
    expect(db.scheduledJob.create).toHaveBeenCalledWith({
      data: {
        type: JOB_TYPES.CONVERSION_EFFECTIVE,
        runAt: atBusinessTime("2026-11-01", 0, 5),
        payload: { reviewId: REVIEW_ID },
        dedupeKey: `conversion-effective:${REVIEW_ID}`,
        maxAttempts: 5,
      },
    });
    expect(db.employee.updateMany).not.toHaveBeenCalled();
  });

  it("accepting when the effective date is today converts immediately in the same transaction", async () => {
    db.conversionReview.findUnique
      .mockResolvedValueOnce(pendingOffer({ proposedEffectiveDate: new Date("2026-10-25T00:00:00.000Z") }))
      .mockResolvedValueOnce(acceptedOffer());

    const result = await conversionService.respondToOffer(internUser, { reviewId: REVIEW_ID, decision: "ACCEPT" }, NOW);

    expect(result).toMatchObject({ converted: true, scheduled: false });
    expect(db.scheduledJob.create).not.toHaveBeenCalled();
    expectFullConversion(INTERN_ID);
  });

  it("the Server Action validates the answer and flushes email only after a conversion", async () => {
    signInAs(INTERN_ID, [Role.INTERN]);
    const invalid = await respondToConversionOfferAction(form({ reviewId: REVIEW_ID, decision: "MAYBE" }));
    expect(invalid).toEqual({
      success: false,
      error: "We couldn't record your answer. Please reload the page and try again.",
    });

    db.conversionReview.findUnique.mockResolvedValue(pendingOffer());
    const declined = await respondToConversionOfferAction(form({ reviewId: REVIEW_ID, decision: "DECLINE" }));
    expect(declined.success).toBe(true);
    expect(scheduleOutboxFlush).not.toHaveBeenCalled();
  });
});

describe("CONVERSION_EFFECTIVE job handler", () => {
  const handler = conversionJobHandlers[JOB_TYPES.CONVERSION_EFFECTIVE];
  const context = { jobId: "job-1", now: NOW, attempt: 1 };

  it("is registered for the CONVERSION_EFFECTIVE job type", () => {
    expect(typeof handler).toBe("function");
  });

  it("performs the full conversion on the effective date", async () => {
    db.conversionReview.findUnique.mockResolvedValue(acceptedOffer());
    await handler({ reviewId: REVIEW_ID }, context);
    expect(db.conversionReview.updateMany).toHaveBeenCalledWith({
      where: { id: REVIEW_ID, convertedAt: null, offerStatus: "ACCEPTED" },
      data: { convertedAt: NOW },
    });
    expectFullConversion(null);
    expect(db.auditLog.create.mock.calls[0][0].data.actorRole).toBe("SYSTEM");
  });

  it("is idempotent: an already converted review or a lost claim changes nothing", async () => {
    db.conversionReview.findUnique.mockResolvedValue(acceptedOffer({ convertedAt: NOW }));
    await handler({ reviewId: REVIEW_ID }, context);

    db.conversionReview.findUnique.mockResolvedValue(acceptedOffer());
    db.conversionReview.updateMany.mockResolvedValue({ count: 0 });
    await handler({ reviewId: REVIEW_ID }, context);

    expect(db.employee.updateMany).not.toHaveBeenCalled();
    expect(db.employmentPeriod.create).not.toHaveBeenCalled();
    expect(db.userRole.upsert).not.toHaveBeenCalled();
    expect(db.notificationOutbox.create).not.toHaveBeenCalled();
  });

  it("skips withdrawn offers and exited records", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    db.conversionReview.findUnique.mockResolvedValue(acceptedOffer({ offerStatus: "WITHDRAWN" }));
    await handler({ reviewId: REVIEW_ID }, context);
    db.conversionReview.findUnique.mockResolvedValue(
      acceptedOffer({ employee: { ...acceptedOffer().employee, status: EmployeeStatus.EXITED } })
    );
    await handler({ reviewId: REVIEW_ID }, context);
    expect(db.conversionReview.updateMany).not.toHaveBeenCalled();
    expect(db.employee.updateMany).not.toHaveBeenCalled();
    info.mockRestore();
  });

  it("retries (throws) before the effective date and rejects malformed payloads", async () => {
    db.conversionReview.findUnique.mockResolvedValue(
      acceptedOffer({ proposedEffectiveDate: new Date("2026-10-26T00:00:00.000Z") })
    );
    await expect(handler({ reviewId: REVIEW_ID }, context)).rejects.toThrow(/not effective yet/);
    await expect(handler({ reviewId: "not-a-uuid" }, context)).rejects.toThrow(/Invalid/);
    expect(db.employee.updateMany).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Supervisor change
// ---------------------------------------------------------------------------

function runningEnrollment(overrides: Record<string, unknown> = {}) {
  return {
    id: ENROLLMENT_ID,
    userId: INTERN_ID,
    status: EvaluationStatus.IN_PROGRESS,
    supervisorId: MENTOR_ID,
    user: { name: "Asha", email: "asha@gara.test" },
    application: { opening: { title: "Frontend Internship" } },
    ...overrides,
  };
}

describe("Evaluation supervisor change", () => {
  it("is limited to ADMIN / HR with canEvaluations", async () => {
    await expect(evaluationService.changeSupervisor(mentorUser, ENROLLMENT_ID, NEW_SUPERVISOR_ID)).rejects.toBeInstanceOf(
      ForbiddenError
    );
    denyPermission("canEvaluations");
    await expect(evaluationService.changeSupervisor(hrUser, ENROLLMENT_ID, NEW_SUPERVISOR_ID)).rejects.toBeInstanceOf(
      ForbiddenError
    );
    expect(db.internshipEnrollment.findUnique).not.toHaveBeenCalled();
  });

  it("never applies to the actor's own enrollment", async () => {
    db.internshipEnrollment.findUnique.mockResolvedValue(runningEnrollment({ userId: HR_ID }));
    await expect(evaluationService.changeSupervisor(hrUser, ENROLLMENT_ID, NEW_SUPERVISOR_ID)).rejects.toBeInstanceOf(
      ForbiddenError
    );
  });

  it.each([EvaluationStatus.PASSED, EvaluationStatus.FAILED])("is locked once the outcome is %s", async (status) => {
    db.internshipEnrollment.findUnique.mockResolvedValue(runningEnrollment({ status }));
    await expect(evaluationService.changeSupervisor(hrUser, ENROLLMENT_ID, NEW_SUPERVISOR_ID)).rejects.toBeInstanceOf(
      ConflictError
    );
    expect(db.internshipEnrollment.updateMany).not.toHaveBeenCalled();
  });

  it("rejects the unchanged supervisor, the intern and non-staff users", async () => {
    db.internshipEnrollment.findUnique.mockResolvedValue(runningEnrollment());
    await expect(evaluationService.changeSupervisor(hrUser, ENROLLMENT_ID, MENTOR_ID)).rejects.toThrow(
      /already supervises/
    );
    await expect(evaluationService.changeSupervisor(hrUser, ENROLLMENT_ID, INTERN_ID)).rejects.toThrow(
      /cannot supervise their own evaluation/
    );
    state.users[OTHER_USER_ID] = { roles: [Role.CANDIDATE] };
    await expect(evaluationService.changeSupervisor(hrUser, ENROLLMENT_ID, OTHER_USER_ID)).rejects.toThrow(
      /must be a staff member/
    );
    expect(db.internshipEnrollment.updateMany).not.toHaveBeenCalled();
  });

  it("changes the supervisor conditionally, audits it and emails the intern and the new supervisor", async () => {
    db.internshipEnrollment.findUnique.mockResolvedValue(runningEnrollment());

    await evaluationService.changeSupervisor(hrUser, ENROLLMENT_ID, NEW_SUPERVISOR_ID);

    expect(db.internshipEnrollment.updateMany).toHaveBeenCalledWith({
      where: {
        id: ENROLLMENT_ID,
        supervisorId: MENTOR_ID,
        status: { notIn: [EvaluationStatus.PASSED, EvaluationStatus.FAILED] },
      },
      data: { supervisorId: NEW_SUPERVISOR_ID },
    });
    expect(db.auditLog.create.mock.calls[0][0].data).toMatchObject({
      action: "EVALUATION_SUPERVISOR_CHANGED",
      diffPayload: { fromSupervisorId: MENTOR_ID, toSupervisorId: NEW_SUPERVISOR_ID },
    });
    const emails = db.notificationOutbox.create.mock.calls.map((c) => c[0].data);
    expect(emails).toHaveLength(2);
    expect(emails.map((e) => e.templateName)).toEqual(["EVALUATION_SUPERVISOR_CHANGED", "EVALUATION_SUPERVISOR_CHANGED"]);
    expect(emails[0]).toMatchObject({
      recipientEmail: "asha@gara.test",
      payload: {
        recipientName: "Asha",
        recipientRole: "INTERN",
        internName: "Asha",
        openingTitle: "Frontend Internship",
        newSupervisorName: "New Mentor",
      },
    });
    expect(emails[1]).toMatchObject({
      recipientEmail: `${NEW_SUPERVISOR_ID}@gara.test`,
      payload: { recipientName: "New Mentor", recipientRole: "SUPERVISOR" },
    });
  });

  it("reports a concurrent change as a conflict", async () => {
    db.internshipEnrollment.findUnique.mockResolvedValue(runningEnrollment());
    db.internshipEnrollment.updateMany.mockResolvedValue({ count: 0 });
    await expect(evaluationService.changeSupervisor(hrUser, ENROLLMENT_ID, NEW_SUPERVISOR_ID)).rejects.toBeInstanceOf(
      ConflictError
    );
    expect(db.notificationOutbox.create).not.toHaveBeenCalled();
  });

  it("the Server Action rejects supervisors, validates the choice and flushes the outbox", async () => {
    signInAs(MENTOR_ID, [Role.MENTOR]);
    const rejected = await changeEvaluationSupervisorAction(
      form({ enrollmentId: ENROLLMENT_ID, supervisorId: NEW_SUPERVISOR_ID })
    );
    expect(rejected).toEqual({ success: false, error: "Your role is not permitted to perform this action." });

    signInAs(HR_ID, [Role.HR]);
    const invalid = await changeEvaluationSupervisorAction(form({ enrollmentId: ENROLLMENT_ID, supervisorId: "" }));
    expect(invalid).toEqual({ success: false, error: "Please choose the new supervisor" });

    db.internshipEnrollment.findUnique.mockResolvedValue(runningEnrollment());
    const res = await changeEvaluationSupervisorAction(
      form({ enrollmentId: ENROLLMENT_ID, supervisorId: NEW_SUPERVISOR_ID })
    );
    expect(res).toEqual({ success: true, data: { supervisorId: NEW_SUPERVISOR_ID } });
    expect(scheduleOutboxFlush).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Round 5: the review board is one bounded database page per view
// ---------------------------------------------------------------------------

describe("Intern review board (round 5)", () => {
  /** Boundaries for NOW (business date 2026-10-25): today starts 25 Oct, the six-day window ends 31 Oct. */
  const TODAY_START = new Date("2026-10-25T00:00:00.000Z");
  const AFTER_THIS_WEEK = new Date("2026-11-01T00:00:00.000Z");
  const managerUser: AuthenticatedUser = { id: OTHER_USER_ID, name: "Manager", email: "mgr@gara.test", roles: [Role.MANAGER] };

  function boardRow(overrides: Record<string, unknown> = {}) {
    return {
      id: REVIEW_ID,
      reviewPeriodMonths: 3,
      scheduledFor: new Date("2026-10-20T00:00:00.000Z"),
      status: "SCHEDULED",
      outcome: null,
      decidedAt: null,
      internalNotes: "Staff-only notes",
      sharedSummary: null,
      proposedDesignation: null,
      proposedDepartment: null,
      proposedEffectiveDate: null,
      proposedInitialStatus: null,
      offerStatus: null,
      offerRespondedAt: null,
      convertedAt: null,
      reviewer: null,
      period: { startDate: new Date(PAST_JOINING_DATE) },
      employee: {
        id: EMP_ID,
        employeeCode: "GAR-007",
        designation: "Frontend Intern",
        department: "Engineering",
        status: EmployeeStatus.ACTIVE,
        employmentType: "INTERN",
        user: { name: "Asha", email: "asha@gara.test" },
      },
      ...overrides,
    };
  }

  const scheduledBase = (userId: string) => ({
    status: "SCHEDULED",
    employee: { userId: { not: userId }, status: { not: EmployeeStatus.EXITED } },
  });

  it("requires canEmployees before any query", async () => {
    denyPermission("canEmployees");
    await expect(conversionService.listReviewBoard(hrUser, { now: NOW })).rejects.toBeInstanceOf(ForbiddenError);
    expect(db.conversionReview.findMany).not.toHaveBeenCalled();
    expect(db.conversionReview.count).not.toHaveBeenCalled();
  });

  it("loads the default view (due now) as one page and counts every view in the database", async () => {
    db.conversionReview.count.mockImplementation(async ({ where }: { where: { scheduledFor?: { lt?: Date; gte?: Date }; status: string } }) => {
      if (where.status === "COMPLETED") return 7;
      if (where.scheduledFor?.gte && where.scheduledFor?.lt) return 2; // due this week
      if (where.scheduledFor?.lt) return 3; // overdue
      return 11; // upcoming
    });
    db.conversionReview.findMany.mockResolvedValue([boardRow()]);

    const board = await conversionService.listReviewBoard(hrUser, { now: NOW });

    const list = db.conversionReview.findMany.mock.calls[0][0];
    expect(list.where).toEqual({ ...scheduledBase(HR_ID), scheduledFor: { lt: AFTER_THIS_WEEK } });
    expect(list).toMatchObject({ skip: 0, take: 20, orderBy: { scheduledFor: "asc" } });
    expect(list).toHaveProperty("select");
    expect(list).not.toHaveProperty("include");

    const countWheres = db.conversionReview.count.mock.calls.map((call) => (call[0] as { where: unknown }).where);
    expect(countWheres).toEqual(
      expect.arrayContaining([
        { ...scheduledBase(HR_ID), scheduledFor: { lt: TODAY_START } },
        { ...scheduledBase(HR_ID), scheduledFor: { gte: TODAY_START, lt: AFTER_THIS_WEEK } },
        { ...scheduledBase(HR_ID), scheduledFor: { gte: AFTER_THIS_WEEK } },
        { status: "COMPLETED", employee: { userId: { not: HR_ID } } },
      ])
    );
    expect(board).toMatchObject({
      view: "due",
      total: 5,
      pageCount: 1,
      counts: { overdue: 3, dueThisWeek: 2, upcoming: 11, decided: 7 },
      canRecord: true,
    });
    expect(board.items[0]).toMatchObject({ dueState: "OVERDUE", internalNotes: "Staff-only notes" });
  });

  it("pages the decided view newest first and clamps the page size", async () => {
    await conversionService.listReviewBoard(adminUser, { now: NOW, view: "decided", page: 3, pageSize: 500 });
    const list = db.conversionReview.findMany.mock.calls[0][0];
    expect(list.where).toEqual({ status: "COMPLETED", employee: { userId: { not: ADMIN_ID } } });
    expect(list).toMatchObject({ skip: 100, take: 50, orderBy: { decidedAt: "desc" } });
  });

  it("filters overdue and upcoming views by the same calendar boundaries as classifyReviewDue", async () => {
    await conversionService.listReviewBoard(hrUser, { now: NOW, view: "overdue" });
    expect(db.conversionReview.findMany.mock.calls[0][0].where.scheduledFor).toEqual({ lt: TODAY_START });
    db.conversionReview.findMany.mockClear();
    await conversionService.listReviewBoard(hrUser, { now: NOW, view: "upcoming" });
    expect(db.conversionReview.findMany.mock.calls[0][0].where.scheduledFor).toEqual({ gte: AFTER_THIS_WEEK });
  });

  it("hides internal notes from staff who cannot record outcomes and never lists their own review", async () => {
    db.conversionReview.findMany.mockResolvedValue([boardRow()]);
    const board = await conversionService.listReviewBoard(managerUser, { now: NOW });
    expect(board.canRecord).toBe(false);
    expect(board.items[0].internalNotes).toBeNull();
    expect(db.conversionReview.findMany.mock.calls[0][0].where.employee.userId).toEqual({ not: OTHER_USER_ID });
  });
});
