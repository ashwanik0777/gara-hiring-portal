import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { certificateService } from "@/features/certificates/services/certificate-service";

function getClientIpHash(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  const ip = forwarded ? forwarded.split(",")[0].trim() : req.headers.get("x-real-ip") || "anonymous";
  const salt = process.env.BETTER_AUTH_SECRET || "gara-cert-verify-salt";
  return crypto.createHash("sha256").update(`${ip}:${salt}`).digest("hex");
}

/**
 * POST /api/certificates/verify
 * Request body: { code: string }
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { code?: string };
    const code = body?.code?.trim();

    if (!code) {
      return NextResponse.json(
        {
          success: false,
          error: "Verification code is required",
        },
        { status: 400 }
      );
    }

    const ipHash = getClientIpHash(req);
    const userAgent = req.headers.get("user-agent") || undefined;
    const result = await certificateService.verifyCertificatePublic(code, ipHash, userAgent);

    return NextResponse.json({
      success: true,
      result,
    });
  } catch (error) {
    console.error("[CertVerifyRoute] Verification handler error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "An unexpected error occurred while verifying the credential.",
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/certificates/verify?code=...
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const code = searchParams.get("code")?.trim();

    if (!code) {
      return NextResponse.json(
        {
          success: false,
          error: "Verification code query parameter is required",
        },
        { status: 400 }
      );
    }

    const ipHash = getClientIpHash(req);
    const userAgent = req.headers.get("user-agent") || undefined;
    const result = await certificateService.verifyCertificatePublic(code, ipHash, userAgent);

    return NextResponse.json({
      success: true,
      result,
    });
  } catch (error) {
    console.error("[CertVerifyRoute] Verification GET handler error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "An unexpected error occurred while verifying the credential.",
      },
      { status: 500 }
    );
  }
}
