import { after } from "next/server";
import { logger } from "@/lib/logging/logger";
import { runAutomation } from "./run-automation";

/** Minimum gap between traffic-triggered automation ticks on one server instance. */
const TICK_INTERVAL_MS = 60 * 1000;

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
        await runAutomation({ limit: 15 });
      } catch (error) {
        logger.error("Traffic-triggered automation tick failed", error);
      }
    });
  } catch {
    // Outside a request scope (scripts, tests): nothing to schedule.
  }
}
