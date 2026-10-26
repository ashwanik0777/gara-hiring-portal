/*
 * Helpers for list pages whose filters and page travel in the URL (`searchParams`), so the
 * back button and shared links reproduce the same view. Pure and client-safe.
 */

export type RawSearchParams = Record<string, string | string[] | undefined>;

/** First value of a search param (repeated keys arrive as arrays). */
export function firstParam(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

/** 1-based page number; anything missing or malformed means the first page. */
export function parsePositivePage(value: string | string[] | undefined): number {
  const parsed = Number.parseInt(firstParam(value), 10);
  return Number.isFinite(parsed) && parsed >= 1 ? parsed : 1;
}

/** `basePath?key=value…`, leaving out empty values so the canonical URL stays short. */
export function buildListHref(basePath: string, params: Record<string, string | number | null | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === "" || value === 0) continue;
    search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `${basePath}?${query}` : basePath;
}
