/**
 * Candidate source attribution ("where did this application come from").
 *
 * Client-safe (no server imports): the apply form uses the field names and options, the
 * submit Server Action normalizes the untrusted values with `resolveApplicationSource`,
 * and the service re-checks them with `normalizeStoredAttribution` before writing
 * `Application.source` / `Application.sourceDetail`.
 *
 * Precedence: the candidate's explicit "How did you hear about us?" answer, then the
 * `?source=` / `utm_source` URL parameters, then CAREERS_PAGE for a direct apply.
 */

export const APPLICATION_SOURCES = [
  "CAREERS_PAGE",
  "LINKEDIN",
  "REFERRAL",
  "GOOGLE_JOBS",
  "COLLEGE",
  "SOCIAL_MEDIA",
  "OTHER",
] as const;

export type ApplicationSource = (typeof APPLICATION_SOURCES)[number];

/** Code used in analytics for applications submitted before source tracking existed. */
export const UNKNOWN_SOURCE = "UNKNOWN";

export const APPLICATION_SOURCE_LABELS: Record<ApplicationSource | typeof UNKNOWN_SOURCE, string> = {
  CAREERS_PAGE: "Careers page",
  LINKEDIN: "LinkedIn",
  REFERRAL: "Referral",
  GOOGLE_JOBS: "Google Jobs",
  COLLEGE: "College / campus",
  SOCIAL_MEDIA: "Social media",
  OTHER: "Other",
  UNKNOWN: "Not recorded",
};

/** Options of the optional "How did you hear about us?" select on the apply form. */
export const HEARD_ABOUT_US_OPTIONS: ReadonlyArray<{ value: ApplicationSource; label: string }> =
  APPLICATION_SOURCES.map((value) => ({ value, label: APPLICATION_SOURCE_LABELS[value] }));

/** URL parameters carried from the opening pages to the apply form. */
export const ATTRIBUTION_PARAM_KEYS = ["source", "utm_source", "utm_campaign", "ref"] as const;
export type AttributionParamKey = (typeof ATTRIBUTION_PARAM_KEYS)[number];
export type AttributionParams = Partial<Record<AttributionParamKey, string>>;

/**
 * Apply-form field names (prefixed so they never collide with admin-defined form fields).
 * `heardFrom` is the candidate's own answer; the others carry the URL parameters.
 */
export const ATTRIBUTION_FORM_FIELDS = {
  heardFrom: "attr_heard_from",
  source: "attr_source",
  utm_source: "attr_utm_source",
  utm_campaign: "attr_utm_campaign",
  ref: "attr_ref",
} as const;

/** Every form field the apply form forwards to the submit action for attribution. */
export const APPLICATION_ATTRIBUTION_FIELDS: readonly string[] = Object.values(ATTRIBUTION_FORM_FIELDS);

/** Maximum stored length of `Application.sourceDetail`. */
export const MAX_SOURCE_DETAIL_LENGTH = 200;

const MAX_PARAM_VALUE_LENGTH = 80;
const MAX_RAW_INPUT_LENGTH = 300;
const MAX_HOST_LENGTH = 100;

/** Lower-cased URL tokens (utm_source / ?source=) mapped to a source code. */
const SOURCE_ALIASES: Record<string, ApplicationSource> = {
  careers_page: "CAREERS_PAGE",
  careers: "CAREERS_PAGE",
  website: "CAREERS_PAGE",
  site: "CAREERS_PAGE",
  direct: "CAREERS_PAGE",
  linkedin: "LINKEDIN",
  linked_in: "LINKEDIN",
  "linkedin.com": "LINKEDIN",
  lnkd: "LINKEDIN",
  "lnkd.in": "LINKEDIN",
  referral: "REFERRAL",
  referred: "REFERRAL",
  employee_referral: "REFERRAL",
  google_jobs: "GOOGLE_JOBS",
  google_jobs_apply: "GOOGLE_JOBS",
  googlejobs: "GOOGLE_JOBS",
  google_for_jobs: "GOOGLE_JOBS",
  college: "COLLEGE",
  campus: "COLLEGE",
  university: "COLLEGE",
  placement_cell: "COLLEGE",
  social_media: "SOCIAL_MEDIA",
  social: "SOCIAL_MEDIA",
  facebook: "SOCIAL_MEDIA",
  "facebook.com": "SOCIAL_MEDIA",
  fb: "SOCIAL_MEDIA",
  instagram: "SOCIAL_MEDIA",
  "instagram.com": "SOCIAL_MEDIA",
  ig: "SOCIAL_MEDIA",
  twitter: "SOCIAL_MEDIA",
  x: "SOCIAL_MEDIA",
  "x.com": "SOCIAL_MEDIA",
  "t.co": "SOCIAL_MEDIA",
  youtube: "SOCIAL_MEDIA",
  whatsapp: "SOCIAL_MEDIA",
  telegram: "SOCIAL_MEDIA",
  reddit: "SOCIAL_MEDIA",
  threads: "SOCIAL_MEDIA",
  other: "OTHER",
};

export function isApplicationSource(value: unknown): value is ApplicationSource {
  return typeof value === "string" && (APPLICATION_SOURCES as readonly string[]).includes(value);
}

/**
 * Reduces an untrusted value to short plain text: control and markup characters are
 * removed, whitespace is collapsed and the result is truncated. Returns null when empty.
 */
export function sanitizeAttributionValue(
  value: unknown,
  maxLength = MAX_PARAM_VALUE_LENGTH
): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value
    .slice(0, MAX_RAW_INPUT_LENGTH)
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N} ._~+@:/()-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength)
    .trim();
  return cleaned === "" ? null : cleaned;
}

