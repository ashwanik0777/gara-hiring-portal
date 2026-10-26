// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import {
  isBot,
  normalizeUserAgent,
  getUniqueVisitorCount,
  trackUniqueVisit,
  MAX_USER_AGENT_LENGTH,
} from "@/features/analytics/services/visitor-service";
import { getClientIpHash } from "@/lib/security/client-ip";
import { RateLimitError } from "@/lib/errors";
import { POST as visitorPost } from "@/app/api/analytics/visitors/route";
import { parseWhatsAppUrl } from "@/lib/constants";

const mockSiteVisitorCount = vi.fn();
const mockSiteVisitorFindUnique = vi.fn();
const mockSiteVisitorFindFirst = vi.fn();
const mockSiteVisitorCreate = vi.fn();
const mockSiteVisitorUpdate = vi.fn();
const mockEnforce = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    siteVisitor: {
      count: (...args: unknown[]) => mockSiteVisitorCount(...args),
      findUnique: (...args: unknown[]) => mockSiteVisitorFindUnique(...args),
      findFirst: (...args: unknown[]) => mockSiteVisitorFindFirst(...args),
      create: (...args: unknown[]) => mockSiteVisitorCreate(...args),
      update: (...args: unknown[]) => mockSiteVisitorUpdate(...args),
    },
  },
}));

vi.mock("@/lib/security/rate-limit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/security/rate-limit")>();
  return {
    ...actual,
    defaultRateLimiter: {
      enforce: (...args: unknown[]) => mockEnforce(...args),
    },
  };
});

const KNOWN_UUID = "3f1c2b9e-8d4a-4c1e-9b7a-2f6d5e4c3b2a";
const IP_HASH = "a".repeat(64);

describe("features/analytics/visitor-service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("isBot", () => {
    it("identifies crawler and scraper bots correctly", () => {
      expect(isBot("Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)")).toBe(true);
      expect(isBot("Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)")).toBe(true);
      expect(isBot("facebookexternalhit/1.1")).toBe(true);
      expect(isBot("curl/7.88.1")).toBe(true);
      expect(isBot("python-requests/2.31.0")).toBe(true);
      expect(isBot("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 HeadlessChrome/114.0.5735.198")).toBe(true);
    });

    it("allows standard human browser user agents", () => {
      expect(
        isBot("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
      ).toBe(false);
      expect(
        isBot("Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1")
      ).toBe(false);
      expect(isBot(null)).toBe(false);
    });
  });

  describe("normalizeUserAgent", () => {
    it("caps length, strips control characters and maps empty values to null", () => {
      expect(normalizeUserAgent("x".repeat(5000))).toHaveLength(MAX_USER_AGENT_LENGTH);
      expect(normalizeUserAgent("Mozilla\u0000/5.0\r\n")).toBe("Mozilla/5.0");
      expect(normalizeUserAgent("   ")).toBeNull();
      expect(normalizeUserAgent(null)).toBeNull();
    });
  });

  describe("client IP hashing", () => {
    it("uses a keyed, purpose-scoped hash and never exposes the raw IP", () => {
      const headers = new Headers({ "x-real-ip": "192.168.1.1" });
      const hash1 = getClientIpHash(headers, "visitor");
      const hash2 = getClientIpHash(new Headers({ "x-real-ip": "192.168.1.1" }), "visitor");
      const otherPurpose = getClientIpHash(headers, "chatbot");

      expect(hash1).toBe(hash2);
      expect(hash1).toMatch(/^[0-9a-f]{64}$/);
      expect(hash1).not.toContain("192.168.1.1");
      expect(otherPurpose).not.toBe(hash1);
    });
  });

  describe("getUniqueVisitorCount", () => {
    it("returns the recorded database count with no baseline offset", async () => {
      mockSiteVisitorCount.mockResolvedValueOnce(25);
      expect(await getUniqueVisitorCount()).toBe(25);
    });

    it("returns null (not a fabricated number) if the database query throws", async () => {
      mockSiteVisitorCount.mockRejectedValueOnce(new Error("DB connection timeout"));
      expect(await getUniqueVisitorCount()).toBeNull();
    });
  });

  describe("trackUniqueVisit", () => {
    it("does not write to DB if the request is from a bot", async () => {
      mockSiteVisitorCount.mockResolvedValueOnce(10);
      const result = await trackUniqueVisit({
        visitorId: null,
        ipHash: IP_HASH,
        userAgent: "Googlebot/2.1",
      });

      expect(result.isNewVisitor).toBe(false);
      expect(result.totalUniqueVisitors).toBe(10);
      expect(mockSiteVisitorCreate).not.toHaveBeenCalled();
    });

    it("creates a new record storing only the keyed IP hash for a first-time visitor", async () => {
      mockSiteVisitorFindUnique.mockResolvedValueOnce(null);
      mockSiteVisitorFindFirst.mockResolvedValueOnce(null);
      mockSiteVisitorCreate.mockResolvedValueOnce({ id: "rec-1" });
      mockSiteVisitorCount.mockResolvedValueOnce(1);

      const result = await trackUniqueVisit({
        visitorId: KNOWN_UUID,
        ipHash: IP_HASH,
        userAgent: "Mozilla/5.0 Chrome/124.0",
      });

      expect(result.isNewVisitor).toBe(true);
      expect(result.visitorId).toBe(KNOWN_UUID);
      expect(result.totalUniqueVisitors).toBe(1);
      expect(mockSiteVisitorCreate).toHaveBeenCalledWith({
        data: {
          visitorId: KNOWN_UUID,
          ipHash: IP_HASH,
          userAgent: "Mozilla/5.0 Chrome/124.0",
        },
      });
    });

    it("ignores a non-UUID visitor cookie and generates a fresh id", async () => {
      mockSiteVisitorFindFirst.mockResolvedValueOnce(null);
      mockSiteVisitorCreate.mockResolvedValueOnce({ id: "rec-2" });
      mockSiteVisitorCount.mockResolvedValueOnce(2);

      const result = await trackUniqueVisit({
        visitorId: "'; DROP TABLE site_visitors; --",
        ipHash: IP_HASH,
        userAgent: "Mozilla/5.0 Chrome/124.0",
      });

      expect(mockSiteVisitorFindUnique).not.toHaveBeenCalled();
      expect(result.visitorId).toMatch(/^[0-9a-f-]{36}$/);
    });

    it("recognizes existing visitor by cookie visitorId and does not increment unique count", async () => {
      mockSiteVisitorFindUnique.mockResolvedValueOnce({
        id: "existing-row-id",
        visitorId: KNOWN_UUID,
      });
      mockSiteVisitorUpdate.mockResolvedValueOnce({ id: "existing-row-id" });
      mockSiteVisitorCount.mockResolvedValueOnce(1);

      const result = await trackUniqueVisit({
        visitorId: KNOWN_UUID,
        ipHash: IP_HASH,
        userAgent: "Mozilla/5.0 Chrome/124.0",
      });

      expect(result.isNewVisitor).toBe(false);
      expect(result.totalUniqueVisitors).toBe(1);
      expect(mockSiteVisitorUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "existing-row-id" },
        })
      );
      expect(mockSiteVisitorCreate).not.toHaveBeenCalled();
    });

    it("recognizes existing visitor by recent IP hash within 24h and does not increment unique count", async () => {
      mockSiteVisitorFindUnique.mockResolvedValueOnce(null);
      mockSiteVisitorFindFirst.mockResolvedValueOnce({
        id: "ip-matched-id",
        visitorId: "prior-uuid-5555",
      });
      mockSiteVisitorCount.mockResolvedValueOnce(1);

      const result = await trackUniqueVisit({
        visitorId: KNOWN_UUID,
        ipHash: IP_HASH,
        userAgent: "Mozilla/5.0 Chrome/124.0",
      });

      expect(result.isNewVisitor).toBe(false);
      expect(result.visitorId).toBe("prior-uuid-5555");
      expect(mockSiteVisitorCreate).not.toHaveBeenCalled();
    });

    it("returns a null count when recording fails", async () => {
      mockSiteVisitorFindUnique.mockRejectedValueOnce(new Error("DB down"));
      const result = await trackUniqueVisit({
        visitorId: KNOWN_UUID,
        ipHash: IP_HASH,
        userAgent: "Mozilla/5.0 Chrome/124.0",
      });
      expect(result.totalUniqueVisitors).toBeNull();
    });
  });
});

