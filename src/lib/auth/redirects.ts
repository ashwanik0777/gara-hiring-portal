const PLACEHOLDER_ORIGIN = "http://callback.invalid";

/**
 * Returns a same-origin relative path for post-authentication redirects, or the
 * fallback when the value could leave the site. Rejects absolute URLs,
 * protocol-relative URLs (`//host`), backslash variants (`/\host`, which browsers
 * normalise to `//host`) and control characters.
 * Safe to import from both Client and Server Components.
 */
export function sanitizeCallbackPath(
  raw: string | null | undefined,
  fallback = "/dashboard"
): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) {
    return fallback;
  }
  const hasControlCharacter = Array.from(raw).some((ch) => {
    const code = ch.charCodeAt(0);
    return code < 0x20 || code === 0x7f;
  });
  if (raw.includes("\\") || hasControlCharacter) {
    return fallback;
  }
  try {
    const parsed = new URL(raw, PLACEHOLDER_ORIGIN);
    if (parsed.origin !== PLACEHOLDER_ORIGIN) {
      return fallback;
    }
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}
