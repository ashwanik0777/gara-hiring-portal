import { expect, test } from "@playwright/test";
import { registerCandidate, signIn } from "../support/auth-ui";
import { E2E_STAFF_PASSWORD, E2E_USERS, newCandidateIdentity } from "../support/fixtures";
import { hasE2EDatabase, NO_DATABASE_SKIP_REASON } from "../support/env";

/*
 * Campus Ambassador programme (Phase 4): the public page is indexable server HTML; a student
 * applies from their portal and an administrator approves them, which gives a referral code.
 */

test.describe("Campus Ambassador", () => {
  test("the programme page is public, indexable and links to the application", async ({ page, request }) => {
    const response = await request.get("/campus-ambassador");
    expect(response.status()).toBe(200);
    const html = await response.text();
    expect(html).toMatch(/<link rel="canonical" href="https?:\/\/[^"]+\/campus-ambassador"/);
    expect(html).toContain('"@type":"BreadcrumbList"');
    expect(html).not.toContain('name="robots" content="noindex');

    await page.goto("/campus-ambassador");
    await expect(page.getByRole("heading", { level: 1, name: "Campus Ambassador Programme" })).toBeVisible();
    await expect(page.getByText("Never collect money from anyone: students pay only on this website.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Apply to become an ambassador" })).toHaveAttribute("href", "/candidate/ambassador");
  });

  test("referral clicks from other sites are refused", async ({ request }) => {
    const response = await request.post("/api/referrals/click", {
      data: { code: "GARA-RAHU7K2" },
      headers: { origin: "https://evil.example", "sec-fetch-site": "cross-site" },
    });
    expect(response.status()).toBe(403);
  });

  test("a student applies and an administrator approves them", async ({ browser }, testInfo) => {
    test.skip(!hasE2EDatabase, NO_DATABASE_SKIP_REASON);
    test.skip(testInfo.project.name !== "chromium", "Creates accounts; runs in the desktop project only.");
    test.setTimeout(180_000);
    const student = newCandidateIdentity("Ambassador");
    const studentContext = await browser.newContext();
    const adminContext = await browser.newContext();
    try {
      const studentPage = await studentContext.newPage();
      await registerCandidate(studentPage, { ...student, interest: "Internship" });
      await studentPage.goto("/candidate/ambassador");
      await studentPage.getByLabel("Mobile number *").fill("9876543210");
      await studentPage.getByLabel("College *").fill("E2E Institute of Technology");
      await studentPage.getByLabel("Why do you want to be a Campus Ambassador? *").fill("I run the coding club and want to help juniors find good training.");
      await studentPage.getByRole("checkbox").check();
      await studentPage.getByRole("button", { name: "Send application" }).click();
      await expect(studentPage.getByText(/is being reviewed/)).toBeVisible();

      const adminPage = await adminContext.newPage();
      await signIn(adminPage, E2E_USERS.admin.email, E2E_STAFF_PASSWORD);
      await adminPage.goto("/admin/campus-ambassadors?status=pending");
      // One card per ambassador (cards hold their own detail lists, so only direct items count).
      const card = () => adminPage.getByRole("list", { name: "Ambassadors" }).locator(":scope > li", { hasText: student.email });
      const row = card();
      await expect(row).toBeVisible();
      await row.getByRole("button", { name: "Approve" }).click();
      // Once approved the application leaves the "pending" list.
      await expect(card()).toHaveCount(0);
      await adminPage.goto("/admin/campus-ambassadors?status=approved");
      await expect(card().getByText(/^GARA-[A-Z2-9]{7}$/)).toBeVisible();

      await studentPage.reload();
      await expect(studentPage.getByText("Your referral link")).toBeVisible();
      await expect(studentPage.getByText(/\/\?ref=GARA-[A-Z2-9]{7}/)).toBeVisible();
      const qr = await studentPage.request.get("/api/ambassador/qr");
      expect(qr.status()).toBe(200);
      expect(qr.headers()["content-type"]).toContain("image/svg+xml");
    } finally {
      await studentContext.close();
      await adminContext.close();
    }
  });
});
