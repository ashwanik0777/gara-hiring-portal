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
 * Staff joining flows (product-owner decisions of 2026-10-25):
 *  1. Select an internship candidate for the 7-working-day evaluation (enrollCandidateAction).
 *  2. Intern "Mark as joined" after a PASSED evaluation (markInternJoinedAction).
 *  3. Welcome emails for joined interns and employees.
 * Real guards run against a mocked session and a mocked Prisma client.
 */

const { db, state } = vi.hoisted(() => {
  const state = {
    session: null as null | { user: { id: string; email: string; name: string } },
    users: {} as Record<string, { roles: string[] }>,
  };
  const db = {
    user: { findUnique: vi.fn(), findMany: vi.fn() },
    subAdminPermission: { findUnique: vi.fn() },
    application: { findUnique: vi.fn(), updateMany: vi.fn() },
    applicationStatusHistory: { create: vi.fn() },
    internshipEnrollment: { findUnique: vi.fn(), create: vi.fn() },
    evaluationCheckpoint: { createMany: vi.fn() },
    employee: { findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn(), updateMany: vi.fn() },
    employmentHistory: { create: vi.fn() },
    employmentPeriod: { create: vi.fn() },
    conversionReview: { create: vi.fn(), updateMany: vi.fn() },
    userRole: { upsert: vi.fn(), deleteMany: vi.fn() },
    notificationOutbox: { create: vi.fn(), findUnique: vi.fn(), updateMany: vi.fn(), update: vi.fn() },
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

import { enrollCandidateAction } from "@/features/internship-evaluation/actions";
import { markInternJoinedAction } from "@/features/employees/actions";
import { employeeService } from "@/features/employees/services/employee-service";
import { MarkInternJoinedSchema } from "@/features/employees/schemas";
import { isFutureJoiningDate, joiningDatePrefill } from "@/features/employees/joining";
import { getInternJourneyState, INTERN_JOURNEY_LABELS } from "@/features/internship-evaluation/joining-state";
import { buildEmployeeJoinedEmail, buildInternJoinedEmail } from "@/infrastructure/email/email-templates";
import { OutboxProcessorService } from "@/infrastructure/email/outbox-processor";
import { scheduleOutboxFlush } from "@/infrastructure/email/outbox-dispatch";
import { OWN_APPLICATION_ACTION_MESSAGE } from "@/features/recruitment/services/application-access";
import { ConflictError, ForbiddenError, ValidationError } from "@/lib/errors";
import type { AuthenticatedUser } from "@/lib/auth/guards";

const HR_ID = "11111111-1111-4111-8111-111111111111";
const ADMIN_ID = "22222222-2222-4222-8222-222222222222";
const CANDIDATE_ID = "33333333-3333-4333-8333-333333333333";
const MENTOR_ID = "44444444-4444-4444-8444-444444444444";
const APP_ID = "55555555-5555-4555-8555-555555555555";
const ENROLLMENT_ID = "66666666-6666-4666-8666-666666666666";
const EMP_ID = "77777777-7777-4777-8777-777777777777";
const MANAGER_EMP_ID = "88888888-8888-4888-8888-888888888888";
const PERIOD_ID = "99999999-9999-4999-8999-999999999999";
const REVIEW_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const DAY_MS = 24 * 60 * 60 * 1000;
const PAST_JOINING_DATE = "2025-01-06";

const hrUser: AuthenticatedUser = { id: HR_ID, name: "HR", email: "hr@gara.test", roles: [Role.HR] };
const adminUser: AuthenticatedUser = { id: ADMIN_ID, name: "Admin", email: "admin@gara.test", roles: [Role.ADMIN] };
const mentorUser: AuthenticatedUser = { id: MENTOR_ID, name: "Mentor", email: "m@gara.test", roles: [Role.MENTOR] };

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
  state.users = { [MENTOR_ID]: { roles: [Role.MENTOR] } };
  db.$transaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => cb(db));
  db.user.findUnique.mockImplementation(async (args: { where: { id: string } }) => {
    const entry = state.users[args.where.id];
    return entry ? { id: args.where.id, mustChangePassword: false, roles: entry.roles.map((role) => ({ role })) } : null;
  });
  db.application.updateMany.mockResolvedValue({ count: 1 });
  db.employee.create.mockImplementation(async (args: { data: Record<string, unknown> }) => ({ id: EMP_ID, ...args.data }));
  db.employee.updateMany.mockResolvedValue({ count: 1 });
  db.employmentPeriod.create.mockResolvedValue({ id: PERIOD_ID });
  db.conversionReview.create.mockImplementation(async (args: { data: { scheduledFor: Date } }) => ({
    id: REVIEW_ID,
    scheduledFor: args.data.scheduledFor,
  }));
  db.conversionReview.updateMany.mockResolvedValue({ count: 0 });
  db.userRole.deleteMany.mockResolvedValue({ count: 0 });
});

