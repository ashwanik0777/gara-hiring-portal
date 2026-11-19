/** The public policy and contact pages, in the order they are linked from the footer. */
export const POLICY_PAGES = [
  { href: "/privacy", label: "Privacy Policy" },
  { href: "/terms", label: "Terms of Service" },
  { href: "/refund-policy", label: "Refund & Cancellation Policy" },
  { href: "/shipping-policy", label: "Shipping & Delivery Policy" },
  { href: "/cookie-policy", label: "Cookie Policy" },
  { href: "/contact", label: "Contact Us" },
] as const;

export type PolicyPagePath = (typeof POLICY_PAGES)[number]["href"];
