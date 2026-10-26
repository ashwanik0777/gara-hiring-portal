import { expect, type Locator, type Page } from "@playwright/test";
import { E2E_FIXED_OTP } from "./fixtures";

/**
 * The visible form whose submit button has the given name. The desktop auth screen keeps
 * the login, register and forgot-password forms mounted (faded out), and the mobile
 * layout renders its own copy, so a form is located by its submit button and visibility.
 */
export function visibleForm(page: Page, submitButtonName: string): Locator {
  return page
    .locator("form")
    .filter({ has: page.getByRole("button", { name: submitButtonName, exact: true }) })
    .filter({ visible: true });
}

export function registerForm(page: Page): Locator {
  return visibleForm(page, "Create Account");
}

export function loginForm(page: Page): Locator {
  return visibleForm(page, "Sign In");
}

/** The visible emailed-code step (after sign-up, or after the password step of sign-in). */
export function otpForm(page: Page, submitButtonName: string): Locator {
  return visibleForm(page, submitButtonName);
}

/**
 * Enters the emailed one-time code. Journey runs use the fixed test code that the app server
 * accepts only on the dedicated test database (see fixtures.ts).
 */
export async function enterEmailedCode(page: Page, submitButtonName: string): Promise<void> {
  const form = otpForm(page, submitButtonName);
  const input = form.getByLabel("Verification code");
  await expect(input).toBeVisible();
  await input.fill(E2E_FIXED_OTP);
  await form.getByRole("button", { name: submitButtonName, exact: true }).click();
}

export type CareerInterestOption = "Full-time job" | "Internship" | "Both";

/** Selects a career-interest card (the radio itself is visually hidden inside its label). */
export async function chooseCareerInterest(
  form: Locator,
  option: CareerInterestOption
): Promise<void> {
  const name = new RegExp(`^${option}\\b`);
  // `has` takes a locator relative to the label, so it is rooted at the page.
  await form
    .locator("label")
    .filter({ has: form.page().getByRole("radio", { name }) })
    .click();
  await expect(form.getByRole("radio", { name })).toBeChecked();
}

export interface NewCandidate {
  name: string;
  email: string;
  password: string;
  interest: CareerInterestOption;
}

/** Registers through the public form and waits for the candidate portal. */
export async function registerCandidate(page: Page, candidate: NewCandidate): Promise<void> {
  await page.goto("/register");
  const form = registerForm(page);
  await form.getByPlaceholder("John Doe").fill(candidate.name);
  await form.getByPlaceholder("you@company.com").fill(candidate.email);
  await form.getByPlaceholder("Create a strong password").fill(candidate.password);
  await chooseCareerInterest(form, candidate.interest);
  await form.getByRole("checkbox", { name: /I agree to the Terms of Service/ }).check();
  await form.getByRole("button", { name: "Create Account", exact: true }).click();
  // The new account verifies its email with the emailed code, which signs it in.
  await enterEmailedCode(page, "Verify email");
  await page.waitForURL("**/candidate/dashboard");
}

/** Signs in through the login form and waits until the browser leaves /login. */
export async function signIn(page: Page, email: string, password: string): Promise<void> {
  await page.goto("/login");
  const form = loginForm(page);
  await form.getByPlaceholder("you@company.com").fill(email);
  await form.getByPlaceholder("••••••••").fill(password);
  await form.getByRole("button", { name: "Sign In", exact: true }).click();
  // Every password sign-in asks for the emailed code.
  await enterEmailedCode(page, "Verify and sign in");
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
}
