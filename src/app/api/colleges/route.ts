import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/guards";
import { defaultRateLimiter, RATE_LIMIT_POLICIES } from "@/lib/security/rate-limit";
import { RateLimitError } from "@/lib/errors";
import { logger } from "@/lib/logging/logger";
import { searchColleges } from "@/features/colleges/services/college-service";

export const instant = false;

const NO_STORE = { "Cache-Control": "private, no-cache, no-store, must-revalidate" };
const MAX_QUERY_LENGTH = 60;

/**
 * College suggestions for the apply form: GET /api/colleges?q=<at least 2 characters>.
 * Signed-in users only (the apply form needs an account), rate-limited per user, never cached.
 */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in to search colleges." }, { status: 401, headers: NO_STORE });
  }

  const query = (request.nextUrl.searchParams.get("q") ?? "").trim();
  if (query.length < 2 || query.length > MAX_QUERY_LENGTH) {
    return NextResponse.json({ colleges: [] }, { headers: NO_STORE });
  }

  try {
    await defaultRateLimiter.enforce(user.id, RATE_LIMIT_POLICIES.COLLEGE_SEARCH);
    const colleges = await searchColleges(query, user.id);
    return NextResponse.json({ colleges }, { headers: NO_STORE });
  } catch (error) {
    if (error instanceof RateLimitError) {
      return NextResponse.json(
        { error: "Too many searches. Please wait a moment." },
        { status: 429, headers: { ...NO_STORE, "Retry-After": String(error.retryAfterSeconds) } }
      );
    }
    logger.error("College search failed", error);
    return NextResponse.json({ error: "College search is unavailable right now." }, { status: 503, headers: NO_STORE });
  }
}
