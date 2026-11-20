import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/guards";
import { AppError, RateLimitError } from "@/lib/errors";
import { logger } from "@/lib/logging/logger";
import { defaultRateLimiter, type RateLimitPolicy } from "@/lib/security/rate-limit";
import { getInternshipOfferPdf } from "@/features/internship-offers/services/internship-offer-service";

const NO_STORE = "private, no-cache, no-store, must-revalidate";

/** The PDF is rendered on every request: at most 20 downloads per user per minute. */
const INTERNSHIP_OFFER_PDF_RATE_LIMIT: RateLimitPolicy = {
  scope: "pdf:internship_offer_letter",
  maxRequests: 20,
  windowSeconds: 60,
};

function jsonError(message: string, status: number, headers: Record<string, string> = {}): NextResponse {
  return NextResponse.json(
    { error: message },
    { status, headers: { "Cache-Control": NO_STORE, "X-Content-Type-Options": "nosniff", ...headers } }
  );
}

/**
 * GET /api/internship-offers/[applicationId]/letter — the internship offer letter PDF.
 * The candidate downloads their own letter; staff need evaluation access to the internship.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ applicationId: string }> }) {
  try {
    const user = await requireAuth();
    const { applicationId } = await params;
    if (!z.uuid().safeParse(applicationId).success) {
      return jsonError("This offer letter could not be found.", 404);
    }

    await defaultRateLimiter.enforce(user.id, INTERNSHIP_OFFER_PDF_RATE_LIMIT);
    const { buffer, filename } = await getInternshipOfferPdf(applicationId, user);

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
    if (error instanceof RateLimitError) {
      return jsonError(error.message, 429, { "Retry-After": String(error.retryAfterSeconds) });
    }
    if (error instanceof AppError) {
      return jsonError(error.message, error.statusCode);
    }
    logger.error("Internship offer letter download failed", error);
    return jsonError("The offer letter could not be generated.", 500);
  }
}
