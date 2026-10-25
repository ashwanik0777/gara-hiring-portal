import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import { logger } from "@/lib/logging/logger";
import { runAutomation } from "@/features/automation/run-automation";

export const maxDuration = 60;

const NO_STORE = { "Cache-Control": "no-store, max-age=0" };

function isAuthorized(req: NextRequest): boolean {
  if (!env.CRON_SECRET) {
    return false;
  }
  const provided = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${env.CRON_SECRET}`;
  const providedBuf = Buffer.from(provided, "utf8");
  const expectedBuf = Buffer.from(expected, "utf8");
  return providedBuf.length === expectedBuf.length && crypto.timingSafeEqual(providedBuf, expectedBuf);
}

async function handle(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: NO_STORE });
  }
  try {
    const summary = await runAutomation({ limit: 50 });
    return NextResponse.json({ success: true, summary }, { headers: NO_STORE });
  } catch (error) {
    logger.error("Automation run failed", error);
    return NextResponse.json({ success: false, error: "Automation run failed" }, { status: 500, headers: NO_STORE });
  }
}

/**
 * GET|POST /api/jobs/run — runs due background jobs and delivers queued email.
 * Called by any scheduler (an external cron service, a crontab, or `npm run worker`)
 * with `Authorization: Bearer <CRON_SECRET>`.
 */
export const GET = handle;
export const POST = handle;
