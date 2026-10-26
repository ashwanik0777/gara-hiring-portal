import { describe, it, expect, vi, beforeEach } from "vitest";
import { LocalStorageService } from "@/infrastructure/storage/local-storage-service";
import {
  MemoryRateLimitStore,
  PostgresRateLimitStore,
  RATE_LIMIT_POLICIES,
  RateLimiter,
} from "@/lib/security/rate-limit";
import {
  EmailTransportAdapter,
  OutboxProcessorService,
} from "@/infrastructure/email/outbox-processor";
import { checkProductionReadiness, DEV_DEFAULT_AUTH_SECRET } from "@/lib/env";
import { attendanceService } from "@/features/attendance/services/attendance-service";
import { leaveService } from "@/features/leave/services/leave-service";
import { payrollService } from "@/features/payroll/services/payroll-service";
import {
  ForbiddenError,
  PolicyBlockedError,
  RateLimitError,
  ValidationError,
} from "@/lib/errors";

const mockVerificationDeleteMany = vi.fn();
const mockVerificationFindMany = vi.fn();
const mockVerificationCreate = vi.fn();
const mockOutboxFindUnique = vi.fn();
const mockOutboxFindMany = vi.fn();
const mockOutboxUpdate = vi.fn();
const mockOutboxUpdateMany = vi.fn();
const mockExecuteRaw = vi.fn();

vi.mock("@/lib/db", () => {
  const prisma = {
    verification: {
      deleteMany: (...args: unknown[]) => mockVerificationDeleteMany(...args),
      findMany: (...args: unknown[]) => mockVerificationFindMany(...args),
      create: (...args: unknown[]) => mockVerificationCreate(...args),
    },
    notificationOutbox: {
      findUnique: (...args: unknown[]) => mockOutboxFindUnique(...args),
      findMany: (...args: unknown[]) => mockOutboxFindMany(...args),
      update: (...args: unknown[]) => mockOutboxUpdate(...args),
      updateMany: (...args: unknown[]) => mockOutboxUpdateMany(...args),
    },
    $executeRaw: (...args: unknown[]) => mockExecuteRaw(...args),
    $transaction: async (cb: (tx: unknown) => Promise<unknown>) => cb(prisma),
  };
  return { prisma };
});

describe("Prompt 10: Storage Hardening, Upload Validation & Signed URL Expiration", () => {
  const storage = new LocalStorageService("/tmp/gara-test-private-storage");

  it("blocks directory traversal attempts in resolveSafePath with ForbiddenError", () => {
    expect(() => storage.resolveSafePath("../../etc/passwd")).toThrow(
      ForbiddenError
    );
    expect(() =>
      storage.resolveSafePath("resumes/2026/../../../../etc/shadow")
    ).toThrow(ForbiddenError);
  });

  it("rejects empty files, disallowed MIME types, and oversized uploads with ValidationError", () => {
    expect(() =>
      storage.validateUploadInput(Buffer.alloc(0), "application/pdf")
    ).toThrow(ValidationError);

    expect(() =>
      storage.validateUploadInput(
        Buffer.from("executable"),
        "application/x-msdownload"
      )
    ).toThrow(ValidationError);

    const elevenMbBuffer = Buffer.alloc(11 * 1024 * 1024);
    expect(() =>
      storage.validateUploadInput(elevenMbBuffer, "application/pdf")
    ).toThrow(ValidationError);

    // Valid PDF buffer passes
    expect(() =>
      storage.validateUploadInput(Buffer.from("%PDF-1.4"), "application/pdf")
    ).not.toThrow();
  });

  it("verifies file signatures (magic bytes) instead of trusting the declared MIME type", () => {
    // Allowed MIME type, but the content is not a PDF
    expect(() =>
      storage.validateUploadInput(Buffer.from("plain text"), "application/pdf")
    ).toThrow(ValidationError);
    // A PDF declared as an image
    expect(() =>
      storage.validateUploadInput(Buffer.from("%PDF-1.4"), "image/png")
    ).toThrow(/does not match its type/);

    expect(() =>
      storage.validateUploadInput(
        Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]),
        "image/jpeg"
      )
    ).not.toThrow();
    expect(() =>
      storage.validateUploadInput(
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]),
        "image/png"
      )
    ).not.toThrow();
  });

  it("generates time-limited HMAC signed download URLs and rejects expired or tampered signatures", async () => {
    const baseTimeMs = 1_750_000_000_000;
    const storageKey = "resumes/2026-04-15/candidate-resume.pdf";

    const signedUrl = await storage.getDownloadUrl(storageKey, 900, baseTimeMs);
    const parsedUrl = new URL(signedUrl, "http://localhost:3000");
    const exp = Number(parsedUrl.searchParams.get("exp"));
    const sig = parsedUrl.searchParams.get("sig") ?? "";

    // Valid within 15-minute window
    expect(
      storage.verifySignedDownloadUrl(
        storageKey,
        exp,
        sig,
        baseTimeMs + 300_000
      )
    ).toBe(true);

    // Expired after 15 minutes
    expect(
      storage.verifySignedDownloadUrl(
        storageKey,
        exp,
        sig,
        baseTimeMs + 901_000
      )
    ).toBe(false);

    // Tampered storageKey with same signature
    expect(
      storage.verifySignedDownloadUrl(
        "resumes/2026-04-15/other-candidate.pdf",
        exp,
        sig,
        baseTimeMs + 100_000
      )
    ).toBe(false);

    // Tampered signature
    expect(
      storage.verifySignedDownloadUrl(
        storageKey,
        exp,
        "0".repeat(sig.length),
        baseTimeMs + 100_000
      )
    ).toBe(false);
  });
});

