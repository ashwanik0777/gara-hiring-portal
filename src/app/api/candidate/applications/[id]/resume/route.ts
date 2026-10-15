import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/guards";
import { applicationService } from "@/features/applications/services/application-service";
import { AppError } from "@/lib/errors";
import { Role } from "@prisma/client";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const { id } = await params;
    const staffRoles: Role[] = [
      Role.ADMIN,
      Role.HR,
      Role.INTERVIEWER,
      Role.MANAGER,
    ];
    const isStaff = user.roles.some((r) => staffRoles.includes(r));

    const file = await applicationService.getApplicationResume(
      id,
      user.id,
      isStaff
    );

    const safeFilename = file.filename.replace(/[^a-zA-Z0-9._-]/g, "_");

    return new NextResponse(file.buffer as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": file.mimeType,
        "Content-Disposition": `inline; filename="${safeFilename}"`,
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
      { status: 403 }
    );
  }
}
