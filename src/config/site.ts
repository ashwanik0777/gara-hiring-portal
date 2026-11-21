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
  // Confirmed by the product owner on 2026-11-20. CIN still to be provided.
  registeredName: "GARA INNOVATION PVT LTD",
  cin: null,
  udyamNumber: "UDYAM-UP-28-0244775",
  registeredAddress: "Barola, Gautam Buddha Nagar, Uttar Pradesh 201304, India",
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
  version: "2026-11-21",
  lastUpdated: "21 November 2026",
  reviewed: false,
} as const;

/**
 * The two people who sign certificates and internship offer letters (careers plan: Director and
 * Training Head / Mentor). Names are `null` until the product owner confirms them; the issuing
 * form is prefilled with whatever is set here and the issuer can type the rest.
 */
export const CERTIFICATE_SIGNATORIES: {
  primary: { name: string | null; title: string };
  secondary: { name: string | null; title: string };
} = {
  primary: { name: null, title: "Director" },
  secondary: { name: null, title: "Training Head / Mentor" },
};

/** Industrial Training rules from the product owner (2026-11-19), used by pages and server. */
export const TRAINING_POLICY = {
  /** Refund window: until this many hours after the batch's first live class. */
  refundHoursAfterFirstClass: 24,
  /** Free transfers to a later batch once the refund window has closed. */
  freeTransfers: 1,
  /** Free re-attempts in a later batch after failing the pass criteria. */
  freeReattempts: 1,
  /**
   * Deduct the payment gateway charges (Razorpay's fee including the GST on it) from refunds.
   * Product-owner decision 2026-11-20: refunds are the amount paid minus these charges.
   */
  deductGatewayChargesFromRefunds: true,
} as const;

/** Pass criteria of Industrial Training (product owner plan, 2026-11-19; configurable). */
export const TRAINING_PASS_CRITERIA = {
  minMarksPercent: 60,
  minAttendancePercent: 75,
  finalProjectRequired: true,
  liveDemoRequired: true,
} as const;

/**
 * Campus Ambassador programme (product owner plan, 2026-11-19; configurable). Amounts in paise.
 */
export const CAMPUS_AMBASSADOR_POLICY = {
  /** Commission per paid Industrial Training enrollment made with the ambassador's code (₹100). */
  commissionPaise: 10_000,
  /** Discount the referral code gives the student at checkout. */
  studentDiscountPercent: 10,
  /** A referral link click is remembered this long (last click wins). */
  attributionDays: 30,
  /** Days after approval during which an ambassador is on trial. */
  trialDays: 30,
  /**
   * Tax deducted at source on commission payouts, in percent. `null` until the company's
   * accountant decides (docs/OPEN_DECISIONS.md #30): automatic RazorpayX payouts stay switched
   * off while it is null; staff can still record a payout made outside with its UTR.
   */
  tdsPercent: null as number | null,
} as const;

/**
 * Marketing kit shown on the ambassador dashboard. Every item comes from the product owner;
 * `null` or an empty list hides it (nothing is invented here).
 */
export const CAMPUS_AMBASSADOR_KIT: {
  /** WhatsApp message; "{link}" is replaced with the ambassador's referral link. */
  whatsappTemplate: string | null;
  pitchScript: string | null;
  /** Poster files under /public (for example "/ambassador/poster-1.png"). */
  posters: Array<{ title: string; href: string }>;
} = {
  whatsappTemplate: null,
  pitchScript: null,
  posters: [],
};

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
