import { describe, it, expect, vi, beforeEach } from "vitest";

const { db } = vi.hoisted(() => ({
  db: {
    scheduledJob: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}));

vi.mock("@/lib/db", () => ({ prisma: db }));

import { enqueueJob, cancelJobsByKeyPrefix } from "@/infrastructure/jobs/job-queue";
import { runDueJobs, STALE_JOB_MS } from "@/infrastructure/jobs/job-runner";
import { addMonths, atBusinessTime, businessDateKey, nextBusinessTime } from "@/lib/time/business-time";

describe("Business time (Asia/Kolkata)", () => {
  it("converts business wall-clock times to UTC instants", () => {
    expect(atBusinessTime("2026-10-26", 9, 0, "Asia/Kolkata").toISOString()).toBe("2026-10-26T03:30:00.000Z");
    expect(atBusinessTime("2026-10-26", 0, 5, "Asia/Kolkata").toISOString()).toBe("2026-10-25T18:35:00.000Z");
  });

  it("reports the business date of an instant", () => {
    // 20:00 UTC is already the next day in India.
    expect(businessDateKey(new Date("2026-10-25T20:00:00Z"), "Asia/Kolkata")).toBe("2026-10-26");
  });

  it("finds the next occurrence of a daily time", () => {
    const beforeNine = new Date("2026-10-26T02:00:00Z"); // 07:30 IST
    const afterNine = new Date("2026-10-26T05:00:00Z"); // 10:30 IST
    expect(nextBusinessTime(beforeNine, 9, 0, "Asia/Kolkata").toISOString()).toBe("2026-10-26T03:30:00.000Z");
    expect(nextBusinessTime(afterNine, 9, 0, "Asia/Kolkata").toISOString()).toBe("2026-10-27T03:30:00.000Z");
  });

  it("adds months and clamps to the end of shorter months", () => {
    expect(addMonths(new Date("2026-01-31T00:00:00Z"), 1).toISOString()).toBe("2026-02-28T00:00:00.000Z");
    expect(addMonths(new Date("2026-04-15T00:00:00Z"), 6).toISOString()).toBe("2026-10-15T00:00:00.000Z");
    expect(addMonths(new Date("2026-11-10T00:00:00Z"), 3).toISOString()).toBe("2027-02-10T00:00:00.000Z");
  });
});

describe("Job queue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a job for a new dedupe key", async () => {
    db.scheduledJob.findUnique.mockResolvedValue(null);
    const runAt = new Date("2026-10-26T03:30:00Z");
    await enqueueJob({ type: "X", runAt, dedupeKey: "x:1", payload: { a: 1 } });
    expect(db.scheduledJob.create).toHaveBeenCalledWith({
      data: { type: "X", runAt, payload: { a: 1 }, dedupeKey: "x:1", maxAttempts: 5 },
    });
  });

  it("moves a pending job instead of duplicating it", async () => {
    db.scheduledJob.findUnique.mockResolvedValue({ id: "job-1", status: "PENDING" });
    await enqueueJob({ type: "X", runAt: new Date("2026-10-27T00:00:00Z"), dedupeKey: "x:1" });
    expect(db.scheduledJob.create).not.toHaveBeenCalled();
    expect(db.scheduledJob.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "job-1" }, data: expect.objectContaining({ status: "PENDING", attempts: 0 }) })
    );
  });

  it("never re-runs a job that already completed", async () => {
    db.scheduledJob.findUnique.mockResolvedValue({ id: "job-1", status: "DONE" });
    await enqueueJob({ type: "X", runAt: new Date(), dedupeKey: "x:1" });
    expect(db.scheduledJob.create).not.toHaveBeenCalled();
    expect(db.scheduledJob.update).not.toHaveBeenCalled();
  });

  it("cancels only pending or failed jobs for a key prefix", async () => {
    db.scheduledJob.updateMany.mockResolvedValue({ count: 2 });
    await expect(cancelJobsByKeyPrefix("interview-reminder:abc:")).resolves.toBe(2);
    expect(db.scheduledJob.updateMany).toHaveBeenCalledWith({
      where: { dedupeKey: { startsWith: "interview-reminder:abc:" }, status: { in: ["PENDING", "FAILED"] } },
      data: { status: "CANCELLED", lockedAt: null },
    });
  });
});

describe("Job runner", () => {
  const now = new Date("2026-10-26T04:00:00Z");

  beforeEach(() => {
    vi.clearAllMocks();
    db.scheduledJob.updateMany.mockResolvedValue({ count: 1 });
  });

  it("claims each due job once and marks it done", async () => {
    db.scheduledJob.findMany.mockResolvedValue([{ id: "j1", type: "PING", payload: { n: 1 }, attempts: 0, maxAttempts: 5 }]);
    const handler = vi.fn(async () => undefined);

    const summary = await runDueJobs({ PING: handler }, { now });

    expect(handler).toHaveBeenCalledWith({ n: 1 }, { jobId: "j1", now, attempt: 1 });
    expect(db.scheduledJob.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "j1", status: "PENDING", attempts: 0 } })
    );
    expect(db.scheduledJob.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "j1" }, data: expect.objectContaining({ status: "DONE" }) })
    );
    expect(summary).toMatchObject({ claimed: 1, succeeded: 1 });
  });

  it("skips a job another trigger claimed first", async () => {
    db.scheduledJob.findMany.mockResolvedValue([{ id: "j1", type: "PING", payload: null, attempts: 0, maxAttempts: 5 }]);
    db.scheduledJob.updateMany
      .mockResolvedValueOnce({ count: 0 }) // stale recovery
      .mockResolvedValueOnce({ count: 0 }); // claim lost
    const handler = vi.fn();
    const summary = await runDueJobs({ PING: handler }, { now });
    expect(handler).not.toHaveBeenCalled();
    expect(summary.claimed).toBe(0);
  });

  it("retries with backoff and gives up after max attempts", async () => {
    db.scheduledJob.findMany.mockResolvedValue([
      { id: "retry", type: "BOOM", payload: null, attempts: 1, maxAttempts: 5 },
      { id: "final", type: "BOOM", payload: null, attempts: 4, maxAttempts: 5 },
    ]);
    const summary = await runDueJobs({ BOOM: async () => { throw new Error("smtp down"); } }, { now });

    expect(db.scheduledJob.update).toHaveBeenCalledWith({
      where: { id: "retry" },
      data: expect.objectContaining({ status: "PENDING", runAt: new Date(now.getTime() + 4 * 60 * 1000) }),
    });
    expect(db.scheduledJob.update).toHaveBeenCalledWith({
      where: { id: "final" },
      data: expect.objectContaining({ status: "FAILED", lastError: "smtp down" }),
    });
    expect(summary).toMatchObject({ retried: 1, failed: 1 });
  });

  it("fails jobs with no registered handler instead of looping", async () => {
    db.scheduledJob.findMany.mockResolvedValue([{ id: "j1", type: "UNKNOWN", payload: null, attempts: 4, maxAttempts: 5 }]);
    const summary = await runDueJobs({}, { now });
    expect(summary.failed).toBe(1);
  });

  it("recovers jobs abandoned by a crashed run", async () => {
    db.scheduledJob.findMany.mockResolvedValue([]);
    await runDueJobs({}, { now });
    expect(db.scheduledJob.updateMany).toHaveBeenCalledWith({
      where: { status: "RUNNING", lockedAt: { lt: new Date(now.getTime() - STALE_JOB_MS) } },
      data: { status: "PENDING", lockedAt: null },
    });
  });
});
