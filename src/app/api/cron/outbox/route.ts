import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import { logger } from "@/lib/logging/logger";
import { outboxProcessorService } from "@/infrastructure/email/outbox-processor";

const NO_STORE = { "Cache-Control": "no-store, max-age=0" };

function isAuthorized(req: NextRequest): boolean {
  if (!env.CRON_SECRET) {
    return false;
  }
  const provided = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${env.CRON_SECRET}`;
  const providedBuf = Buffer.from(provided, "utf8");
  const expectedBuf = Buffer.from(expected, "utf8");
  return (
    providedBuf.length === expectedBuf.length &&
    crypto.timingSafeEqual(providedBuf, expectedBuf)
  );
}

/**
 * GET /api/cron/outbox
 * Retries pending and failed notification emails. Invoked by Vercel Cron, which
 * sends `Authorization: Bearer <CRON_SECRET>` when CRON_SECRET is configured.
 */
export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: NO_STORE });
  }

  try {
    const summary = await outboxProcessorService.processPendingBatch(50);
    return NextResponse.json({ success: true, summary }, { headers: NO_STORE });
  } catch (error) {
    logger.error("Outbox cron run failed", error);
    return NextResponse.json(
      { success: false, error: "Outbox processing failed" },
      { status: 500, headers: NO_STORE }
    );
  }
}
