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
  /** Public contact address for applicants and students. */
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

/** Statutory details confirmed so far, in display order; unknown values are left out. */
export function confirmedCompanyFacts(): Array<{ label: string; value: string }> {
  return [
    { label: "Registered name", value: COMPANY.registeredName },
    { label: "CIN", value: COMPANY.cin },
    { label: "Udyam Registration No.", value: COMPANY.udyamNumber },
    { label: "Registered office", value: COMPANY.registeredAddress },
  ].filter((fact): fact is { label: string; value: string } => Boolean(fact.value));
}

/**
 * Policy pages (privacy, terms, refund, cookies, shipping). `version` is stored with each
 * consent so the accepted text can be identified later; change it whenever the wording
 * changes. While `reviewed` is false the pages carry a "Draft — pending legal review" notice
 * everywhere except production deployments.
 */
export const LEGAL = {
  version: "2026-11-19",
  lastUpdated: "19 November 2026",
  reviewed: false,
} as const;

/** Industrial Training rules from the product owner (2026-11-19), used by pages and server. */
export const TRAINING_POLICY = {
  /** Full refund until this many hours after the batch's first live class. */
  refundHoursAfterFirstClass: 24,
  /** Free transfers to a later batch once the refund window has closed. */
  freeTransfers: 1,
  /** Free re-attempts in a later batch after failing the pass criteria. */
  freeReattempts: 1,
  /** Deduct payment gateway charges from refunds (product owner default: off). */
  deductGatewayChargesFromRefunds: false,
} as const;

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
