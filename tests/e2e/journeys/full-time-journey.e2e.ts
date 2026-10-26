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

test.describe("Full-time journey (requires E2E_DATABASE_URL)", () => {
  test.skip(!hasE2EDatabase, NO_DATABASE_SKIP_REASON);
  test.skip(isProductionServer, PRODUCTION_OTP_SKIP_REASON);

  test("candidate applies, HR extends an offer, the candidate accepts, HR marks joined", async ({
    browser,
  }) => {
    test.setTimeout(300_000);
    const candidate = newCandidateIdentity("Hire");
    const opening = E2E_OPENINGS.fullTime;
    const candidatePage = await newActorPage(browser);
    const hrPage = await newActorPage(browser);
    // Offer actions confirm with window.confirm; accept every native dialog.
    for (const page of [candidatePage, hrPage]) {
      page.on("dialog", (dialog) => void dialog.accept());
    }
    let applicationId = "";

    await test.step("candidate registers choosing Full-time job and applies", async () => {
      await registerCandidate(candidatePage, { ...candidate, interest: "Full-time job" });
      applicationId = await applyToOpening(candidatePage, opening.slug, opening.title, {
        fullName: candidate.name,
      });
      await expectCandidateStage(candidatePage, applicationId, "Submitted");
    });

    await test.step("HR moves the application to Interviewed", async () => {
      await signInAsStaff(hrPage, E2E_USERS.hr.email);
      await openStaffApplication(hrPage, applicationId);
      await advanceToInterviewed(hrPage);
    });

    await test.step("HR drafts and extends the offer", async () => {
      await hrPage.getByRole("button", { name: /Prepare Full-Time Job Offer/ }).click();
      // The offer form's visual labels are not associated with their inputs.
      const offerForm = formWithButton(hrPage, /Create Draft Offer/);
      await offerForm.getByPlaceholder("e.g. Engineering, Product").fill(opening.department);
      await offerForm
        .getByPlaceholder("e.g. Software Engineer, Product Analyst")
        .fill("Backend Engineer");
      await offerForm.locator('input[type="date"]').fill(dateInputValue(21));
      await offerForm
        .getByPlaceholder("Summary of the terms agreed with the candidate (as approved)")
        .fill("E2E fixture terms: as agreed with the candidate during the interview.");
      await offerForm.getByRole("button", { name: /Create Draft Offer/ }).click();

      await hrPage.getByRole("button", { name: /Extend Formal Offer to Candidate/ }).click();
      await expect(hrPage.getByText(/^Offer Extended/).first()).toBeVisible();
      await expectCandidateStage(candidatePage, applicationId, "Offer Extended");
    });

    await test.step("candidate signs and accepts the offer", async () => {
      await expect(
        candidatePage.getByRole("heading", { name: "Official Employment Offer" })
      ).toBeVisible();
      // Electronic acceptance: typed name + consent, when the e-sign form is present.
      const signedName = candidatePage.getByLabel("Full legal name");
      if (await signedName.isVisible()) {
        await signedName.fill(candidate.name);
        await candidatePage
          .getByRole("checkbox", { name: /agree to accept it electronically/ })
          .check();
      }
      await candidatePage.getByRole("button", { name: /^Accept job offer$/i }).click();
      await expect(candidatePage.getByText("Congratulations & Welcome!")).toBeVisible();
      await expectCandidateStage(candidatePage, applicationId, "Offer Accepted");
    });

    await test.step("HR marks the new employee as joined", async () => {
      await openStaffApplication(hrPage, applicationId);
      await hrPage.getByRole("button", { name: "Mark as joined", exact: true }).click();
      const dialog = hrPage.getByRole("dialog", { name: /Mark as joined/ });
      await dialog.getByLabel(/^Employee code/).fill(candidate.employeeCode);
      await dialog.getByLabel(/^Joining date/).fill(dateInputValue(0));
      await dialog.getByLabel(/^Department/).fill(opening.department);
      await dialog.getByLabel(/^Designation/).fill("Backend Engineer");
      await dialog.getByRole("radio", { name: /^Active/ }).check();
      await dialog.getByRole("button", { name: "Confirm: mark as joined" }).click();
      await expect(dialog).toBeHidden();
      await hrPage.reload();
      await expect(hrPage.getByText("Joined", { exact: true }).first()).toBeVisible();
    });

    await test.step("the candidate portal becomes the employee portal", async () => {
      await candidatePage.goto("/candidate/dashboard");
      await candidatePage.waitForURL("**/hrms");
      await expect(candidatePage.getByRole("heading", { name: /Welcome/ }).first()).toBeVisible();
    });

    await candidatePage.context().close();
    await hrPage.context().close();
  });
});
