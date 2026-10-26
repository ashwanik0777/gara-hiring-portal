import type { MetadataRoute } from "next";
import { connection } from "next/server";
import { listPublishedOpeningSlugs } from "@/features/openings/services/opening-service";
import { absoluteUrl } from "@/lib/site-url";
import { openingUrl } from "./careers/_lib/seo";

/** Upper bound of opening URLs in one sitemap file (the protocol allows 50,000). */
const MAX_SITEMAP_OPENINGS = 5000;

/**
 * Public pages for search engines: home, the careers index and every PUBLISHED opening.
 * Draft, paused and closed openings are never listed.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Served per request (never prerendered at build time, when no database is reachable);
  // the opening list itself comes from the public-openings cache, which every opening
  // change expires, so the sitemap costs no database query on a warm cache.
  await connection();

  const openings = await listPublishedOpeningSlugs(MAX_SITEMAP_OPENINGS);

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
