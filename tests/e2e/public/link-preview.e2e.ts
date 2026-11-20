import { expect, test, type APIRequestContext } from "@playwright/test";
import { E2E_OPENINGS } from "../support/fixtures";
import { hasE2EDatabase, NO_DATABASE_SKIP_REASON } from "../support/env";

/**
 * Link previews: WhatsApp, LinkedIn, Slack and X fetch the page without running JavaScript
 * and read only the <head>. Every shareable page must carry Open Graph tags with an absolute,
 * small PNG image, and its real content must be in the server HTML (not a loading screen).
 */

const PREVIEW_BOTS = {
  whatsapp: "WhatsApp/2.23.20.0 A",
  linkedin: "LinkedInBot/1.0 (compatible; Mozilla/5.0; Apache-HttpClient +http://www.linkedin.com)",
};

const SHAREABLE_PAGES = ["/", "/careers", "/training", "/campus-ambassador", "/login", "/register", "/help", "/verify", "/privacy", "/refund-policy", "/contact"];

function metaContent(html: string, key: string): string | null {
  const head = html.slice(0, html.indexOf("</head>"));
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match =
    new RegExp(`<meta[^>]+(?:property|name)="${escaped}"[^>]+content="([^"]*)"`).exec(head) ??
    new RegExp(`<meta[^>]+content="([^"]*)"[^>]+(?:property|name)="${escaped}"`).exec(head);
  return match ? match[1].replace(/&amp;/g, "&") : null;
}

async function expectPreviewImage(request: APIRequestContext, imageUrl: string) {
  // Previews need an absolute URL; the test server answers for it (BETTER_AUTH_URL = baseURL).
  expect(imageUrl).toMatch(/^https?:\/\//);
  // The dev server compiles the next/og image route on first use, which can take a while.
  const response = await request.get(new URL(imageUrl).pathname + new URL(imageUrl).search, { timeout: 60_000 });
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("image/png");
  const body = await response.body();
  // WhatsApp drops large preview images; the generated card is far below this.
  expect(body.byteLength).toBeLessThan(600 * 1024);
}

test.describe("Link previews (Open Graph in the server HTML)", () => {
  for (const pagePath of SHAREABLE_PAGES) {
    test(`${pagePath} carries Open Graph tags for WhatsApp and LinkedIn`, async ({ request }) => {
      for (const userAgent of Object.values(PREVIEW_BOTS)) {
        const response = await request.get(pagePath, { headers: { "user-agent": userAgent } });
        expect(response.status()).toBe(200);
        const html = await response.text();

        expect(metaContent(html, "og:title")).toBeTruthy();
        expect(metaContent(html, "og:description")).toBeTruthy();
        expect(metaContent(html, "og:site_name")).toBe("GARA Innovation");
        expect(metaContent(html, "twitter:card")).toBe("summary_large_image");
        const image = metaContent(html, "og:image");
        expect(image, "og:image").toBeTruthy();
        await expectPreviewImage(request, image ?? "");
      }
    });
  }

  test("an opening shares its own title and image", async ({ request }) => {
    test.skip(!hasE2EDatabase, NO_DATABASE_SKIP_REASON);
    const opening = E2E_OPENINGS.internship;
    const html = await (
      await request.get(`/careers/${opening.slug}`, { headers: { "user-agent": PREVIEW_BOTS.whatsapp } })
    ).text();

    expect(metaContent(html, "og:title")).toContain(opening.title);
    const image = metaContent(html, "og:image") ?? "";
    expect(image).toContain(`/careers/${opening.slug}/opengraph-image`);
    await expectPreviewImage(request, image);
  });
});

test.describe("Content without JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("the home page shows its content", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1, name: /Accelerating Talent/ })).toBeVisible();
  });

  test("the careers page shows its heading (and a message instead of an error screen without data)", async ({
    page,
  }) => {
    await page.goto("/careers");
    await expect(
      page.getByRole("heading", { level: 1, name: "Current Openings & Internship Cohorts" })
    ).toBeVisible();
    if (!hasE2EDatabase) {
      await expect(page.getByRole("status").filter({ hasText: "Openings could not be loaded" })).toBeVisible();
    }
  });

  test("an opening shows its details and a working apply link", async ({ page }) => {
    test.skip(!hasE2EDatabase, NO_DATABASE_SKIP_REASON);
    const opening = E2E_OPENINGS.internship;
    await page.goto(`/careers/${opening.slug}`);
    await expect(page.getByRole("heading", { level: 1, name: opening.title })).toBeVisible();
    // The role summary beside the details is part of the server HTML too.
    await expect(page.getByRole("heading", { level: 2, name: "Role summary" })).toBeVisible();
    await expect(page.getByRole("link", { name: /Apply Now/ })).toHaveAttribute(
      "href",
      `/careers/${opening.slug}/apply`
    );
  });

  test("the sign-in and registration forms are in the server HTML", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByPlaceholder("you@company.com").filter({ visible: true }).first()).toBeVisible();
    await page.goto("/register");
    await expect(page.getByPlaceholder("John Doe").filter({ visible: true }).first()).toBeVisible();
  });

  test("the help and certificate verification pages show their content", async ({ page }) => {
    await page.goto("/help");
    await expect(page.getByRole("heading", { level: 1, name: /Help Center/ })).toBeVisible();
    await page.goto("/verify");
    await expect(page.getByRole("heading", { name: /Verify/ }).first()).toBeVisible();
  });
});
