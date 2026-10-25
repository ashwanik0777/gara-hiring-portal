import { env } from "@/lib/env";

/**
 * Canonical public origin of the site (no trailing slash), used for SEO metadata,
 * sitemaps, structured data and calendar invites. Resolved from BETTER_AUTH_URL, which
 * env.ts already maps to the Vercel production URL when deployed there.
 */
export function getSiteUrl(): string {
  return env.BETTER_AUTH_URL.replace(/\/+$/, "");
}

/** Absolute URL for an app-relative path (must start with "/"). */
export function absoluteUrl(path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${getSiteUrl()}${normalized}`;
}
