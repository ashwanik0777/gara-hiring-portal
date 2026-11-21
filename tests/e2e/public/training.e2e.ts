import { expect, test, type Page } from "@playwright/test";
import { registerCandidate, signIn } from "../support/auth-ui";
import { E2E_STAFF_PASSWORD, E2E_TRAINING, E2E_USERS, newCandidateIdentity } from "../support/fixtures";
import { hasE2EDatabase, NO_DATABASE_SKIP_REASON } from "../support/env";

/*
 * Industrial Training (Phase 3A): public programme pages are indexable server HTML, enrolling
 * needs an account, and students find receipts, refunds and transfers on "My Training".
 * Payments stay switched off in tests (no Razorpay keys), so no money moves.
 */

const programmePath = `/training/${E2E_TRAINING.slug}`;
const enrolPath = `${programmePath}/enroll?batch=${E2E_TRAINING.batchId}`;

/** The visible level-1 heading (the router keeps the previous page mounted but hidden). */
const pageHeading = (page: Page, name: string | RegExp) => page.getByRole("heading", { level: 1, name }).filter({ visible: true });

test.describe("Industrial Training", () => {
  test("the payment webhook refuses unsigned calls", async ({ request }) => {
    const response = await request.post("/api/webhooks/razorpay", {
      data: JSON.stringify({ event: "payment.captured" }),
      headers: { "content-type": "application/json" },
    });
    // 503 while payments are not configured, 400 (bad signature) once they are.
    expect([400, 503]).toContain(response.status());
  });

  test("/training lists the programme with its fee and next batch", async ({ page }) => {
    test.skip(!hasE2EDatabase, NO_DATABASE_SKIP_REASON);
    await page.goto("/training");
    await expect(pageHeading(page, "Industrial Training Programmes")).toBeVisible();

    const card = page.locator("div.rounded-3xl", { has: page.getByText(E2E_TRAINING.title, { exact: true }) });
    await expect(card).toBeVisible();
    await expect(card).toContainText(E2E_TRAINING.feeLabel);
    await expect(card).toContainText(`${E2E_TRAINING.durationWeeks} weeks`);
    await expect(card).toContainText(`${E2E_TRAINING.seats - E2E_TRAINING.seatsTaken} seats left`);
  });

  test("a programme page is indexable with Course and breadcrumb data", async ({ page, request }) => {
    test.skip(!hasE2EDatabase, NO_DATABASE_SKIP_REASON);
    const html = await (await request.get(programmePath)).text();
    expect(html).toMatch(new RegExp(`<link rel="canonical" href="https?://[^"]+${programmePath}"`));
    expect(html).not.toContain('name="robots" content="noindex');
    expect(html).toContain('"@type":"Course"');
    expect(html).toContain('"@type":"BreadcrumbList"');

    await page.goto(programmePath);
    await expect(pageHeading(page, E2E_TRAINING.title)).toBeVisible();
    await expect(page.getByText(`Week 1: ${E2E_TRAINING.syllabus[0].title}`)).toBeVisible();
    await expect(page.getByText(E2E_TRAINING.batchName)).toBeVisible();
    await expect(page.getByText(`${E2E_TRAINING.seats - E2E_TRAINING.seatsTaken} of ${E2E_TRAINING.seats} left`)).toBeVisible();
    const enrol = page.getByRole("link", { name: "Enrol in this batch" });
    await expect(enrol).toHaveAttribute("href", enrolPath);
  });

  test("enrolling asks a signed-out visitor to sign in first", async ({ page }) => {
    test.skip(!hasE2EDatabase, NO_DATABASE_SKIP_REASON);
    await page.goto(enrolPath);
    await expect(page).toHaveURL(/\/login\?callbackUrl=/);
    expect(decodeURIComponent(new URL(page.url()).searchParams.get("callbackUrl") ?? "")).toBe(enrolPath);
  });

  test("an unknown programme shows the not-found page and is never indexed", async ({ request }) => {
    test.skip(!hasE2EDatabase, NO_DATABASE_SKIP_REASON);
    const response = await request.get("/training/no-such-programme");
    // Development answers 404; a production build streams the page with status 200 and noindex.
    expect([200, 404]).toContain(response.status());
    const html = await response.text();
    expect(html).toContain('<meta name="robots" content="noindex"');
  });

  test("a student sees My Training and the enrol page", async ({ page }) => {
    test.skip(!hasE2EDatabase, NO_DATABASE_SKIP_REASON);
    test.setTimeout(120_000);
    const student = newCandidateIdentity("Trainee");
    await registerCandidate(page, { ...student, interest: "Internship" });

    // The portal menu links to the page (on phones it sits in the collapsed menu).
    await expect(page.locator('a[href="/candidate/training"]')).not.toHaveCount(0);
    await page.goto("/candidate/training");
    await expect(page.getByRole("heading", { level: 2, name: "My Training" }).filter({ visible: true })).toBeVisible();
    await expect(page.getByText("No training enrollments yet").filter({ visible: true })).toBeVisible();

    await page.goto(enrolPath);
    await expect(pageHeading(page, `Enrol: ${E2E_TRAINING.title}`)).toBeVisible();
    await expect(page.getByText(E2E_TRAINING.batchName).filter({ visible: true })).toBeVisible();
    // Without Razorpay keys the checkout is switched off; with them it asks for consent first.
    const switchedOff = page.getByText("Online payment opens soon");
    const payButton = page.getByRole("button", { name: `Pay ${E2E_TRAINING.feeLabel}` });
    await expect(switchedOff.or(payButton)).toBeVisible();
    if (await payButton.isVisible()) await expect(payButton).toBeDisabled();
  });

  test("administrators see the refund queue", async ({ page }) => {
    test.skip(!hasE2EDatabase, NO_DATABASE_SKIP_REASON);
    test.setTimeout(120_000);
    await signIn(page, E2E_USERS.admin.email, E2E_STAFF_PASSWORD);
    await page.goto("/admin/training/refunds");
    // The portal header carries the page title; the page repeats it as its own heading.
    await expect(page.getByRole("heading", { level: 2, name: "Training Refunds" })).toBeVisible();
    await expect(page.getByText("Waiting for a decision (0)")).toBeVisible();

    // Printed certificate orders (Phase 3C) and ambassador payouts (Phase 4).
    // These pages show their title in the portal header only.
    await page.goto("/admin/print-orders");
    await expect(page.getByRole("heading", { level: 1, name: "Print Orders" })).toBeVisible();
    await expect(page.getByRole("group", { name: "Print order summary" })).toBeVisible();
    await page.goto("/admin/campus-ambassadors/payouts");
    await expect(page.getByRole("heading", { level: 1, name: "Ambassador Payouts" })).toBeVisible();
    await expect(page.getByText("Nothing to review")).toBeVisible();
  });

  test("a student submits an assignment and the mentor grades it", async ({ browser }, testInfo) => {
    test.skip(!hasE2EDatabase, NO_DATABASE_SKIP_REASON);
    // The journey changes the seeded learning record (the submission gets graded), so it runs once.
    test.skip(testInfo.project.name !== "chromium", "Changes shared seeded data; runs in the desktop project only.");
    test.setTimeout(180_000);
    const studentContext = await browser.newContext();
    const mentorContext = await browser.newContext();
    try {
      const student = await studentContext.newPage();
      await signIn(student, E2E_USERS.trainee.email, E2E_STAFF_PASSWORD);
      await student.goto("/candidate/training");
      await student.getByRole("link", { name: "Open learning area" }).filter({ visible: true }).first().click();
      await expect(student).toHaveURL(new RegExp(`/candidate/training/${E2E_TRAINING.enrollmentId}$`));
      await expect(student.getByText("Progress against the pass criteria")).toBeVisible();
      await expect(student.getByText(E2E_TRAINING.sessionTitle)).toBeVisible();
      await student.getByLabel("Repository link (GitHub or similar)").fill("https://github.com/e2e/landing-page");
      await student.getByRole("button", { name: "Submit", exact: true }).click();
      await expect(student.getByText(/Submitted\. You can replace it/)).toBeVisible();

      const mentor = await mentorContext.newPage();
      await signIn(mentor, E2E_USERS.mentor.email, E2E_STAFF_PASSWORD);
      await mentor.goto("/subadmin/training");
      await expect(mentor.getByRole("link", { name: `${E2E_TRAINING.title} · ${E2E_TRAINING.batchName}` })).toBeVisible();
      await mentor.goto(`/subadmin/training/${E2E_TRAINING.batchId}?tab=assignments`);
      await expect(mentor.getByText("https://github.com/e2e/landing-page").or(mentor.getByRole("link", { name: "Repository" })).first()).toBeVisible();
      await mentor.getByLabel(`Marks / ${E2E_TRAINING.assignmentMaxMarks}`).fill("15");
      await mentor.getByRole("button", { name: "Grade" }).click();
      await expect(mentor.getByText("Marks saved.")).toBeVisible();

      await mentor.goto(`/subadmin/training/${E2E_TRAINING.batchId}?tab=classes`);
      await mentor.getByRole("checkbox", { name: E2E_USERS.trainee.name }).check();
      await mentor.getByRole("button", { name: "Save attendance" }).click();
      await expect(mentor.getByText("Attendance saved.")).toBeVisible();

      await student.reload();
      await expect(student.getByText(`15 of ${E2E_TRAINING.assignmentMaxMarks} marks across all assignments`)).toBeVisible();
      await expect(student.getByText("Present")).toBeVisible();
    } finally {
      await studentContext.close();
      await mentorContext.close();
    }
  });
});