describe("POST /api/analytics/visitors", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function buildRequest(headers: Record<string, string> = {}) {
    return new NextRequest("http://localhost/api/analytics/visitors", {
      method: "POST",
      headers: { "x-real-ip": "203.0.113.7", "user-agent": "Mozilla/5.0 Chrome/124.0", ...headers },
    });
  }

  it("rate limits by the keyed client-IP hash and returns 429 without touching the database", async () => {
    mockEnforce.mockRejectedValueOnce(new RateLimitError(120));

    const response = await visitorPost(buildRequest());

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("120");
    const expectedKey = getClientIpHash(new Headers({ "x-real-ip": "203.0.113.7" }), "visitor");
    expect(mockEnforce).toHaveBeenCalledWith(
      expectedKey,
      expect.objectContaining({ scope: "public:visitor_track" })
    );
    expect(mockSiteVisitorCreate).not.toHaveBeenCalled();
  });

  it("stores the keyed hash (never the raw IP) for an allowed request", async () => {
    mockEnforce.mockResolvedValueOnce({ allowed: true, remaining: 9, retryAfterSeconds: 0 });
    mockSiteVisitorFindFirst.mockResolvedValueOnce(null);
    mockSiteVisitorCreate.mockResolvedValueOnce({ id: "rec-3" });
    mockSiteVisitorCount.mockResolvedValueOnce(3);

    const response = await visitorPost(buildRequest());
    const body = (await response.json()) as { count: number | null };

    expect(response.status).toBe(200);
    expect(body.count).toBe(3);
    const createArgs = mockSiteVisitorCreate.mock.calls[0]?.[0] as {
      data: { ipHash: string | null };
    };
    expect(createArgs.data.ipHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(createArgs)).not.toContain("203.0.113.7");
  });
});

describe("lib/constants WhatsApp link", () => {
  it("accepts only https://wa.me/<number> links and hides the link otherwise", () => {
    expect(parseWhatsAppUrl("https://wa.me/919876543210")).toBe("https://wa.me/919876543210");
    expect(parseWhatsAppUrl(undefined)).toBeNull();
    expect(parseWhatsAppUrl("")).toBeNull();
    expect(parseWhatsAppUrl("http://wa.me/919876543210")).toBeNull();
    expect(parseWhatsAppUrl("https://wa.me.evil.example/919876543210")).toBeNull();
    expect(parseWhatsAppUrl("https://wa.me/javascript:alert(1)")).toBeNull();
    expect(parseWhatsAppUrl("javascript:alert(1)")).toBeNull();
  });
});
