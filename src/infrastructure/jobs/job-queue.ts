import { Prisma, ScheduledJobStatus } from "@prisma/client";
import { prisma } from "@/lib/db";

type Db = Prisma.TransactionClient | typeof prisma;

export interface EnqueueJobInput {
  type: string;
  runAt: Date;
  payload?: Prisma.InputJsonValue;
  /**
   * Stable key for idempotency. Enqueueing again with the same key moves the pending job
   * (new time/payload) instead of creating a duplicate; a job that already ran is not re-run.
   * Include anything that should produce a new job (e.g. the interview's scheduled time).
   */
  dedupeKey?: string;
  maxAttempts?: number;
}

/**
 * Adds a durable background job. Pass the transaction client to enqueue atomically with
 * the business change that requires it.
 */
export async function enqueueJob(input: EnqueueJobInput, db: Db = prisma): Promise<void> {
  if (!input.dedupeKey) {
    await db.scheduledJob.create({
      data: {
        type: input.type,
        runAt: input.runAt,
        payload: input.payload,
        maxAttempts: input.maxAttempts ?? 5,
      },
    });
    return;
  }

  const existing = await db.scheduledJob.findUnique({
    where: { dedupeKey: input.dedupeKey },
    select: { id: true, status: true },
  });
  if (!existing) {
    await db.scheduledJob.create({
      data: {
        type: input.type,
        runAt: input.runAt,
        payload: input.payload,
        dedupeKey: input.dedupeKey,
        maxAttempts: input.maxAttempts ?? 5,
      },
    });
    return;
  }
  if (existing.status === ScheduledJobStatus.DONE || existing.status === ScheduledJobStatus.RUNNING) {
    return;
  }
  await db.scheduledJob.update({
    where: { id: existing.id },
    data: {
      type: input.type,
      runAt: input.runAt,
      payload: input.payload,
      status: ScheduledJobStatus.PENDING,
      attempts: 0,
      lastError: null,
      lockedAt: null,
      maxAttempts: input.maxAttempts ?? 5,
    },
  });
}

/** Cancels pending jobs whose dedupe key starts with the prefix (e.g. a cancelled interview). */
export async function cancelJobsByKeyPrefix(prefix: string, db: Db = prisma): Promise<number> {
  const result = await db.scheduledJob.updateMany({
    where: {
      dedupeKey: { startsWith: prefix },
      status: { in: [ScheduledJobStatus.PENDING, ScheduledJobStatus.FAILED] },
    },
    data: { status: ScheduledJobStatus.CANCELLED, lockedAt: null },
  });
  return result.count;
}
