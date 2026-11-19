import type { MetadataRoute } from "next";
import { connection } from "next/server";
import { getPublicOpenings, listPublishedOpeningSlugs } from "@/features/openings/services/opening-service";
import { isApplicationWindowClosed } from "@/features/openings/listing";
import { absoluteUrl } from "@/lib/site-url";
import { POLICY_PAGES } from "@/components/legal/policy-pages";
import { LEGAL } from "@/config/site";
import { openingUrl } from "./careers/_lib/seo";

/** Upper bound of opening URLs in one sitemap file (the protocol allows 50,000). */
const MAX_SITEMAP_OPENINGS = 5000;

/**
 * Public pages for search engines: home, the careers index, every PUBLISHED opening whose
 * deadline has not passed, the track pages that list at least one such opening, and the policy
 * and contact pages. Draft, paused, closed and expired openings are never listed.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Served per request (never prerendered at build time, when no database is reachable);
  // the opening list itself comes from the public-openings cache, which every opening
  // change expires, so the sitemap costs no database query on a warm cache.
  await connection();

  const [published, listed] = await Promise.all([
    listPublishedOpeningSlugs(MAX_SITEMAP_OPENINGS),
    getPublicOpenings(),
  ]);
  const now = new Date();
  const openings = published.filter((opening) => !isApplicationWindowClosed(opening.applyDeadline, now));

  // Track pages worth indexing: those with at least one open opening (newest change first).
  const trackUpdates = new Map<string, Date>();
  for (const opening of listed) {
    if (!opening.track || isApplicationWindowClosed(opening.applyDeadline, now)) continue;
    const seen = trackUpdates.get(opening.track.slug);
    if (!seen || opening.updatedAt > seen) trackUpdates.set(opening.track.slug, opening.updatedAt);
  }

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
    ...Array.from(trackUpdates, ([slug, lastModified]) => ({
      url: absoluteUrl(`/careers/tracks/${slug}`),
      lastModified,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    })),
    ...POLICY_PAGES.map((page) => ({
      url: absoluteUrl(page.href),
      ...(page.href === "/contact" ? {} : { lastModified: new Date(`${LEGAL.version}T00:00:00Z`) }),
      changeFrequency: "yearly" as const,
      priority: 0.3,
    })),
  ];
}
