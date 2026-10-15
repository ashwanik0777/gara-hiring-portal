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

vi.mock("@/lib/db", () => ({
  prisma: {
    verification: {
      deleteMany: (...args: unknown[]) => mockVerificationDeleteMany(...args),
      findMany: (...args: unknown[]) => mockVerificationFindMany(...args),
      create: (...args: unknown[]) => mockVerificationCreate(...args),
    },
    notificationOutbox: {
      findUnique: (...args: unknown[]) => mockOutboxFindUnique(...args),
      findMany: (...args: unknown[]) => mockOutboxFindMany(...args),
      update: (...args: unknown[]) => mockOutboxUpdate(...args),
    },
  },
}));

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

    const outcome = await processor.processSingleRecord("outbox-pending-1");
    expect(outcome).toBe("SENT");
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
    });

    expect(devCheck.ready).toBe(false);
    expect(devCheck.blockers.length).toBeGreaterThanOrEqual(4);
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
