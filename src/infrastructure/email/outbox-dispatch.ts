import { after } from "next/server";
import { logger } from "@/lib/logging/logger";
import { outboxProcessorService } from "./outbox-processor";

/**
 * Schedules delivery of pending NotificationOutbox rows after the current
 * response has been sent. Call it from a Server Action or Route Handler right
 * after a transaction that enqueued notifications has committed.
 *
 * Delivery failures never affect the request; failed rows stay in the outbox
 * and are retried by the `/api/cron/outbox` job.
 */
export function scheduleOutboxFlush(): void {
  try {
    after(async () => {
      try {
        await outboxProcessorService.processPendingBatch();
      } catch (error) {
        logger.error("Outbox flush after response failed", error);
      }
    });
  } catch (error) {
    // `after` is only available inside a request scope (not in scripts or unit tests).
    logger.warn("Outbox flush could not be scheduled outside a request scope", {
      reason: error instanceof Error ? error.message : String(error),
    });
  }
}
