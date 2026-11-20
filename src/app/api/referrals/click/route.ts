import { NextRequest, NextResponse } from "next/server";
import { RateLimitError } from "@/lib/errors";
import { logger } from "@/lib/logging/logger";
import { defaultRateLimiter, type RateLimitPolicy } from "@/lib/security/rate-limit";
import { getClientIpHash } from "@/lib/security/client-ip";
import { getSiteUrl } from "@/lib/site-url";
import { CAMPUS_AMBASSADOR_POLICY } from "@/config/site";
import { REFERRAL_COOKIE } from "@/features/ambassadors/policy";
import { recordReferralClick } from "@/features/ambassadors/services/ambassador-service";

/** Click tracking is rate-limited per client (anti-abuse, product-owner plan). */
const REFERRAL_CLICK_RATE_LIMIT: RateLimitPolicy = { scope: "public:referral_click", maxRequests: 20, windowSeconds: 10 * 60 };

const NO_STORE = { "Cache-Control": "no-store" };

function isSameOriginRequest(req: NextRequest): boolean {
  const fetchSite = req.headers.get("sec-fetch-site");
  if (fetchSite !== null && fetchSite !== "same-origin") return false;
  const origin = req.headers.get("origin");
  if (origin === null) return fetchSite === "same-origin";
  return origin === new URL(getSiteUrl()).origin;
}

/**
 * POST /api/referrals/click — a page opened with `?ref=CODE` reports the code. A valid code of
 * an active ambassador is counted (per day, no visitor data stored) and remembered in an
 * httpOnly cookie for the attribution window; the last click wins.
 */
export async function POST(req: NextRequest) {
  if (!isSameOriginRequest(req)) return NextResponse.json({ ok: false }, { status: 403, headers: NO_STORE });
  try {
    await defaultRateLimiter.enforce(getClientIpHash(req.headers, "referral-click"), REFERRAL_CLICK_RATE_LIMIT);
  } catch (error) {
    if (error instanceof RateLimitError) return NextResponse.json({ ok: false }, { status: 429, headers: NO_STORE });
    throw error;
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400, headers: NO_STORE });
  }
  const rawCode = body && typeof body === "object" ? (body as { code?: unknown }).code : undefined;
  let code: string | null = null;
  try {
    code = await recordReferralClick(rawCode, new Date());
  } catch (error) {
    logger.warn("Referral click could not be recorded", { reason: error instanceof Error ? error.name : "unknown" });
  }
  if (!code) return NextResponse.json({ ok: false }, { status: 200, headers: NO_STORE });

  const response = NextResponse.json({ ok: true }, { headers: NO_STORE });
  response.cookies.set(REFERRAL_COOKIE, code, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: CAMPUS_AMBASSADOR_POLICY.attributionDays * 24 * 60 * 60,
  });
  return response;
}
