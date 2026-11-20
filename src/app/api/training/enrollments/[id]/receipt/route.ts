import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/guards";
import { AppError, RateLimitError } from "@/lib/errors";
import { logger } from "@/lib/logging/logger";
import { defaultRateLimiter, type RateLimitPolicy } from "@/lib/security/rate-limit";
import { getReceiptPdf } from "@/features/training/services/enrollment-service";

const NO_STORE = "private, no-cache, no-store, must-revalidate";
const RECEIPT_RATE_LIMIT: RateLimitPolicy = { scope: "pdf:training_receipt", maxRequests: 20, windowSeconds: 60 };

function jsonError(message: string, status: number, headers: Record<string, string> = {}) {
  return NextResponse.json({ error: message }, { status, headers: { "Cache-Control": NO_STORE, "X-Content-Type-Options": "nosniff", ...headers } });
}

/** GET /api/training/enrollments/[id]/receipt — the Payment Receipt PDF (student or administrator). */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth();
    const { id } = await params;
    if (!z.uuid().safeParse(id).success) return jsonError("Receipt not found.", 404);
    await defaultRateLimiter.enforce(user.id, RECEIPT_RATE_LIMIT);
    const { buffer, filename } = await getReceiptPdf(id, user);
    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(buffer.length),
        "Cache-Control": NO_STORE,
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
      },
    });
  } catch (error) {
    if (error instanceof RateLimitError) return jsonError(error.message, 429, { "Retry-After": String(error.retryAfterSeconds) });
    if (error instanceof AppError) return jsonError(error.message, error.statusCode);
    logger.error("Training receipt download failed", error);
    return jsonError("The receipt could not be generated.", 500);
  }
}
