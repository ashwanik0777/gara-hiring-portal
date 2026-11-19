import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/guards";
import { certificateService } from "@/features/certificates/services/certificate-service";
import { AppError, RateLimitError } from "@/lib/errors";
import { logger } from "@/lib/logging/logger";
import { defaultRateLimiter, type RateLimitPolicy } from "@/lib/security/rate-limit";

const NO_STORE = "private, no-cache, no-store, must-revalidate";

const CertificateIdSchema = z.string().uuid();

/** The PDF is generated on every request: at most 20 downloads per user per minute. */
const CERTIFICATE_PDF_RATE_LIMIT: RateLimitPolicy = {
  scope: "pdf:certificate_download",
  maxRequests: 20,
  windowSeconds: 60,
};

function jsonError(
  message: string,
  status: number,
  code?: string,
  headers: Record<string, string> = {}
): NextResponse {
  return NextResponse.json(
    { error: message, ...(code ? { code } : {}) },
    { status, headers: { "Cache-Control": NO_STORE, "X-Content-Type-Options": "nosniff", ...headers } }
  );
}

/**
 * GET /api/certificates/[id]/download — the certificate PDF as an attachment.
 * Record-level authorization lives in the service: the certificate's intern, or staff
 * with evaluation access whose scope includes the enrollment.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth();

    const { id } = await params;
    const parsed = CertificateIdSchema.safeParse(id);
    if (!parsed.success) {
      return jsonError("This certificate could not be found.", 404, "NOT_FOUND");
    }

    await defaultRateLimiter.enforce(user.id, CERTIFICATE_PDF_RATE_LIMIT);

    const certificateId = parsed.data;
    const pdfBuffer = await certificateService.getCertificatePdfBuffer(certificateId, user.id, user.roles);

    return new Response(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="GARA_Certificate_${certificateId}.pdf"`,
        "Content-Length": String(pdfBuffer.length),
        "Cache-Control": NO_STORE,
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
      },
    });
  } catch (error: unknown) {
    if (error instanceof RateLimitError) {
      return jsonError("Too many downloads. Please wait a minute and try again.", 429, error.code, {
        "Retry-After": String(error.retryAfterSeconds),
      });
    }
    if (error instanceof AppError && error.isOperational) {
      return jsonError(error.message, error.statusCode, error.code);
    }
    logger.error("Certificate download failed", error);
    return jsonError("We couldn't prepare the certificate right now. Please try again later.", 500);
  }
}