// ---------------------------------------------------------------------------
// 1. Select for 7-day evaluation
// ---------------------------------------------------------------------------

describe("enrollCandidateAction (internship step 1)", () => {
  function internshipApplication(overrides: Record<string, unknown> = {}) {
    return {
      id: APP_ID,
      status: ApplicationStatus.INTERVIEWED,
      enrollment: null,
      opening: { title: "Frontend Internship", type: OpeningType.INTERNSHIP },
      candidate: { userId: CANDIDATE_ID, user: { email: "cand@gara.test", name: "Candidate" } },
      ...overrides,
    };
  }

  const enrollForm = () => form({ applicationId: APP_ID, supervisorId: MENTOR_ID });

  it("rejects staff without decision authority (MENTOR) before loading the application", async () => {
    signInAs(MENTOR_ID, [Role.MENTOR]);
    const res = await enrollCandidateAction(enrollForm());
    expect(res).toEqual({ success: false, error: "Your role is not permitted to perform this action." });
    expect(db.application.findUnique).not.toHaveBeenCalled();
  });

  it("requires the canEvaluations permission for HR", async () => {
    signInAs(HR_ID, [Role.HR]);
    denyPermission("canEvaluations");
    const res = await enrollCandidateAction(enrollForm());
    expect(res.success).toBe(false);
    expect(db.application.findUnique).not.toHaveBeenCalled();
  });

  it("validates the supervisor choice with zod", async () => {
    signInAs(HR_ID, [Role.HR]);
    const res = await enrollCandidateAction(form({ applicationId: APP_ID, supervisorId: "" }));
    expect(res).toEqual({ success: false, error: "Please choose a supervisor" });
    expect(db.application.findUnique).not.toHaveBeenCalled();
  });

  it("never lets staff select their own application", async () => {
    signInAs(CANDIDATE_ID, [Role.HR]);
    db.application.findUnique.mockResolvedValue(internshipApplication());
    const res = await enrollCandidateAction(enrollForm());
    expect(res).toEqual({ success: false, error: OWN_APPLICATION_ACTION_MESSAGE });
    expect(db.application.updateMany).not.toHaveBeenCalled();
    expect(db.internshipEnrollment.create).not.toHaveBeenCalled();
  });

  it("rejects full-time applications", async () => {
    signInAs(HR_ID, [Role.HR]);
    db.application.findUnique.mockResolvedValue(
      internshipApplication({ opening: { title: "Engineer", type: OpeningType.FULL_TIME } })
    );
    const res = await enrollCandidateAction(enrollForm());
    expect(res).toEqual({
      success: false,
      error: "Only internship applications can enter the supervised evaluation.",
    });
    expect(db.internshipEnrollment.create).not.toHaveBeenCalled();
  });

  it("enrolls with the chosen supervisor, queues the selection email and flushes the outbox", async () => {
    signInAs(HR_ID, [Role.HR]);
    db.application.findUnique.mockResolvedValue(internshipApplication());
    db.internshipEnrollment.create.mockResolvedValue({ id: ENROLLMENT_ID });
    db.evaluationCheckpoint.createMany.mockResolvedValue({ count: 7 });

    const res = await enrollCandidateAction(enrollForm());

    expect(res).toEqual({ success: true, data: { enrollmentId: ENROLLMENT_ID, created: true } });
    expect(db.internshipEnrollment.create.mock.calls[0][0].data.supervisorId).toBe(MENTOR_ID);
    expect(db.notificationOutbox.create.mock.calls[0][0].data.templateName).toBe(
      "EVALUATION_SELECTION_NOTIFICATION"
    );
    expect(scheduleOutboxFlush).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// 2. Intern "Mark as joined"
// ---------------------------------------------------------------------------

function passedEnrollment(overrides: Record<string, unknown> = {}) {
  return {
    id: ENROLLMENT_ID,
    userId: CANDIDATE_ID,
    status: EvaluationStatus.PASSED,
    application: {
      id: APP_ID,
      referenceCode: "APP-1",
      status: ApplicationStatus.EVALUATION_SELECTED,
      opening: { title: "Frontend Internship", type: OpeningType.INTERNSHIP },
      jobOffer: null,
    },
    user: { id: CANDIDATE_ID, name: "Candidate", email: "cand@gara.test", employeeProfile: null },
    ...overrides,
  };
}

const joinInput = {
  enrollmentId: ENROLLMENT_ID,
  employeeCode: "INT-001",
  department: "Engineering",
  designation: "Frontend Intern",
  joiningDate: PAST_JOINING_DATE,
  initialStatus: EmployeeStatus.ACTIVE,
  reviewAfterMonths: 3 as const,
};

function expectNoJoiningWrites() {
  expect(db.application.updateMany).not.toHaveBeenCalled();
  expect(db.employee.create).not.toHaveBeenCalled();
  expect(db.userRole.upsert).not.toHaveBeenCalled();
  expect(db.notificationOutbox.create).not.toHaveBeenCalled();
  expect(db.employmentPeriod.create).not.toHaveBeenCalled();
  expect(db.conversionReview.create).not.toHaveBeenCalled();
}

describe("employeeService.createEmployeeFromInternship (internship step 2)", () => {
  it.each([mentorUser, { ...mentorUser, roles: [Role.INTERVIEWER] }])(
    "rejects staff other than ADMIN / HR (%o)",
    async (user) => {
      await expect(employeeService.createEmployeeFromInternship(user, joinInput)).rejects.toBeInstanceOf(
        ForbiddenError
      );
      expect(db.internshipEnrollment.findUnique).not.toHaveBeenCalled();
    }
  );

  it("requires canEmployees for HR", async () => {
    denyPermission("canEmployees");
    await expect(employeeService.createEmployeeFromInternship(hrUser, joinInput)).rejects.toBeInstanceOf(
      ForbiddenError
    );
    expect(db.internshipEnrollment.findUnique).not.toHaveBeenCalled();
  });

  it("never marks the actor's own enrollment as joined", async () => {
    db.internshipEnrollment.findUnique.mockResolvedValue(passedEnrollment());
    const hrCandidate: AuthenticatedUser = { ...hrUser, id: CANDIDATE_ID };
    await expect(employeeService.createEmployeeFromInternship(hrCandidate, joinInput)).rejects.toBeInstanceOf(
      ForbiddenError
    );
    expectNoJoiningWrites();
  });

  it.each([
    EvaluationStatus.PENDING_TRIGGER,
    EvaluationStatus.IN_PROGRESS,
    EvaluationStatus.UNDER_REVIEW,
    EvaluationStatus.FAILED,
  ])("requires a PASSED evaluation (rejects %s)", async (status) => {
    db.internshipEnrollment.findUnique.mockResolvedValue(passedEnrollment({ status }));
    await expect(employeeService.createEmployeeFromInternship(adminUser, joinInput)).rejects.toThrow(
      /PASSED/
    );
    expectNoJoiningWrites();
  });

  it("rejects a joining date in the future", async () => {
    const future = new Date(Date.now() + 10 * DAY_MS).toISOString().slice(0, 10);
    await expect(
      employeeService.createEmployeeFromInternship(hrUser, { ...joinInput, joiningDate: future })
    ).rejects.toBeInstanceOf(ValidationError);
    expect(db.internshipEnrollment.findUnique).not.toHaveBeenCalled();
  });

  it("rejects a person who already has an active employee record", async () => {
    db.internshipEnrollment.findUnique.mockResolvedValue(
      passedEnrollment({
        user: {
          id: CANDIDATE_ID,
          name: "Candidate",
          email: "cand@gara.test",
          employeeProfile: { employeeCode: "EMP-9", status: EmployeeStatus.PROBATION },
        },
      })
    );
    await expect(employeeService.createEmployeeFromInternship(hrUser, joinInput)).rejects.toThrow(
      /already has an active employee record/
    );
    expectNoJoiningWrites();
    expect(db.employee.updateMany).not.toHaveBeenCalled();
  });

  it.each([EmployeeStatus.ACTIVE, EmployeeStatus.ON_LEAVE])(
    "still refuses re-joining while the record is %s",
    async (status) => {
      db.internshipEnrollment.findUnique.mockResolvedValue(
        passedEnrollment({
          user: {
            id: CANDIDATE_ID,
            name: "Candidate",
            email: "cand@gara.test",
            employeeProfile: { id: EMP_ID, employeeCode: "INT-001", status, employmentType: "INTERN" },
          },
        })
      );
      await expect(employeeService.createEmployeeFromInternship(hrUser, joinInput)).rejects.toBeInstanceOf(
        ConflictError
      );
      expectNoJoiningWrites();
      expect(db.employee.updateMany).not.toHaveBeenCalled();
    }
  );

  it("requires a 3 or 6 month review choice even when called directly", async () => {
    await expect(
      employeeService.createEmployeeFromInternship(hrUser, {
        ...joinInput,
        reviewAfterMonths: 4 as unknown as 3,
      })
    ).rejects.toBeInstanceOf(ValidationError);
    expect(db.internshipEnrollment.findUnique).not.toHaveBeenCalled();
  });

  it("reports an already joined application as a conflict", async () => {
    db.internshipEnrollment.findUnique.mockResolvedValue(
      passedEnrollment({
        application: { ...passedEnrollment().application, status: ApplicationStatus.HIRED },
      })
    );
    await expect(employeeService.createEmployeeFromInternship(hrUser, joinInput)).rejects.toBeInstanceOf(
      ConflictError
    );
    expectNoJoiningWrites();
  });

  it("refuses to join while a job offer is still pending", async () => {
    db.internshipEnrollment.findUnique.mockResolvedValue(
      passedEnrollment({
        application: { ...passedEnrollment().application, jobOffer: { status: OfferStatus.DRAFT } },
      })
    );
    await expect(employeeService.createEmployeeFromInternship(hrUser, joinInput)).rejects.toThrow(
      /pending job offer/
    );
    expectNoJoiningWrites();
  });

  it("is atomic: a conditional-update conflict writes nothing else", async () => {
    db.internshipEnrollment.findUnique.mockResolvedValue(passedEnrollment());
    db.employee.findUnique.mockResolvedValue(null);
    db.application.updateMany.mockResolvedValue({ count: 0 });

    await expect(employeeService.createEmployeeFromInternship(hrUser, joinInput)).rejects.toBeInstanceOf(
      ConflictError
    );
    expect(db.employee.create).not.toHaveBeenCalled();
    expect(db.userRole.upsert).not.toHaveBeenCalled();
    expect(db.applicationStatusHistory.create).not.toHaveBeenCalled();
    expect(db.notificationOutbox.create).not.toHaveBeenCalled();
    expect(db.auditLog.create).not.toHaveBeenCalled();
  });

  it("maps a unique-constraint race to a conflict", async () => {
    db.internshipEnrollment.findUnique.mockResolvedValue(passedEnrollment());
    db.employee.findUnique.mockResolvedValue(null);
    db.employee.create.mockRejectedValue(Object.assign(new Error("Unique constraint failed"), { code: "P2002" }));

    await expect(employeeService.createEmployeeFromInternship(hrUser, joinInput)).rejects.toBeInstanceOf(
      ConflictError
    );
  });

  it("creates the INTERN record, moves the application to HIRED and grants INTERN with a fresh assignedAt", async () => {
    db.internshipEnrollment.findUnique.mockResolvedValue(passedEnrollment());
    db.employee.findUnique.mockImplementation(async (args: { where: { id?: string; employeeCode?: string } }) =>
      args.where.id === MANAGER_EMP_ID
        ? { id: MANAGER_EMP_ID, employeeCode: "MGR-1", managerId: null, status: EmployeeStatus.ACTIVE }
        : null
    );

    const before = Date.now();
    const result = await employeeService.createEmployeeFromInternship(hrUser, {
      ...joinInput,
      initialStatus: EmployeeStatus.PROBATION,
      managerId: MANAGER_EMP_ID,
    });

    expect(result).toEqual({
      employeeId: EMP_ID,
      applicationId: APP_ID,
      enrollmentId: ENROLLMENT_ID,
      reviewId: REVIEW_ID,
      rejoined: false,
    });

    expect(db.application.updateMany).toHaveBeenCalledWith({
      where: {
        id: APP_ID,
        status: ApplicationStatus.EVALUATION_SELECTED,
        enrollment: { is: { status: EvaluationStatus.PASSED } },
      },
      data: { status: ApplicationStatus.HIRED },
    });

    const employee = db.employee.create.mock.calls[0][0].data;
    expect(employee).toMatchObject({
      userId: CANDIDATE_ID,
      employeeCode: "INT-001",
      employmentType: "INTERN",
      status: EmployeeStatus.PROBATION,
      applicationId: APP_ID,
      managerId: MANAGER_EMP_ID,
    });

    const history = db.applicationStatusHistory.create.mock.calls[0][0].data;
    expect(history.fromStatus).toBe(ApplicationStatus.EVALUATION_SELECTED);
    expect(history.toStatus).toBe(ApplicationStatus.HIRED);
    expect(db.employmentHistory.create.mock.calls[0][0].data.changeType).toBe("INTERN_JOINED");

    const role = db.userRole.upsert.mock.calls[0][0];
    expect(role.where).toEqual({ userId_role: { userId: CANDIDATE_ID, role: Role.INTERN } });
    // A stale INTERN row must get a fresh assignedAt (it drives the portal upgrade banner).
    expect(role.update.assignedAt).toBeInstanceOf(Date);
    expect(role.update.assignedAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(role.create).toMatchObject({ userId: CANDIDATE_ID, role: Role.INTERN, assignedBy: HR_ID });

    const email = db.notificationOutbox.create.mock.calls[0][0].data;
    expect(email.templateName).toBe("INTERN_JOINED");
    expect(email.recipientEmail).toBe("cand@gara.test");

    const audit = db.auditLog.create.mock.calls[0][0].data;
    expect(audit.action).toBe("MARK_INTERN_JOINED");
    expect(audit.diffPayload).toMatchObject({
      roleGranted: Role.INTERN,
      applicationToStatus: ApplicationStatus.HIRED,
      isRejoin: false,
      periodId: PERIOD_ID,
      reviewId: REVIEW_ID,
    });

    // A JOINED period opens in the same transaction.
    expect(db.employmentPeriod.create.mock.calls[0][0].data).toMatchObject({
      employeeId: EMP_ID,
      employmentType: "INTERN",
      startReason: "JOINED",
      applicationId: APP_ID,
      startDate: new Date(PAST_JOINING_DATE),
    });
    // First progress review: joining date + 3 months.
    expect(db.conversionReview.create.mock.calls[0][0].data).toMatchObject({
      employeeId: EMP_ID,
      periodId: PERIOD_ID,
      reviewPeriodMonths: 3,
      status: "SCHEDULED",
      scheduledFor: new Date("2025-04-06T00:00:00.000Z"),
    });
    expect(email.payload).not.toHaveProperty("isRejoin");
    expect(db.userRole.deleteMany).not.toHaveBeenCalled();
  });
});

describe("markInternJoinedAction", () => {
  const joinForm = (overrides: Record<string, string> = {}) =>
    form({
      enrollmentId: ENROLLMENT_ID,
      employeeCode: "INT-001",
      department: "Engineering",
      designation: "Frontend Intern",
      joiningDate: PAST_JOINING_DATE,
      initialStatus: EmployeeStatus.ACTIVE,
      managerId: "",
      reviewAfterMonths: "6",
      ...overrides,
    });

  it("requires an explicit initial status (no default)", async () => {
    signInAs(HR_ID, [Role.HR]);
    const res = await markInternJoinedAction(joinForm({ initialStatus: "" }));
    expect(res.success).toBe(false);
    if (!res.success) expect(res.fieldErrors?.initialStatus).toBeDefined();
    expect(db.internshipEnrollment.findUnique).not.toHaveBeenCalled();
    expect(MarkInternJoinedSchema.safeParse({ ...joinInput, initialStatus: EmployeeStatus.EXITED }).success).toBe(
      false
    );
  });

  it("requires an explicit progress review choice (no default)", async () => {
    signInAs(HR_ID, [Role.HR]);
    for (const reviewAfterMonths of ["", "4", "12"]) {
      const res = await markInternJoinedAction(joinForm({ reviewAfterMonths }));
      expect(res.success).toBe(false);
      if (!res.success) expect(res.fieldErrors?.reviewAfterMonths).toBeDefined();
    }
    expect(db.internshipEnrollment.findUnique).not.toHaveBeenCalled();
  });

  it("schedules the first review 6 months after joining when HR chooses 6", async () => {
    signInAs(ADMIN_ID, [Role.ADMIN]);
    db.internshipEnrollment.findUnique.mockResolvedValue(passedEnrollment());
    db.employee.findUnique.mockResolvedValue(null);

    const res = await markInternJoinedAction(joinForm());

    expect(res.success).toBe(true);
    expect(db.conversionReview.create.mock.calls[0][0].data).toMatchObject({
      reviewPeriodMonths: 6,
      scheduledFor: new Date("2025-07-06T00:00:00.000Z"),
    });
  });

  it("rejects supervisors before reaching the service", async () => {
    signInAs(MENTOR_ID, [Role.MENTOR]);
    const res = await markInternJoinedAction(joinForm());
    expect(res.success).toBe(false);
    expect(db.internshipEnrollment.findUnique).not.toHaveBeenCalled();
  });

  it("marks the intern as joined and flushes the outbox", async () => {
    signInAs(ADMIN_ID, [Role.ADMIN]);
    db.internshipEnrollment.findUnique.mockResolvedValue(passedEnrollment());
    db.employee.findUnique.mockResolvedValue(null);

    const res = await markInternJoinedAction(joinForm());

    expect(res).toEqual({ success: true, data: { employeeId: EMP_ID } });
    expect(scheduleOutboxFlush).toHaveBeenCalledTimes(1);
  });

  it("does not flush the outbox when joining fails", async () => {
    signInAs(HR_ID, [Role.HR]);
    db.internshipEnrollment.findUnique.mockResolvedValue(passedEnrollment({ status: EvaluationStatus.IN_PROGRESS }));
    const res = await markInternJoinedAction(joinForm());
    expect(res.success).toBe(false);
    expect(scheduleOutboxFlush).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

describe("Joining date rule", () => {
  const now = new Date("2026-10-25T02:00:00.000Z");

  it("accepts today and past days, including today in time zones ahead of UTC", () => {
    expect(isFutureJoiningDate(new Date("2026-10-25"), now)).toBe(false);
    expect(isFutureJoiningDate(new Date("2026-10-01"), now)).toBe(false);
    // 20:00 UTC on Oct 24 is already 01:30 on Oct 25 in India: Oct 25 is not "future".
    expect(isFutureJoiningDate(new Date("2026-10-25"), new Date("2026-10-24T20:00:00.000Z"))).toBe(false);
    // Oct 26 begins in UTC+14 at 10:00 UTC on Oct 25.
    expect(isFutureJoiningDate(new Date("2026-10-26"), now)).toBe(true);
    expect(isFutureJoiningDate(new Date("2026-10-26"), new Date("2026-10-25T10:00:00.000Z"))).toBe(false);
  });

  it("rejects days that have not begun in any time zone", () => {
    expect(isFutureJoiningDate(new Date("2026-10-27"), now)).toBe(true);
    expect(isFutureJoiningDate(new Date("2026-12-01"), now)).toBe(true);
  });

  it("prefills the agreed date only once it has been reached", () => {
    expect(joiningDatePrefill(new Date("2026-10-20T00:00:00.000Z"), now)).toBe("2026-10-20");
    expect(joiningDatePrefill(new Date("2026-12-01T00:00:00.000Z"), now)).toBe("");
    expect(joiningDatePrefill(null, now)).toBe("");
  });
});

describe("Intern journey labels", () => {
  it("labels selection, awaiting joining and joined states", () => {
    expect(INTERN_JOURNEY_LABELS[getInternJourneyState({ evaluationStatus: "IN_PROGRESS" })]).toBe(
      "Selected for evaluation"
    );
    expect(INTERN_JOURNEY_LABELS[getInternJourneyState({ evaluationStatus: "PASSED" })]).toBe(
      "Evaluation passed — awaiting joining"
    );
    expect(INTERN_JOURNEY_LABELS[getInternJourneyState({ evaluationStatus: "PASSED", joinedAs: "INTERN" })]).toBe(
      "Joined as intern"
    );
    expect(getInternJourneyState({ evaluationStatus: "PASSED", joinedAs: "FULL_TIME" })).toBe("JOINED_AS_EMPLOYEE");
  });
});

// ---------------------------------------------------------------------------
// 3. Welcome emails
// ---------------------------------------------------------------------------

describe("Joined welcome emails escape untrusted values", () => {
  const hostile = {
    recipientName: `<script>alert("x")</script>`,
    employeeCode: `INT-1"><img src=x onerror=alert(1)>`,
    department: "R&D <b>",
    designation: "<i>Intern</i>",
    joiningDate: "2026-10-20T00:00:00.000Z",
  };

  it("escapes every interpolated value in the intern email and links to the intern workspace", () => {
    const email = buildInternJoinedEmail({ ...hostile, openingTitle: "<svg onload=alert(1)>" });
    expect(email.html).not.toContain("<script>");
    expect(email.html).not.toContain("<img src=x");
    expect(email.html).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(email.html).not.toContain("<svg");
    expect(email.html).not.toContain("<i>Intern</i>");
    expect(email.html).toContain("&lt;script&gt;");
    expect(email.html).toContain("R&amp;D &lt;b&gt;");
    expect(email.html).toContain("/intern/dashboard");
    for (const feature of ["Intern workspace", "Attendance", "Leave requests", "Payslips", "ID card &amp; certificate"]) {
      expect(email.html).toContain(feature);
    }
    expect(email.html).toContain("20 October 2026");
  });

  it("escapes every interpolated value in the employee email and links to the employee home", () => {
    const email = buildEmployeeJoinedEmail(hostile);
    expect(email.html).not.toContain("<script>");
    expect(email.html).not.toContain("<img src=x");
    expect(email.html).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(email.html).not.toContain("<i>Intern</i>");
    expect(email.html).toContain("&lt;i&gt;Intern&lt;/i&gt;");
    expect(email.html).toMatch(/href="[^"]*\/hrms"/);
    expect(email.text).toContain("Employee home");
  });

  it.each([
    ["INTERN_JOINED", { recipientName: "Asha", designation: "Intern" }, "/intern/dashboard"],
    ["EMPLOYEE_JOINED", { employeeName: "Ravi", designation: "Engineer" }, "/hrms"],
    ["EMPLOYEE_ONBOARDING_WELCOME", { employeeName: "Ravi", designation: "Engineer" }, "/hrms"],
  ])("renders %s through the outbox processor", async (templateName, payload, link) => {
    const sendEmail = vi.fn().mockResolvedValue(undefined);
    const processor = new OutboxProcessorService({ sendEmail });
    db.notificationOutbox.findUnique.mockResolvedValue({
      id: "outbox-1",
      recipientEmail: "person@gara.test",
      templateName,
      payload,
      status: "PENDING",
      attempts: 0,
      maxAttempts: 5,
      sentAt: null,
      claimedAt: null,
    });
    db.notificationOutbox.updateMany.mockResolvedValue({ count: 1 });
    db.notificationOutbox.update.mockResolvedValue({});

    await expect(processor.processSingleRecord("outbox-1")).resolves.toBe("SENT");
    const message = sendEmail.mock.calls[0][0];
    expect(message.subject).toMatch(/Welcome aboard/);
    expect(message.html).toContain(link);
  });
});

// ---------------------------------------------------------------------------
// Round 5: the reporting-manager picker is bounded and selected
// ---------------------------------------------------------------------------

describe("employeeService.listReportingManagerOptions (joining dialogs)", () => {
  beforeEach(() => {
    db.employee.findMany.mockResolvedValue([
      { id: MANAGER_EMP_ID, employeeCode: "GAR-001", designation: "Lead", user: { name: "Lead Person" } },
    ]);
  });

  it("is limited to HR / Admin with canEmployees", async () => {
    await expect(employeeService.listReportingManagerOptions(mentorUser)).rejects.toBeInstanceOf(ForbiddenError);
    denyPermission("canEmployees");
    await expect(employeeService.listReportingManagerOptions(hrUser)).rejects.toBeInstanceOf(ForbiddenError);
    expect(db.employee.findMany).not.toHaveBeenCalled();
  });

  it("returns at most 100 active employees with only the picker columns", async () => {
    const options = await employeeService.listReportingManagerOptions(hrUser);
    const args = db.employee.findMany.mock.calls[0][0];
    expect(args).toMatchObject({ where: { status: { not: EmployeeStatus.EXITED } }, take: 100, orderBy: { employeeCode: "asc" } });
    expect(args).not.toHaveProperty("include");
    expect(Object.keys(args.select).sort()).toEqual(["designation", "employeeCode", "id", "user"]);
    expect(options).toEqual([{ id: MANAGER_EMP_ID, employeeCode: "GAR-001", name: "Lead Person", designation: "Lead" }]);
  });

  it("narrows by search, excludes the edited employee and caps a larger take at 100", async () => {
    await employeeService.listReportingManagerOptions(adminUser, { search: " lead ", excludeEmployeeId: EMP_ID, take: 500 });
    const args = db.employee.findMany.mock.calls[0][0];
    expect(args.take).toBe(100);
    expect(args.where.id).toEqual({ not: EMP_ID });
    expect(args.where.OR).toEqual(
      expect.arrayContaining([{ user: { name: { contains: "lead", mode: "insensitive" } } }])
    );
  });
});
