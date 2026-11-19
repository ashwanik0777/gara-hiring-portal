import { runDueJobs, type JobRunSummary } from "@/infrastructure/jobs/job-runner";
import {
  outboxProcessorService,
  type OutboxProcessingSummary,
} from "@/infrastructure/email/outbox-processor";
import { automationHandlers, ensureRecurringJobs } from "./registry";

export interface AutomationRunSummary {
  jobs: JobRunSummary;
  outbox: OutboxProcessingSummary;
}

/** Queued emails one run delivers unless the trigger asks for fewer. */
const DEFAULT_EMAIL_BATCH_SIZE = 50;

interface RunAutomationOptions {
  now?: Date;
  /** Most due jobs to claim. */
  limit?: number;
  /** Most queued emails to deliver (default {@link DEFAULT_EMAIL_BATCH_SIZE}). */
  emailBatchSize?: number;
}

/**
 * One automation tick: seed recurring jobs, run every due job, then deliver queued email
 * through the configured SMTP account. Safe to call concurrently from any trigger.
 */
export async function runAutomation(options: RunAutomationOptions = {}): Promise<AutomationRunSummary> {
  const now = options.now ?? new Date();
  await ensureRecurringJobs(now);
  const jobs = await runDueJobs(automationHandlers, { now, limit: options.limit });
  const outbox = await outboxProcessorService.processPendingBatch(
    options.emailBatchSize ?? DEFAULT_EMAIL_BATCH_SIZE
  );
  return { jobs, outbox };
}
