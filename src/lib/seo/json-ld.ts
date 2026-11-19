import { COMPANY, SOCIAL_PROFILES } from "@/config/site";
import { absoluteUrl, getSiteUrl } from "@/lib/site-url";

/** Name and logo used in structured data (search engines show this form). */
export const ORGANIZATION_NAME = "GARA Innovation";
export const ORGANIZATION_LOGO_PATH = "/brand/gara-logo.png";

/**
 * Serializes structured data for a `<script type="application/ld+json">` tag. `<`, `>` and `&`
 * (and the JavaScript line separators) are escaped as unicode, so text from the database can
 * never close the script element.
 */
export function serializeJsonLd(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(new RegExp("\\u2028", "g"), "\\u2028")
    .replace(new RegExp("\\u2029", "g"), "\\u2029");
}

/**
 * schema.org Organization and WebSite for the home page. Statutory details (legal name,
 * address) are included only once the product owner has confirmed them.
 */
export function buildOrganizationJsonLd(): Record<string, unknown> {
  const organizationId = `${getSiteUrl()}/#organization`;
  const organization: Record<string, unknown> = {
    "@type": "Organization",
    "@id": organizationId,
    name: ORGANIZATION_NAME,
    url: COMPANY.websiteUrl,
    logo: absoluteUrl(ORGANIZATION_LOGO_PATH),
    email: COMPANY.contactEmail,
    sameAs: Object.values(SOCIAL_PROFILES),
    contactPoint: {
      "@type": "ContactPoint",
      contactType: "recruitment",
      email: COMPANY.contactEmail,
    },
  };
  if (COMPANY.registeredName) organization.legalName = COMPANY.registeredName;
  if (COMPANY.registeredAddress) organization.address = COMPANY.registeredAddress;

  return {
    "@context": "https://schema.org",
    "@graph": [
      organization,
      {
        "@type": "WebSite",
        "@id": `${getSiteUrl()}/#website`,
        name: `${ORGANIZATION_NAME} Careers`,
        url: absoluteUrl("/"),
        publisher: { "@id": organizationId },
        inLanguage: "en-IN",
      },
    ],
  };
}

export interface BreadcrumbItem {
  name: string;
  /** App-relative path, starting with "/". */
  path: string;
}

/** schema.org BreadcrumbList (search results show the trail instead of the raw URL). */
export function buildBreadcrumbJsonLd(items: readonly BreadcrumbItem[]): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: absoluteUrl(item.path),
    })),
  };
}
