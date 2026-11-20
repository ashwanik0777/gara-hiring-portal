import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/guards";
import { AppError, RateLimitError } from "@/lib/errors";
import { logger } from "@/lib/logging/logger";
import { defaultRateLimiter, type RateLimitPolicy } from "@/lib/security/rate-limit";
import { exportAdminDataset } from "@/features/exports/admin-exports";

const NO_STORE = "private, no-cache, no-store, must-revalidate";
const EXPORT_RATE_LIMIT: RateLimitPolicy = { scope: "admin:csv_export", maxRequests: 30, windowSeconds: 10 * 60 };

/** GET /api/admin/exports/[dataset] — an administrator CSV export (audited, capped). */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ dataset: string }> }) {
  try {
    const user = await requireAuth();
    await defaultRateLimiter.enforce(user.id, EXPORT_RATE_LIMIT);
    const { dataset } = await params;
    const { csv, filename, truncated } = await exportAdminDataset(user, dataset, new Date());
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": NO_STORE,
        "X-Content-Type-Options": "nosniff",
        "X-Export-Truncated": truncated ? "true" : "false",
      },
    });
  } catch (error) {
    if (error instanceof RateLimitError) return NextResponse.json({ error: error.message }, { status: 429, headers: { "Cache-Control": NO_STORE } });
    if (error instanceof AppError) return NextResponse.json({ error: error.message }, { status: error.statusCode, headers: { "Cache-Control": NO_STORE } });
    logger.error("Admin CSV export failed", error);
    return NextResponse.json({ error: "The export could not be created." }, { status: 500, headers: { "Cache-Control": NO_STORE } });
  }
}
