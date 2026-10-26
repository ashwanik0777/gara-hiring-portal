import { expect, test } from "@playwright/test";
import { hasE2EDatabase, NO_DATABASE_SKIP_REASON } from "../support/env";
import { E2E_OPENINGS } from "../support/fixtures";

// These tests need no database unless marked; the app server runs with an unreachable
// DATABASE_URL when E2E_DATABASE_URL is not set (playwright.config.ts).

test.describe("Help centre", () => {
  test("renders the heading, the assistant region and the approved FAQs", async ({ page }) => {
    await page.goto("/help");

    await expect(page.getByRole("heading", { level: 1, name: /Help Center/ })).toBeVisible();
    await expect(page.getByRole("region", { name: "Interactive Portal Assistant" })).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 2, name: /Approved Programme & Portal FAQs/ })
    ).toBeVisible();
    // The FAQ catalogue is static content: at least one entry is on the page.
    await expect(page.getByText(/^FAQ-/).first()).toBeVisible();
  });
});

test.describe("Certificate verification", () => {
  test("the verification page renders the code form", async ({ page }) => {
    await page.goto("/verify");

    await expect(page.getByRole("heading", { level: 1, name: "Verify Certificate" })).toBeVisible();
    const input = page.getByLabel("Certificate Verification Code");
    await expect(input).toBeVisible();
    const submit = page.getByRole("button", { name: "Verify Now" });
    await expect(submit).toBeDisabled();
    await input.fill("gara-cert-2026-sample");
    await expect(input).toHaveValue("GARA-CERT-2026-SAMPLE");
    await expect(submit).toBeEnabled();
  });

  test("an unknown code shows the failed state with the queried code", async ({ page }) => {
    // The public lookup is rate limited through the database, so it needs the test database.
    test.skip(!hasE2EDatabase, NO_DATABASE_SKIP_REASON);

    await page.goto("/verify/GARA-CERT-0000-E2ENONE");

    await expect(
      page.getByRole("heading", { level: 2, name: "Invalid or Unverified Credential" })
    ).toBeVisible();
    await expect(page.getByText("GARA-CERT-0000-E2ENONE")).toBeVisible();
  });
});

test.describe("Crawler files", () => {
  test("robots.txt allows the public pages, hides private areas and names the sitemap", async ({
    request,
  }) => {
    const response = await request.get("/robots.txt");
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("text/plain");

    const body = await response.text();
    expect(body).toContain("User-Agent: *");
    expect(body).toContain("Allow: /careers");
    for (const privatePath of ["/admin", "/subadmin", "/hrms", "/api", "/verify", "/careers/*/apply"]) {
      expect(body).toContain(`Disallow: ${privatePath}`);
    }
    expect(body).toMatch(/Sitemap: https?:\/\/[^\s]+\/sitemap\.xml/);
  });

  test("sitemap.xml lists the home page, the careers index and the published openings", async ({
    request,
  }) => {
    test.skip(!hasE2EDatabase, NO_DATABASE_SKIP_REASON);

    const response = await request.get("/sitemap.xml");
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("xml");

    const body = await response.text();
    expect(body).toContain("<urlset");
    expect(body).toMatch(/<loc>https?:\/\/[^<]+\/careers<\/loc>/);
    for (const opening of Object.values(E2E_OPENINGS)) {
      expect(body).toContain(`/careers/${opening.slug}</loc>`);
    }
    expect(body).not.toContain("/apply</loc>");
    expect(body).not.toContain("/admin");
  });
});

test.describe("Client-side navigation", () => {
  test("the home page call to action navigates to the careers page", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: /Explore Opportunities/ }).first().click();

    await page.waitForURL((url) => url.pathname === "/careers");
    const heading = page.getByRole("heading", {
      level: 1,
      name: "Current Openings & Internship Cohorts",
    });
    if (hasE2EDatabase) {
      await expect(heading).toBeVisible();
    } else {
      // Without a database the openings stream fails and the route's friendly error boundary
      // replaces the page; either way the navigation itself completed. (The route announcer
      // is also an alert, so the error boundary is matched by its text.)
      const errorBoundary = page.getByRole("alert").filter({ hasText: "Something went wrong" });
      await expect(heading.or(errorBoundary).first()).toBeVisible();
    }
  });
});
