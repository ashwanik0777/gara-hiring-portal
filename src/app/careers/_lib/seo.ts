import type { Metadata } from "next";
import { absoluteUrl, getSiteUrl } from "@/lib/site-url";
import { ORGANIZATION_LOGO_PATH, ORGANIZATION_NAME } from "@/lib/seo/json-ld";

/**
 * Search-engine metadata for the public careers pages: page metadata, Open Graph and the
 * schema.org `JobPosting` structured data read by Google Jobs. Only PUBLISHED openings
 * ever reach these builders (the public opening queries filter on status).
 */

export { ORGANIZATION_LOGO_PATH, ORGANIZATION_NAME, serializeJsonLd } from "@/lib/seo/json-ld";

const META_DESCRIPTION_LENGTH = 160;

export interface PublicOpeningSeoInput {
  title: string;
  slug: string;
  description: string;
  requirements: string;
  responsibilities: string | null;
  department: string;
  type: "INTERNSHIP" | "FULL_TIME";
  location: string;
  workplaceType: "REMOTE" | "HYBRID" | "ON_SITE";
  createdAt: Date;
  updatedAt: Date;
  /** Application deadline (Opening.applyDeadline). */
  closesAt?: Date | null;
  skills?: string[];
  eligibility?: string | null;
  openingsCount?: number | null;
}

/** Collapses whitespace and cuts text to a meta-description length on a word boundary. */
export function toMetaDescription(text: string, maxLength = META_DESCRIPTION_LENGTH): string {
  const plain = text.replace(/\s+/g, " ").trim();
  if (plain.length <= maxLength) return plain;
  const cut = plain.slice(0, maxLength - 1);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > maxLength * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

/** Escapes text for inclusion in an HTML fragment. */
function escapeHtmlText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Plain text → escaped HTML paragraphs (blank lines split paragraphs, newlines become <br>). */
function plainTextToHtml(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph !== "")
    .map((paragraph) => `<p>${escapeHtmlText(paragraph).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

/**
 * The JobPosting description as HTML built only from escaped plain text, so staff-entered
 * content can never inject markup into the structured data.
 */
export function buildJobPostingDescription(opening: PublicOpeningSeoInput): string {
  const sections: Array<[string, string | null]> = [
    ["About the role", opening.description],
    ["Key responsibilities", opening.responsibilities],
    ["Requirements & qualifications", opening.requirements],
  ];
  return sections
    .filter((entry): entry is [string, string] => Boolean(entry[1] && entry[1].trim()))
    .map(([heading, body]) => `<h3>${escapeHtmlText(heading)}</h3>${plainTextToHtml(body)}`)
    .join("");
}

/** schema.org PostalAddress from free-text location ("City, Region, Country"). */
export function buildPostalAddress(location: string): Record<string, string> | null {
  const parts = location
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part !== "");
  if (parts.length === 0) return null;
  const address: Record<string, string> = { "@type": "PostalAddress", addressLocality: parts[0] };
  if (parts.length === 2) {
    address.addressRegion = parts[1];
  } else if (parts.length > 2) {
    address.addressRegion = parts.slice(1, -1).join(", ");
    address.addressCountry = parts[parts.length - 1];
  }
  return address;
}

const REMOTE_ONLY_LOCATION = /^(remote|anywhere|work from home|wfh|online)$/i;

/** Absolute canonical URL of an opening page. */
export function openingUrl(slug: string): string {
  return absoluteUrl(`/careers/${encodeURIComponent(slug)}`);
}

/** Date-only ISO string (YYYY-MM-DD) as recommended for `datePosted`. */
function isoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

/** schema.org JobPosting for Google Jobs. Fields without real data are omitted, never invented. */
export function buildJobPostingJsonLd(opening: PublicOpeningSeoInput): Record<string, unknown> {
  const siteUrl = getSiteUrl();
  const jsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "JobPosting",
    title: opening.title,
    description: buildJobPostingDescription(opening),
    datePosted: isoDate(opening.createdAt),
    employmentType: opening.type === "INTERNSHIP" ? "INTERN" : "FULL_TIME",
    hiringOrganization: {
      "@type": "Organization",
      name: ORGANIZATION_NAME,
      sameAs: siteUrl,
      logo: absoluteUrl(ORGANIZATION_LOGO_PATH),
    },
    url: openingUrl(opening.slug),
    directApply: true,
  };

  if (opening.skills && opening.skills.length > 0) {
    jsonLd.skills = opening.skills.join(", ");
  }
  if (opening.eligibility) {
    jsonLd.qualifications = opening.eligibility;
  }
  if (opening.openingsCount) {
    jsonLd.totalJobOpenings = opening.openingsCount;
  }

  if (opening.closesAt) {
    jsonLd.validThrough = opening.closesAt.toISOString();
  }

  const location = opening.location.trim();
  if (opening.workplaceType === "REMOTE") {
    jsonLd.jobLocationType = "TELECOMMUTE";
    if (location !== "" && !REMOTE_ONLY_LOCATION.test(location)) {
      jsonLd.applicantLocationRequirements = { "@type": "AdministrativeArea", name: location };
    }
  } else {
    const address = buildPostalAddress(location);
    if (address) {
      jsonLd.jobLocation = { "@type": "Place", address };
    }
  }

  return jsonLd;
}

/** Page metadata (title, description, canonical URL and Open Graph) for an opening. */
export function buildOpeningMetadata(opening: PublicOpeningSeoInput): Metadata {
  const description = toMetaDescription(opening.description);
  const url = openingUrl(opening.slug);
  const kind = opening.type === "INTERNSHIP" ? "Internship" : "Full-time role";
  return {
    title: opening.title,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: "website",
      url,
      siteName: ORGANIZATION_NAME,
      title: `${opening.title} — ${kind} at ${ORGANIZATION_NAME}`,
      description,
    },
  };
}

/** Metadata of the careers index page. */
export function buildCareersIndexMetadata(): Metadata {
  const url = absoluteUrl("/careers");
  const description =
    "Explore structured internship programs and full-time career opportunities at GARA Innovation.";
  return {
    title: "Careers & Openings",
    description,
    alternates: { canonical: url },
    openGraph: {
      type: "website",
      url,
      siteName: ORGANIZATION_NAME,
      title: `Careers at ${ORGANIZATION_NAME}`,
      description,
    },
  };
}
