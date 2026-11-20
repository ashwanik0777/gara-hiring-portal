import { expect, test } from "@playwright/test";
import { registerCandidate } from "../support/auth-ui";
import {
  hasE2EDatabase,
  isProductionServer,
  NO_DATABASE_SKIP_REASON,
  PRODUCTION_OTP_SKIP_REASON,
} from "../support/env";
import { E2E_OPENINGS, E2E_USERS, newCandidateIdentity } from "../support/fixtures";
import {
  advanceToInterviewed,
  applyToOpening,
  dateInputValue,
  expectCandidateStage,
  formWithButton,
  newActorPage,
  openStaffApplication,
  signInAsStaff,
} from "../support/journey-ui";

test.describe("Internship journey (requires E2E_DATABASE_URL)", () => {
  test.skip(!hasE2EDatabase, NO_DATABASE_SKIP_REASON);
  test.skip(isProductionServer, PRODUCTION_OTP_SKIP_REASON);

  test("candidate applies, HR runs the pipeline and evaluation, the intern joins", async ({
    browser,
  }) => {
    test.setTimeout(600_000);
    const candidate = newCandidateIdentity("Intern");
    const opening = E2E_OPENINGS.internship;
    const candidatePage = await newActorPage(browser);
    const hrPage = await newActorPage(browser);
    let applicationId = "";

    await test.step("candidate registers choosing Internship and applies with a resume link", async () => {
      await registerCandidate(candidatePage, { ...candidate, interest: "Internship" });
      applicationId = await applyToOpening(candidatePage, opening.slug, opening.title, {
        fullName: candidate.name,
      });
      await expectCandidateStage(candidatePage, applicationId, "Submitted");
    });

    await test.step("the same opening does not accept a second application", async () => {
      await candidatePage.goto(`/careers/${opening.slug}/apply`);
      await expect(candidatePage.getByRole("heading", { name: "You Have Already Applied" })).toBeVisible();
      await expect(candidatePage.getByRole("button", { name: "Submit Application" })).toHaveCount(0);
      await candidatePage.getByRole("button", { name: "View my application" }).click();
      await candidatePage.waitForURL(new RegExp(`/candidate/applications/${applicationId}$`));
    });

    await test.step("HR sees the education details and the consent on the application", async () => {
      await signInAsStaff(hrPage, E2E_USERS.hr.email);
      await expect(hrPage).toHaveURL(/\/subadmin/);
      await openStaffApplication(hrPage, applicationId);
      await expect(hrPage.getByText(/E2E Institute of Technology \(pending approval\)/)).toBeVisible();
      await expect(hrPage.getByText(/Accepted Privacy Policy & Terms on/)).toBeVisible();
    });

    await test.step("HR moves the application to Interviewed", async () => {
      await openStaffApplication(hrPage, applicationId);
      await advanceToInterviewed(hrPage);
      await expectCandidateStage(candidatePage, applicationId, "Interview Completed");
    });

    await test.step("HR selects the candidate for the 7-day evaluation", async () => {
      await hrPage
        .getByLabel(/^Evaluation supervisor/)
        .selectOption({ label: `${E2E_USERS.mentor.name} (MENTOR)` });
      await hrPage.getByRole("button", { name: "Select for 7-day evaluation" }).click();
      const dialog = hrPage.getByRole("dialog", { name: /for the 7-day evaluation\?$/ });
      await dialog.getByRole("button", { name: "Confirm selection" }).click();
      // The page refreshes into the evaluation status card (the transient confirmation is replaced).
      await expect(hrPage.getByText(`Supervisor: ${E2E_USERS.mentor.name}`)).toBeVisible();
      await expect(hrPage.getByRole("link", { name: /evaluation cockpit/i }).first()).toBeVisible();
      await expectCandidateStage(candidatePage, applicationId, "Evaluation Selected");
    });

    await test.step("HR starts and passes the evaluation", async () => {
      await hrPage.getByRole("link", { name: /evaluation cockpit/i }).first().click();
      await hrPage.waitForURL(/\/subadmin\/evaluations\/[0-9a-f-]{36}$/);

      const startForm = formWithButton(hrPage, /Start 7-Working-Day Window/);
      // "Official Start Date (Day 1)" is a visual label not associated with its input.
      await startForm.locator('input[type="date"]').fill(dateInputValue(0));
      await startForm.getByRole("button", { name: /Start 7-Working-Day Window/ }).click();
      // The confirmation can be replaced by the refreshed cockpit before it is observed, so
      // either the message or the next step's form proves the window started.
      await expect(
        hrPage
          .getByText("7-working-day evaluation window initiated successfully.")
          .or(formWithButton(hrPage, "Record Final Decision"))
          .first()
      ).toBeVisible();
      await hrPage.reload();

      const finalForm = formWithButton(hrPage, "Record Final Decision");
      await finalForm.getByRole("combobox").selectOption("PASSED");
      await finalForm
        .getByPlaceholder(/Detail candidate performance across all 7 checkpoints/)
        .fill("E2E: met every checkpoint and delivered the evaluation tasks.");
      await finalForm.getByRole("button", { name: "Record Final Decision" }).click();
      await expect(
        hrPage
          .getByText(/Evaluation outcome recorded as PASSED/)
          .or(hrPage.getByRole("button", { name: "Mark as joined", exact: true }))
          .first()
      ).toBeVisible();
      await hrPage.reload();
    });

    await test.step("HR issues the internship offer letter and the candidate downloads it", async () => {
      // The form submits through React; wait until the page has hydrated after the reload.
      await hrPage.waitForLoadState("networkidle");
      await hrPage.getByLabel("Start date *", { exact: true }).fill(dateInputValue(0));
      await hrPage.getByLabel("Signatory name *", { exact: true }).fill("E2E Director");
      await expect(hrPage.getByLabel("Tenure *", { exact: true })).toHaveValue("3 months");
      await hrPage.getByRole("button", { name: "Issue offer letter" }).click();
      await expect(hrPage.getByRole("status").filter({ hasText: "Offer letter issued." })).toBeVisible();

      await candidatePage.goto(`/candidate/applications/${applicationId}`);
      await expect(candidatePage.getByText("Your internship offer letter")).toBeVisible();
      const download = candidatePage.getByRole("link", { name: /Download offer letter/ });
      const href = await download.getAttribute("href");
      expect(href).toBe(`/api/internship-offers/${applicationId}/letter`);
      const pdf = await candidatePage.request.get(href ?? "");
      expect(pdf.status()).toBe(200);
      expect(pdf.headers()["content-type"]).toContain("application/pdf");
      await hrPage.reload();
    });

    await test.step("HR marks the intern as joined", async () => {
      await hrPage.getByRole("button", { name: "Mark as joined", exact: true }).click();
      const dialog = hrPage.getByRole("dialog", { name: /^Mark as joined:/ });
      // The joining form is prefilled from the offer letter.
      await expect(dialog.getByLabel(/^Joining date/)).toHaveValue(dateInputValue(0));
      await dialog.getByLabel(/^Employee code/).fill(candidate.employeeCode);
      await dialog.getByLabel(/^Joining date/).fill(dateInputValue(0));
      await expect(dialog.getByLabel(/^Department/)).not.toHaveValue("");
      await expect(dialog.getByLabel(/^Designation/)).not.toHaveValue("");
      await dialog.getByRole("radio", { name: /^Active/ }).check();
      await dialog.getByRole("radio", { name: /^3 months/ }).check();
      await dialog.getByRole("button", { name: "Confirm: mark as joined" }).click();
      await expect(
        hrPage.getByRole("status").filter({ hasText: "is now marked as joined as an intern" })
      ).toBeVisible();
    });

    await test.step("the candidate portal becomes the intern portal", async () => {
      await candidatePage.goto("/candidate/dashboard");
      await candidatePage.waitForURL("**/intern/dashboard");
      // The intern workspace is unlocked: attendance and the ID card belong to joined interns only.
      await expect(candidatePage.getByRole("heading", { name: "Today's attendance" })).toBeVisible();
      await expect(candidatePage.getByRole("heading", { name: "ID card" })).toBeVisible();
    });

    await candidatePage.context().close();
    await hrPage.context().close();
  });
});
