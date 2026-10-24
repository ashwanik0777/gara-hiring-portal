import { NextRequest, NextResponse } from "next/server";
import {
  getUniqueVisitorCount,
  trackUniqueVisit,
} from "@/features/analytics/services/visitor-service";
import { RateLimitError } from "@/lib/errors";
import { defaultRateLimiter, RATE_LIMIT_POLICIES } from "@/lib/security/rate-limit";
import { getClientIpHash } from "@/lib/security/client-ip";

const COOKIE_NAME = "gara_vid";
const ONE_YEAR_SECONDS = 365 * 24 * 60 * 60;

/**
 * GET /api/analytics/visitors
 * Returns the recorded visitor count without side-effects (`null` if unavailable).
 */
export async function GET() {
  const count = await getUniqueVisitorCount();
  return NextResponse.json({
    success: count !== null,
    count,
  });
}

/**
 * POST /api/analytics/visitors
 * Rate-limited per keyed client-IP hash. Records a visit if new and sets/refreshes
 * the anonymous visitor cookie. Only the keyed hash is stored, never the raw IP.
 */
export async function POST(req: NextRequest) {
  const ipHash = getClientIpHash(req.headers, "visitor");

  try {
    await defaultRateLimiter.enforce(ipHash, RATE_LIMIT_POLICIES.VISITOR_TRACK);
  } catch (error) {
    if (error instanceof RateLimitError) {
      return NextResponse.json(
        { success: false, error: "Too many requests." },
        {
          status: 429,
          headers: { "Retry-After": String(error.retryAfterSeconds) },
        }
      );
    }
    throw error;
  }

  const result = await trackUniqueVisit({
    visitorId: req.cookies.get(COOKIE_NAME)?.value ?? null,
    ipHash,
    userAgent: req.headers.get("user-agent"),
  });

  const response = NextResponse.json({
    success: result.totalUniqueVisitors !== null,
    count: result.totalUniqueVisitors,
    isNewVisitor: result.isNewVisitor,
  });

  // Set or renew long-lived anonymous visitor cookie
  response.cookies.set({
    name: COOKIE_NAME,
    value: result.visitorId,
    maxAge: ONE_YEAR_SECONDS,
    path: "/",
    sameSite: "lax",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
  });

  return response;
}
