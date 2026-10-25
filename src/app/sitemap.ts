import type { MetadataRoute } from "next";
import { connection } from "next/server";
import { OpeningStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { absoluteUrl } from "@/lib/site-url";
import { openingUrl } from "./careers/_lib/seo";

/** Upper bound of opening URLs in one sitemap file (the protocol allows 50,000). */
const MAX_SITEMAP_OPENINGS = 5000;

/**
 * Public pages for search engines: home, the careers index and every PUBLISHED opening.
 * Draft, paused and closed openings are never listed.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Openings change at runtime; build the sitemap per request instead of at build time.
  await connection();

  const openings = await prisma.opening.findMany({
    where: { status: OpeningStatus.PUBLISHED },
    select: { slug: true, updatedAt: true },
    orderBy: { updatedAt: "desc" },
    take: MAX_SITEMAP_OPENINGS,
  });

  const latestOpeningUpdate = openings[0]?.updatedAt;

  return [
    {
      url: absoluteUrl("/"),
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: absoluteUrl("/careers"),
      ...(latestOpeningUpdate ? { lastModified: latestOpeningUpdate } : {}),
      changeFrequency: "daily",
      priority: 0.9,
    },
    ...openings.map((opening) => ({
      url: openingUrl(opening.slug),
      lastModified: opening.updatedAt,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })),
  ];
}
