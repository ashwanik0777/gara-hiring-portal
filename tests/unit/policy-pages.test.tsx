import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import React from "react";
import type { Metadata } from "next";
import { render, screen, cleanup } from "@testing-library/react";
import PrivacyPolicyPage, { metadata as privacyMetadata } from "@/app/privacy/page";
import TermsPage, { metadata as termsMetadata } from "@/app/terms/page";
import RefundPolicyPage, { metadata as refundMetadata } from "@/app/refund-policy/page";
import ShippingPolicyPage, { metadata as shippingMetadata } from "@/app/shipping-policy/page";
import CookiePolicyPage, { metadata as cookieMetadata } from "@/app/cookie-policy/page";
import ContactPage, { metadata as contactMetadata } from "@/app/contact/page";
import { Footer } from "@/components/navigation/footer";
import { isLegalDraftNoticeShown } from "@/components/legal/legal-page";
import { POLICY_PAGES } from "@/components/legal/policy-pages";
import { COMPANY, LEGAL, TRAINING_POLICY } from "@/config/site";
import { buildBreadcrumbJsonLd, buildOrganizationJsonLd } from "@/lib/seo/json-ld";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => "/privacy",
}));

vi.mock("@/lib/auth/auth-client", () => ({
  authClient: {
    useSession: vi.fn(() => ({ data: null, isPending: false })),
    signOut: vi.fn(),
  },
}));

const PAGES: Array<{
  path: string;
  title: string;
  Page: () => React.JSX.Element;
  metadata: Metadata;
}> = [
  { path: "/privacy", title: "Privacy Policy", Page: PrivacyPolicyPage, metadata: privacyMetadata },
  { path: "/terms", title: "Terms of Service", Page: TermsPage, metadata: termsMetadata },
  { path: "/refund-policy", title: "Refund & Cancellation Policy", Page: RefundPolicyPage, metadata: refundMetadata },
  { path: "/shipping-policy", title: "Shipping & Delivery Policy", Page: ShippingPolicyPage, metadata: shippingMetadata },
  { path: "/cookie-policy", title: "Cookie Policy", Page: CookiePolicyPage, metadata: cookieMetadata },
  { path: "/contact", title: "Contact Us", Page: ContactPage, metadata: contactMetadata },
];

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ count: 1 }) }));
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
    })),
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function pageText(Page: () => React.JSX.Element): string {
  const { container } = render(<Page />);
  return (container.textContent ?? "").replace(/\s+/g, " ");
}

describe("Policy and contact pages", () => {
  it("covers every footer policy link with a page", () => {
    expect(POLICY_PAGES.map((page) => page.href).sort()).toEqual(PAGES.map((page) => page.path).sort());
  });

  for (const { path: pagePath, title, Page, metadata } of PAGES) {
    it(`${pagePath} has its heading, canonical URL and no placeholder text`, () => {
      render(<Page />);
      expect(screen.getByRole("heading", { level: 1, name: title })).toBeTruthy();
      expect(metadata.title).toBe(title);
      expect(String(metadata.description).length).toBeGreaterThan(50);
      expect(String(metadata.alternates?.canonical)).toMatch(new RegExp(`${pagePath.replace("/", "\\/")}$`));
      const text = document.body.textContent ?? "";
      expect(text).not.toMatch(/TODO|lorem ipsum|\[[A-Z ]+\]/i);
      if (pagePath !== "/contact") expect(text).toContain(`Last updated: ${LEGAL.lastUpdated}`);
    });
  }

  it("the refund policy states exactly the owner's training rules", () => {
    const text = pageText(RefundPolicyPage);
    expect(text).toContain("Internships and job applications at");
    expect(text).toContain("before your batch's start date");
    expect(text).toContain(`within ${TRAINING_POLICY.refundHoursAfterFirstClass} hours after the first live class`);
    expect(text).toContain("move to the next batch free of charge, once");
    expect(text).toContain(
      TRAINING_POLICY.deductGatewayChargesFromRefunds
        ? "Payment gateway charges are deducted"
        : "no gateway or processing charges are deducted"
    );
  });

  it("the terms say internships are free and set the ambassador rules", () => {
    const text = pageText(TermsPage);
    expect(text).toContain("GARA never charges a fee, deposit, registration charge or certificate fee for an internship");
    expect(text).toContain("never collect money from anyone");
    expect(text).toContain("such as a placement guarantee");
    expect(text).toContain("plagiarism, misconduct");
    expect(text).not.toMatch(/Tax Invoice|GSTIN/);
  });

  it("the privacy policy follows the DPDP Act and never stores card data", () => {
    const text = pageText(PrivacyPolicyPage);
    expect(text).toContain("Digital Personal Data Protection Act, 2023");
    expect(text).toContain("they never reach us and we never store them");
    expect(text).toContain("Data Protection Board of India");
    for (const processor of ["Vercel", "Neon", "Razorpay", "Google"]) expect(text).toContain(processor);
    expect(text).toContain(COMPANY.contactEmail);
  });

  it("the cookie policy names the cookies and storage keys the code really uses", () => {
    const text = pageText(CookiePolicyPage);
    const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), "utf8");

    const visitorCookie = /COOKIE_NAME = "([^"]+)"/.exec(read("src/app/api/analytics/visitors/route.ts"))?.[1];
    expect(visitorCookie).toBeTruthy();
    expect(text).toContain(visitorCookie);
    expect(read("src/app/layout.tsx")).toContain('localStorage.getItem("gara_theme")');
    expect(text).toContain("gara_theme");
    expect(read("src/components/analytics/visitor-beacon.tsx")).toContain('"gara_visit_tracked"');
    expect(text).toContain("gara_visit_tracked");
    expect(text).toContain("better-auth.session_token");
    expect(text).toContain("no third-party analytics");
  });

  it("the contact page lists only confirmed company details", () => {
    const text = pageText(ContactPage);
    expect(text).toContain(COMPANY.contactEmail);
    for (const [label, value] of [
      ["CIN:", COMPANY.cin],
      ["Udyam Registration No.:", COMPANY.udyamNumber],
      ["Registered office:", COMPANY.registeredAddress],
    ] as const) {
      expect(text.includes(label)).toBe(Boolean(value));
    }
  });
});

