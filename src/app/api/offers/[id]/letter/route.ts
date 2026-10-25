import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/guards";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logging/logger";
import { OfferReferenceSchema } from "@/features/employees/schemas";
import { offerService } from "@/features/employees/services/offer-service";

const NO_STORE = "private, no-cache, no-store, must-revalidate";

function jsonError(message: string, status: number, code?: string): NextResponse {
  return NextResponse.json(
    { error: message, ...(code ? { code } : {}) },
    { status, headers: { "Cache-Control": NO_STORE, "X-Content-Type-Options": "nosniff" } }
  );
}

/**
 * GET /api/offers/[id]/letter — the offer letter PDF as an attachment.
 * Record-level authorization lives in the service: the candidate who owns the offer (only
 * once it was extended: EXTENDED / ACCEPTED / DECLINED) or HR / Admin with canEmployees.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth();

    const { id } = await params;
    const parsed = OfferReferenceSchema.safeParse({ offerId: id });
    if (!parsed.success) {
      return jsonError("This offer letter could not be found.", 404, "NOT_FOUND");
    }

    const { pdf, filename } = await offerService.getOfferLetterPdf(user, parsed.data.offerId);

    return new Response(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(pdf.length),
        "Cache-Control": NO_STORE,
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
      },
    });
  } catch (error: unknown) {
    if (error instanceof AppError && error.isOperational) {
      return jsonError(error.message, error.statusCode, error.code);
    }
    logger.error("Offer letter download failed", error);
    return jsonError("We couldn't prepare the offer letter right now. Please try again later.", 500);
  }
}