/** A bare host name (e.g. "linkedin.com") or null when the value is not one. */
export function sanitizeReferrerHost(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const host = value.trim().toLowerCase().replace(/^www\./, "");
  if (host === "" || host.length > MAX_HOST_LENGTH || !/^[a-z0-9.-]+$/.test(host)) {
    return null;
  }
  return host;
}

/**
 * Host of an external referrer URL, or null for missing/invalid values and for links
 * from this site itself (internal navigation is not a source).
 */
export function externalReferrerHost(referrer: string | null | undefined, siteUrl: string): string | null {
  if (!referrer) return null;
  try {
    const referrerHost = new URL(referrer).hostname.toLowerCase().replace(/^www\./, "");
    const siteHost = new URL(siteUrl).hostname.toLowerCase().replace(/^www\./, "");
    if (referrerHost === siteHost) return null;
    return sanitizeReferrerHost(referrerHost);
  } catch {
    return null;
  }
}

/** Maps a URL token to a source code; unknown non-empty tokens become OTHER. */
function mapUrlToken(value: unknown): ApplicationSource | null {
  const cleaned = sanitizeAttributionValue(value);
  if (!cleaned) return null;
  const token = cleaned.toLowerCase().replace(/^www\./, "").replace(/[\s-]+/g, "_");
  return SOURCE_ALIASES[token] ?? null;
}

/** Picks the attribution parameters from page search params as sanitized strings. */
export function pickAttributionParams(
  searchParams: Record<string, string | string[] | undefined> | null | undefined
): AttributionParams {
  const picked: AttributionParams = {};
  if (!searchParams) return picked;
  for (const key of ATTRIBUTION_PARAM_KEYS) {
    const raw = searchParams[key];
    const first = Array.isArray(raw) ? raw[0] : raw;
    const value = key === "ref" ? sanitizeReferrerHost(first) : sanitizeAttributionValue(first);
    if (value) picked[key] = value;
  }
  return picked;
}

/** "?source=…&utm_source=…" for carrying attribution to the next page, or "". */
export function toAttributionQuery(params: AttributionParams): string {
  const query = new URLSearchParams();
  for (const key of ATTRIBUTION_PARAM_KEYS) {
    const value = params[key];
    if (value) query.set(key, value);
  }
  const serialized = query.toString();
  return serialized ? `?${serialized}` : "";
}

export interface RawAttributionInput {
  heardFrom?: unknown;
  source?: unknown;
  utmSource?: unknown;
  utmCampaign?: unknown;
  referrerHost?: unknown;
}

export interface ResolvedAttribution {
  source: ApplicationSource;
  sourceDetail: string | null;
}

/** Plain-text detail kept next to the code (utm values and referrer host), ≤ 200 chars. */
function buildSourceDetail(input: RawAttributionInput): string | null {
  const parts: string[] = [];
  const source = sanitizeAttributionValue(input.source);
  const utmSource = sanitizeAttributionValue(input.utmSource);
  const utmCampaign = sanitizeAttributionValue(input.utmCampaign);
  const ref = sanitizeReferrerHost(input.referrerHost);
  if (source) parts.push(`source=${source}`);
  if (utmSource) parts.push(`utm_source=${utmSource}`);
  if (utmCampaign) parts.push(`utm_campaign=${utmCampaign}`);
  if (ref) parts.push(`ref=${ref}`);
  if (parts.length === 0) return null;
  return parts.join("; ").slice(0, MAX_SOURCE_DETAIL_LENGTH).trim();
}

/**
 * Normalizes untrusted attribution input to an allow-listed source code plus detail.
 * The explicit answer wins only when it is an exact allow-listed code (anything else is
 * treated as no answer); URL tokens are mapped through known aliases, unknown tokens
 * count as OTHER; with no signal at all the application is a direct CAREERS_PAGE apply.
 */
export function resolveApplicationSource(input: RawAttributionInput): ResolvedAttribution {
  const explicit = isApplicationSource(input.heardFrom) ? input.heardFrom : null;
  const hasUrlSignal =
    sanitizeAttributionValue(input.source) !== null ||
    sanitizeAttributionValue(input.utmSource) !== null;
  const fromUrl =
    mapUrlToken(input.source) ?? mapUrlToken(input.utmSource) ?? (hasUrlSignal ? "OTHER" : null);

  return {
    source: explicit ?? fromUrl ?? "CAREERS_PAGE",
    sourceDetail: buildSourceDetail(input),
  };
}

/**
 * Defence in depth for the persistence layer: guarantees an allow-listed code and a
 * bounded plain-text detail whatever the caller passed.
 */
export function normalizeStoredAttribution(
  attribution: { source?: unknown; sourceDetail?: unknown } | null | undefined
): ResolvedAttribution {
  const source = isApplicationSource(attribution?.source) ? attribution.source : "CAREERS_PAGE";
  const detail =
    typeof attribution?.sourceDetail === "string"
      ? attribution.sourceDetail
          .replace(/[\p{Cc}<>]/gu, " ")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, MAX_SOURCE_DETAIL_LENGTH)
          .trim()
      : "";
  return { source, sourceDetail: detail === "" ? null : detail };
}

/** Display label for a stored code; legacy null rows and unknown codes are labelled honestly. */
export function describeApplicationSource(code: string | null | undefined): string {
  if (!code) return APPLICATION_SOURCE_LABELS.UNKNOWN;
  return isApplicationSource(code) ? APPLICATION_SOURCE_LABELS[code] : APPLICATION_SOURCE_LABELS.OTHER;
}
