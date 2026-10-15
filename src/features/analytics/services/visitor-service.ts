import crypto from "crypto";
import { prisma } from "@/lib/db";

/**
 * Baseline visitor count offset.
 * Preserves the platform's historical verified baseline while dynamically incrementing
 * on each genuinely new unique visitor recorded in PostgreSQL.
 */
const BASELINE_OFFSET = parseInt(
  process.env.INITIAL_VISITOR_OFFSET || "1480",
  10
);

/**
 * Filter common web crawlers, indexers, and automated monitors.
 */
export function isBot(userAgent: string | null): boolean {
  if (!userAgent) return false;
  const botPattern =
    /bot|crawler|spider|slurp|facebookexternalhit|whatsapp|twitterbot|slackbot|curl|wget|python|postman|lighthouse|headlesschrome|bytespider/i;
  return botPattern.test(userAgent);
}

/**
 * Cryptographically hash an IP address with a secret salt.
 * Ensures zero storage of plain PII (GDPR / OD-011 compliance) while enabling deduplication.
 */
export function hashIp(ip: string): string {
  const salt = process.env.BETTER_AUTH_SECRET || "gara-innovation-analytics-salt";
  return crypto.createHash("sha256").update(`${ip}:${salt}`).digest("hex");
}

export interface TrackVisitParams {
  visitorId: string | null;
  ip: string | null;
  userAgent: string | null;
}

export interface VisitTrackingResult {
  totalUniqueVisitors: number;
  visitorId: string;
  isNewVisitor: boolean;
}

/**
 * Fetches the current total count of unique visitors from PostgreSQL + baseline.
 */
export async function getUniqueVisitorCount(): Promise<number> {
  try {
    const dbCount = await prisma.siteVisitor.count();
    return BASELINE_OFFSET + dbCount;
  } catch (error) {
    console.error("[VisitorService] Failed to read visitor count from database:", error);
    return BASELINE_OFFSET;
  }
}

/**
 * Records a visitor and returns the live unique count.
 * Deduplicates by:
 * 1. Persistent cookie visitorId.
 * 2. Anonymized IP hash recorded within the current 24-hour window.
 */
export async function trackUniqueVisit({
  visitorId,
  ip,
  userAgent,
}: TrackVisitParams): Promise<VisitTrackingResult> {
  // Ignore bots and headless crawlers
  if (isBot(userAgent)) {
    const currentCount = await getUniqueVisitorCount();
    return {
      totalUniqueVisitors: currentCount,
      visitorId: visitorId || "bot-ignored",
      isNewVisitor: false,
    };
  }

  const effectiveIp = ip && ip !== "::1" && ip !== "127.0.0.1" ? ip : "local-loopback";
  const ipHashed = hashIp(effectiveIp);
  const effectiveVisitorId = visitorId?.trim() || crypto.randomUUID();

  try {
    // 1. Check if visitorId already exists in database
    const existingVisitor = await prisma.siteVisitor.findUnique({
      where: { visitorId: effectiveVisitorId },
    });

    if (existingVisitor) {
      // Update last seen timestamp without incrementing unique count
      await prisma.siteVisitor.update({
        where: { id: existingVisitor.id },
        data: {
          lastSeenAt: new Date(),
          userAgent: userAgent ? userAgent.slice(0, 255) : null,
        },
      });

      const totalCount = await getUniqueVisitorCount();
      return {
        totalUniqueVisitors: totalCount,
        visitorId: existingVisitor.visitorId,
        isNewVisitor: false,
      };
    }

    // 2. Fallback deduplication: Check if IP hash was seen today (prevents counting if user clears cookies)
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const existingIpVisitor = await prisma.siteVisitor.findFirst({
      where: {
        ipHash: ipHashed,
        lastSeenAt: { gte: twentyFourHoursAgo },
      },
      orderBy: { lastSeenAt: "desc" },
    });

    if (existingIpVisitor) {
      // Recognized from recent IP visit — do not increment unique count
      const totalCount = await getUniqueVisitorCount();
      return {
        totalUniqueVisitors: totalCount,
        visitorId: existingIpVisitor.visitorId,
        isNewVisitor: false,
      };
    }

    // 3. Genuinely new unique visitor -> Create new record in PostgreSQL
    await prisma.siteVisitor.create({
      data: {
        visitorId: effectiveVisitorId,
        ipHash: ipHashed,
        userAgent: userAgent ? userAgent.slice(0, 255) : null,
      },
    });

    const totalCount = await getUniqueVisitorCount();
    return {
      totalUniqueVisitors: totalCount,
      visitorId: effectiveVisitorId,
      isNewVisitor: true,
    };
  } catch (error) {
    console.error("[VisitorService] Failed to record unique visitor:", error);
    const fallbackCount = await getUniqueVisitorCount();
    return {
      totalUniqueVisitors: fallbackCount,
      visitorId: effectiveVisitorId,
      isNewVisitor: false,
    };
  }
}
