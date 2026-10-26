import { expect, type Browser, type Locator, type Page } from "@playwright/test";
import { signIn } from "./auth-ui";
import { E2E_STAFF_PASSWORD } from "./fixtures";

/** Local calendar date as YYYY-MM-DD, offset by whole days. */
export function dateInputValue(offsetDays = 0): string {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/** A fresh browser context for one actor, so candidate and staff sessions never mix. */
export async function newActorPage(browser: Browser): Promise<Page> {
  const context = await browser.newContext();
  return context.newPage();
}

export async function signInAsStaff(page: Page, email: string): Promise<void> {
  await signIn(page, email, E2E_STAFF_PASSWORD);
}

/** The visible form whose submit button has the given accessible name. */
export function formWithButton(page: Page, buttonName: string | RegExp): Locator {
  return page
    .locator("form")
    .filter({ has: page.getByRole("button", { name: buttonName }) })
    .filter({ visible: true });
}

export interface ApplicationAnswers {
  fullName: string;
  /** Seeded openings use the default form; its education label depends on the type. */
  resumeLink?: string;
}

/**
 * Fills and submits the published application form of an opening and returns the new
 * application's id (from the candidate's application detail URL).
 */
export async function applyToOpening(
  page: Page,
  slug: string,
  title: string,
  answers: ApplicationAnswers
): Promise<string> {
  await page.goto(`/careers/${slug}/apply`);
  await expect(page.getByRole("heading", { level: 1, name: `Apply: ${title}` })).toBeVisible();

  await page.getByLabel(/^Full Legal Name/).fill(answers.fullName);
  await expect(page.getByLabel(/^Email Address/)).not.toHaveValue("");
  await page.getByLabel(/^Phone Number/).fill("9876543210");
  await page.getByLabel(/^Current City \/ Location/).fill("Bengaluru");
  await page
    .getByLabel(/^(College \/ Degree & Graduating Year|Highest Qualification)/)
    .fill("B.Tech Computer Science, 2026 (E2E)");
  await page
    .getByLabel(/^Resume link/)
    .fill(answers.resumeLink ?? "https://drive.google.com/file/d/e2e-fixture-resume/view");
  await page.getByLabel(/^Earliest Available Start Date/).fill(dateInputValue(14));

  await page.getByRole("button", { name: "Submit Application" }).click();
  await expect(
    page.getByRole("heading", { name: "Application Submitted Successfully" })
  ).toBeVisible();
  await expect(page.getByText("Application Reference Code")).toBeVisible();

  await page.getByRole("button", { name: "View Application Details" }).click();
  await page.waitForURL(/\/candidate\/applications\/[0-9a-f-]{36}$/);
  const applicationId = new URL(page.url()).pathname.split("/").pop();
  if (!applicationId) throw new Error("Application id missing from the detail URL.");
  return applicationId;
}

/** Opens the candidate's application page and expects the stage badge text. */
export async function expectCandidateStage(
  page: Page,
  applicationId: string,
  stageLabel: string
): Promise<void> {
  await page.goto(`/candidate/applications/${applicationId}`);
  await expect(page.getByText(stageLabel, { exact: true }).first()).toBeVisible();
}

export async function openStaffApplication(page: Page, applicationId: string): Promise<void> {
  await page.goto(`/subadmin/applications/${applicationId}`);
  await expect(
    page
      .getByText(/^Current: [A-Z_]+$/)
      .or(page.getByText(/managed by the evaluation, job offer and joining workflows/))
      .first()
  ).toBeVisible();
}

/**
 * Moves an application one manual stage forward with the stage-decision card.
 * `stage` is the option text, e.g. "INTERVIEW SCHEDULED".
 */
export async function advanceStage(page: Page, stage: string): Promise<void> {
  const form = formWithButton(page, /Execute Transition/);
  // The target <select> has a visual label that is not associated with it; it is the
  // only combobox in this form.
  await form.getByRole("combobox").selectOption({ label: stage });
  await form.getByRole("button", { name: /Execute Transition/ }).click();
  await expect(
    page.getByText(`Application stage successfully advanced to ${stage}.`)
  ).toBeVisible();
  await page.reload();
  await expect(page.getByText(`Current: ${stage.replace(/ /g, "_")}`)).toBeVisible();
}

/** Takes an application from SUBMITTED to INTERVIEWED through the manual stages. */
export async function advanceToInterviewed(page: Page): Promise<void> {
  for (const stage of ["SCREENING", "SHORTLISTED", "INTERVIEW SCHEDULED", "INTERVIEWED"]) {
    await advanceStage(page, stage);
  }
}