describe("Prompt 10: Multi-Instance Distributed Rate Limiting", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("enforces sliding-window rate limits in PostgresRateLimitStore and blocks excess requests with RateLimitError", async () => {
    const pgStore = new PostgresRateLimitStore();
    const limiter = new RateLimiter(pgStore);
    const nowMs = 1_750_000_000_000;

    // 1st request: 0 active hits -> allowed
    mockVerificationDeleteMany.mockResolvedValueOnce({ count: 0 });
    mockVerificationFindMany.mockResolvedValueOnce([]);
    mockVerificationCreate.mockResolvedValueOnce({ id: "hit-1" });

    const first = await limiter.enforce(
      "203.0.113.10",
      RATE_LIMIT_POLICIES.LOGIN,
      nowMs
    );
    expect(first.allowed).toBe(true);
    expect(first.remaining).toBe(4);
    // Concurrent requests for the same key are serialized with an advisory lock
    expect(mockExecuteRaw).toHaveBeenCalledTimes(1);

    // 6th request: 5 active hits already in window -> throws RateLimitError (HTTP 429)
    mockVerificationDeleteMany.mockResolvedValueOnce({ count: 0 });
    mockVerificationFindMany.mockResolvedValueOnce([
      { expiresAt: new Date(nowMs + 120_000) },
      { expiresAt: new Date(nowMs + 130_000) },
      { expiresAt: new Date(nowMs + 140_000) },
      { expiresAt: new Date(nowMs + 150_000) },
      { expiresAt: new Date(nowMs + 160_000) },
    ]);

    await expect(
      limiter.enforce("203.0.113.10", RATE_LIMIT_POLICIES.LOGIN, nowMs)
    ).rejects.toThrow(RateLimitError);
  });

  it("resets MemoryRateLimitStore allowance once the rate-limit window expires", async () => {
    const memStore = new MemoryRateLimitStore();
    const limiter = new RateLimiter(memStore, memStore);
    const nowMs = 1_750_000_000_000;
    const customPolicy = {
      scope: "test:endpoint",
      maxRequests: 2,
      windowSeconds: 60,
    };

    await limiter.enforce("actor-1", customPolicy, nowMs);
    await limiter.enforce("actor-1", customPolicy, nowMs + 1000);

    // 3rd request inside 60s window is blocked
    await expect(
      limiter.enforce("actor-1", customPolicy, nowMs + 2000)
    ).rejects.toThrow(RateLimitError);

    // Request after 61s succeeds
    const afterReset = await limiter.enforce(
      "actor-1",
      customPolicy,
      nowMs + 61_000
    );
    expect(afterReset.allowed).toBe(true);
  });
});

