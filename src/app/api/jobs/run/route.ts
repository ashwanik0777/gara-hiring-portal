import { NextRequest, NextResponse } from "next/server";
import { hasCronSecret } from "@/lib/security/cron-auth";
import { logger } from "@/lib/logging/logger";
import { runAutomation } from "@/features/automation/run-automation";

export const maxDuration = 60;

const NO_STORE = { "Cache-Control": "no-store, max-age=0" };

async function handle(req: NextRequest) {
  if (!hasCronSecret(req.headers.get("authorization"))) {
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
