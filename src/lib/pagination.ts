/**
 * Deepest page any list accepts. Page numbers come from the URL, so without a ceiling a
 * request such as `?page=900000000` would make PostgreSQL walk an enormous OFFSET.
 */
export const MAX_PAGE_NUMBER = 10_000;

/**
 * 1-based page number clamped to 1..MAX_PAGE_NUMBER. Missing, non-finite or non-positive
 * values mean page 1; fractions are truncated.
 */
export function clampPageNumber(value: number | null | undefined): number {
  if (value === null || value === undefined || !Number.isFinite(value)) return 1;
  return Math.min(MAX_PAGE_NUMBER, Math.max(1, Math.trunc(value)));
}
