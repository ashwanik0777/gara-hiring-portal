import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, screen, cleanup, within } from "@testing-library/react";
import Home from "@/app/page";
import { Footer } from "@/components/navigation/footer";
import { FraudAlert } from "@/components/marketing/fraud-alert";
import { ANNOUNCEMENT, COMPANY, PORTAL_DOMAIN, fraudAlertText } from "@/config/site";
import nextConfig from "../../next.config";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => "/",
}));

vi.mock("@/lib/auth/auth-client", () => ({
  authClient: {
    useSession: vi.fn(() => ({ data: null, isPending: false })),
    signOut: vi.fn(),
  },
}));

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({ count: 1 }) });
  vi.stubGlobal("fetch", fetchMock);
  window.sessionStorage.clear();
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

describe("Fraud alert", () => {
  it("says internships are free, names the portal domain and the contact address", () => {
    const text = fraudAlertText();
    expect(text).toContain("never charges any fee for internships");
    expect(text).toContain(PORTAL_DOMAIN);
    expect(text).toContain(COMPANY.contactEmail);
  });

  it("renders as a note with a working contact link", () => {
    render(<FraudAlert />);
    const note = screen.getByRole("note", { name: "Fraud alert" });
    expect(within(note).getByRole("link", { name: COMPANY.contactEmail }).getAttribute("href")).toBe(`mailto:${COMPANY.contactEmail}`);
  });
});

describe("Public footer", () => {
  it("shows the attribution and fraud alert, and no visitor count", () => {
    render(<Footer />);

    expect(screen.queryByText(/Recorded visitors/)).toBeNull();
    expect(screen.queryByText(/Architected/)).toBeNull();
    expect(screen.getByText(/Built by/)).toBeTruthy();
    expect(screen.getByRole("link", { name: COMPANY.brandName }).getAttribute("href")).toBe(COMPANY.websiteUrl);
    expect(screen.getByText(/never charges any fee for internships/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Sitemap" }).getAttribute("href")).toBe("/sitemap.xml");
  });

  it("prints only the company details that are configured (never a placeholder)", () => {
    render(<Footer />);
    const facts: Array<[string, string | null]> = [
      ["Registered name:", COMPANY.registeredName],
      ["CIN:", COMPANY.cin],
      ["Udyam Registration No.:", COMPANY.udyamNumber],
      ["Registered office:", COMPANY.registeredAddress],
    ];
    for (const [label, value] of facts) {
      if (value) {
        expect(screen.getByText(label)).toBeTruthy();
      } else {
        expect(screen.queryByText(label)).toBeNull();
      }
    }
    expect(screen.queryByText(/TODO/)).toBeNull();
  });

  it("records the visit once per browser session without showing anything", async () => {
    const { unmount } = render(<Footer />);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith("/api/analytics/visitors", expect.objectContaining({ method: "POST" }));
    await vi.waitFor(() => expect(window.sessionStorage.getItem("gara_visit_tracked")).toBe("1"));
    unmount();

    render(<Footer />);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("Home page", () => {
  it("speaks to students and carries no internal HRMS or platform marketing", () => {
    const { container } = render(<Home />);
    const text = container.textContent ?? "";

    for (const internal of ["RBAC", "HRMS", "Payroll", "Platform Architecture", "Foundation Release"]) {
      expect(text).not.toContain(internal);
    }
    for (const badge of ["Real Projects", "Mentor Support", "Verified QR Certificates", "7-Day Evaluation"]) {
      expect(screen.getAllByText(badge).length).toBeGreaterThan(0);
    }
    if (ANNOUNCEMENT) {
      expect(screen.getByText(ANNOUNCEMENT.text)).toBeTruthy();
    }
    expect(screen.getByRole("note", { name: "Fraud alert" })).toBeTruthy();
  });
});

describe("Canonical domain redirect (next.config)", () => {
  async function hostRedirects() {
    const redirects = (await nextConfig.redirects?.()) ?? [];
    return redirects.filter((rule) => rule.has?.some((condition) => condition.type === "host"));
  }

  it("is off outside production builds", async () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("BETTER_AUTH_URL", "https://careers.example.org");
    expect(await hostRedirects()).toEqual([]);
  });

  it("sends every vercel.app page (not the API) to the canonical domain in production", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("BETTER_AUTH_URL", "https://careers.example.org");
    const [rule, ...rest] = await hostRedirects();

    expect(rest).toEqual([]);
    expect(rule).toMatchObject({
      source: "/:path((?!api(?:/|$)).*)",
      destination: "https://careers.example.org/:path",
      permanent: true,
    });
    const hostPattern = new RegExp(`^${rule.has?.[0]?.value}$`);
    expect(hostPattern.test("gara-portal.vercel.app")).toBe(true);
    expect(hostPattern.test("careers.example.org")).toBe(false);

    const pathPattern = /^\/((?!api(?:\/|$)).*)$/;
    expect(pathPattern.test("/careers/frontend-intern")).toBe(true);
    expect(pathPattern.test("/")).toBe(true);
    expect(pathPattern.test("/api/jobs/run")).toBe(false);
    expect(pathPattern.test("/apiary")).toBe(true);
  });

  it("never redirects when the canonical address is itself a vercel.app host", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("BETTER_AUTH_URL", "https://gara-portal.vercel.app");
    expect(await hostRedirects()).toEqual([]);
  });
});
