import { connection, NextRequest, NextResponse } from "next/server";
import {
  getPublicVisitorCount,
  trackUniqueVisit,
} from "@/features/analytics/services/visitor-service";
import { RateLimitError } from "@/lib/errors";
import { defaultRateLimiter, RATE_LIMIT_POLICIES } from "@/lib/security/rate-limit";
import { getClientIpHash } from "@/lib/security/client-ip";
import { getSiteUrl } from "@/lib/site-url";

const COOKIE_NAME = "gara_vid";
const ONE_YEAR_SECONDS = 365 * 24 * 60 * 60;

/** Shared caches may reuse a count for 5 minutes (it is the same for every visitor). */
const PUBLIC_COUNT_CACHE_CONTROL = "public, max-age=0, s-maxage=300, stale-while-revalidate=600";

/**
 * GET /api/analytics/visitors
 * Returns the recorded visitor count without side-effects (`null` if unavailable). The
 * count is cached for a few minutes, so public page views never count the whole table.
 */
export async function GET() {
  // Read at request time (never at build time); the count itself comes from "use cache".
  await connection();
  const count = await getPublicVisitorCount();
  return NextResponse.json(
    { success: count !== null, count },
    // A failed read is never cached by a CDN.
    { headers: { "Cache-Control": count === null ? "no-store" : PUBLIC_COUNT_CACHE_CONTROL } }
  );
}

/**
 * True only for a request the site's own pages sent: `Sec-Fetch-Site: same-origin` when
 * the browser sends it, and an `Origin` equal to the app origin (`getSiteUrl()`). Requests
 * with neither header are refused, so other sites cannot inflate the count or set the
 * visitor cookie.
 */
function isSameOriginRequest(req: NextRequest): boolean {
  const fetchSite = req.headers.get("sec-fetch-site");
  if (fetchSite !== null && fetchSite !== "same-origin") return false;
  const origin = req.headers.get("origin");
  if (origin === null) return fetchSite === "same-origin";
  return origin === new URL(getSiteUrl()).origin;
}

/**
 * POST /api/analytics/visitors
 * Same-origin only, then rate-limited per keyed client-IP hash. Records a visit if new
 * and sets/refreshes the anonymous visitor cookie. Only the keyed hash is stored, never
 * the raw IP.
 */
export async function POST(req: NextRequest) {
  if (!isSameOriginRequest(req)) {
    return NextResponse.json(
      { success: false, error: "Cross-site requests are not allowed." },
      { status: 403, headers: { "Cache-Control": "no-store" } }
    );
  }

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
