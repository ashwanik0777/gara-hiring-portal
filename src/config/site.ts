/**
 * Company and public-site settings, kept in one place (no secrets: this file is also
 * bundled into client components).
 *
 * Values that the product owner has not confirmed yet are `null`, and every place that
 * shows them hides the line instead of printing a placeholder. Never fill these with an
 * invented CIN, Udyam number, address, statistic or testimonial.
 */

export interface SiteAnnouncement {
  /** Short text shown in the pill above the home page heading. */
  text: string;
  /** Optional app-relative link for the pill. */
  href: string | null;
}

export interface CompanyDetails {
  /** Brand name as written across the site. */
  brandName: string;
  /** Exact registered company name (TODO: product owner to provide). */
  registeredName: string | null;
  /** Corporate Identification Number (TODO: product owner to provide). */
  cin: string | null;
  /** Udyam registration number (TODO: product owner to provide). */
  udyamNumber: string | null;
  /** Registered office address (TODO: product owner to provide). */
  registeredAddress: string | null;
  /** Public contact address for applicants, students and reports of fraud. */
  contactEmail: string;
  /** Main company website (the careers portal is a separate subdomain). */
  websiteUrl: string;
}

export interface SocialProfiles {
  facebook: string;
  instagram: string;
  twitter: string;
  linkedin: string;
  youtube: string;
}

export const COMPANY: CompanyDetails = {
  brandName: "GARA INNOVATION",
  registeredName: null,
  cin: null,
  udyamNumber: null,
  registeredAddress: null,
  contactEmail: "garaworking007@gmail.com",
  websiteUrl: "https://www.gara-innovations.tech/",
};

/**
 * Host name of the careers portal as shown to people (the fraud alert tells them to pay only
 * here). Links and metadata use the configured site URL (BETTER_AUTH_URL), not this text.
 */
export const PORTAL_DOMAIN = "careers.gara-innovations.tech";

/** Home page announcement pill; `null` hides it. */
export const ANNOUNCEMENT: SiteAnnouncement | null = {
  text: "Winter 2026 cohort — applications open",
  href: "/careers",
};

export const SOCIAL_PROFILES: SocialProfiles = {
  facebook: "https://www.facebook.com/garainnovations",
  instagram: "https://www.instagram.com/gara_innovations",
  twitter: "https://x.com/garainnovations",
  linkedin: "https://www.linkedin.com/company/gara-innovation",
  youtube: "https://www.youtube.com/@garainnovations",
};

/** Fraud alert text (business rule: internships are always free). */
export function fraudAlertText(): string {
  return (
    `${COMPANY.brandName} never charges any fee for internships. ` +
    `Pay only on ${PORTAL_DOMAIN}, only for Industrial Training. ` +
    `Report suspicious requests to ${COMPANY.contactEmail}.`
  );
}
