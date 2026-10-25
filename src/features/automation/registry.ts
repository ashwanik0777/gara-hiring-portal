import { prisma } from "@/lib/db";
import { enqueueJob } from "@/infrastructure/jobs/job-queue";
import type { JobHandler } from "@/infrastructure/jobs/job-runner";
import { businessDateKey, nextBusinessTime } from "@/lib/time/business-time";
import { conversionJobHandlers } from "@/features/employees/services/conversion-jobs";
import { runCheckpointReminders } from "./checkpoint-reminders";
import { runConversionReviewReminders } from "./conversion-review-reminders";
import { handleInterviewReminder } from "./interview-reminders";
import { JOB_TYPES, type JobType } from "./job-types";
import { DAILY_JOBS, readDailyJobDate } from "./schedule";
import { runStaffDailyDigest } from "./staff-digest";

/** Wraps a daily job: runs only for a valid payload on its own business day. */
function dailyHandler(type: JobType, run: (dateKey: string, now: Date) => Promise<unknown>): JobHandler {
  return async (payload, { now }) => {
    const dateKey = readDailyJobDate(type, payload, now);
    if (dateKey === null) return;
    await run(dateKey, now);
  };
}

/**
 * Job type → handler map used by the automation runner. Feature modules contribute their
 * handlers here (reminders, digests, scheduled conversions).
 */
export const automationHandlers: Record<string, JobHandler> = {
  [JOB_TYPES.INTERVIEW_REMINDER]: handleInterviewReminder,
  [JOB_TYPES.CHECKPOINT_REMINDERS_DAILY]: dailyHandler(JOB_TYPES.CHECKPOINT_REMINDERS_DAILY, runCheckpointReminders),
  [JOB_TYPES.CONVERSION_REVIEW_REMINDERS_DAILY]: dailyHandler(
    JOB_TYPES.CONVERSION_REVIEW_REMINDERS_DAILY,
    runConversionReviewReminders
  ),
  [JOB_TYPES.STAFF_DAILY_DIGEST]: dailyHandler(JOB_TYPES.STAFF_DAILY_DIGEST, runStaffDailyDigest),
  // CONVERSION_EFFECTIVE (accepted intern → full-time conversions), owned by the employees module.
  ...conversionJobHandlers,
};

/** Dedupe key of a daily job occurrence, e.g. `STAFF_DAILY_DIGEST:2026-10-26`. */
export function dailyJobDedupeKey(type: JobType, dateKey: string): string {
  return `${type}:${dateKey}`;
}

function isUniqueConstraintError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}

/**
 * Seeds the next occurrence of recurring jobs (daily digest, daily reminders). Must be
 * idempotent: it runs on every automation tick.
 *
 * Only occurrences that do not exist yet are created. Existing ones are left untouched, so a
 * job waiting for a retry keeps its backoff and attempt count, and a finished one is never
 * re-queued. A concurrent tick creating the same occurrence first is not an error.
 */
export async function ensureRecurringJobs(now: Date): Promise<void> {
  const planned = DAILY_JOBS.map((job) => {
    const runAt = nextBusinessTime(now, job.hour, job.minute);
    const dateKey = businessDateKey(runAt);
    return { type: job.type, runAt, dateKey, dedupeKey: dailyJobDedupeKey(job.type, dateKey) };
  });

  const existing = await prisma.scheduledJob.findMany({
    where: { dedupeKey: { in: planned.map((job) => job.dedupeKey) } },
    select: { dedupeKey: true },
  });
  const existingKeys = new Set(existing.map((job) => job.dedupeKey));

  for (const job of planned) {
    if (existingKeys.has(job.dedupeKey)) continue;
    try {
      await enqueueJob({
        type: job.type,
        runAt: job.runAt,
        payload: { dateKey: job.dateKey },
        dedupeKey: job.dedupeKey,
      });
    } catch (error) {
      if (!isUniqueConstraintError(error)) throw error;
    }
  }
}