describe("Draft notice", () => {
  it("shows outside production while the policies are unreviewed", () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    expect(isLegalDraftNoticeShown()).toBe(!LEGAL.reviewed);
    if (!LEGAL.reviewed) {
      render(<PrivacyPolicyPage />);
      expect(screen.getByRole("note").textContent).toContain("Draft — pending legal review");
    }
  });

  it("is hidden on production deployments", () => {
    vi.stubEnv("VERCEL_ENV", "production");
    expect(isLegalDraftNoticeShown()).toBe(false);
    render(<PrivacyPolicyPage />);
    expect(screen.queryByText(/pending legal review/)).toBeNull();
  });
});

describe("Footer policy links", () => {
  it("lists every policy page and the sitemap in the Policies column", () => {
    render(<Footer />);
    const nav = screen.getByRole("navigation", { name: "Policies" });
    const links = Array.from(nav.querySelectorAll("a")).map((a) => [a.textContent, a.getAttribute("href")]);
    expect(links).toEqual([...POLICY_PAGES.map((page) => [page.label, page.href]), ["Sitemap", "/sitemap.xml"]]);
  });

  it("keeps only Privacy Policy and Terms of Service in the bottom bar", () => {
    render(<Footer />);
    const nav = screen.getByRole("navigation", { name: "Legal" });
    const links = Array.from(nav.querySelectorAll("a")).map((a) => [a.textContent, a.getAttribute("href")]);
    expect(links).toEqual([
      ["Privacy Policy", "/privacy"],
      ["Terms of Service", "/terms"],
    ]);
  });
});

describe("Policy page layout", () => {
  it("builds the On this page list from the page's own sections", () => {
    render(<RefundPolicyPage />);
    const toc = screen.getByRole("navigation", { name: "On this page" });
    const targets = Array.from(toc.querySelectorAll("a")).map((a) => a.getAttribute("href"));
    const sectionIds = Array.from(document.querySelectorAll("article section[id]")).map((el) => `#${el.id}`);
    expect(targets).toEqual(sectionIds);
    expect(targets.length).toBeGreaterThan(3);
  });
});

describe("Structured data", () => {
  it("describes the organization without unconfirmed statutory details", () => {
    const data = buildOrganizationJsonLd() as { "@graph": Array<Record<string, unknown>> };
    const organization = data["@graph"].find((node) => node["@type"] === "Organization");
    expect(organization).toMatchObject({ name: "GARA Innovation", email: COMPANY.contactEmail, url: COMPANY.websiteUrl });
    expect("legalName" in (organization ?? {})).toBe(Boolean(COMPANY.registeredName));
    expect("address" in (organization ?? {})).toBe(Boolean(COMPANY.registeredAddress));
    expect(data["@graph"].some((node) => node["@type"] === "WebSite")).toBe(true);
  });

  it("numbers breadcrumb items from 1 with absolute URLs", () => {
    const data = buildBreadcrumbJsonLd([
      { name: "Home", path: "/" },
      { name: "Privacy Policy", path: "/privacy" },
    ]) as { itemListElement: Array<{ position: number; item: string }> };
    expect(data.itemListElement.map((entry) => entry.position)).toEqual([1, 2]);
    expect(data.itemListElement[1].item).toMatch(/^https?:\/\/[^/]+\/privacy$/);
  });
});
