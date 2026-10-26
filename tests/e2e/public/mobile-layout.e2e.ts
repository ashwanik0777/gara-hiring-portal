import { expect, test } from "@playwright/test";
import { hasE2EDatabase, NO_DATABASE_SKIP_REASON } from "../support/env";
import { E2E_OPENINGS } from "../support/fixtures";

const VIEWPORT_WIDTH = 375;

interface MobilePage {
  path: string;
  /** Level-1 heading that marks the page as rendered (null: only wait for the load event). */
  ready: string | RegExp | null;
  /** Pages whose content needs the seeded test database. */
  needsDatabase?: boolean;
}

const PAGES: MobilePage[] = [
  { path: "/", ready: /Accelerating Talent/ },
  { path: "/login", ready: null },
  { path: "/register", ready: null },
  { path: "/forgot-password", ready: null },
  { path: "/help", ready: /Help Center/ },
  { path: "/verify", ready: "Verify Certificate" },
  // Without a database the careers list fails and the error boundary renders instead.
  { path: "/careers", ready: hasE2EDatabase ? "Current Openings & Internship Cohorts" : null },
  {
    path: `/careers/${E2E_OPENINGS.internship.slug}`,
    ready: E2E_OPENINGS.internship.title,
    needsDatabase: true,
  },
];

test.describe("Mobile layout (375px)", () => {
  test.beforeEach(({ isMobile }) => {
    test.skip(!isMobile, "Runs in the mobile-375 project.");
  });

  for (const target of PAGES) {
    test(`${target.path} has no horizontal overflow`, async ({ page }) => {
      test.skip(Boolean(target.needsDatabase) && !hasE2EDatabase, NO_DATABASE_SKIP_REASON);

      await page.goto(target.path);
      if (target.ready) {
        await expect(page.getByRole("heading", { level: 1, name: target.ready })).toBeVisible();
      }
      await page.waitForLoadState("load");

      // With mobile emulation the layout viewport grows to fit overflowing content, so the
      // document width is compared with the device width rather than window.innerWidth.
      const scrollWidth = await page.evaluate(() =>
        Math.max(document.documentElement.scrollWidth, document.body?.scrollWidth ?? 0)
      );
      expect(scrollWidth, `${target.path} is ${scrollWidth}px wide`).toBeLessThanOrEqual(
        VIEWPORT_WIDTH
      );
    });
  }
});
