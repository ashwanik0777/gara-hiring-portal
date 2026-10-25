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

/**
 * One automation tick: seed recurring jobs, run every due job, then deliver queued email
 * through the configured SMTP account. Safe to call concurrently from any trigger.
 */
export async function runAutomation(options: { now?: Date; limit?: number } = {}): Promise<AutomationRunSummary> {
  const now = options.now ?? new Date();
  await ensureRecurringJobs(now);
  const jobs = await runDueJobs(automationHandlers, { now, limit: options.limit });
  const outbox = await outboxProcessorService.processPendingBatch(50);
  return { jobs, outbox };
}
