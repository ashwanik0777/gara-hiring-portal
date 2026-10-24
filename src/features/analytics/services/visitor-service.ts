import crypto from "crypto";
import { prisma } from "@/lib/db";

/** Maximum stored user-agent length (characters). */
export const MAX_USER_AGENT_LENGTH = 255;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HEX_HASH_PATTERN = /^[0-9a-f]{64}$/;

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
 * Normalises an untrusted user-agent header: strips control characters, trims,
 * and caps the length. Empty values become null.
 */
export function normalizeUserAgent(userAgent: string | null | undefined): string | null {
  if (!userAgent) return null;
  // Keep printable characters only (drops ASCII control characters).
  const cleaned = Array.from(userAgent)
    .filter((ch) => {
      const code = ch.charCodeAt(0);
      return code >= 0x20 && code !== 0x7f;
    })
    .join("")
    .trim();
  return cleaned ? cleaned.slice(0, MAX_USER_AGENT_LENGTH) : null;
}

export interface TrackVisitParams {
  /** Visitor cookie value (only accepted when it is a UUID). */
  visitorId: string | null;
  /**
   * Keyed HMAC of the client IP (`getClientIpHash(headers, "visitor")`).
   * Raw IP addresses are never passed to or stored by this service.
   */
  ipHash: string;
  userAgent: string | null;
}

export interface VisitTrackingResult {
  /** `null` when the count could not be read. */
  totalUniqueVisitors: number | null;
  visitorId: string;
  isNewVisitor: boolean;
}

/**
 * Returns the number of recorded visitor rows (no baseline or offset),
 * or `null` when the database cannot be read.
 */
export async function getUniqueVisitorCount(): Promise<number | null> {
  try {
    return await prisma.siteVisitor.count();
  } catch (error) {
    console.error(
      "[VisitorService] Failed to read visitor count from database:",
      error instanceof Error ? error.message : error
    );
    return null;
  }
}

/**
 * Records a visitor and returns the recorded count.
 * Deduplicates by:
 * 1. Persistent cookie visitorId.
 * 2. Keyed IP hash seen within the last 24 hours.
 */
export async function trackUniqueVisit({
  visitorId,
  ipHash,
  userAgent,
}: TrackVisitParams): Promise<VisitTrackingResult> {
  const normalizedUserAgent = normalizeUserAgent(userAgent);
  const validVisitorId =
    visitorId && UUID_PATTERN.test(visitorId.trim()) ? visitorId.trim() : null;
  const effectiveVisitorId = validVisitorId ?? crypto.randomUUID();

  // Ignore bots and headless crawlers
  if (isBot(normalizedUserAgent)) {
    return {
      totalUniqueVisitors: await getUniqueVisitorCount(),
      visitorId: effectiveVisitorId,
      isNewVisitor: false,
    };
  }

  // Only keyed hashes are stored; anything else is discarded.
  const storedIpHash = HEX_HASH_PATTERN.test(ipHash) ? ipHash : null;

  try {
    // 1. Check if visitorId already exists in database
    if (validVisitorId) {
      const existingVisitor = await prisma.siteVisitor.findUnique({
        where: { visitorId: validVisitorId },
      });

      if (existingVisitor) {
        // Update last seen timestamp without incrementing unique count
        await prisma.siteVisitor.update({
          where: { id: existingVisitor.id },
          data: {
            lastSeenAt: new Date(),
            userAgent: normalizedUserAgent,
          },
        });

        return {
          totalUniqueVisitors: await getUniqueVisitorCount(),
          visitorId: existingVisitor.visitorId,
          isNewVisitor: false,
        };
      }
    }

    // 2. Fallback deduplication: keyed IP hash seen in the last 24 hours
    if (storedIpHash) {
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const existingIpVisitor = await prisma.siteVisitor.findFirst({
        where: {
          ipHash: storedIpHash,
          lastSeenAt: { gte: twentyFourHoursAgo },
        },
        orderBy: { lastSeenAt: "desc" },
      });

      if (existingIpVisitor) {
        return {
          totalUniqueVisitors: await getUniqueVisitorCount(),
          visitorId: existingIpVisitor.visitorId,
          isNewVisitor: false,
        };
      }
    }

    // 3. New visitor -> create a record
    await prisma.siteVisitor.create({
      data: {
        visitorId: effectiveVisitorId,
        ipHash: storedIpHash,
        userAgent: normalizedUserAgent,
      },
    });

    return {
      totalUniqueVisitors: await getUniqueVisitorCount(),
      visitorId: effectiveVisitorId,
      isNewVisitor: true,
    };
  } catch (error) {
    console.error(
      "[VisitorService] Failed to record unique visitor:",
      error instanceof Error ? error.message : error
    );
    return {
      totalUniqueVisitors: null,
      visitorId: effectiveVisitorId,
      isNewVisitor: false,
    };
  }
}
