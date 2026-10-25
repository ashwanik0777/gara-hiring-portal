import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/guards";
import { applicationService } from "@/features/applications/services/application-service";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logging/logger";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth();

    const { id } = await params;
    // Record-level authorization lives in the service: the owning candidate, recruitment
    // staff with `canApplications`, and interviewer-scoped staff only for assigned applications.
    // Applications whose resume is an external share link have no file: the service raises a
    // 404 with code RESUME_IS_LINK (the link is shown on the application page instead).
    const file = await applicationService.getApplicationResume(id, user);

    const safeFilename = file.filename.replace(/[^a-zA-Z0-9._-]/g, "_");

    return new NextResponse(file.buffer as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": file.mimeType,
        "Content-Disposition": `attachment; filename="${safeFilename}"`,
        "Cache-Control": "private, no-cache, no-store, must-revalidate",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
      },
    });
  } catch (err: unknown) {
    if (err instanceof AppError && err.isOperational) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: err.statusCode, headers: { "Cache-Control": "no-store" } }
      );
    }
    logger.error("Resume download failed", err);
    return NextResponse.json(
      { error: "We couldn't open this resume right now. Please try again later." },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
