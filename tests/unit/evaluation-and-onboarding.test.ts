import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  ApplicationStatus,
  CheckpointStatus,
  EvaluationStatus,
  IdCardStatus,
  OnboardingStatus,
  OpeningType,
  Role,
} from "@prisma/client";
import type { AuthenticatedUser } from "@/lib/auth/guards";

// ---------------------------------------------------------------------------
// Prisma mock: every model exposes the same vi.fn() methods; `$transaction`
// runs interactive callbacks against the same mock object.
// ---------------------------------------------------------------------------
const { db, resetDb, mockRequireAuth, mockGetCurrentUser, mockRedirect } = vi.hoisted(() => {
  const model = () => ({
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
    create: vi.fn(),
    createMany: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    upsert: vi.fn(),
  });
  const mock = {
    application: model(),
    applicationStatusHistory: model(),
    internshipEnrollment: model(),
    evaluationCheckpoint: model(),
    internOnboarding: model(),
    internIdCard: model(),
    notificationOutbox: model(),
    auditLog: model(),
    user: model(),
    userRole: model(),
    subAdminPermission: model(),
    $transaction: vi.fn(),
    $queryRaw: vi.fn(),
  };
  const reset = () => {
    for (const value of Object.values(mock)) {
      if (typeof value === "function") {
        value.mockReset();
      } else {
        for (const fn of Object.values(value)) fn.mockReset();
      }
    }
    mock.$transaction.mockImplementation(async (arg: unknown) =>
      typeof arg === "function" ? (arg as (tx: typeof mock) => Promise<unknown>)(mock) : Promise.all(arg as Promise<unknown>[])
    );
    mock.$queryRaw.mockResolvedValue([]);
    // No custom SubAdminPermission row: role defaults apply (all staff defaults include canEvaluations).
    mock.subAdminPermission.findUnique.mockResolvedValue(null);
    mock.auditLog.create.mockResolvedValue({ id: "audit-1" });
    mock.notificationOutbox.create.mockResolvedValue({ id: "outbox-1" });
    mock.applicationStatusHistory.create.mockResolvedValue({ id: "history-1" });
  };
  reset();
  return {
    db: mock,
    resetDb: reset,
    mockRequireAuth: vi.fn(),
    mockGetCurrentUser: vi.fn(),
    // Mirrors next/navigation: redirect() never returns.
    mockRedirect: vi.fn((url: string) => {
      throw new Error(`NEXT_REDIRECT:${url}`);
    }),
  };
});

