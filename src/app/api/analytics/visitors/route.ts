import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import {
  getUniqueVisitorCount,
  trackUniqueVisit,
} from "@/features/analytics/services/visitor-service";

const COOKIE_NAME = "gara_vid";
const ONE_YEAR_SECONDS = 365 * 24 * 60 * 60;

/**
 * Helper to extract client IP from proxy headers.
 */
function getClientIp(req: NextRequest): string {
  const forwardedFor = req.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const ips = forwardedFor.split(",").map((ip) => ip.trim());
    if (ips[0]) return ips[0];
  }
  return req.headers.get("x-real-ip") || "127.0.0.1";
}

/**
 * GET /api/analytics/visitors
 * Returns the current total unique visitor count without side-effects.
 */
export async function GET() {
  const count = await getUniqueVisitorCount();
  return NextResponse.json({
    success: true,
    count,
  });
}

/**
 * POST /api/analytics/visitors
 * Tracks a unique visit, records it in PostgreSQL if new, and sets/refreshes the visitor cookie.
 */
export async function POST(req: NextRequest) {
  // Check if visitor already has the persistent cookie
  const existingCookie = req.cookies.get(COOKIE_NAME)?.value || null;
  const ip = getClientIp(req);

  // Validate visitor cookie format if present
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const validatedCookie = (existingCookie && uuidRegex.test(existingCookie)) ? existingCookie : null;

  const userAgent = req.headers.get("user-agent") || null;

  const result = await trackUniqueVisit({
    visitorId: validatedCookie,
    ip,
    userAgent,
  });

  const response = NextResponse.json({
    success: true,
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
