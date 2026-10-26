import { expect, test, type Page } from "@playwright/test";
import { chooseCareerInterest, loginForm, registerForm } from "../support/auth-ui";
import { hasE2EDatabase, NO_DATABASE_SKIP_REASON } from "../support/env";

// These tests need no database: the app server runs with an unreachable DATABASE_URL
// unless E2E_DATABASE_URL is set (playwright.config.ts).

test.describe("Public pages", () => {
  test("home page renders the hero and the careers call to action", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("heading", { level: 1, name: /Accelerating Talent/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /Explore Opportunities/ }).first()).toBeVisible();
  });

  test("careers page serves its heading in the prerendered shell", async ({ request }) => {
    // The heading is part of the static shell; the openings list streams in below it.
    const response = await request.get("/careers");
    expect(response.status()).toBe(200);
    expect(await response.text()).toContain("Current Openings &amp; Internship Cohorts");
  });

  test("careers page shows its heading", async ({ page }) => {
    // Without a database the openings stream fails and the route's error boundary replaces
    // the page after hydration, so the rendered heading needs the test database.
    test.skip(!hasE2EDatabase, NO_DATABASE_SKIP_REASON);

    await page.goto("/careers");
    await expect(
      page.getByRole("heading", { level: 1, name: "Current Openings & Internship Cohorts" })
    ).toBeVisible();
  });

  test("reset-password without a token shows the invalid-link state", async ({ page }) => {
    await page.goto("/reset-password");

    await expect(
      page
        .getByRole("alert")
        .filter({ hasText: "This reset link is invalid or has expired. Please request a new one." })
    ).toBeVisible();
    await expect(page.getByRole("link", { name: /Request a new reset link/ })).toBeVisible();
  });
});

test.describe("Login", () => {
  test("login page renders the sign-in form", async ({ page }) => {
    await page.goto("/login");

    await expect(
      page.getByRole("heading", { name: /^(Your Career Journey Continues|Welcome back)$/ })
    ).toBeVisible();
    const form = loginForm(page);
    await expect(form.getByPlaceholder("you@company.com")).toBeVisible();
    await expect(form.getByPlaceholder("••••••••")).toBeVisible();
    await expect(form.getByRole("button", { name: "Sign In", exact: true })).toBeEnabled();
  });

  test("a bad login attempt shows a friendly error", async ({ page }) => {
    // Rejecting credentials requires the user table, so this only runs with a test database.
    test.skip(!hasE2EDatabase, NO_DATABASE_SKIP_REASON);

    await page.goto("/login");
    const form = loginForm(page);
    await form.getByPlaceholder("you@company.com").fill("nobody@example.test");
    await form.getByPlaceholder("••••••••").fill("Wrong-Password-123!");
    await form.getByRole("button", { name: "Sign In", exact: true }).click();

    await expect(form.getByText(/Invalid email or password/)).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe("Registration form (client-side validation, nothing is submitted)", () => {
  test.beforeEach(async ({ page }) => {
    // Any sign-up request would mean client-side validation let the form through.
    await page.route("**/api/auth/sign-up/**", (route) =>
      route.abort("blockedbyclient")
    );
  });

  async function fillAccountFields(page: Page) {
    await page.goto("/register");
    const form = registerForm(page);
    await form.getByPlaceholder("John Doe").fill("Validation Only");
    await form.getByPlaceholder("you@company.com").fill("validation-only@example.test");
    await form.getByPlaceholder("Create a strong password").fill("Valid-Password-123!");
    return form;
  }

  test("requires choosing a career interest", async ({ page }) => {
    const signUpRequests: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes("/api/auth/sign-up")) signUpRequests.push(request.url());
    });
    const form = await fillAccountFields(page);
    await form.getByRole("checkbox", { name: /I agree to the Terms of Service/ }).check();

    await form.getByRole("button", { name: "Create Account", exact: true }).click();

    await expect(
      page
        .getByText("Please choose whether you are looking for a job, an internship, or both.")
        .filter({ visible: true })
    ).toBeVisible();
    await expect(page).toHaveURL(/\/register/);
    expect(signUpRequests).toEqual([]);
  });

  test("requires accepting the terms", async ({ page }) => {
    const signUpRequests: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes("/api/auth/sign-up")) signUpRequests.push(request.url());
    });
    const form = await fillAccountFields(page);
    await chooseCareerInterest(form, "Internship");
    const terms = form.getByRole("checkbox", { name: /I agree to the Terms of Service/ });
    await expect(terms).not.toBeChecked();

    await form.getByRole("button", { name: "Create Account", exact: true }).click();

    // The checkbox is a required control, so the browser blocks the submission.
    expect(await terms.evaluate((input: HTMLInputElement) => input.validity.valueMissing)).toBe(
      true
    );
    expect(await form.evaluate((element: HTMLFormElement) => element.checkValidity())).toBe(false);
    await expect(page).toHaveURL(/\/register/);
    expect(signUpRequests).toEqual([]);
  });

  test("offers the three career-interest choices as a labelled radio group", async ({ page }) => {
    await page.goto("/register");
    const form = registerForm(page);
    const group = form.getByRole("group", { name: /I am looking for/ });

    await expect(group).toBeVisible();
    await expect(group.getByRole("radio")).toHaveCount(3);
    for (const option of ["Full-time job", "Internship", "Both"] as const) {
      await expect(group.getByRole("radio", { name: new RegExp(`^${option}\\b`) })).toBeAttached();
    }
  });
});
