import { expect, test, type Page } from "@playwright/test";
import { E2E_EXPIRED_OPENING, E2E_OPENINGS } from "../support/fixtures";
import { hasE2EDatabase, NO_DATABASE_SKIP_REASON } from "../support/env";

/*
 * Careers listing (Phase 2): filters are plain links (no JavaScript needed), track pages are
 * indexable, and an opening disappears once its last date to apply has passed.
 */

const internship = E2E_OPENINGS.internship;
const fullTime = E2E_OPENINGS.fullTime;

/**
 * The visible card heading of an opening (its description starts with the title too, and the
 * router keeps the previous page mounted but hidden after a client-side navigation).
 */
const cardHeading = (page: Page, title: string) =>
  page.getByRole("heading", { level: 3, name: title, exact: true }).filter({ visible: true });

test.describe("Careers listing", () => {
  test("/careers/tracks has no page of its own and sends visitors to /careers", async ({ request }) => {
    const response = await request.get("/careers/tracks", { maxRedirects: 0 });
    expect(response.status()).toBe(308);
    expect(response.headers()["location"]).toMatch(/\/careers$/);
  });

  test("lists open openings with their details and hides an expired one", async ({ page }) => {
    test.skip(!hasE2EDatabase, NO_DATABASE_SKIP_REASON);
    await page.goto("/careers");

    const card = page.locator("div.rounded-3xl", { has: cardHeading(page, internship.title) });
    await expect(card).toBeVisible();
    await expect(card).toContainText("3 months");
    await expect(card).toContainText(/Apply by \d{1,2} \w{3} \d{4}/);
    await expect(card).toContainText("Software Engineering");
    await expect(cardHeading(page, fullTime.title)).toBeVisible();
    await expect(cardHeading(page, E2E_EXPIRED_OPENING.title)).toHaveCount(0);
  });

  test("filters by type and work mode with plain links", async ({ page }) => {
    test.skip(!hasE2EDatabase, NO_DATABASE_SKIP_REASON);
    await page.goto("/careers");
    const filters = page.getByRole("navigation", { name: "Filter openings" });

    await filters.getByRole("link", { name: "Full-time" }).click();
    await expect(page).toHaveURL(/\/careers\?type=full-time$/);
    await expect(cardHeading(page, fullTime.title)).toBeVisible();
    await expect(cardHeading(page, internship.title)).toHaveCount(0);
    await expect(filters.getByRole("link", { name: "Full-time" })).toHaveAttribute("aria-current", "page");

    await page.goto("/careers?type=internship&mode=on-site");
    await expect(page.getByText("No openings match these filters").filter({ visible: true })).toBeVisible();
  });

  test("a track page lists only that track, is indexable and has a breadcrumb", async ({ page, request }) => {
    test.skip(!hasE2EDatabase, NO_DATABASE_SKIP_REASON);
    await page.goto("/careers");
    await page.getByRole("navigation", { name: "Filter openings" }).getByRole("link", { name: "Software Engineering" }).click();

    await expect(page).toHaveURL(/\/careers\/tracks\/software$/);
    await expect(page.getByRole("heading", { level: 1, name: "Software Engineering Internships & Jobs" })).toBeVisible();
    await expect(cardHeading(page, internship.title)).toBeVisible();
    await expect(cardHeading(page, fullTime.title)).toHaveCount(0);

    const html = await (await request.get("/careers/tracks/software")).text();
    expect(html).toMatch(/<link rel="canonical" href="https?:\/\/[^"]+\/careers\/tracks\/software"/);
    expect(html).not.toContain('name="robots" content="noindex');
    expect(html).toContain('"@type":"BreadcrumbList"');
  });

  test("an unknown track shows the not-found page and is never indexed", async ({ request }) => {
    test.skip(!hasE2EDatabase, NO_DATABASE_SKIP_REASON);
    const response = await request.get("/careers/tracks/no-such-track");
    // The development server answers 404; a production build streams the page (status 200 is
    // already sent with the shell) and marks it noindex, the same as for unknown openings.
    expect([200, 404]).toContain(response.status());
    const html = await response.text();
    expect(html).toContain('<meta name="robots" content="noindex"');
    expect(html).toContain("Page Not Found");
  });

  test("the sitemap lists the track page of an open opening", async ({ request }) => {
    test.skip(!hasE2EDatabase, NO_DATABASE_SKIP_REASON);
    const body = await (await request.get("/sitemap.xml")).text();
    expect(body).toContain("/careers/tracks/software</loc>");
    expect(body).not.toContain(`/careers/${E2E_EXPIRED_OPENING.slug}</loc>`);
  });
});

test.describe("Opening after its last date to apply", () => {
  test("shows a closed notice, no apply button and no Google Jobs data", async ({ page, request }) => {
    test.skip(!hasE2EDatabase, NO_DATABASE_SKIP_REASON);
    await page.goto(`/careers/${E2E_EXPIRED_OPENING.slug}`);

    await expect(page.getByRole("heading", { level: 1, name: E2E_EXPIRED_OPENING.title })).toBeVisible();
    await expect(page.getByText(/Applications for this opening closed on/)).toBeVisible();
    await expect(page.getByRole("link", { name: /Apply/ })).toHaveCount(0);

    const html = await (await request.get(`/careers/${E2E_EXPIRED_OPENING.slug}`)).text();
    expect(html).not.toContain('"@type":"JobPosting"');

    await page.goto(`/careers/${E2E_EXPIRED_OPENING.slug}/apply`);
    await expect(page.getByRole("heading", { level: 1, name: "Applications Closed" })).toBeVisible();
  });

  test("an open opening carries its deadline in the Google Jobs data", async ({ request }) => {
    test.skip(!hasE2EDatabase, NO_DATABASE_SKIP_REASON);
    const html = await (await request.get(`/careers/${internship.slug}`)).text();
    expect(html).toContain('"@type":"JobPosting"');
    expect(html).toMatch(/"validThrough":"\d{4}-\d{2}-\d{2}T/);
    expect(html).toContain('"skills":"TypeScript, React"');
  });
});
