import { after } from "next/server";
import { logger } from "@/lib/logging/logger";
import { runAutomation } from "./run-automation";

/** Minimum gap between traffic-triggered automation ticks on one server instance. */
const TICK_INTERVAL_MS = 60 * 1000;

/**
 * A traffic tick runs inside the request's `after()` window on a shared instance, so it
 * delivers only a small batch of queued email; `/api/jobs/run` (external scheduler or
 * `npm run worker`) keeps the full default batch.
 */
const TRAFFIC_TICK_JOB_LIMIT = 15;
const TRAFFIC_TICK_EMAIL_BATCH_SIZE = 10;

const state = globalThis as typeof globalThis & { __garaAutomationLastTick?: number };

/**
 * Runs due automation after the current response is sent, at most once a minute per server
 * instance. Keeps reminders flowing whenever people use the app; an external scheduler or
 * `npm run worker` covers quiet periods. Never affects the request that triggered it.
 */
export function scheduleAutomationTick(): void {
  const nowMs = Date.now();
  if (state.__garaAutomationLastTick && nowMs - state.__garaAutomationLastTick < TICK_INTERVAL_MS) {
    return;
  }
  state.__garaAutomationLastTick = nowMs;
  try {
    after(async () => {
      try {
        await runAutomation({ limit: TRAFFIC_TICK_JOB_LIMIT, emailBatchSize: TRAFFIC_TICK_EMAIL_BATCH_SIZE });
      } catch (error) {
        logger.error("Traffic-triggered automation tick failed", error);
      }
    });
  } catch {
    // Outside a request scope (scripts, tests): nothing to schedule.
  }
}
