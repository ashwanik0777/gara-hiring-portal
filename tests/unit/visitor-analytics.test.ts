import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  isBot,
  hashIp,
  getUniqueVisitorCount,
  trackUniqueVisit,
} from "@/features/analytics/services/visitor-service";

const mockSiteVisitorCount = vi.fn();
const mockSiteVisitorFindUnique = vi.fn();
const mockSiteVisitorFindFirst = vi.fn();
const mockSiteVisitorCreate = vi.fn();
const mockSiteVisitorUpdate = vi.fn();

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

  describe("hashIp", () => {
    it("generates a deterministic 64-character SHA-256 hash without storing raw IP", () => {
      const hash1 = hashIp("192.168.1.1");
      const hash2 = hashIp("192.168.1.1");
      const hash3 = hashIp("10.0.0.1");

      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64);
      expect(hash1).not.toBe(hash3);
      expect(hash1).not.toContain("192.168.1.1");
    });
  });

  describe("getUniqueVisitorCount", () => {
    it("returns baseline offset + database count", async () => {
      mockSiteVisitorCount.mockResolvedValueOnce(25);
      const count = await getUniqueVisitorCount();
      expect(count).toBe(1480 + 25);
    });

    it("falls back to baseline if database query throws", async () => {
      mockSiteVisitorCount.mockRejectedValueOnce(new Error("DB connection timeout"));
      const count = await getUniqueVisitorCount();
      expect(count).toBe(1480);
    });
  });

  describe("trackUniqueVisit", () => {
    it("does not increment or write to DB if the request is from a bot", async () => {
      mockSiteVisitorCount.mockResolvedValueOnce(10);
      const result = await trackUniqueVisit({
        visitorId: null,
        ip: "66.249.66.1",
        userAgent: "Googlebot/2.1",
      });

      expect(result.isNewVisitor).toBe(false);
      expect(mockSiteVisitorCreate).not.toHaveBeenCalled();
    });

    it("creates a new record and increments count for a first-time unique visitor", async () => {
      mockSiteVisitorFindUnique.mockResolvedValueOnce(null);
      mockSiteVisitorFindFirst.mockResolvedValueOnce(null);
      mockSiteVisitorCreate.mockResolvedValueOnce({ id: "rec-1" });
      mockSiteVisitorCount.mockResolvedValueOnce(1);

      const result = await trackUniqueVisit({
        visitorId: "unique-uuid-1234",
        ip: "203.0.113.195",
        userAgent: "Mozilla/5.0 Chrome/124.0",
      });

      expect(result.isNewVisitor).toBe(true);
      expect(result.visitorId).toBe("unique-uuid-1234");
      expect(result.totalUniqueVisitors).toBe(1481);
      expect(mockSiteVisitorCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            visitorId: "unique-uuid-1234",
          }),
        })
      );
    });

    it("recognizes existing visitor by cookie visitorId and does not increment unique count", async () => {
      mockSiteVisitorFindUnique.mockResolvedValueOnce({
        id: "existing-row-id",
        visitorId: "known-uuid-9999",
      });
      mockSiteVisitorUpdate.mockResolvedValueOnce({ id: "existing-row-id" });
      mockSiteVisitorCount.mockResolvedValueOnce(1);

      const result = await trackUniqueVisit({
        visitorId: "known-uuid-9999",
        ip: "203.0.113.195",
        userAgent: "Mozilla/5.0 Chrome/124.0",
      });

      expect(result.isNewVisitor).toBe(false);
      expect(result.totalUniqueVisitors).toBe(1481);
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
        visitorId: "new-incognito-uuid",
        ip: "203.0.113.195",
        userAgent: "Mozilla/5.0 Chrome/124.0",
      });

      expect(result.isNewVisitor).toBe(false);
      expect(result.visitorId).toBe("prior-uuid-5555");
      expect(result.totalUniqueVisitors).toBe(1481);
      expect(mockSiteVisitorCreate).not.toHaveBeenCalled();
    });
  });
});