describe("Prompt 10: Durable Notification Outbox & Idempotent Email Retries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("skips already SENT outbox records to prevent duplicate emails (idempotency)", async () => {
    const sendEmailMock = vi.fn();
    const mockTransport: EmailTransportAdapter = { sendEmail: sendEmailMock };
    const processor = new OutboxProcessorService(mockTransport);

    mockOutboxFindUnique.mockResolvedValueOnce({
      id: "outbox-sent-1",
      recipientEmail: "candidate@example.com",
      templateName: "APPLICATION_SUBMITTED",
      payload: { referenceCode: "GARA-APP-2026-0001" },
      status: "SENT",
      attempts: 1,
      maxAttempts: 5,
      sentAt: new Date(),
    });

    const outcome = await processor.processSingleRecord("outbox-sent-1");
    expect(outcome).toBe("SKIPPED_SENT");
    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(mockOutboxUpdate).not.toHaveBeenCalled();
  });

  it("delivers PENDING notifications and transitions status to SENT", async () => {
    const sendEmailMock = vi.fn().mockResolvedValueOnce(undefined);
    const processor = new OutboxProcessorService({ sendEmail: sendEmailMock });

    mockOutboxFindUnique.mockResolvedValueOnce({
      id: "outbox-pending-1",
      recipientEmail: "candidate@example.com",
      templateName: "INTERVIEW_SCHEDULED",
      payload: { referenceCode: "GARA-APP-2026-0002" },
      status: "PENDING",
      attempts: 0,
      maxAttempts: 5,
      sentAt: null,
    });
    mockOutboxUpdate.mockResolvedValue({});
    mockOutboxUpdateMany.mockResolvedValueOnce({ count: 1 });

    const outcome = await processor.processSingleRecord("outbox-pending-1");
    expect(outcome).toBe("SENT");
    expect(mockOutboxUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "outbox-pending-1", status: "PENDING", attempts: 0 },
        data: expect.objectContaining({ status: "PROCESSING", attempts: 1 }),
      })
    );
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    expect(mockOutboxUpdate).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { id: "outbox-pending-1" },
        data: expect.objectContaining({
          status: "SENT",
          lastError: null,
        }),
      })
    );
  });

  it("records transport failure and halts retries once maxAttempts is reached", async () => {
    const failingTransport: EmailTransportAdapter = {
      sendEmail: vi
        .fn()
        .mockRejectedValueOnce(new Error("SMTP connection refused")),
    };
    const processor = new OutboxProcessorService(failingTransport);

    mockOutboxFindUnique.mockResolvedValueOnce({
      id: "outbox-fail-1",
      recipientEmail: "candidate@example.com",
      templateName: "OFFER_EXTENDED",
      payload: {},
      status: "FAILED",
      attempts: 2,
      maxAttempts: 5,
      sentAt: null,
    });
    mockOutboxUpdate.mockResolvedValue({});
    mockOutboxUpdateMany.mockResolvedValue({ count: 1 });

    const failOutcome = await processor.processSingleRecord("outbox-fail-1");
    expect(failOutcome).toBe("FAILED");

    // Exhausted record (attempts === maxAttempts)
    mockOutboxFindUnique.mockResolvedValueOnce({
      id: "outbox-exhausted-1",
      recipientEmail: "candidate@example.com",
      templateName: "OFFER_EXTENDED",
      payload: {},
      status: "FAILED",
      attempts: 5,
      maxAttempts: 5,
      sentAt: null,
    });

    const exhaustedOutcome = await processor.processSingleRecord(
      "outbox-exhausted-1"
    );
    expect(exhaustedOutcome).toBe("EXHAUSTED");
    // Exhausted rows are parked so they stop blocking the batch queue
    expect(mockOutboxUpdateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { id: "outbox-exhausted-1", status: "FAILED" },
        data: { status: "DEAD_LETTER" },
      })
    );
  });

  it("does not send when another worker already claimed the record", async () => {
    const sendEmailMock = vi.fn();
    const processor = new OutboxProcessorService({ sendEmail: sendEmailMock });

    mockOutboxFindUnique.mockResolvedValueOnce({
      id: "outbox-race-1",
      recipientEmail: "candidate@example.com",
      templateName: "APPLICATION_SUBMITTED",
      payload: {},
      status: "PENDING",
      attempts: 0,
      maxAttempts: 5,
      claimedAt: null,
      sentAt: null,
    });
    mockOutboxUpdateMany.mockResolvedValueOnce({ count: 0 });

    const outcome = await processor.processSingleRecord("outbox-race-1");
    expect(outcome).toBe("SKIPPED_CLAIMED");
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("skips fresh PROCESSING claims but recovers stale ones", async () => {
    const sendEmailMock = vi.fn().mockResolvedValue(undefined);
    const processor = new OutboxProcessorService({ sendEmail: sendEmailMock });
    const nowMs = 1_750_000_000_000;

    mockOutboxFindUnique.mockResolvedValueOnce({
      id: "outbox-fresh-claim",
      recipientEmail: "candidate@example.com",
      templateName: "APPLICATION_SUBMITTED",
      payload: {},
      status: "PROCESSING",
      attempts: 1,
      maxAttempts: 5,
      claimedAt: new Date(nowMs - 60_000),
      sentAt: null,
    });
    await expect(
      processor.processSingleRecord("outbox-fresh-claim", nowMs)
    ).resolves.toBe("SKIPPED_CLAIMED");

    mockOutboxFindUnique.mockResolvedValueOnce({
      id: "outbox-stale-claim",
      recipientEmail: "candidate@example.com",
      templateName: "APPLICATION_SUBMITTED",
      payload: {},
      status: "PROCESSING",
      attempts: 1,
      maxAttempts: 5,
      claimedAt: new Date(nowMs - 60 * 60_000),
      sentAt: null,
    });
    mockOutboxUpdateMany.mockResolvedValueOnce({ count: 1 });
    mockOutboxUpdate.mockResolvedValue({});
    await expect(
      processor.processSingleRecord("outbox-stale-claim", nowMs)
    ).resolves.toBe("SENT");
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
  });
});

