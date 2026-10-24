import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  CertificateStatus,
  CompletionStatus,
  EvaluationStatus,
  ProgressCadence,
  Role,
  SubmissionReviewStatus,
  TaskPriority,
  TaskStatus,
} from "@prisma/client";
import type { AuthenticatedUser } from "@/lib/auth/guards";

const { db, resetDb, mockRequireAuth } = vi.hoisted(() => {
  const model = () => ({
    findUnique: vi.fn(),
    findUniqueOrThrow: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    upsert: vi.fn(),
  });
  const mock = {
    internshipEnrollment: model(),
    internTask: model(),
    taskSubmission: model(),
    progressReport: model(),
    internCompletion: model(),
    certificate: model(),
    certificateReissueHistory: model(),
    auditLog: model(),
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
    mock.subAdminPermission.findUnique.mockResolvedValue(null);
    mock.auditLog.create.mockResolvedValue({ id: "audit-1" });
  };
  reset();
  return { db: mock, resetDb: reset, mockRequireAuth: vi.fn() };
});

vi.mock("@/lib/db", () => ({ prisma: db }));
vi.mock("@/lib/auth/guards", () => ({ requireAuth: mockRequireAuth }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { CertificatePdfGenerator } from "@/infrastructure/pdf/certificate-pdf-generator";
import { taskService } from "@/features/intern-tasks/services/task-service";
import { certificateService } from "@/features/certificates/services/certificate-service";
import { COMPLETION_CHECKLIST_TEMPLATE } from "@/features/certificates/constants";
import { ReviewSubmissionSchema, SubmitTaskSchema } from "@/features/intern-tasks/schemas";
import { recordCompletionChecklistAction } from "@/features/certificates/actions";
import { submitTaskAction } from "@/features/intern-tasks/actions";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";

const ENROLLMENT_ID = "11111111-1111-4111-8111-111111111111";
const TASK_ID = "22222222-2222-4222-8222-222222222222";
const SUBMISSION_ID = "33333333-3333-4333-8333-333333333333";
const CERT_ID = "44444444-4444-4444-8444-444444444444";
const INTERN_ID = "55555555-5555-4555-8555-555555555555";

function user(id: string, roles: Role[]): AuthenticatedUser {
  return { id, email: `${id}@gara.test`, name: `User ${id}`, roles };
}

const hr = user("hr-1", [Role.HR]);
const assignedMentor = user("mentor-1", [Role.MENTOR]);
const otherMentor = user("mentor-2", [Role.MENTOR]);
const intern = user(INTERN_ID, [Role.CANDIDATE]);

const enrollmentRef = { id: ENROLLMENT_ID, userId: INTERN_ID, supervisorId: assignedMentor.id };

const allCompleted = COMPLETION_CHECKLIST_TEMPLATE.map((item) => ({ id: item.id, completed: true }));

beforeEach(() => {
  resetDb();
  mockRequireAuth.mockReset();
});

describe("Prompt 6: PDF Generation Engine", () => {
  const generator = new CertificatePdfGenerator();

  it("generates a valid standard PDF 1.4 binary buffer with header, trailer, and xref", async () => {
    const pdfBuffer = await generator.generateCertificatePdf({
      recipientName: "Test Recipient",
      programmeTitle: "Full-Stack Engineering Internship",
      completionDate: "2026-04-15",
      issueDate: "2026-04-16",
      verificationCode: "GARA-CERT-2026-B94E21",
      verificationUrl: "https://portal.example.test/verify/GARA-CERT-2026-B94E21",
      signatoryName: "Test Signatory",
      signatoryTitle: "Programme Lead",
    });

    expect(pdfBuffer).toBeInstanceOf(Buffer);
    expect(pdfBuffer.length).toBeGreaterThan(1000);

    const pdfString = pdfBuffer.toString("utf-8");
    expect(pdfString.startsWith("%PDF-1.4")).toBe(true);
    expect(pdfString).toContain("%%EOF");
    expect(pdfString).toContain("xref");
    expect(pdfString).toContain("/Type /Catalog");
    expect(pdfString).toContain("/Type /Pages");
    expect(pdfString).toContain("Test Recipient");
    expect(pdfString).toContain("GARA-CERT-2026-B94E21");
    expect(pdfString).toContain("CERTIFICATE OF COMPLETION");
    expect(pdfString).toContain("re f");
  });

  it("escapes PDF string delimiters in user-controlled text", async () => {
    const pdf = (
      await generator.generateCertificatePdf({
        recipientName: "Name) Tj (injected",
        programmeTitle: "P",
        completionDate: "2026-04-15",
        issueDate: "2026-04-16",
        verificationCode: "C",
        verificationUrl: "https://portal.example.test/verify/C",
        signatoryName: "S",
        signatoryTitle: "T",
      })
    ).toString("utf-8");
    expect(pdf).toContain("Name\\) Tj \\(injected");
  });
});

describe("Task service: record-level authorization (SEC-15)", () => {
  it("lets only ADMIN/HR or the assigned supervisor create tasks", async () => {
    db.internshipEnrollment.findUnique.mockResolvedValue(enrollmentRef);
    db.internTask.create.mockResolvedValue({ id: TASK_ID, enrollmentId: ENROLLMENT_ID });
    const input = { enrollmentId: ENROLLMENT_ID, title: "T", description: "D", priority: TaskPriority.MEDIUM };

    await expect(taskService.createTask(otherMentor, input)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(taskService.createTask(intern, input)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(taskService.createTask(assignedMentor, input)).resolves.toEqual({ id: TASK_ID, enrollmentId: ENROLLMENT_ID });
    await expect(taskService.createTask(hr, input)).resolves.toBeDefined();
  });

  it("rejects progress report reviews by unassigned supervisors", async () => {
    db.progressReport.findUnique.mockResolvedValue({ id: "rep-1", enrollment: enrollmentRef });
    await expect(taskService.reviewProgressReport(otherMentor, "rep-1", "Nice")).rejects.toBeInstanceOf(ForbiddenError);
    expect(db.progressReport.update).not.toHaveBeenCalled();
  });

  it("lets interns read only their own task list", async () => {
    db.internshipEnrollment.findUnique.mockResolvedValue(enrollmentRef);
    db.internTask.findMany.mockResolvedValue([]);
    await expect(taskService.getEnrollmentTasks(ENROLLMENT_ID, intern)).resolves.toEqual([]);
    await expect(
      taskService.getEnrollmentTasks(ENROLLMENT_ID, user("other-intern", [Role.INTERN]))
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("Task submissions and reviews (BUG-07)", () => {
  function pendingSubmission(overrides: Record<string, unknown> = {}) {
    return {
      id: SUBMISSION_ID,
      taskId: TASK_ID,
      versionNumber: 1,
      status: SubmissionReviewStatus.PENDING,
      task: { id: TASK_ID, status: TaskStatus.SUBMITTED, enrollment: enrollmentRef },
      ...overrides,
    };
  }
  const review = {
    taskId: TASK_ID,
    submissionId: SUBMISSION_ID,
    status: SubmissionReviewStatus.APPROVED,
    supervisorFeedback: "Approved",
  };

  it("computes the next version inside the transaction under a task row lock", async () => {
    db.internTask.findUnique.mockResolvedValue({ id: TASK_ID, status: TaskStatus.REVISION_REQUESTED, enrollment: { id: ENROLLMENT_ID, userId: INTERN_ID } });
    db.taskSubmission.findFirst.mockResolvedValue({ versionNumber: 2 });
    db.taskSubmission.create.mockResolvedValue({ id: "sub-3", versionNumber: 3 });
    db.internTask.updateMany.mockResolvedValue({ count: 1 });

    const result = await taskService.submitTask(intern, { taskId: TASK_ID, submissionNotes: "v3" });

    expect(db.$queryRaw).toHaveBeenCalledTimes(1);
    expect(db.taskSubmission.create.mock.calls[0][0].data.versionNumber).toBe(3);
    expect(result.submission.versionNumber).toBe(3);
  });

  it("maps a concurrent duplicate version (P2002) to a ConflictError", async () => {
    db.internTask.findUnique.mockResolvedValue({ id: TASK_ID, status: TaskStatus.SUBMITTED, enrollment: { id: ENROLLMENT_ID, userId: INTERN_ID } });
    db.taskSubmission.findFirst.mockResolvedValue({ versionNumber: 1 });
    db.taskSubmission.create.mockRejectedValue(Object.assign(new Error("Unique constraint failed"), { code: "P2002" }));

    await expect(taskService.submitTask(intern, { taskId: TASK_ID, submissionNotes: "dup" })).rejects.toBeInstanceOf(ConflictError);
  });

  it("rejects PENDING as a review outcome", async () => {
    await expect(
      taskService.reviewSubmission(hr, { ...review, status: SubmissionReviewStatus.PENDING })
    ).rejects.toBeInstanceOf(ValidationError);
    expect(ReviewSubmissionSchema.safeParse({ ...review, status: "PENDING" }).success).toBe(false);
  });

  it("refuses to review a stale version while a newer submission exists", async () => {
    db.taskSubmission.findUnique.mockResolvedValue(pendingSubmission());
    db.taskSubmission.findFirst.mockResolvedValue({ id: "newer-submission" });

    await expect(taskService.reviewSubmission(hr, review)).rejects.toThrow(/newer version/);
    expect(db.taskSubmission.updateMany).not.toHaveBeenCalled();
    expect(db.internTask.updateMany).not.toHaveBeenCalled();
  });

  it("does not re-review an already reviewed submission or reopen a completed task", async () => {
    db.taskSubmission.findUnique.mockResolvedValue(pendingSubmission({ status: SubmissionReviewStatus.APPROVED }));
    await expect(taskService.reviewSubmission(hr, { ...review, status: SubmissionReviewStatus.REVISION_REQUESTED })).rejects.toBeInstanceOf(ConflictError);

    db.taskSubmission.findUnique.mockResolvedValue(
      pendingSubmission({ task: { id: TASK_ID, status: TaskStatus.COMPLETED, enrollment: enrollmentRef } })
    );
    await expect(taskService.reviewSubmission(hr, review)).rejects.toBeInstanceOf(ConflictError);
  });

  it("rejects reviews from an unassigned supervisor", async () => {
    db.taskSubmission.findUnique.mockResolvedValue(pendingSubmission());
    await expect(taskService.reviewSubmission(otherMentor, review)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("approves the latest pending submission conditionally and writes an audit row", async () => {
    db.taskSubmission.findUnique.mockResolvedValue(pendingSubmission());
    db.taskSubmission.findFirst.mockResolvedValue({ id: SUBMISSION_ID });
    db.taskSubmission.updateMany.mockResolvedValue({ count: 1 });
    db.internTask.updateMany.mockResolvedValue({ count: 1 });

    await taskService.reviewSubmission(assignedMentor, review);

    expect(db.taskSubmission.updateMany.mock.calls[0][0].where).toEqual({
      id: SUBMISSION_ID,
      status: SubmissionReviewStatus.PENDING,
    });
    expect(db.internTask.updateMany.mock.calls[0][0].data.status).toBe(TaskStatus.COMPLETED);
    expect(db.auditLog.create.mock.calls[0][0].data.action).toBe("TASK_SUBMISSION_REVIEWED");
  });

  it("rejects javascript: deliverable links at the action boundary", async () => {
    expect(
      SubmitTaskSchema.safeParse({ taskId: TASK_ID, submissionNotes: "x", deliverableUrls: "javascript:alert(1)" }).success
    ).toBe(false);

    mockRequireAuth.mockResolvedValue(intern);
    const formData = new FormData();
    formData.set("taskId", TASK_ID);
    formData.set("submissionNotes", "Done");
    formData.set("deliverableUrls", "https://github.com/x, data:text/html,hi");
    const res = await submitTaskAction(formData);
    expect(res).toEqual({ success: false, error: "Deliverable links must be http or https URLs." });
    expect(db.internTask.findUnique).not.toHaveBeenCalled();
  });

  it("validates progress report cadence", async () => {
    db.internshipEnrollment.findUnique.mockResolvedValue({ id: ENROLLMENT_ID, userId: INTERN_ID });
    db.progressReport.create.mockResolvedValue({ id: "rep-1", enrollmentId: ENROLLMENT_ID });
    await expect(
      taskService.submitProgressReport(intern, {
        enrollmentId: ENROLLMENT_ID,
        cadence: ProgressCadence.WEEKLY,
        periodIdentifier: "Week 1",
        summary: "Did things",
      })
    ).resolves.toEqual({ id: "rep-1", enrollmentId: ENROLLMENT_ID });
    await expect(
      taskService.submitProgressReport(user("someone-else", [Role.INTERN]), {
        enrollmentId: ENROLLMENT_ID,
        cadence: ProgressCadence.WEEKLY,
        periodIdentifier: "Week 1",
        summary: "x",
      })
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("Completion decisions (SEC-11)", () => {
  function passedEnrollment(overrides: Record<string, unknown> = {}) {
    return { ...enrollmentRef, status: EvaluationStatus.PASSED, completion: null, certificate: null, ...overrides };
  }

  it("does not approve an empty checklist (\"[].every()\" bypass)", async () => {
    db.internshipEnrollment.findUnique.mockResolvedValue(passedEnrollment());
    db.internCompletion.upsert.mockImplementation(async (args: { create: { status: CompletionStatus } }) => ({
      id: "comp-1",
      enrollmentId: ENROLLMENT_ID,
      status: args.create.status,
    }));

    const completion = await certificateService.recordCompletionChecklist(hr, {
      enrollmentId: ENROLLMENT_ID,
      checklistResponses: [],
      isEligibleForCertificate: true,
    });

    expect(completion.status).toBe(CompletionStatus.IN_PROGRESS);
    expect(db.internCompletion.upsert.mock.calls[0][0].create.approvedById).toBeNull();
  });

  it("approves only when every required template item is completed, using server-side labels", async () => {
    db.internshipEnrollment.findUnique.mockResolvedValue(passedEnrollment());
    db.internCompletion.upsert.mockImplementation(async (args: { create: { status: CompletionStatus } }) => ({
      id: "comp-1",
      enrollmentId: ENROLLMENT_ID,
      status: args.create.status,
    }));

    const completion = await certificateService.recordCompletionChecklist(assignedMentor, {
      enrollmentId: ENROLLMENT_ID,
      checklistResponses: allCompleted,
      isEligibleForCertificate: true,
    });

    expect(completion.status).toBe(CompletionStatus.APPROVED);
    const stored = db.internCompletion.upsert.mock.calls[0][0].create.checklistResponses as { label: string }[];
    expect(stored.map((i) => i.label)).toEqual(COMPLETION_CHECKLIST_TEMPLATE.map((i) => i.label));
    expect(db.auditLog.create.mock.calls[0][0].data.action).toBe("COMPLETION_DECISION_RECORDED");
  });

  it("rejects unknown checklist items", async () => {
    db.internshipEnrollment.findUnique.mockResolvedValue(passedEnrollment());
    await expect(
      certificateService.recordCompletionChecklist(hr, {
        enrollmentId: ENROLLMENT_ID,
        checklistResponses: [{ id: "invented", completed: true }],
        isEligibleForCertificate: true,
      })
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("blocks completion decisions for failed or never-started interns and for unassigned mentors", async () => {
    db.internshipEnrollment.findUnique.mockResolvedValue(passedEnrollment({ status: EvaluationStatus.FAILED }));
    await expect(
      certificateService.recordCompletionChecklist(hr, {
        enrollmentId: ENROLLMENT_ID,
        checklistResponses: allCompleted,
        isEligibleForCertificate: true,
      })
    ).rejects.toBeInstanceOf(ValidationError);

    db.internshipEnrollment.findUnique.mockResolvedValue(passedEnrollment());
    await expect(
      certificateService.recordCompletionChecklist(otherMentor, {
        enrollmentId: ENROLLMENT_ID,
        checklistResponses: allCompleted,
        isEligibleForCertificate: true,
      })
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("reads the certificate state under the enrollment row lock before recording a decision (REV-13)", async () => {
    db.internshipEnrollment.findUnique.mockResolvedValue(
      passedEnrollment({ certificate: { status: CertificateStatus.ACTIVE } })
    );

    await expect(
      certificateService.recordCompletionChecklist(hr, {
        enrollmentId: ENROLLMENT_ID,
        checklistResponses: allCompleted,
        isEligibleForCertificate: false,
      })
    ).rejects.toBeInstanceOf(ConflictError);

    const lockSql = (db.$queryRaw.mock.calls[0][0] as TemplateStringsArray).join("?");
    expect(lockSql).toContain('FROM "internship_enrollments"');
    expect(lockSql).toContain("FOR UPDATE");
    expect(db.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      db.internshipEnrollment.findUnique.mock.invocationCallOrder[0]
    );
    expect(db.internCompletion.upsert).not.toHaveBeenCalled();
  });

  it("rejects malformed checklist JSON at the action boundary", async () => {
    mockRequireAuth.mockResolvedValue(hr);
    const formData = new FormData();
    formData.set("enrollmentId", ENROLLMENT_ID);
    formData.set("isEligibleForCertificate", "true");
    formData.set("checklistResponses", "{not json");
    const res = await recordCompletionChecklistAction(formData);
    expect(res).toEqual({ success: false, error: "Invalid checklist data format" });
  });
});

describe("Certificate issuance (SEC-11 / BUG-14)", () => {
  function issuable(overrides: Record<string, unknown> = {}) {
    return {
      ...enrollmentRef,
      status: EvaluationStatus.PASSED,
      user: { name: "Intern Name" },
      application: { opening: { title: "Frontend" } },
      completion: {
        status: CompletionStatus.APPROVED,
        isEligibleForCertificate: true,
        approvedAt: new Date("2026-05-01T00:00:00Z"),
        checklistResponses: allCompleted,
      },
      certificate: null,
      ...overrides,
    };
  }
  const input = { enrollmentId: ENROLLMENT_ID, signatoryName: "Signer", signatoryTitle: "Programme Lead" };

  it("requires ADMIN / HR", async () => {
    await expect(certificateService.issueCertificate(assignedMentor, input)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("requires a PASSED evaluation", async () => {
    db.internshipEnrollment.findUnique.mockResolvedValue(issuable({ status: EvaluationStatus.FAILED }));
    await expect(certificateService.issueCertificate(hr, input)).rejects.toThrow(/not been recorded as PASSED/);
  });

  it("rejects legacy approvals recorded with an empty checklist", async () => {
    db.internshipEnrollment.findUnique.mockResolvedValue(
      issuable({
        completion: {
          status: CompletionStatus.APPROVED,
          isEligibleForCertificate: true,
          approvedAt: null,
          checklistResponses: [],
        },
      })
    );
    await expect(certificateService.issueCertificate(hr, input)).rejects.toThrow(/every required item/);
    expect(db.certificate.create).not.toHaveBeenCalled();
  });

  it("returns an existing ACTIVE certificate idempotently", async () => {
    const existing = {
      id: CERT_ID,
      verificationCode: "GARA-CERT-2026-AAAAAAAAAAAAAAAA",
      enrollmentId: ENROLLMENT_ID,
      recipientName: "Intern Name",
      programmeTitle: "Frontend Internship",
      issueDate: new Date(),
      completionDate: new Date(),
      signatoryTitle: "T",
      signatoryName: "S",
      status: CertificateStatus.ACTIVE,
      qrPayloadUrl: "https://x/verify/c",
      versionNumber: 1,
      pdfStorageKey: null,
      createdAt: new Date(),
    };
    db.internshipEnrollment.findUnique.mockResolvedValue(issuable({ certificate: existing }));
    const result = await certificateService.issueCertificate(hr, input);
    expect(result.id).toBe(CERT_ID);
    expect(db.certificate.create).not.toHaveBeenCalled();
  });

  it("reports a clear conflict when a non-active certificate already exists", async () => {
    db.internshipEnrollment.findUnique.mockResolvedValue(
      issuable({ certificate: { id: CERT_ID, status: CertificateStatus.REVOKED } })
    );
    await expect(certificateService.issueCertificate(hr, input)).rejects.toBeInstanceOf(ConflictError);
  });

  it("issues with explicit signatory, a 64-bit code and an audit row; concurrent duplicates become conflicts", async () => {
    db.internshipEnrollment.findUnique.mockResolvedValue(issuable());
    db.certificate.create.mockImplementation(async (args: { data: Record<string, unknown> }) => ({
      id: CERT_ID,
      pdfStorageKey: null,
      createdAt: new Date(),
      ...args.data,
    }));

    const cert = await certificateService.issueCertificate(hr, input);

    expect(cert.verificationCode).toMatch(/^GARA-CERT-\d{4}-[0-9A-F]{16}$/);
    expect(cert.signatoryName).toBe("Signer");
    expect(cert.qrPayloadUrl).toContain(`/verify/${cert.verificationCode}`);
    expect(db.auditLog.create.mock.calls[0][0].data.action).toBe("CERTIFICATE_ISSUED");

    db.certificate.create.mockRejectedValue(Object.assign(new Error("Unique"), { code: "P2002" }));
    await expect(certificateService.issueCertificate(hr, input)).rejects.toBeInstanceOf(ConflictError);
  });

  it("checks eligibility inside the transaction after locking the enrollment row (REV-13)", async () => {
    // Eligibility was revoked by a concurrent completion decision: the locked read sees it.
    db.internshipEnrollment.findUnique.mockResolvedValue(
      issuable({
        completion: {
          status: CompletionStatus.APPROVED,
          isEligibleForCertificate: false,
          approvedAt: new Date("2026-05-01T00:00:00Z"),
          checklistResponses: allCompleted,
        },
      })
    );

    await expect(certificateService.issueCertificate(hr, input)).rejects.toThrow(/not marked eligible/);

    expect(db.$transaction).toHaveBeenCalledTimes(1);
    const lockSql = (db.$queryRaw.mock.calls[0][0] as TemplateStringsArray).join("?");
    expect(lockSql).toContain('FROM "internship_enrollments"');
    expect(lockSql).toContain("FOR UPDATE");
    expect(db.$queryRaw.mock.calls[0][1]).toBe(ENROLLMENT_ID);
    expect(db.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      db.internshipEnrollment.findUnique.mock.invocationCallOrder[0]
    );
    expect(db.certificate.create).not.toHaveBeenCalled();
  });

  it("reissues only active certificates and keeps the previous code in history", async () => {
    db.certificate.findUnique.mockResolvedValue({
      id: CERT_ID,
      verificationCode: "GARA-CERT-2026-OLDOLDOLDOLDOLD1",
      status: CertificateStatus.ACTIVE,
      versionNumber: 1,
      signatoryName: "S",
      signatoryTitle: "T",
      enrollment: { userId: INTERN_ID, supervisorId: assignedMentor.id },
    });
    db.certificate.updateMany.mockResolvedValue({ count: 1 });
    db.certificateReissueHistory.create.mockResolvedValue({ id: "hist-1" });
    db.certificate.findUniqueOrThrow.mockResolvedValue({
      id: CERT_ID,
      verificationCode: "GARA-CERT-2026-NEWNEWNEWNEWNEW1",
      enrollmentId: ENROLLMENT_ID,
      recipientName: "Intern Name",
      programmeTitle: "Frontend Internship",
      issueDate: new Date(),
      completionDate: new Date(),
      signatoryTitle: "T",
      signatoryName: "S",
      status: CertificateStatus.ACTIVE,
      qrPayloadUrl: "https://x",
      versionNumber: 2,
      pdfStorageKey: null,
      createdAt: new Date(),
    });

    await certificateService.reissueCertificate(hr, { certificateId: CERT_ID, reason: "Corrected legal name spelling" });

    expect(db.certificateReissueHistory.create.mock.calls[0][0].data.previousCode).toBe("GARA-CERT-2026-OLDOLDOLDOLDOLD1");
    expect(db.auditLog.create.mock.calls[0][0].data.action).toBe("CERTIFICATE_REISSUED");

    db.certificate.findUnique.mockResolvedValue({
      id: CERT_ID,
      status: CertificateStatus.REVOKED,
      enrollment: { userId: INTERN_ID, supervisorId: null },
    });
    await expect(
      certificateService.reissueCertificate(hr, { certificateId: CERT_ID, reason: "Corrected legal name spelling" })
    ).rejects.toBeInstanceOf(ConflictError);
  });
});

describe("Certificate PDF download authorization (BUG-14)", () => {
  function cert(overrides: Record<string, unknown> = {}) {
    return {
      id: CERT_ID,
      recipientName: "Intern Name",
      programmeTitle: "Frontend Internship",
      issueDate: new Date("2026-05-02T00:00:00Z"),
      completionDate: new Date("2026-05-01T00:00:00Z"),
      verificationCode: "GARA-CERT-2026-AAAAAAAAAAAAAAAA",
      qrPayloadUrl: "https://portal.example.test/verify/GARA-CERT-2026-AAAAAAAAAAAAAAAA",
      signatoryName: "S",
      signatoryTitle: "T",
      status: CertificateStatus.ACTIVE,
      enrollment: { userId: INTERN_ID, supervisorId: assignedMentor.id },
      ...overrides,
    };
  }

  it("throws NotFoundError (404) for unknown certificates", async () => {
    db.certificate.findUnique.mockResolvedValue(null);
    await expect(certificateService.getCertificatePdfBuffer(CERT_ID, INTERN_ID, [Role.CANDIDATE])).rejects.toBeInstanceOf(NotFoundError);
  });

  it("throws ForbiddenError (403) for other interns and unassigned supervisors", async () => {
    db.certificate.findUnique.mockResolvedValue(cert());
    await expect(certificateService.getCertificatePdfBuffer(CERT_ID, "other-intern", [Role.INTERN])).rejects.toBeInstanceOf(ForbiddenError);
    await expect(certificateService.getCertificatePdfBuffer(CERT_ID, otherMentor.id, [Role.MENTOR])).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("refuses non-active certificates", async () => {
    db.certificate.findUnique.mockResolvedValue(cert({ status: CertificateStatus.REVOKED }));
    await expect(certificateService.getCertificatePdfBuffer(CERT_ID, INTERN_ID, [Role.CANDIDATE])).rejects.toBeInstanceOf(ConflictError);
  });

  it("lets the intern download their own active certificate", async () => {
    db.certificate.findUnique.mockResolvedValue(cert());
    const pdf = await certificateService.getCertificatePdfBuffer(CERT_ID, INTERN_ID, [Role.CANDIDATE]);
    expect(pdf.toString("utf-8").startsWith("%PDF-1.4")).toBe(true);
  });
});
