import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { referralLink } from "@/features/ambassadors/services/ambassador-service";

const NO_STORE = { "Cache-Control": "private, no-store" };

/** GET /api/ambassador/qr — the signed-in ambassador's referral link as an SVG QR code. */
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth();
    const ambassador = await prisma.campusAmbassador.findUnique({ where: { userId: user.id }, select: { referralCode: true, status: true } });
    if (!ambassador?.referralCode || ambassador.status !== "APPROVED") {
      return NextResponse.json({ error: "No active referral code." }, { status: 404, headers: NO_STORE });
    }
    const { toString } = await import("qrcode");
    const svg = await toString(referralLink(ambassador.referralCode), { type: "svg", margin: 2, width: 512, errorCorrectionLevel: "M" });
    const download = request.nextUrl.searchParams.get("download") === "1";
    return new Response(svg, {
      headers: {
        ...NO_STORE,
        "Content-Type": "image/svg+xml",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'",
        ...(download ? { "Content-Disposition": `attachment; filename="${ambassador.referralCode}-qr.svg"` } : {}),
      },
    });
  } catch (error) {
    const status = error instanceof AppError ? error.statusCode : 500;
    return NextResponse.json({ error: status === 401 ? "Sign in first." : "The QR code could not be created." }, { status, headers: NO_STORE });
  }
}
