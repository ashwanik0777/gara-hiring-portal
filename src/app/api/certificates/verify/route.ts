import { NextRequest, NextResponse } from "next/server";
import { certificateService } from "@/features/certificates/services/certificate-service";
import { defaultRateLimiter, RATE_LIMIT_POLICIES } from "@/lib/security/rate-limit";
import { getClientIpHash } from "@/lib/security/client-ip";

const MAX_CODE_LENGTH = 64;

/**
 * POST /api/certificates/verify
 * Request body: { code: string }
 */
export async function POST(req: NextRequest) {
  try {
    const body: unknown = await req.json().catch(() => null);
    const rawCode =
      body && typeof body === "object" && "code" in body ? (body as { code: unknown }).code : undefined;
    const code = typeof rawCode === "string" ? rawCode.trim() : "";

    if (!code || code.length > MAX_CODE_LENGTH) {
      return NextResponse.json(
        {
          success: false,
          error: "Verification code is required",
        },
        { status: 400 }
      );
    }

    const ipHash = getClientIpHash(req.headers, "certificate-verify");

    try {
      await defaultRateLimiter.enforce(ipHash, RATE_LIMIT_POLICIES.CERTIFICATE_VERIFY);
    } catch {
      return NextResponse.json(
        { success: false, error: "Too many verification requests. Please try again later." },
        { status: 429 }
      );
    }
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

    if (!code || code.length > MAX_CODE_LENGTH) {
      return NextResponse.json(
        {
          success: false,
          error: "Verification code query parameter is required",
        },
        { status: 400 }
      );
    }

    const ipHash = getClientIpHash(req.headers, "certificate-verify");

    try {
      await defaultRateLimiter.enforce(ipHash, RATE_LIMIT_POLICIES.CERTIFICATE_VERIFY);
    } catch {
      return NextResponse.json(
        { success: false, error: "Too many verification requests. Please try again later." },
        { status: 429 }
      );
    }
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
