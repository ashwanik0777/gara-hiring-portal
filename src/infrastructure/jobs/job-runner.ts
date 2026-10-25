import { Prisma, ScheduledJobStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logging/logger";

export interface JobContext {
  jobId: string;
  now: Date;
  attempt: number;
}

export type JobHandler = (payload: Prisma.JsonValue | null, context: JobContext) => Promise<void>;

export interface JobRunSummary {
  claimed: number;
  succeeded: number;
  retried: number;
  failed: number;
  recoveredStale: number;
}

/** Jobs left RUNNING longer than this are assumed abandoned by a crashed run. */
export const STALE_JOB_MS = 10 * 60 * 1000;

/** Retry delay after a failed attempt: 1, 4, 9, 16 … minutes. */
function retryDelayMs(attempt: number): number {
  return attempt * attempt * 60 * 1000;
}

/**
 * Runs due jobs. Each job is claimed with a conditional update (PENDING → RUNNING), so
 * concurrent triggers (traffic, external scheduler, worker) never run the same job twice.
 * Handlers must be idempotent because a crash after the side effect but before completion
 * makes the job run again once its claim goes stale.
 */
export async function runDueJobs(
  handlers: Record<string, JobHandler>,
  options: { now?: Date; limit?: number } = {}
): Promise<JobRunSummary> {
  const now = options.now ?? new Date();
  const limit = options.limit ?? 25;
  const summary: JobRunSummary = { claimed: 0, succeeded: 0, retried: 0, failed: 0, recoveredStale: 0 };

  const stale = await prisma.scheduledJob.updateMany({
    where: { status: ScheduledJobStatus.RUNNING, lockedAt: { lt: new Date(now.getTime() - STALE_JOB_MS) } },
    data: { status: ScheduledJobStatus.PENDING, lockedAt: null },
  });
  summary.recoveredStale = stale.count;

  const due = await prisma.scheduledJob.findMany({
    where: { status: ScheduledJobStatus.PENDING, runAt: { lte: now } },
    orderBy: { runAt: "asc" },
    take: limit,
    select: { id: true, type: true, payload: true, attempts: true, maxAttempts: true },
  });

  for (const job of due) {
    const claim = await prisma.scheduledJob.updateMany({
      where: { id: job.id, status: ScheduledJobStatus.PENDING, attempts: job.attempts },
      data: { status: ScheduledJobStatus.RUNNING, lockedAt: now, attempts: { increment: 1 } },
    });
    if (claim.count !== 1) {
      continue;
    }
    summary.claimed += 1;
    const attempt = job.attempts + 1;

    try {
      const handler = handlers[job.type];
      if (!handler) {
        throw new Error(`No handler registered for job type "${job.type}"`);
      }
      await handler(job.payload, { jobId: job.id, now, attempt });
      await prisma.scheduledJob.update({
        where: { id: job.id },
        data: { status: ScheduledJobStatus.DONE, completedAt: new Date(), lockedAt: null, lastError: null },
      });
      summary.succeeded += 1;
    } catch (error) {
      const message = (error instanceof Error ? error.message : String(error)).slice(0, 500);
      const exhausted = attempt >= job.maxAttempts;
      await prisma.scheduledJob.update({
        where: { id: job.id },
        data: exhausted
          ? { status: ScheduledJobStatus.FAILED, lockedAt: null, lastError: message }
          : {
              status: ScheduledJobStatus.PENDING,
              lockedAt: null,
              lastError: message,
              runAt: new Date(now.getTime() + retryDelayMs(attempt)),
            },
      });
      if (exhausted) {
        summary.failed += 1;
        logger.error("Scheduled job failed permanently", error, { jobId: job.id, type: job.type });
      } else {
        summary.retried += 1;
        logger.warn("Scheduled job failed; will retry", { jobId: job.id, type: job.type, attempt });
      }
    }
  }

  return summary;
}
