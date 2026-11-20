import { describe, it, expect, vi, beforeEach } from "vitest";

const { db } = vi.hoisted(() => {
  const db = {
    trainingBatchMentor: { findUnique: vi.fn() },
    trainingBatch: { findUnique: vi.fn() },
    trainingEnrollment: { findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn(), create: vi.fn(), count: vi.fn() },
    trainingAssignment: { findUnique: vi.fn() },
    trainingSubmission: { findUnique: vi.fn(), upsert: vi.fn(), update: vi.fn() },
    trainingFinalProject: { findUnique: vi.fn(), upsert: vi.fn() },
    trainingDemoSlot: { findMany: vi.fn(), findUnique: vi.fn(), updateMany: vi.fn() },
    trainingSession: { findUnique: vi.fn(), update: vi.fn() },
    trainingAttendance: { upsert: vi.fn() },
    candidateProfile: { findUnique: vi.fn() },
    certificate: { create: vi.fn() },
    notificationOutbox: { createMany: vi.fn() },
    auditLog: { create: vi.fn() },
    $queryRaw: vi.fn(),
    $transaction: vi.fn(),
  };
  return { db };
});

vi.mock("@/lib/db", () => ({ prisma: db }));

import { Role } from "@prisma/client";
import type { AuthenticatedUser } from "@/lib/auth/guards";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import { computeTrainingProgress, hasBatchEnded, resultBlockers } from "@/features/training/progress";
import { fromLocalDateTime, submissionSchema, projectReviewSchema, resultDecisionSchema } from "@/features/training/learning-schemas";
import { assertBatchStaff, gradeSubmission, saveAttendance } from "@/features/training/services/batch-staff-service";
import { bookDemoSlot, startReattempt, submitAssignment } from "@/features/training/services/learning-service";
import { decideTrainingResult } from "@/features/training/services/result-service";
import { renderTrainingResultEmail } from "@/infrastructure/email/templates/training-emails";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const NOW = new Date("2027-02-01T10:00:00Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms);
const later = (ms: number) => new Date(NOW.getTime() + ms);

const ADMIN: AuthenticatedUser = { id: "admin-1", email: "a@example.test", name: "Admin", roles: [Role.ADMIN] };
const MENTOR: AuthenticatedUser = { id: "mentor-1", email: "m@example.test", name: "Mentor", roles: [Role.MENTOR] };
const HR: AuthenticatedUser = { id: "hr-1", email: "h@example.test", name: "HR", roles: [Role.HR] };
const STUDENT: AuthenticatedUser = { id: "student-1", email: "s@example.test", name: "Asha Rao", roles: [Role.CANDIDATE] };

const BATCH = "11111111-1111-4111-8111-111111111111";
const ENROLLMENT = "22222222-2222-4222-8222-222222222222";
const ASSIGNMENT = "33333333-3333-4333-8333-333333333333";
const SLOT = "44444444-4444-4444-8444-444444444444";
const OTHER_BATCH = "55555555-5555-4555-8555-555555555555";
const SESSION = "66666666-6666-4666-8666-666666666666";

beforeEach(() => {
  vi.resetAllMocks();
  db.$transaction.mockImplementation((fn: (tx: typeof db) => unknown) => fn(db));
  db.$queryRaw.mockResolvedValue([]);
  db.auditLog.create.mockResolvedValue({});
  db.notificationOutbox.createMany.mockResolvedValue({ count: 1 });
});

// -----------------------------------------------------------------------------
// Pass criteria
// -----------------------------------------------------------------------------

const assignments = [
  { id: "a1", dueAt: ago(5 * DAY), maxMarks: 10 },
  { id: "a2", dueAt: ago(2 * DAY), maxMarks: 30 },
];
const sessions = [
  { id: "s1", startsAt: ago(10 * DAY), status: "SCHEDULED", attendanceTakenAt: ago(10 * DAY) },
  { id: "s2", startsAt: ago(9 * DAY), status: "SCHEDULED", attendanceTakenAt: ago(9 * DAY) },
  { id: "s3", startsAt: ago(8 * DAY), status: "SCHEDULED", attendanceTakenAt: ago(8 * DAY) },
  { id: "s4", startsAt: ago(7 * DAY), status: "SCHEDULED", attendanceTakenAt: ago(7 * DAY) },
  { id: "s5", startsAt: ago(6 * DAY), status: "CANCELLED", attendanceTakenAt: null },
  { id: "s6", startsAt: later(DAY), status: "SCHEDULED", attendanceTakenAt: null },
];

function progress(overrides: Partial<Parameters<typeof computeTrainingProgress>[0]> = {}) {
  return computeTrainingProgress({
    now: NOW,
    assignments,
    submissions: [
      { assignmentId: "a1", marks: 6 },
      { assignmentId: "a2", marks: 18 },
    ],
    sessions,
    attendance: [
      { sessionId: "s1", present: true },
      { sessionId: "s2", present: true },
      { sessionId: "s3", present: true },
      { sessionId: "s4", present: false },
    ],
    project: { status: "PASSED" },
    demos: [{ result: "FAILED" }, { result: "PASSED" }],
    ...overrides,
  });
}

describe("training progress (product-owner rules)", () => {
  it("uses total marks over every assignment, with a missed one as 0", () => {
    const met = progress();
    expect(met.marks).toMatchObject({ obtained: 24, max: 40, percent: 60, met: true });
    const missed = progress({ submissions: [{ assignmentId: "a2", marks: 23 }] });
    expect(missed.marks).toMatchObject({ obtained: 23, max: 40, percent: 57.5, met: false });
  });

  it("counts held classes with attendance taken; cancelled and future classes do not count", () => {
    const result = progress();
    expect(result.attendance).toMatchObject({ present: 3, counted: 4, unmarked: 0, percent: 75, met: true });
    const unmarked = progress({ sessions: [...sessions, { id: "s7", startsAt: ago(HOUR), status: "SCHEDULED", attendanceTakenAt: null }] });
    expect(unmarked.attendance.unmarked).toBe(1);
  });

  it("needs a passed project and any passed demo (a failed demo can be retried)", () => {
    expect(progress().allMet).toBe(true);
    expect(progress({ project: { status: "SUBMITTED" } }).allMet).toBe(false);
    expect(progress({ demos: [{ result: "FAILED" }] }).allMet).toBe(false);
  });

  it("blocks a pass on unmet criteria or an incomplete record, and a fail before the batch ends", () => {
    const runningBatch = { status: "RUNNING", endDate: later(5 * DAY) };
    const endedBatch = { status: "RUNNING", endDate: ago(HOUR) };
    expect(resultBlockers("PASS", progress(), runningBatch, NOW)).toEqual([]);
    expect(resultBlockers("PASS", progress({ project: null }), runningBatch, NOW)).toContain("The final project has not passed.");
    const ungraded = progress({ submissions: [{ assignmentId: "a1", marks: 6 }, { assignmentId: "a2", marks: null }] });
    expect(resultBlockers("PASS", ungraded, runningBatch, NOW).join(" ")).toContain("not graded");

    const failing = progress({ project: { status: "FAILED" } });
    expect(resultBlockers("FAIL", failing, runningBatch, NOW)).toContain("A fail can be recorded only after the batch has ended.");
    expect(resultBlockers("FAIL", failing, endedBatch, NOW)).toEqual([]);
    expect(resultBlockers("FAIL", progress(), endedBatch, NOW)).toContain("Every pass criterion is met; record a pass instead.");
  });

  it("knows when a batch has ended", () => {
    expect(hasBatchEnded({ status: "COMPLETED", endDate: null }, NOW)).toBe(true);
    expect(hasBatchEnded({ status: "RUNNING", endDate: null }, NOW)).toBe(false);
    expect(hasBatchEnded({ status: "RUNNING", endDate: ago(1) }, NOW)).toBe(true);
  });
});

describe("learning schemas", () => {
  it("reads datetime-local input as India time", () => {
    expect(fromLocalDateTime("2027-01-10T19:00").toISOString()).toBe("2027-01-10T13:30:00.000Z");
  });

  it("accepts only https links and needs one link per submission", () => {
    const base = { enrollmentId: ENROLLMENT, assignmentId: ASSIGNMENT };
    expect(submissionSchema.safeParse({ ...base, repoUrl: "https://github.com/a/b" }).success).toBe(true);
    expect(submissionSchema.safeParse({ ...base, repoUrl: "javascript:alert(1)" }).success).toBe(false);
    expect(submissionSchema.safeParse({ ...base, repoUrl: "http://example.com" }).success).toBe(false);
    expect(submissionSchema.safeParse({ ...base, repoUrl: "", linkUrl: "" }).success).toBe(false);
  });

  it("needs feedback to request changes and a reason to fail", () => {
    expect(projectReviewSchema.safeParse({ projectId: ENROLLMENT, status: "CHANGES_REQUESTED", marks: "", feedback: "" }).success).toBe(false);
    expect(projectReviewSchema.safeParse({ projectId: ENROLLMENT, status: "PASSED", marks: "80", feedback: "" }).success).toBe(true);
    expect(resultDecisionSchema.safeParse({ enrollmentId: ENROLLMENT, result: "FAIL", note: "" }).success).toBe(false);
    expect(resultDecisionSchema.safeParse({ enrollmentId: ENROLLMENT, result: "PASS", signatoryName: "", signatoryTitle: "Director" }).success).toBe(false);
  });
});

// -----------------------------------------------------------------------------
// Access and staff actions
// -----------------------------------------------------------------------------

describe("batch staff access", () => {
  it("allows administrators and assigned mentors only", async () => {
    await expect(assertBatchStaff(ADMIN, BATCH)).resolves.toBeUndefined();
    db.trainingBatchMentor.findUnique.mockResolvedValue({ userId: MENTOR.id });
    await expect(assertBatchStaff(MENTOR, BATCH)).resolves.toBeUndefined();
    db.trainingBatchMentor.findUnique.mockResolvedValue(null);
    await expect(assertBatchStaff(MENTOR, BATCH)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(assertBatchStaff(HR, BATCH)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("does not grade above the maximum or after the result", async () => {
    db.trainingSubmission.findUnique.mockResolvedValue({ id: "sub-1", assignment: { batchId: BATCH, maxMarks: 10 }, enrollment: { status: "ACTIVE" } });
    await expect(gradeSubmission(ADMIN, { submissionId: ENROLLMENT, marks: 11 }, NOW)).rejects.toBeInstanceOf(ValidationError);
    db.trainingSubmission.findUnique.mockResolvedValue({ id: "sub-1", assignment: { batchId: BATCH, maxMarks: 10 }, enrollment: { status: "COMPLETED" } });
    await expect(gradeSubmission(ADMIN, { submissionId: ENROLLMENT, marks: 5 }, NOW)).rejects.toBeInstanceOf(ConflictError);
  });

  it("takes attendance only after the class starts and only for students of the batch", async () => {
    db.trainingSession.findUnique.mockResolvedValue({ id: SESSION, batchId: BATCH, startsAt: later(HOUR), status: "SCHEDULED" });
    const input = { sessionId: SESSION, entries: [{ enrollmentId: ENROLLMENT, present: true }] };
    await expect(saveAttendance(ADMIN, input, NOW)).rejects.toThrow("once the class has started");

    db.trainingSession.findUnique.mockResolvedValue({ id: SESSION, batchId: BATCH, startsAt: ago(HOUR), status: "SCHEDULED" });
    db.trainingEnrollment.findMany.mockResolvedValue([]);
    await expect(saveAttendance(ADMIN, input, NOW)).rejects.toBeInstanceOf(ValidationError);

    db.trainingEnrollment.findMany.mockResolvedValue([{ id: ENROLLMENT, status: "ACTIVE" }]);
    await saveAttendance(ADMIN, input, NOW);
    expect(db.trainingAttendance.upsert).toHaveBeenCalledTimes(1);
    expect(db.trainingSession.update.mock.calls[0][0].data).toMatchObject({ attendanceTakenAt: NOW });
  });
});

// -----------------------------------------------------------------------------
// Student actions
// -----------------------------------------------------------------------------

function ownEnrollment(overrides: Record<string, unknown> = {}) {
  return {
    id: ENROLLMENT,
    userId: STUDENT.id,
    status: "ACTIVE",
    batchId: BATCH,
    batch: { id: BATCH, status: "RUNNING", endDate: later(10 * DAY), programId: "program-1" },
    ...overrides,
  };
}

describe("student submissions", () => {
  const input = { enrollmentId: ENROLLMENT, assignmentId: ASSIGNMENT, repoUrl: "https://github.com/asha/app" };

  it("refuses a submission after the due time (product-owner rule)", async () => {
    db.trainingEnrollment.findUnique.mockResolvedValue(ownEnrollment());
    db.trainingAssignment.findUnique.mockResolvedValue({ id: ASSIGNMENT, batchId: BATCH, dueAt: ago(1) });
    await expect(submitAssignment(STUDENT, input, NOW)).rejects.toThrow("due time");
    expect(db.trainingSubmission.upsert).not.toHaveBeenCalled();
  });

  it("refuses another student's enrollment and a graded submission", async () => {
    db.trainingEnrollment.findUnique.mockResolvedValue(ownEnrollment({ userId: "student-2" }));
    await expect(submitAssignment(STUDENT, input, NOW)).rejects.toBeInstanceOf(NotFoundError);

    db.trainingEnrollment.findUnique.mockResolvedValue(ownEnrollment());
    db.trainingAssignment.findUnique.mockResolvedValue({ id: ASSIGNMENT, batchId: BATCH, dueAt: later(DAY) });
    db.trainingSubmission.findUnique.mockResolvedValue({ id: "sub-1", marks: 7 });
    await expect(submitAssignment(STUDENT, input, NOW)).rejects.toThrow("graded");
  });

  it("saves a submission before the due time", async () => {
    db.trainingEnrollment.findUnique.mockResolvedValue(ownEnrollment());
    db.trainingAssignment.findUnique.mockResolvedValue({ id: ASSIGNMENT, batchId: BATCH, dueAt: later(DAY) });
    db.trainingSubmission.findUnique.mockResolvedValue(null);
    await submitAssignment(STUDENT, input, NOW);
    expect(db.trainingSubmission.upsert.mock.calls[0][0].create).toMatchObject({ repoUrl: input.repoUrl, submittedAt: NOW });
  });
});

describe("demo booking", () => {
  it("allows a new booking after a failed demo but not a second open booking", async () => {
    db.trainingEnrollment.findUnique.mockResolvedValue(ownEnrollment());
    db.trainingDemoSlot.findMany.mockResolvedValue([{ result: "FAILED", startsAt: ago(DAY) }]);
    db.trainingDemoSlot.findUnique.mockResolvedValue({ batchId: BATCH, startsAt: later(DAY) });
    db.trainingDemoSlot.updateMany.mockResolvedValue({ count: 1 });
    await bookDemoSlot(STUDENT, { enrollmentId: ENROLLMENT, slotId: SLOT }, NOW);
    expect(db.trainingDemoSlot.updateMany.mock.calls[0][0].where).toEqual({ id: SLOT, bookedEnrollmentId: null });

    db.trainingDemoSlot.findMany.mockResolvedValue([{ result: null, startsAt: later(HOUR) }]);
    await expect(bookDemoSlot(STUDENT, { enrollmentId: ENROLLMENT, slotId: SLOT }, NOW)).rejects.toThrow("already have a demo booked");
  });

  it("reports a slot taken by someone else a moment earlier", async () => {
    db.trainingEnrollment.findUnique.mockResolvedValue(ownEnrollment());
    db.trainingDemoSlot.findMany.mockResolvedValue([]);
    db.trainingDemoSlot.findUnique.mockResolvedValue({ batchId: BATCH, startsAt: later(DAY) });
    db.trainingDemoSlot.updateMany.mockResolvedValue({ count: 0 });
    await expect(bookDemoSlot(STUDENT, { enrollmentId: ENROLLMENT, slotId: SLOT }, NOW)).rejects.toThrow("Someone booked");
  });
});

describe("free re-attempt", () => {
  const failed = {
    id: ENROLLMENT,
    userId: STUDENT.id,
    status: "FAILED",
    listPricePaise: 499_900,
    reattemptOfId: null,
    reattempt: null,
    batch: { id: BATCH, programId: "program-1" },
  };
  const target = { id: OTHER_BATCH, programId: "program-1", status: "UPCOMING", startDate: later(20 * DAY), enrollmentDeadline: null, seats: 30 };

  it("creates an unpaid enrollment in a later open batch", async () => {
    db.trainingEnrollment.findUnique.mockResolvedValueOnce(failed).mockResolvedValueOnce(null);
    db.trainingBatch.findUnique.mockResolvedValue(target);
    db.trainingEnrollment.count.mockResolvedValue(3);
    db.trainingEnrollment.create.mockResolvedValue({ id: "new-enrollment" });
    await startReattempt(STUDENT, { enrollmentId: ENROLLMENT, targetBatchId: OTHER_BATCH }, NOW);
    expect(db.trainingEnrollment.create.mock.calls[0][0].data).toMatchObject({
      status: "ACTIVE",
      amountPaidPaise: 0,
      reattemptOfId: ENROLLMENT,
      batchId: OTHER_BATCH,
    });
  });

  it("is once only and only after a fail", async () => {
    db.trainingEnrollment.findUnique.mockResolvedValue({ ...failed, reattempt: { id: "x" } });
    await expect(startReattempt(STUDENT, { enrollmentId: ENROLLMENT, targetBatchId: OTHER_BATCH }, NOW)).rejects.toThrow("already started");
    db.trainingEnrollment.findUnique.mockResolvedValue({ ...failed, reattemptOfId: "older" });
    await expect(startReattempt(STUDENT, { enrollmentId: ENROLLMENT, targetBatchId: OTHER_BATCH }, NOW)).rejects.toThrow("has been used");
    db.trainingEnrollment.findUnique.mockResolvedValue({ ...failed, status: "ACTIVE" });
    await expect(startReattempt(STUDENT, { enrollmentId: ENROLLMENT, targetBatchId: OTHER_BATCH }, NOW)).rejects.toThrow("after a fail");
  });
});

// -----------------------------------------------------------------------------
// Final result and certificate
// -----------------------------------------------------------------------------

describe("decideTrainingResult", () => {
  function decidable(overrides: Record<string, unknown> = {}) {
    return {
      id: ENROLLMENT,
      status: "ACTIVE",
      userId: STUDENT.id,
      user: { name: "Asha Rao" },
      attendance: [
        { sessionId: "s1", present: true },
        { sessionId: "s2", present: true },
        { sessionId: "s3", present: true },
        { sessionId: "s4", present: true },
      ],
      submissions: [
        { assignmentId: "a1", marks: 8 },
        { assignmentId: "a2", marks: 25 },
      ],
      finalProject: { status: "PASSED", title: "Shop App" },
      demoBookings: [{ result: "PASSED" }],
      certificate: null,
      batch: {
        id: BATCH,
        name: "Jan 2027",
        status: "RUNNING",
        startDate: ago(30 * DAY),
        endDate: later(DAY),
        program: { title: "Full-Stack Web Development", track: { name: "Software" } },
        sessions,
        assignments,
      },
      ...overrides,
    };
  }
  const pass = { enrollmentId: ENROLLMENT, result: "PASS", signatoryName: "R. Sharma", signatoryTitle: "Director" };

  beforeEach(() => {
    db.trainingBatchMentor.findUnique.mockResolvedValue({ userId: MENTOR.id });
    db.candidateProfile.findUnique.mockResolvedValue({ college: { name: "ABC Institute" } });
    db.certificate.create.mockResolvedValue({ id: "cert-1", verificationCode: "GARA-TC-2027-ABC234" });
  });

  it("passes a student who meets every criterion and issues the training certificate", async () => {
    db.trainingEnrollment.findUnique.mockImplementation((args: { select?: { batchId?: boolean; resultNote?: boolean } }) =>
      Promise.resolve(
        args.select?.batchId
          ? { batchId: BATCH }
          : args.select?.resultNote
            ? { status: "COMPLETED", resultNote: null, reattemptOfId: null, user: { name: "Asha", email: "s@example.test" }, batch: { name: "Jan", program: { title: "FS" } }, certificate: { verificationCode: "GARA-TC-2027-ABC234" } }
            : decidable()
      )
    );
    const result = await decideTrainingResult(MENTOR, pass, NOW);
    expect(result.status).toBe("COMPLETED");
    expect(db.trainingEnrollment.update.mock.calls[0][0].data).toMatchObject({ status: "COMPLETED", resultById: MENTOR.id });
    const certificate = db.certificate.create.mock.calls[0][0].data;
    expect(certificate).toMatchObject({
      type: "TRAINING_COMPLETION",
      trainingEnrollmentId: ENROLLMENT,
      recipientName: "Asha Rao",
      programmeTitle: "Full-Stack Web Development",
      collegeName: "ABC Institute",
      domain: "Software",
      projectTitle: "Shop App",
      signatoryName: "R. Sharma",
    });
    expect(certificate.verificationCode).toMatch(/^GARA-TC-2027-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$/);
    expect(db.notificationOutbox.createMany.mock.calls[0][0].data[0]).toMatchObject({ templateName: "TRAINING_RESULT" });
  });

  it("refuses a pass when a criterion is not met (no override)", async () => {
    db.trainingEnrollment.findUnique.mockImplementation((args: { select?: { batchId?: boolean } }) =>
      Promise.resolve(args.select?.batchId ? { batchId: BATCH } : decidable({ demoBookings: [{ result: "FAILED" }] }))
    );
    await expect(decideTrainingResult(MENTOR, pass, NOW)).rejects.toThrow("No live demo has passed.");
    expect(db.certificate.create).not.toHaveBeenCalled();
  });

  it("refuses a fail before the batch ends and a second decision", async () => {
    db.trainingEnrollment.findUnique.mockImplementation((args: { select?: { batchId?: boolean } }) =>
      Promise.resolve(args.select?.batchId ? { batchId: BATCH } : decidable({ finalProject: { status: "FAILED", title: "x" } }))
    );
    await expect(decideTrainingResult(MENTOR, { enrollmentId: ENROLLMENT, result: "FAIL", note: "Project failed" }, NOW)).rejects.toThrow(
      "after the batch has ended"
    );
    db.trainingEnrollment.findUnique.mockImplementation((args: { select?: { batchId?: boolean } }) =>
      Promise.resolve(args.select?.batchId ? { batchId: BATCH } : decidable({ status: "COMPLETED" }))
    );
    await expect(decideTrainingResult(MENTOR, pass, NOW)).rejects.toThrow("already been recorded");
  });

  it("is refused to a mentor of another batch", async () => {
    db.trainingEnrollment.findUnique.mockResolvedValue({ batchId: BATCH });
    db.trainingBatchMentor.findUnique.mockResolvedValue(null);
    await expect(decideTrainingResult(MENTOR, pass, NOW)).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("training result email", () => {
  it("shows the certificate ID for a pass and the re-attempt for a fail", () => {
    const passed = renderTrainingResultEmail({ outcome: "PASSED", programTitle: "FS", verificationCode: "GARA-TC-2027-ABC234" });
    expect(passed.subject).toContain("Certificate issued");
    expect(passed.text).toContain("GARA-TC-2027-ABC234");
    const failed = renderTrainingResultEmail({ outcome: "FAILED", programTitle: "FS", note: "<b>x</b>", canReattempt: true });
    expect(failed.text).toContain("re-attempt");
    expect(failed.html).not.toContain("<b>x</b>");
  });
});