vi.mock("@/lib/db", () => ({ prisma: db }));
vi.mock("@/lib/auth/guards", () => ({ requireAuth: mockRequireAuth, getCurrentUser: mockGetCurrentUser }));
vi.mock("next/navigation", () => ({ redirect: mockRedirect }));
vi.mock("@/components/dashboard/dashboard-shell", () => ({ DashboardShell: () => null }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/infrastructure/email/outbox-dispatch", () => ({ scheduleOutboxFlush: vi.fn() }));

import {
  WorkingDayService,
  DEFAULT_WORKING_CALENDAR,
} from "@/features/internship-evaluation/services/working-day-service";
import { evaluationService } from "@/features/internship-evaluation/services/evaluation-service";
import {
  finalizeEvaluationAction,
  reviewCheckpointAction,
  submitCheckpointAction,
} from "@/features/internship-evaluation/actions";
import HrmsLayout from "@/app/hrms/layout";
import { HRMS_NAV_ITEMS, INTERN_NAV_ITEMS } from "@/config/dashboard-nav";
import { ConflictError, ForbiddenError, NotFoundError, PolicyBlockedError, ValidationError } from "@/lib/errors";

const ENROLLMENT_ID = "11111111-1111-4111-8111-111111111111";
const APPLICATION_ID = "22222222-2222-4222-8222-222222222222";
const CHECKPOINT_ID = "33333333-3333-4333-8333-333333333333";
const INTERN_ID = "44444444-4444-4444-8444-444444444444";

function staff(id: string, roles: Role[]): AuthenticatedUser {
  return { id, email: `${id}@gara.test`, name: `User ${id}`, roles };
}

const admin = staff("admin-1", [Role.ADMIN]);
const hr = staff("hr-1", [Role.HR]);
const assignedMentor = staff("mentor-1", [Role.MENTOR]);
const otherMentor = staff("mentor-2", [Role.MENTOR]);
const intern = staff(INTERN_ID, [Role.CANDIDATE]);

function enrollment(overrides: Record<string, unknown> = {}) {
  return {
    id: ENROLLMENT_ID,
    applicationId: APPLICATION_ID,
    userId: INTERN_ID,
    supervisorId: assignedMentor.id,
    status: EvaluationStatus.IN_PROGRESS,
    workingDaysTarget: 7,
    application: {
      status: ApplicationStatus.EVALUATION_SELECTED,
      candidate: { user: { email: "intern@gara.test", name: "Intern" } },
      opening: { title: "Frontend Internship" },
    },
    ...overrides,
  };
}

beforeEach(() => {
  resetDb();
  mockRequireAuth.mockReset();
  mockGetCurrentUser.mockReset();
  mockRedirect.mockClear();
});

describe("Working Day Service & Calendar Boundaries (Prompt 5 / OD-002)", () => {
  const service = new WorkingDayService();

  it("calculates 7 working days starting on a Monday with standard Mon-Fri calendar", () => {
    const monday = new Date(Date.UTC(2026, 2, 2, 0, 0, 0));
    const endDate = service.addWorkingDays(monday, 7, DEFAULT_WORKING_CALENDAR);
    expect(endDate.getUTCFullYear()).toBe(2026);
    expect(endDate.getUTCMonth()).toBe(2);
    expect(endDate.getUTCDate()).toBe(10);
  });

  it("strictly honors explicit holidays and advances end date accordingly", () => {
    const monday = new Date(Date.UTC(2026, 2, 2, 0, 0, 0));
    const endDate = service.addWorkingDays(monday, 7, {
      workingDaysOfWeek: [1, 2, 3, 4, 5],
      holidays: ["2026-03-03", "2026-03-04"],
    });
    expect(endDate.getUTCDate()).toBe(12);
  });

  it("accurately counts working days between dates excluding weekends and holidays", () => {
    const startDate = new Date(Date.UTC(2026, 2, 2, 0, 0, 0));
    const endDate = new Date(Date.UTC(2026, 2, 13, 0, 0, 0));
    expect(service.countWorkingDays(startDate, endDate, DEFAULT_WORKING_CALENDAR)).toBe(10);
    expect(
      service.countWorkingDays(startDate, endDate, { workingDaysOfWeek: [1, 2, 3, 4, 5], holidays: ["2026-03-05"] })
    ).toBe(9);
  });
});

describe("enrollCandidate", () => {
  function application(overrides: Record<string, unknown> = {}) {
    return {
      id: APPLICATION_ID,
      status: ApplicationStatus.INTERVIEWED,
      enrollment: null,
      opening: { title: "Frontend Internship", type: OpeningType.INTERNSHIP },
      candidate: { userId: INTERN_ID, user: { email: "intern@gara.test", name: "Intern" } },
      ...overrides,
    };
  }

  it("rejects supervisors (MENTOR) without decision authority", async () => {
    await expect(evaluationService.enrollCandidate(assignedMentor, APPLICATION_ID)).rejects.toBeInstanceOf(ForbiddenError);
    expect(db.application.findUnique).not.toHaveBeenCalled();
  });

  it("rejects full-time applications", async () => {
    db.application.findUnique.mockResolvedValue(
      application({ opening: { title: "Engineer", type: OpeningType.FULL_TIME } })
    );
    await expect(evaluationService.enrollCandidate(hr, APPLICATION_ID)).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects applications whose status cannot transition to EVALUATION_SELECTED", async () => {
    db.application.findUnique.mockResolvedValue(application({ status: ApplicationStatus.SUBMITTED }));
    await expect(evaluationService.enrollCandidate(hr, APPLICATION_ID)).rejects.toThrow(
      /cannot be moved to EVALUATION_SELECTED/
    );
    expect(db.internshipEnrollment.create).not.toHaveBeenCalled();
  });

  it("rejects a supervisor who is not a staff member", async () => {
    db.application.findUnique.mockResolvedValue(application());
    db.user.findUnique.mockResolvedValue({ id: "cand-9", roles: [{ role: Role.CANDIDATE }] });
    await expect(
      evaluationService.enrollCandidate(hr, APPLICATION_ID, "55555555-5555-4555-8555-555555555555")
    ).rejects.toThrow(/supervisor must be a staff member/);
  });

  it("moves the application with a conditional update and records accurate history", async () => {
    db.application.findUnique.mockResolvedValue(application());
    db.application.updateMany.mockResolvedValue({ count: 1 });
    db.internshipEnrollment.create.mockResolvedValue({ id: ENROLLMENT_ID });
    db.evaluationCheckpoint.createMany.mockResolvedValue({ count: 7 });

    const result = await evaluationService.enrollCandidate(hr, APPLICATION_ID);

    expect(result).toEqual({ enrollmentId: ENROLLMENT_ID, created: true });
    expect(db.application.updateMany).toHaveBeenCalledWith({
      where: { id: APPLICATION_ID, status: ApplicationStatus.INTERVIEWED },
      data: { status: ApplicationStatus.EVALUATION_SELECTED },
    });
    expect(db.applicationStatusHistory.create.mock.calls[0][0].data.fromStatus).toBe(ApplicationStatus.INTERVIEWED);
  });
});

describe("triggerEvaluationStart (BUG-05 / SEC-15)", () => {
  it("rejects a mentor who is not the assigned supervisor", async () => {
    db.internshipEnrollment.findUnique.mockResolvedValue(enrollment({ status: EvaluationStatus.PENDING_TRIGGER }));
    await expect(
      evaluationService.triggerEvaluationStart(otherMentor, ENROLLMENT_ID, new Date("2026-03-02"))
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(db.internshipEnrollment.updateMany).not.toHaveBeenCalled();
  });

  it("rejects the assigned supervisor when canEvaluations has been revoked", async () => {
    db.subAdminPermission.findUnique.mockResolvedValue({
      canApplications: false,
      canOpenings: false,
      canInterviews: false,
      canEvaluations: false,
      canEmployees: false,
      canAttendance: false,
      canLeave: false,
      canPayroll: false,
      canReports: false,
    });
    await expect(
      evaluationService.triggerEvaluationStart(assignedMentor, ENROLLMENT_ID, new Date("2026-03-02"))
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(db.internshipEnrollment.findUnique).not.toHaveBeenCalled();
  });

  it("never resets a finalized evaluation back to IN_PROGRESS", async () => {
    db.internshipEnrollment.findUnique.mockResolvedValue(enrollment({ status: EvaluationStatus.PASSED }));
    await expect(
      evaluationService.triggerEvaluationStart(hr, ENROLLMENT_ID, new Date("2026-03-02"))
    ).rejects.toBeInstanceOf(ConflictError);
    expect(db.internshipEnrollment.updateMany).not.toHaveBeenCalled();
  });

  it("lets the assigned supervisor start a PENDING_TRIGGER evaluation with a conditional update", async () => {
    db.internshipEnrollment.findUnique.mockResolvedValue(
      enrollment({
        status: EvaluationStatus.PENDING_TRIGGER,
        application: {
          status: ApplicationStatus.EVALUATION_SELECTED,
          candidate: { user: { email: "intern@gara.test", name: "Intern" } },
        },
      })
    );
    db.internshipEnrollment.updateMany.mockResolvedValue({ count: 1 });

    await evaluationService.triggerEvaluationStart(assignedMentor, ENROLLMENT_ID, new Date("2026-03-02"));

    expect(db.internshipEnrollment.updateMany.mock.calls[0][0].where).toEqual({
      id: ENROLLMENT_ID,
      status: EvaluationStatus.PENDING_TRIGGER,
    });
    const history = db.applicationStatusHistory.create.mock.calls[0][0].data;
    expect(history.fromStatus).toBe(ApplicationStatus.EVALUATION_SELECTED);
    expect(history.toStatus).toBe(ApplicationStatus.EVALUATION_SELECTED);
  });

  it("reports a conflict when a concurrent request already started the evaluation", async () => {
    db.internshipEnrollment.findUnique.mockResolvedValue(enrollment({ status: EvaluationStatus.PENDING_TRIGGER }));
    db.internshipEnrollment.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      evaluationService.triggerEvaluationStart(hr, ENROLLMENT_ID, new Date("2026-03-02"))
    ).rejects.toBeInstanceOf(ConflictError);
  });
});

describe("Checkpoint transitions (BUG-06)", () => {
  function checkpoint(status: CheckpointStatus, enrollmentStatus: EvaluationStatus = EvaluationStatus.IN_PROGRESS) {
    return {
      id: CHECKPOINT_ID,
      enrollmentId: ENROLLMENT_ID,
      dayNumber: 2,
      status,
      supervisorFeedback: status === CheckpointStatus.PENDING ? null : "Earlier feedback",
      enrollment: { id: ENROLLMENT_ID, userId: INTERN_ID, supervisorId: assignedMentor.id, status: enrollmentStatus },
    };
  }

  it("blocks interns from submitting another intern's checkpoint", async () => {
    db.evaluationCheckpoint.findUnique.mockResolvedValue(checkpoint(CheckpointStatus.PENDING));
    await expect(
      evaluationService.submitCheckpoint(staff("other-intern", [Role.CANDIDATE]), CHECKPOINT_ID, "notes")
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("does not let the intern turn a REVIEWED checkpoint back to SUBMITTED", async () => {
    db.evaluationCheckpoint.findUnique.mockResolvedValue(checkpoint(CheckpointStatus.REVIEWED));
    await expect(evaluationService.submitCheckpoint(intern, CHECKPOINT_ID, "notes")).rejects.toBeInstanceOf(ConflictError);
    expect(db.evaluationCheckpoint.updateMany).not.toHaveBeenCalled();
  });

  it("rejects submissions when the evaluation is not running", async () => {
    db.evaluationCheckpoint.findUnique.mockResolvedValue(checkpoint(CheckpointStatus.PENDING, EvaluationStatus.PASSED));
    await expect(evaluationService.submitCheckpoint(intern, CHECKPOINT_ID, "notes")).rejects.toBeInstanceOf(ValidationError);
  });

  it("lets the assigned supervisor review a PENDING checkpoint directly (supervisor-led, audit-logged)", async () => {
    db.evaluationCheckpoint.findUnique.mockResolvedValue(checkpoint(CheckpointStatus.PENDING));
    db.evaluationCheckpoint.updateMany.mockResolvedValue({ count: 1 });

    await evaluationService.reviewCheckpoint(assignedMentor, CHECKPOINT_ID, "Observed on site", CheckpointStatus.REVIEWED);

    const update = db.evaluationCheckpoint.updateMany.mock.calls[0][0];
    expect(update.where).toMatchObject({
      id: CHECKPOINT_ID,
      status: CheckpointStatus.PENDING,
      enrollment: { status: EvaluationStatus.IN_PROGRESS },
    });
    expect(update.data).toMatchObject({
      status: CheckpointStatus.REVIEWED,
      supervisorFeedback: "Observed on site",
      reviewedById: assignedMentor.id,
    });
    expect(db.auditLog.create.mock.calls[0][0].data).toMatchObject({
      action: "EVALUATION_CHECKPOINT_REVIEWED",
      resourceId: CHECKPOINT_ID,
      diffPayload: {
        fromStatus: CheckpointStatus.PENDING,
        toStatus: CheckpointStatus.REVIEWED,
        reviewedWithoutInternSubmission: true,
      },
    });
  });

  it("lets HR review a PENDING checkpoint of any intern", async () => {
    db.evaluationCheckpoint.findUnique.mockResolvedValue(checkpoint(CheckpointStatus.PENDING));
    db.evaluationCheckpoint.updateMany.mockResolvedValue({ count: 1 });
    await expect(
      evaluationService.reviewCheckpoint(hr, CHECKPOINT_ID, "Needs more detail", CheckpointStatus.BLOCKED)
    ).resolves.toEqual({ enrollmentId: ENROLLMENT_ID });
  });

  it("requires an explicitly chosen outcome when reviewing (no default)", async () => {
    mockRequireAuth.mockResolvedValue(assignedMentor);
    const formData = new FormData();
    formData.set("checkpointId", CHECKPOINT_ID);
    formData.set("feedback", "Looks good");

    const res = await reviewCheckpointAction(formData);

    expect(res).toEqual({ success: false, error: "Review status must be REVIEWED or BLOCKED" });
    expect(db.evaluationCheckpoint.findUnique).not.toHaveBeenCalled();
    expect(db.evaluationCheckpoint.updateMany).not.toHaveBeenCalled();
  });

  it("refuses PENDING checkpoint reviews from unauthorized users", async () => {
    db.evaluationCheckpoint.findUnique.mockResolvedValue(checkpoint(CheckpointStatus.PENDING));

    // Unassigned supervisor
    await expect(
      evaluationService.reviewCheckpoint(otherMentor, CHECKPOINT_ID, "x", CheckpointStatus.REVIEWED)
    ).rejects.toBeInstanceOf(ForbiddenError);
    // The intern (no staff role) cannot review their own checkpoint
    await expect(
      evaluationService.reviewCheckpoint(intern, CHECKPOINT_ID, "x", CheckpointStatus.REVIEWED)
    ).rejects.toBeInstanceOf(ForbiddenError);
    // Staff member reviewing their own enrollment
    await expect(
      evaluationService.reviewCheckpoint(staff(INTERN_ID, [Role.HR]), CHECKPOINT_ID, "x", CheckpointStatus.REVIEWED)
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(db.evaluationCheckpoint.updateMany).not.toHaveBeenCalled();
    expect(db.auditLog.create).not.toHaveBeenCalled();
  });

  it("refuses PENDING checkpoint reviews once the evaluation is no longer running", async () => {
    db.evaluationCheckpoint.findUnique.mockResolvedValue(
      checkpoint(CheckpointStatus.PENDING, EvaluationStatus.PASSED)
    );
    await expect(
      evaluationService.reviewCheckpoint(hr, CHECKPOINT_ID, "Late review", CheckpointStatus.REVIEWED)
    ).rejects.toBeInstanceOf(ValidationError);
    expect(db.evaluationCheckpoint.updateMany).not.toHaveBeenCalled();
  });

  it("lets the intern submit notes for their own PENDING checkpoint through the action", async () => {
    mockRequireAuth.mockResolvedValue(intern);
    db.evaluationCheckpoint.findUnique.mockResolvedValue(checkpoint(CheckpointStatus.PENDING));
    db.evaluationCheckpoint.updateMany.mockResolvedValue({ count: 1 });
    const formData = new FormData();
    formData.set("checkpointId", CHECKPOINT_ID);
    formData.set("submissionNotes", "Set up the repository and ran the build.");

    const res = await submitCheckpointAction(formData);

    expect(res).toEqual({ success: true, data: null });
    expect(db.evaluationCheckpoint.updateMany).toHaveBeenCalledWith({
      where: {
        id: CHECKPOINT_ID,
        status: CheckpointStatus.PENDING,
        enrollment: { status: EvaluationStatus.IN_PROGRESS },
      },
      data: {
        submissionNotes: "Set up the repository and ran the build.",
        status: CheckpointStatus.SUBMITTED,
      },
    });
  });

  it("refuses an intern submitting another intern's checkpoint through the action", async () => {
    mockRequireAuth.mockResolvedValue(staff("other-intern", [Role.CANDIDATE]));
    db.evaluationCheckpoint.findUnique.mockResolvedValue(checkpoint(CheckpointStatus.PENDING));
    const formData = new FormData();
    formData.set("checkpointId", CHECKPOINT_ID);
    formData.set("submissionNotes", "Not my checkpoint");

    const res = await submitCheckpointAction(formData);

    expect(res).toEqual({ success: false, error: "You can only submit checkpoints for your own evaluation." });
    expect(db.evaluationCheckpoint.updateMany).not.toHaveBeenCalled();
  });

  it("rejects review outcomes other than REVIEWED / BLOCKED", async () => {
    await expect(
      evaluationService.reviewCheckpoint(hr, CHECKPOINT_ID, "x", CheckpointStatus.PENDING)
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects reviews from a mentor who is not assigned to the intern", async () => {
    db.evaluationCheckpoint.findUnique.mockResolvedValue(checkpoint(CheckpointStatus.SUBMITTED));
    await expect(
      evaluationService.reviewCheckpoint(otherMentor, CHECKPOINT_ID, "x", CheckpointStatus.REVIEWED)
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("records the review conditionally and keeps the previous feedback in the audit log", async () => {
    db.evaluationCheckpoint.findUnique.mockResolvedValue(checkpoint(CheckpointStatus.SUBMITTED));
    db.evaluationCheckpoint.updateMany.mockResolvedValue({ count: 1 });

    await evaluationService.reviewCheckpoint(assignedMentor, CHECKPOINT_ID, "Needs rework", CheckpointStatus.BLOCKED);

    expect(db.evaluationCheckpoint.updateMany.mock.calls[0][0].where).toMatchObject({
      id: CHECKPOINT_ID,
      status: CheckpointStatus.SUBMITTED,
      enrollment: { status: EvaluationStatus.IN_PROGRESS },
    });
    const audit = db.auditLog.create.mock.calls[0][0].data;
    expect(audit.action).toBe("EVALUATION_CHECKPOINT_REVIEWED");
    expect(audit.diffPayload).toMatchObject({
      fromStatus: CheckpointStatus.SUBMITTED,
      toStatus: CheckpointStatus.BLOCKED,
      previousFeedback: "Earlier feedback",
    });
  });
});

describe("finalizeEvaluation (BUG-05 / POL-07)", () => {
  it("cannot finalize an evaluation that has not started", async () => {
    db.internshipEnrollment.findUnique.mockResolvedValue(enrollment({ status: EvaluationStatus.PENDING_TRIGGER }));
    await expect(
      evaluationService.finalizeEvaluation(hr, ENROLLMENT_ID, EvaluationStatus.PASSED, "Strong delivery")
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("cannot flip a recorded outcome (PASSED → FAILED)", async () => {
    db.internshipEnrollment.findUnique.mockResolvedValue(enrollment({ status: EvaluationStatus.PASSED }));
    await expect(
      evaluationService.finalizeEvaluation(hr, ENROLLMENT_ID, EvaluationStatus.FAILED, "Changed my mind")
    ).rejects.toBeInstanceOf(ConflictError);
    expect(db.internshipEnrollment.updateMany).not.toHaveBeenCalled();
  });

  it("policy-gates EXTENDED outcomes (OD-003)", async () => {
    await expect(
      evaluationService.finalizeEvaluation(hr, ENROLLMENT_ID, EvaluationStatus.EXTENDED, "More time")
    ).rejects.toBeInstanceOf(PolicyBlockedError);
  });

  it("restricts final decisions to ADMIN / HR, even for the assigned supervisor", async () => {
    await expect(
      evaluationService.finalizeEvaluation(assignedMentor, ENROLLMENT_ID, EvaluationStatus.PASSED, "Great")
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("records PASSED without changing the application status, offers or roles", async () => {
    db.internshipEnrollment.findUnique.mockResolvedValue(enrollment());
    db.internshipEnrollment.updateMany.mockResolvedValue({ count: 1 });
    db.internOnboarding.upsert.mockResolvedValue({ id: "onb-1" });

    await evaluationService.finalizeEvaluation(admin, ENROLLMENT_ID, EvaluationStatus.PASSED, "Strong delivery");

    expect(db.internshipEnrollment.updateMany.mock.calls[0][0].where).toEqual({
      id: ENROLLMENT_ID,
      status: { in: [EvaluationStatus.IN_PROGRESS, EvaluationStatus.UNDER_REVIEW, EvaluationStatus.EXTENDED] },
    });
    expect(db.userRole.upsert).not.toHaveBeenCalled();
    expect(db.application.update).not.toHaveBeenCalled();
    expect(db.application.updateMany).not.toHaveBeenCalled();
    expect(db.applicationStatusHistory.create).not.toHaveBeenCalled();
    expect(db.internOnboarding.upsert).toHaveBeenCalled();
    expect(db.auditLog.create.mock.calls[0][0].data).toMatchObject({
      action: "EVALUATION_FINALIZED",
      diffPayload: { fromStatus: EvaluationStatus.IN_PROGRESS, toStatus: EvaluationStatus.PASSED },
    });
  });
});

describe("Intern ID Card Policy Gating (Prompt 5 / OD-014 / POL-10)", () => {
  function idCardEnrollment(overrides: Record<string, unknown> = {}) {
    return {
      id: ENROLLMENT_ID,
      userId: INTERN_ID,
      supervisorId: assignedMentor.id,
      status: EvaluationStatus.PASSED,
      onboarding: { status: OnboardingStatus.COMPLETED },
      user: { email: "intern@gara.test", name: "Intern" },
      idCard: null,
      ...overrides,
    };
  }

  it("strictly rejects ID card issuance merely because 7 days elapsed without passing evaluation", async () => {
    db.internshipEnrollment.findUnique.mockResolvedValue(idCardEnrollment({ status: EvaluationStatus.IN_PROGRESS }));
    await expect(evaluationService.approveAndIssueIdCard(hr, ENROLLMENT_ID)).rejects.toThrow(
      /evaluation status is IN_PROGRESS/
    );
  });

  it("strictly rejects ID card issuance if onboarding checklist is incomplete", async () => {
    db.internshipEnrollment.findUnique.mockResolvedValue(
      idCardEnrollment({ onboarding: { status: OnboardingStatus.IN_PROGRESS } })
    );
    await expect(evaluationService.approveAndIssueIdCard(hr, ENROLLMENT_ID)).rejects.toThrow(
      /onboarding checklist is not complete/
    );
  });

  it("strictly rejects ID card approval by unprivileged roles (Candidate or Mentor)", async () => {
    await expect(evaluationService.approveAndIssueIdCard(assignedMentor, ENROLLMENT_ID)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(evaluationService.approveAndIssueIdCard(intern, ENROLLMENT_ID)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("issues a neutral provisional card number without a hard-coded year and audits it", async () => {
    db.internshipEnrollment.findUnique.mockResolvedValue(idCardEnrollment());
    db.internIdCard.create.mockResolvedValue({ id: "card-1" });

    const result = await evaluationService.approveAndIssueIdCard(hr, ENROLLMENT_ID);

    expect(result.cardNumber).toMatch(/^IDC-[0-9A-F]{12}$/);
    expect(result.cardNumber).not.toContain("GARA-INT");
    expect(result).toMatchObject({ alreadyIssued: false, reissued: false });
    expect(db.auditLog.create.mock.calls[0][0].data.action).toBe("ID_CARD_ISSUED");
  });

  it("is idempotent: an issued card is returned unchanged instead of regenerating the number", async () => {
    db.internshipEnrollment.findUnique.mockResolvedValue(
      idCardEnrollment({ idCard: { id: "card-1", cardNumber: "IDC-ABCDEF123456", status: IdCardStatus.ISSUED } })
    );

    const result = await evaluationService.approveAndIssueIdCard(hr, ENROLLMENT_ID);

    expect(result).toEqual({ cardNumber: "IDC-ABCDEF123456", alreadyIssued: true, reissued: false });
    expect(db.internIdCard.create).not.toHaveBeenCalled();
    expect(db.internIdCard.updateMany).not.toHaveBeenCalled();
    expect(db.auditLog.create).not.toHaveBeenCalled();
    expect(db.notificationOutbox.create).not.toHaveBeenCalled();
  });

  it("checks the onboarding gate inside the transaction after locking the onboarding row (REV-13)", async () => {
    db.internshipEnrollment.findUnique.mockResolvedValue(
      idCardEnrollment({ onboarding: { status: OnboardingStatus.IN_PROGRESS } })
    );

    await expect(evaluationService.approveAndIssueIdCard(hr, ENROLLMENT_ID)).rejects.toThrow(
      /onboarding checklist is not complete/
    );

    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(db.$queryRaw).toHaveBeenCalledTimes(1);
    const lockSql = (db.$queryRaw.mock.calls[0][0] as TemplateStringsArray).join("?");
    expect(lockSql).toContain('FROM "intern_onboardings"');
    expect(lockSql).toContain("FOR UPDATE");
    expect(db.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      db.internshipEnrollment.findUnique.mock.invocationCallOrder[0]
    );
    expect(db.internIdCard.create).not.toHaveBeenCalled();
  });

  it("reissues only with a justification and records the previous number", async () => {
    db.internshipEnrollment.findUnique.mockResolvedValue(
      idCardEnrollment({ idCard: { id: "card-1", cardNumber: "IDC-ABCDEF123456", status: IdCardStatus.ISSUED } })
    );
    db.internIdCard.updateMany.mockResolvedValue({ count: 1 });

    const result = await evaluationService.approveAndIssueIdCard(hr, ENROLLMENT_ID, "Card lost; replacement requested");

    expect(result.reissued).toBe(true);
    expect(result.cardNumber).not.toBe("IDC-ABCDEF123456");
    expect(db.auditLog.create.mock.calls[0][0].data).toMatchObject({
      action: "ID_CARD_REISSUED",
      diffPayload: { previousCardNumber: "IDC-ABCDEF123456", reason: "Card lost; replacement requested" },
    });
  });
});

describe("Onboarding checklist updates", () => {
  const items = [
    { id: "id-doc", label: "ID", required: true, completed: true },
    { id: "nda-agree", label: "NDA", required: true, completed: false },
  ];

  it("locks the onboarding row, then marks onboarding COMPLETED when every required item is verified", async () => {
    db.internshipEnrollment.findUnique.mockResolvedValue({
      id: ENROLLMENT_ID,
      userId: INTERN_ID,
      supervisorId: assignedMentor.id,
      status: EvaluationStatus.PASSED,
    });
    db.internOnboarding.findUnique.mockResolvedValue({ id: "onb-1", checklistItems: items });
    db.internOnboarding.update.mockResolvedValue({ id: "onb-1" });

    await evaluationService.updateOnboardingChecklistItem(assignedMentor, ENROLLMENT_ID, "nda-agree", true);

    expect(db.$queryRaw).toHaveBeenCalledTimes(1);
    expect(db.internOnboarding.update.mock.calls[0][0].data.status).toBe(OnboardingStatus.COMPLETED);
    expect(db.auditLog.create).toHaveBeenCalled();
  });

  it("rejects unknown checklist items and unassigned supervisors", async () => {
    db.internshipEnrollment.findUnique.mockResolvedValue({
      id: ENROLLMENT_ID,
      userId: INTERN_ID,
      supervisorId: assignedMentor.id,
      status: EvaluationStatus.PASSED,
    });
    db.internOnboarding.findUnique.mockResolvedValue({ id: "onb-1", checklistItems: items });

    await expect(
      evaluationService.updateOnboardingChecklistItem(hr, ENROLLMENT_ID, "invented-item", true)
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      evaluationService.updateOnboardingChecklistItem(otherMentor, ENROLLMENT_ID, "nda-agree", true)
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("Evaluation reads are record-scoped (SEC-15)", () => {
  it("hides another supervisor's intern dossier", async () => {
    db.internshipEnrollment.findUnique.mockResolvedValue(enrollment());
    await expect(evaluationService.getEvaluationDetail(ENROLLMENT_ID, otherMentor)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("denies candidates and interns access to the staff cockpit", async () => {
    await expect(evaluationService.getEvaluationDetail(ENROLLMENT_ID, intern)).rejects.toBeInstanceOf(ForbiddenError);
    expect(db.internshipEnrollment.findUnique).not.toHaveBeenCalled();
  });

  it("limits supervisor lists to assigned interns", async () => {
    db.internshipEnrollment.findMany.mockResolvedValue([]);
    await evaluationService.listEnrollmentsForStaff(assignedMentor);
    expect(db.internshipEnrollment.findMany.mock.calls[0][0].where).toEqual({
      supervisorId: assignedMentor.id,
      userId: { not: assignedMentor.id },
    });

    db.internshipEnrollment.findMany.mockClear();
    await evaluationService.listEnrollmentsForStaff(hr);
    expect(db.internshipEnrollment.findMany.mock.calls[0][0].where).toEqual({ userId: { not: hr.id } });
  });
});

describe("Evaluation Server Actions (SEC-20)", () => {
  it("validates input with zod before calling the service", async () => {
    mockRequireAuth.mockResolvedValue(hr);
    const formData = new FormData();
    formData.set("enrollmentId", ENROLLMENT_ID);
    formData.set("status", "OFFERED");
    formData.set("finalReviewNotes", "Strong delivery");

    const res = await finalizeEvaluationAction(formData);

    expect(res).toEqual({ success: false, error: "Final status must be PASSED or FAILED" });
    expect(db.internshipEnrollment.findUnique).not.toHaveBeenCalled();
  });

  it("never returns internal error messages to the client", async () => {
    mockRequireAuth.mockResolvedValue(hr);
    db.evaluationCheckpoint.findUnique.mockRejectedValue(new Error("connect ECONNREFUSED 10.0.0.5:5432"));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const formData = new FormData();
    formData.set("checkpointId", CHECKPOINT_ID);
    formData.set("feedback", "Good");
    formData.set("status", CheckpointStatus.REVIEWED);

    const res = await reviewCheckpointAction(formData);

    expect(res).toEqual({ success: false, error: "Failed to review checkpoint" });
    consoleError.mockRestore();
  });

  it("returns operational authorization errors safely", async () => {
    mockRequireAuth.mockRejectedValue(new ForbiddenError("Please set a permanent password before continuing."));
    const res = await reviewCheckpointAction(new FormData());
    expect(res).toEqual({ success: false, error: "Please set a permanent password before continuing." });
  });
});

describe("HRMS layout admission (REV-11)", () => {
  const child = "page-content";

  it("admits an enrollment owner without the INTERN role and shows the intern navigation", async () => {
    mockGetCurrentUser.mockResolvedValue({ ...intern, mustChangePassword: false });
    db.internshipEnrollment.count.mockResolvedValue(1);

    const element = await HrmsLayout({ children: child });

    expect(mockRedirect).not.toHaveBeenCalled();
    expect(db.internshipEnrollment.count).toHaveBeenCalledWith({ where: { userId: INTERN_ID } });
    expect(element.props.navItems).toBe(INTERN_NAV_ITEMS);
    expect(element.props.children).toBe(child);
    // No role is granted.
    expect(db.userRole.create).not.toHaveBeenCalled();
    expect(db.userRole.upsert).not.toHaveBeenCalled();
  });

  it("still redirects candidates who own no enrollment", async () => {
    mockGetCurrentUser.mockResolvedValue({ ...staff("cand-1", [Role.CANDIDATE]), mustChangePassword: false });
    db.internshipEnrollment.count.mockResolvedValue(0);

    await expect(HrmsLayout({ children: child })).rejects.toThrow("NEXT_REDIRECT:/candidate/dashboard");
  });

  it("admits HRMS roles without an enrollment lookup", async () => {
    mockGetCurrentUser.mockResolvedValue({ ...staff("emp-1", [Role.EMPLOYEE]), mustChangePassword: false });

    const element = await HrmsLayout({ children: child });

    expect(db.internshipEnrollment.count).not.toHaveBeenCalled();
    expect(element.props.navItems).toBe(HRMS_NAV_ITEMS);
  });
});
