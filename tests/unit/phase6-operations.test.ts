import { describe, it, expect, vi, beforeEach } from "vitest";

const { db, jobs, perms } = vi.hoisted(() => ({
  db: {
    trainingBatch: { findUnique: vi.fn() },
    trainingEnrollment: { findMany: vi.fn() },
    trainingPayment: { findMany: vi.fn() },
    trainingRefund: { findMany: vi.fn() },
    certificate: { findMany: vi.fn() },
    campusAmbassador: { findMany: vi.fn(), count: vi.fn(), updateMany: vi.fn() },
    ambassadorPayout: { findMany: vi.fn() },
    certificatePrintOrder: { findMany: vi.fn() },
    college: { findUnique: vi.fn(), delete: vi.fn(), update: vi.fn() },
    candidateProfile: { updateMany: vi.fn() },
    notificationOutbox: { createMany: vi.fn() },
    auditLog: { create: vi.fn() },
    $queryRaw: vi.fn(),
    $transaction: vi.fn(),
  },
  jobs: { enqueueJob: vi.fn(), cancelJobsByKeyPrefix: vi.fn() },
  perms: { assertPermission: vi.fn() },
}));

vi.mock("@/lib/db", () => ({ prisma: db }));
vi.mock("@/infrastructure/jobs/job-queue", () => jobs);
vi.mock("@/lib/auth/permissions", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/auth/permissions")>()), ...perms }));

import { Role } from "@prisma/client";
import type { AuthenticatedUser } from "@/lib/auth/guards";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import { handleTrainingFirstClassReminder, scheduleFirstClassReminder } from "@/features/training/first-class-reminder";
import { exportAdminDataset } from "@/features/exports/admin-exports";
import { renderTrainingFirstClassReminderEmail } from "@/infrastructure/email/templates/training-emails";
import { APPROVED_FAQ_KNOWLEDGE_BASE } from "@/infrastructure/ai/faq-knowledge-base";

const HOUR = 3_600_000;
const NOW = new Date("2027-01-01T06:00:00Z");
const ADMIN: AuthenticatedUser = { id: "admin-1", email: "a@example.test", name: "Admin", roles: [Role.ADMIN] };
const HR: AuthenticatedUser = { id: "hr-1", email: "h@example.test", name: "HR", roles: [Role.HR] };

beforeEach(() => {
  vi.resetAllMocks();
  db.$transaction.mockImplementation((fn: (tx: typeof db) => unknown) => fn(db));
  db.$queryRaw.mockResolvedValue([]);
  db.notificationOutbox.createMany.mockResolvedValue({ count: 2 });
  db.auditLog.create.mockResolvedValue({});
});

describe("first-class reminder", () => {
  const firstClassAt = new Date(NOW.getTime() + 3 * 24 * HOUR);

  it("is scheduled 24 hours before the first class, or now when that is past", async () => {
    await scheduleFirstClassReminder(db as never, { id: "batch-1", firstClassAt, status: "UPCOMING" }, NOW);
    expect(jobs.enqueueJob.mock.calls[0][0]).toMatchObject({
      type: "TRAINING_FIRST_CLASS_REMINDER",
      runAt: new Date(firstClassAt.getTime() - 24 * HOUR),
      dedupeKey: `TRAINING_FIRST_CLASS_REMINDER:batch-1:${firstClassAt.toISOString()}`,
    });
    const soon = new Date(NOW.getTime() + 2 * HOUR);
    await scheduleFirstClassReminder(db as never, { id: "batch-1", firstClassAt: soon, status: "UPCOMING" }, NOW);
    expect(jobs.enqueueJob.mock.calls[1][0].runAt).toEqual(NOW);
    await scheduleFirstClassReminder(db as never, { id: "batch-1", firstClassAt: null, status: "UPCOMING" }, NOW);
    await scheduleFirstClassReminder(db as never, { id: "batch-1", firstClassAt, status: "CANCELLED" }, NOW);
    expect(jobs.enqueueJob).toHaveBeenCalledTimes(2);
  });

  it("emails learning students once, and does nothing when the class moved", async () => {
    db.trainingBatch.findUnique.mockResolvedValue({
      id: "batch-1",
      name: "Jan",
      status: "UPCOMING",
      firstClassAt,
      program: { title: "Full-Stack" },
      enrollments: [
        { id: "e1", user: { name: "A", email: "a@s.test" } },
        { id: "e2", user: { name: "B", email: "b@s.test" } },
      ],
    });
    await handleTrainingFirstClassReminder({ batchId: "batch-1", firstClassAt: firstClassAt.toISOString() }, { now: NOW } as never);
    const data = db.notificationOutbox.createMany.mock.calls[0][0].data;
    expect(data).toHaveLength(2);
    expect(data[0].dedupeKey).toBe(`TRAINING_FIRST_CLASS_REMINDER:batch-1:${firstClassAt.toISOString()}:e1`);

    db.notificationOutbox.createMany.mockClear();
    await handleTrainingFirstClassReminder({ batchId: "batch-1", firstClassAt: new Date(0).toISOString() }, { now: NOW } as never);
    expect(db.notificationOutbox.createMany).not.toHaveBeenCalled();
  });

  it("renders the reminder with the class time and a learning-area link", () => {
    const email = renderTrainingFirstClassReminderEmail({
      recipientName: "Asha",
      programTitle: "Full-Stack",
      batchName: "Jan",
      firstClassAt: "2027-01-10T13:30:00Z",
      enrollmentId: "22222222-2222-4222-8222-222222222222",
    });
    expect(email.subject).toContain("First class tomorrow");
    expect(email.text).toContain("/candidate/training/22222222-2222-4222-8222-222222222222");
  });
});

describe("administrator CSV exports", () => {
  it("is for administrators and known datasets only", async () => {
    await expect(exportAdminDataset(HR, "certificates", NOW)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(exportAdminDataset(ADMIN, "users", NOW)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("escapes formula cells, audits the export and never includes a raw UPI ID", async () => {
    db.campusAmbassador.findMany.mockResolvedValue([
      {
        phone: "9876543210",
        status: "APPROVED",
        role: "LEAD",
        referralCode: "GARA-RAHU7K2",
        createdAt: NOW,
        approvedAt: NOW,
        upiIdMasked: "ra••••@okaxis",
        duplicateFlag: null,
        user: { name: "=HYPERLINK(\"x\")", email: "r@example.test" },
        college: { name: "ABC" },
      },
    ]);
    const result = await exportAdminDataset(ADMIN, "ambassadors", NOW);
    expect(result.csv.startsWith("﻿\"Name\"")).toBe(true);
    expect(result.csv).toContain(`"'=HYPERLINK(""x"")"`);
    expect(result.csv).toContain("ra••••@okaxis");
    expect(result.filename).toBe("gara-ambassadors-2027-01-01.csv");
    expect(db.auditLog.create.mock.calls[0][0].data).toMatchObject({ action: "EXPORT_REPORT", resourceId: "ambassadors", diffPayload: { rowCount: 1, truncated: false } });
  });
});

describe("college merge", () => {
  it("moves students and ambassadors, removes the duplicate and audits", async () => {
    const { mergeColleges } = await import("@/features/colleges/services/college-service");
    db.college.findUnique.mockImplementation(({ where }: { where: { id: string } }) =>
      Promise.resolve(where.id === "dup" ? { id: "dup", name: "ABC Inst", status: "APPROVED" } : { id: "keep", name: "ABC Institute", status: "PENDING" })
    );
    db.campusAmbassador.count.mockResolvedValue(1);
    db.candidateProfile.updateMany.mockResolvedValue({ count: 4 });
    db.campusAmbassador.updateMany.mockResolvedValue({ count: 1 });
    const result = await mergeColleges({ sourceId: "dup", targetId: "keep" }, ADMIN);
    expect(result).toEqual({ students: 4, ambassadors: 1 });
    expect(db.college.delete).toHaveBeenCalledWith({ where: { id: "dup" } });
    expect(db.college.update).toHaveBeenCalledWith({ where: { id: "keep" }, data: { status: "APPROVED" } });
    expect(db.auditLog.create.mock.calls[0][0].data.action).toBe("COLLEGE_MERGED");
  });

  it("refuses merging a college into itself or two colleges with a Lead each", async () => {
    const { mergeColleges } = await import("@/features/colleges/services/college-service");
    await expect(mergeColleges({ sourceId: "a", targetId: "a" }, ADMIN)).rejects.toBeInstanceOf(ValidationError);
    db.college.findUnique.mockResolvedValue({ id: "x", name: "X", status: "APPROVED" });
    db.campusAmbassador.count.mockResolvedValue(2);
    await expect(mergeColleges({ sourceId: "dup", targetId: "keep" }, ADMIN)).rejects.toBeInstanceOf(ConflictError);
    expect(db.college.delete).not.toHaveBeenCalled();
  });
});

describe("Help & FAQ", () => {
  it("answers Industrial Training and Campus Ambassador questions", () => {
    const categories = new Set(APPROVED_FAQ_KNOWLEDGE_BASE.map((entry) => entry.category));
    expect(categories.has("INDUSTRIAL_TRAINING")).toBe(true);
    expect(categories.has("CAMPUS_AMBASSADOR")).toBe(true);
    const ids = APPROVED_FAQ_KNOWLEDGE_BASE.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
