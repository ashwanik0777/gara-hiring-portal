import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/guards";
import { applicationService } from "@/features/applications/services/application-service";
import { AppError } from "@/lib/errors";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth();

    const { id } = await params;
    // Record-level authorization lives in the service: the owning candidate, recruitment
    // staff with `canApplications`, and interviewer-scoped staff only for assigned applications.
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
    if (err instanceof AppError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: err.statusCode }
      );
    }
    return NextResponse.json(
      { error: "Unable to retrieve resume document" },
      { status: 500 }
    );
  }
}