describe("Prompt 10: Environment Readiness & Unresolved-Policy Release Gates", () => {
  it("flags development secrets and unconfigured external providers in checkProductionReadiness", () => {
    const devCheck = checkProductionReadiness({
      NODE_ENV: "development",
      DATABASE_URL:
        "postgresql://postgres:postgres@localhost:5432/gara_hrms?schema=public",
      BETTER_AUTH_SECRET: DEV_DEFAULT_AUTH_SECRET,
      BETTER_AUTH_URL: "http://localhost:3000",
      SMTP_HOST: "localhost",
      SMTP_PORT: 587,
      SMTP_FROM: "no-reply@garainnovation.com",
      DOCUMENT_STORAGE_MODE: "link",
      VIRUS_SCAN_MODE: "off",
      CLAMAV_HOST: "127.0.0.1",
      CLAMAV_PORT: 3310,
    });

    expect(devCheck.ready).toBe(false);
    expect(devCheck.blockers.length).toBeGreaterThanOrEqual(4);
  });

  it("blocks enabling document uploads without a virus scanner", () => {
    const base = {
      NODE_ENV: "production" as const,
      DATABASE_URL: "postgresql://app:secret@db.example.com:5432/gara",
      BETTER_AUTH_SECRET: "a-strong-production-secret-that-is-long-enough",
      BETTER_AUTH_URL: "https://careers.example.com",
      GOOGLE_CLIENT_ID: "client-id",
      GOOGLE_CLIENT_SECRET: "client-secret",
      SMTP_HOST: "smtp.example.com",
      SMTP_PORT: 587,
      SMTP_USER: "mailer",
      SMTP_FROM: "no-reply@example.com",
      CRON_SECRET: "cron-secret-value",
      CLAMAV_HOST: "127.0.0.1",
      CLAMAV_PORT: 3310,
      PAYOUT_ENCRYPTION_KEY: "a".repeat(64),
    };

    const linkMode = checkProductionReadiness({ ...base, DOCUMENT_STORAGE_MODE: "link", VIRUS_SCAN_MODE: "off" });
    expect(linkMode).toEqual({ ready: true, blockers: [] });

    const unscanned = checkProductionReadiness({ ...base, DOCUMENT_STORAGE_MODE: "local", VIRUS_SCAN_MODE: "off" });
    expect(unscanned.ready).toBe(false);
    expect(unscanned.blockers).toEqual([expect.stringContaining("VIRUS_SCAN_MODE is off")]);

    const scanned = checkProductionReadiness({ ...base, DOCUMENT_STORAGE_MODE: "local", VIRUS_SCAN_MODE: "clamav" });
    expect(scanned.ready).toBe(true);
  });

  it("blocks production readiness until PAYOUT_ENCRYPTION_KEY is configured", () => {
    const base = {
      NODE_ENV: "production" as const,
      DATABASE_URL: "postgresql://app:secret@db.example.com:5432/gara",
      BETTER_AUTH_SECRET: "a-strong-production-secret-that-is-long-enough",
      BETTER_AUTH_URL: "https://careers.example.com",
      GOOGLE_CLIENT_ID: "client-id",
      GOOGLE_CLIENT_SECRET: "client-secret",
      SMTP_HOST: "smtp.example.com",
      SMTP_PORT: 587,
      SMTP_USER: "mailer",
      SMTP_FROM: "no-reply@example.com",
      CRON_SECRET: "cron-secret-value",
      DOCUMENT_STORAGE_MODE: "link" as const,
      VIRUS_SCAN_MODE: "off" as const,
      CLAMAV_HOST: "127.0.0.1",
      CLAMAV_PORT: 3310,
    };

    for (const missing of [undefined, "", "   "]) {
      const result = checkProductionReadiness({ ...base, PAYOUT_ENCRYPTION_KEY: missing });
      expect(result.ready).toBe(false);
      expect(result.blockers).toEqual([expect.stringContaining("PAYOUT_ENCRYPTION_KEY is not configured")]);
    }
    expect(
      checkProductionReadiness({ ...base, PAYOUT_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64") })
    ).toEqual({ ready: true, blockers: [] });
  });

  it("enforces unresolved-policy gates across Attendance (OD-006), Leave (OD-007), and Payroll (OD-008)", () => {
    expect(() => attendanceService.calculateLatenessOrOvertime()).toThrow(
      PolicyBlockedError
    );
    expect(() => leaveService.calculateLeaveAccrualOrBalance()).toThrow(
      PolicyBlockedError
    );
    expect(() => payrollService.calculateGrossNetSalary()).toThrow(
      PolicyBlockedError
    );
    expect(() => payrollService.calculateStatutoryTaxes()).toThrow(
      PolicyBlockedError
    );
  });
});
