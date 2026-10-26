import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act, cleanup } from "@testing-library/react";

/**
 * Emailed one-time codes (product-owner decision 2026-10-26): auth configuration, account
 * creation hooks, the code email and its delivery, the test-only fixed-code seam, the OTP
 * step component and the sign-in/sign-up branching of the auth screen.
 * The full HTTP flows run in otp-auth-flow.test.ts (Node environment).
 */

const h = vi.hoisted(() => ({
  prisma: {
    user: { findUnique: vi.fn() },
    twoFactor: { create: vi.fn() },
    candidateProfile: { upsert: vi.fn() },
  },
  sendEmail: vi.fn(),
  afterTasks: [] as Array<() => Promise<void>>,
  authClient: {
    useSession: vi.fn(() => ({ data: null, isPending: false })),
    signIn: { email: vi.fn(), social: vi.fn() },
    signUp: { email: vi.fn() },
    requestPasswordReset: vi.fn(),
    twoFactor: { sendOtp: vi.fn(), verifyOtp: vi.fn() },
    emailOtp: { verifyEmail: vi.fn(), sendVerificationOtp: vi.fn() },
  },
  router: { replace: vi.fn(), push: vi.fn(), refresh: vi.fn() },
  search: { value: "" },
  getPostLoginRedirectAction: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ prisma: h.prisma }));
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: (task: () => Promise<void>) => {
    h.afterTasks.push(task);
  },
}));
vi.mock("@/infrastructure/email/outbox-processor", () => ({
  NodemailerEmailAdapter: class {
    sendEmail = h.sendEmail;
  },
}));
vi.mock("@/lib/auth/auth-client", () => ({ authClient: h.authClient }));
vi.mock("next/navigation", () => ({
  useRouter: () => h.router,
  useSearchParams: () => new URLSearchParams(h.search.value),
}));
vi.mock("next/image", async () => {
  const { createElement } = await import("react");
  return { default: ({ alt }: { alt: string }) => createElement("img", { alt }) };
});
vi.mock("next/link", async () => {
  const { createElement } = await import("react");
  return {
    default: ({ href, children, className }: { href: string; children?: React.ReactNode; className?: string }) =>
      createElement("a", { href, className }, children),
  };
});
vi.mock("@/features/auth/password-actions", () => ({
  getPostLoginRedirectAction: h.getPostLoginRedirectAction,
}));

import {
  auth,
  DISABLED_AUTH_PATHS,
  OTP_ALLOWED_ATTEMPTS,
  OTP_LENGTH,
  OTP_RATE_LIMIT_RULES,
  OTP_TTL_MINUTES,
  deliverOtpEmail,
  resolveFixedTestOtp,
} from "@/lib/auth/auth";
import { buildOtpCodeEmail } from "@/infrastructure/email/email-templates";
import { CareerInterestSchema } from "@/features/lifecycle/schemas";
import { OtpCodeStep } from "@/components/auth/otp-code-step";
import { AuthSplitScreen } from "@/components/auth/auth-split-screen";
import {
  OTP_CODE_LENGTH,
  OTP_EXPIRY_MINUTES,
  OTP_RESEND_COOLDOWN_SECONDS,
  describeGoogleSignInError,
  describeOtpError,
  maskEmail,
  normalizeOtpInput,
  type OtpResult,
} from "@/components/auth/otp-helpers";

const [emailOtpPlugin, twoFactorPlugin] = auth.options.plugins;
const createHooks = auth.options.databaseHooks.user.create;
type CreateAfterArgs = Parameters<typeof createHooks.after>;

function runCreateAfter(userId: string, context: { path: string; body?: unknown } | null): Promise<void> {
  return createHooks.after({ id: userId } as CreateAfterArgs[0], context as CreateAfterArgs[1]);
}

let consoleOutput: string[] = [];

function captureConsole(): void {
  consoleOutput = [];
  for (const method of ["log", "info", "warn", "error", "debug"] as const) {
    vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
      consoleOutput.push(args.map((arg) => (arg instanceof Error ? `${arg.message} ${arg.stack}` : String(arg))).join(" "));
    });
  }
}

async function flushAfterResponse(): Promise<void> {
  while (h.afterTasks.length > 0) {
    await h.afterTasks.shift()?.();
  }
}

function post(path: string, body: unknown): Promise<Response> {
  return auth.handler(
    new Request(`http://localhost:3000/api/auth${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://localhost:3000" },
      body: JSON.stringify(body),
    })
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  h.afterTasks.length = 0;
  h.search.value = "";
  h.prisma.twoFactor.create.mockResolvedValue({});
  h.prisma.candidateProfile.upsert.mockResolvedValue({});
  h.sendEmail.mockResolvedValue(undefined);
  h.getPostLoginRedirectAction.mockResolvedValue({ redirectTo: "/candidate/dashboard", mustChangePassword: false });
  captureConsole();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// ─── Configuration ───────────────────────────────────────────────────────────

describe("Auth configuration", () => {
  it("requires a verified email and sends the verification code on sign-up and sign-in", async () => {
    expect(auth.options.emailAndPassword.requireEmailVerification).toBe(true);
    expect(auth.options.emailVerification).toEqual({
      sendOnSignUp: true,
      sendOnSignIn: true,
      autoSignInAfterVerification: true,
    });
    // email-otp replaces the verification link with a code.
    const context = await auth.$context;
    const merged: Record<string, unknown> = { ...context.options.emailVerification };
    expect(typeof merged.sendVerificationEmail).toBe("function");
  });

  it("uses the email-otp and two-factor plugins with hashed 6-digit codes valid for 10 minutes", () => {
    expect(auth.options.plugins.map((plugin) => plugin.id)).toEqual(["email-otp", "two-factor"]);
    expect(emailOtpPlugin.options).toMatchObject({
      overrideDefaultEmailVerification: true,
      otpLength: 6,
      expiresIn: 600,
      allowedAttempts: 5,
      storeOTP: "hashed",
      disableSignUp: true,
    });
    expect(emailOtpPlugin.options.generateOTP).toBeUndefined();
    expect(twoFactorPlugin.options?.otpOptions).toMatchObject({
      period: 10,
      digits: 6,
      allowedAttempts: 5,
      storeOTP: "hashed",
    });
    expect(twoFactorPlugin.options?.totpOptions?.disable).toBe(true);
    expect(twoFactorPlugin.options?.accountLockout?.enabled).toBe(true);
  });

  it("disables every endpoint that would bypass the password + code decision", () => {
    expect(auth.options.disabledPaths).toEqual(expect.arrayContaining([
      "/sign-in/email-otp",
      "/two-factor/enable",
      "/two-factor/disable",
      "/two-factor/get-totp-uri",
      "/two-factor/verify-totp",
      "/two-factor/generate-backup-codes",
      "/two-factor/verify-backup-code",
      "/email-otp/request-password-reset",
      "/forget-password/email-otp",
      "/email-otp/reset-password",
      "/email-otp/request-email-change",
      "/email-otp/change-email",
      "/email-otp/check-verification-otp",
    ]));
    // The endpoints the flows need stay reachable.
    for (const needed of ["/email-otp/send-verification-otp", "/email-otp/verify-email", "/two-factor/send-otp", "/two-factor/verify-otp", "/request-password-reset", "/reset-password"]) {
      expect(DISABLED_AUTH_PATHS).not.toContain(needed);
    }
  });

  it("answers 404 on disabled endpoints and rejects trusted devices and other code types", async () => {
    for (const path of ["/sign-in/email-otp", "/two-factor/enable", "/two-factor/disable", "/two-factor/verify-backup-code"]) {
      expect((await post(path, { email: "a@example.test", otp: "123456", password: "x" })).status).toBe(404);
    }
    for (const path of ["/two-factor/send-otp", "/two-factor/verify-otp"]) {
      const response = await post(path, { code: "123456", trustDevice: true });
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ code: "TRUSTED_DEVICE_NOT_SUPPORTED" });
    }
    for (const type of ["sign-in", "forget-password", "change-email"]) {
      const response = await post("/email-otp/send-verification-otp", { email: "a@example.test", type });
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ code: "OTP_TYPE_NOT_SUPPORTED" });
    }
  });

  it("keeps the session cookie cache off and limits code requests per IP", () => {
    expect(auth.options.session).not.toHaveProperty("cookieCache");
    expect(auth.options.rateLimit.storage).toBe("database");
    expect(auth.options.rateLimit.customRules).toEqual({
      "/email-otp/send-verification-otp": { window: 60, max: 3 },
      "/two-factor/send-otp": { window: 60, max: 3 },
      "/email-otp/verify-email": { window: 60, max: 10 },
      "/two-factor/verify-otp": { window: 60, max: 10 },
    });
    expect(OTP_RATE_LIMIT_RULES).toBe(auth.options.rateLimit.customRules);
  });

  it("never links Google to a password account whose email is not verified", () => {
    expect(auth.options.account.accountLinking).toMatchObject({
      enabled: true,
      trustedProviders: ["google"],
      requireLocalEmailVerified: true,
    });
  });

  it("keeps the client constants in sync with the server", () => {
    expect(OTP_CODE_LENGTH).toBe(OTP_LENGTH);
    expect(OTP_EXPIRY_MINUTES).toBe(OTP_TTL_MINUTES);
    expect(OTP_ALLOWED_ATTEMPTS).toBe(5);
    expect(OTP_RESEND_COOLDOWN_SECONDS).toBe(OTP_RATE_LIMIT_RULES["/email-otp/send-verification-otp"].window);
  });
});

// ─── Account creation hooks ─────────────────────────────────────────────────

describe("Account creation hooks", () => {
  it("forces the emailed sign-in code on for every new user", async () => {
    await expect(createHooks.before()).resolves.toEqual({ data: { twoFactorEnabled: true } });
  });

  it("creates the two-factor lockout row with an unused random secret", async () => {
    await runCreateAfter("user-1", { path: "/sign-up/email", body: {} });
    await runCreateAfter("user-2", { path: "/sign-up/email", body: {} });

    const rows = h.prisma.twoFactor.create.mock.calls.map(
      (call) => (call[0] as { data: { userId: string; secret: string; backupCodes: string } }).data
    );
    expect(rows.map((row) => row.userId)).toEqual(["user-1", "user-2"]);
    for (const row of rows) {
      expect(row.backupCodes).toBe("[]");
      expect(row.secret).toMatch(/^[A-Za-z0-9_-]{43}$/);
    }
    expect(rows[0]?.secret).not.toBe(rows[1]?.secret);
  });

  it("stores the career interest chosen at sign-up on the new candidate profile", async () => {
    await runCreateAfter("user-1", { path: "/sign-up/email", body: { name: "A", careerInterest: "INTERNSHIP" } });

    expect(h.prisma.candidateProfile.upsert).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      create: { userId: "user-1", careerInterest: "INTERNSHIP" },
      update: { careerInterest: "INTERNSHIP" },
    });
  });

  it.each([["CEO"], [42], ["internship"], [undefined]])(
    "ignores an invalid career interest (%s) and never overwrites a chosen one",
    async (value) => {
      await runCreateAfter("user-1", { path: "/sign-up/email", body: { careerInterest: value } });

      expect(h.prisma.candidateProfile.upsert).toHaveBeenCalledWith({
        where: { userId: "user-1" },
        create: { userId: "user-1", careerInterest: null },
        update: {},
      });
    }
  );

  it("gives a Google user a candidate profile with no interest chosen", async () => {
    await runCreateAfter("google-user", { path: "/callback/:id", body: { careerInterest: "JOB" } });
    await runCreateAfter("no-context", null);

    expect(h.prisma.candidateProfile.upsert.mock.calls.map((call) => (call[0] as { create: unknown }).create)).toEqual([
      { userId: "google-user", careerInterest: null },
      { userId: "no-context", careerInterest: null },
    ]);
  });

  it("validates exactly like CareerInterestSchema", async () => {
    for (const value of ["JOB", "INTERNSHIP", "BOTH", "job", "", "NONE", null]) {
      h.prisma.candidateProfile.upsert.mockClear();
      await runCreateAfter("user-1", { path: "/sign-up/email", body: { careerInterest: value } });
      const [[args]] = h.prisma.candidateProfile.upsert.mock.calls as [[{ create: { careerInterest: unknown } }]];
      expect(args.create.careerInterest !== null).toBe(CareerInterestSchema.safeParse(value).success);
    }
  });

  it("logs a failed step without undoing the sign-up", async () => {
    h.prisma.twoFactor.create.mockRejectedValueOnce(new Error("db down"));
    h.prisma.candidateProfile.upsert.mockRejectedValueOnce(new Error("db down"));

    await expect(runCreateAfter("user-1", { path: "/sign-up/email", body: { careerInterest: "JOB" } })).resolves.toBeUndefined();
    expect(h.prisma.candidateProfile.upsert).toHaveBeenCalled();
    expect(consoleOutput.join("\n")).toContain("Could not create the two-factor lockout record");
    expect(consoleOutput.join("\n")).toContain("Could not create the candidate profile");
  });
});

// ─── Email template and delivery ────────────────────────────────────────────

describe("One-time code email", () => {
  it("contains the code, the purpose, the 10-minute expiry and an ignore notice, all escaped", () => {
    const email = buildOtpCodeEmail({
      name: '<script>alert("x")</script>',
      code: "482913",
      purpose: "verify-email",
      expiresInMinutes: 10,
    });

    expect(email.subject).toBe("Your GARA Innovation verification code");
    expect(email.html).toContain("482913");
    expect(email.html).toContain("10 minutes");
    expect(email.html).toContain("Verify your email address");
    expect(email.html).toContain("If this wasn&#39;t you");
    expect(email.html).toContain("&lt;script&gt;");
    expect(email.html).not.toContain("<script>");
    expect(email.text).toContain("482913");
    expect(email.text).toContain("verify your email address");
    expect(email.text).toContain("expires in 10 minutes");
    expect(email.text).toContain("If this wasn't you, you can ignore this email");

    const signIn = buildOtpCodeEmail({ name: null, code: "000111", purpose: "sign-in", expiresInMinutes: 10 });
    expect(signIn.text).toContain("finish signing in");
    expect(signIn.html).toContain("Your sign-in code");
    expect(signIn.text.startsWith("Hello,")).toBe(true);
  });

  it("emails a verification code only to an account that still needs verifying", async () => {
    h.prisma.user.findUnique.mockResolvedValueOnce({ name: "Asha", emailVerified: false });
    await deliverOtpEmail({ email: "Asha@Example.test", code: "482913", purpose: "verify-email" });
    expect(h.prisma.user.findUnique).toHaveBeenCalledWith({
      where: { email: "asha@example.test" },
      select: { name: true, emailVerified: true },
    });
    expect(h.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "Asha@Example.test",
        subject: "Your GARA Innovation verification code",
        text: expect.stringContaining("Hello Asha,"),
        html: expect.stringContaining("482913"),
      })
    );

    h.sendEmail.mockClear();
    h.prisma.user.findUnique.mockResolvedValueOnce({ name: "Done", emailVerified: true });
    await deliverOtpEmail({ email: "done@example.test", code: "482913", purpose: "verify-email" });
    h.prisma.user.findUnique.mockResolvedValueOnce(null);
    await deliverOtpEmail({ email: "nobody@example.test", code: "482913", purpose: "verify-email" });
    expect(h.sendEmail).not.toHaveBeenCalled();
  });

  it("emails the sign-in code to the signed-in user without another lookup", async () => {
    await deliverOtpEmail({ email: "staff@example.test", name: "Staff", code: "135790", purpose: "sign-in" });
    expect(h.prisma.user.findUnique).not.toHaveBeenCalled();
    expect(h.sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: "staff@example.test", html: expect.stringContaining("135790") }));
  });

  it("logs a delivery failure without the code and without throwing", async () => {
    const failure = Object.assign(new Error("550 rejected message containing 482913"), { code: "EENVELOPE" });
    h.prisma.user.findUnique.mockResolvedValueOnce({ name: "Asha", emailVerified: false });
    h.sendEmail.mockRejectedValueOnce(failure);

    await expect(deliverOtpEmail({ email: "asha@example.test", code: "482913", purpose: "verify-email" })).resolves.toBeUndefined();
    const logs = consoleOutput.join("\n");
    expect(logs).toContain("One-time code email delivery failed");
    expect(logs).toContain("EENVELOPE");
    expect(logs).not.toContain("482913");
  });

  it("sends codes after the response (identical answers) and only for email verification", async () => {
    h.prisma.user.findUnique.mockResolvedValue({ name: "Asha", emailVerified: false });
    await emailOtpPlugin.options.sendVerificationOTP({ email: "asha@example.test", otp: "482913", type: "email-verification" });
    await emailOtpPlugin.options.sendVerificationOTP({ email: "asha@example.test", otp: "482913", type: "forget-password" });
    await twoFactorPlugin.options?.otpOptions?.sendOTP?.({
      user: {
        id: "u1",
        email: "asha@example.test",
        name: "Asha",
        emailVerified: true,
        twoFactorEnabled: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      otp: "135790",
    });

    expect(h.sendEmail).not.toHaveBeenCalled();
    expect(h.afterTasks).toHaveLength(2);
    await flushAfterResponse();
    expect(h.sendEmail).toHaveBeenCalledTimes(2);
    expect(consoleOutput.join("\n")).not.toMatch(/482913|135790/);
  });
});

// ─── Test-only fixed code seam ──────────────────────────────────────────────

describe("Test-only fixed OTP seam", () => {
  const testDb = "postgresql://user:pw@localhost:5432/gara_e2e_test";
  const active = { NODE_ENV: "development", E2E_FIXED_OTP: "246810", E2E_DATABASE_URL: testDb, DATABASE_URL: testDb };

  it("is active only outside production, on the dedicated test database, with a 6-digit code", () => {
    expect(resolveFixedTestOtp(active)).toBe("246810");
    expect(resolveFixedTestOtp({ ...active, NODE_ENV: "test" })).toBe("246810");
    expect(resolveFixedTestOtp({ ...active, DATABASE_URL: "postgresql://u:p@db.test-cluster.example:5432/app", E2E_DATABASE_URL: "postgresql://u:p@db.test-cluster.example:5432/app" })).toBe("246810");

    expect(resolveFixedTestOtp({ ...active, NODE_ENV: "production" })).toBeNull();
    expect(resolveFixedTestOtp({ ...active, VERCEL: "1" })).toBeNull();
    expect(resolveFixedTestOtp({ ...active, E2E_FIXED_OTP: undefined })).toBeNull();
    for (const code of ["12345", "1234567", "abcdef", "12 345"]) {
      expect(resolveFixedTestOtp({ ...active, E2E_FIXED_OTP: code })).toBeNull();
    }
    expect(resolveFixedTestOtp({ ...active, E2E_DATABASE_URL: undefined })).toBeNull();
    expect(resolveFixedTestOtp({ ...active, DATABASE_URL: "postgresql://u:p@localhost:5432/gara_hrms" })).toBeNull();
    const realDb = "postgresql://u:p@ep-cool.ap-southeast-1.aws.neon.tech/neondb";
    expect(resolveFixedTestOtp({ ...active, DATABASE_URL: realDb, E2E_DATABASE_URL: realDb })).toBeNull();
    expect(resolveFixedTestOtp({ ...active, DATABASE_URL: "not a url", E2E_DATABASE_URL: "not a url" })).toBeNull();
  });

  describe("auth configuration with the seam variables set", () => {
    afterEach(() => {
      vi.unstubAllEnvs();
      vi.resetModules();
    });

    function stubSeam(nodeEnv: string): void {
      vi.stubEnv("NODE_ENV", nodeEnv);
      vi.stubEnv("E2E_FIXED_OTP", "246810");
      vi.stubEnv("E2E_DATABASE_URL", testDb);
      vi.stubEnv("DATABASE_URL", testDb);
      vi.stubEnv("BETTER_AUTH_SECRET", "unit-test-secret-that-is-long-enough-0123456789");
    }

    it("uses the fixed code on a development server connected to the test database", async () => {
      stubSeam("development");
      vi.resetModules();
      const { auth: seamAuth } = await import("@/lib/auth/auth");
      const [emailOtp, twoFactorOtp] = seamAuth.options.plugins;

      expect(emailOtp.options.generateOTP?.({ email: "a@example.test", type: "email-verification" })).toBe("246810");
      const store = twoFactorOtp.options?.otpOptions?.storeOTP;
      expect(typeof store).toBe("object");
      if (typeof store === "object" && "decrypt" in store) {
        await expect(store.decrypt(await store.encrypt("999999"))).resolves.toBe("246810");
      }
    });

    it("is inert in production: random codes, hashed storage", async () => {
      stubSeam("production");
      vi.resetModules();
      const { auth: productionAuth } = await import("@/lib/auth/auth");
      const [emailOtp, twoFactorOtp] = productionAuth.options.plugins;

      // A fresh instance built under the production environment (rate limiting is on).
      expect(productionAuth).not.toBe(auth);
      expect(productionAuth.options.rateLimit.enabled).toBe(true);
      expect(emailOtp.options.generateOTP).toBeUndefined();
      expect(emailOtp.options.storeOTP).toBe("hashed");
      expect(twoFactorOtp.options?.otpOptions?.storeOTP).toBe("hashed");
      expect(consoleOutput.join("\n")).not.toContain("fixed one-time code is active");
    });
  });
});

// ─── OTP step component ─────────────────────────────────────────────────────

function renderStep(overrides: Partial<React.ComponentProps<typeof OtpCodeStep>> = {}) {
  const props: React.ComponentProps<typeof OtpCodeStep> = {
    idPrefix: "test-otp",
    purpose: "verify-email",
    email: "candidate@example.test",
    onVerify: vi.fn(async (): Promise<OtpResult> => ({ ok: true })),
    onResend: vi.fn(async (): Promise<OtpResult> => ({ ok: true })),
    onBack: vi.fn(),
    backLabel: "Back to sign in",
    ...overrides,
  };
  render(React.createElement(OtpCodeStep, props));
  return { props, input: screen.getByLabelText("Verification code") as HTMLInputElement };
}

async function submitCode(input: HTMLInputElement, code: string): Promise<void> {
  fireEvent.change(input, { target: { value: code } });
  await act(async () => {
    fireEvent.submit(input.closest("form") as HTMLFormElement);
  });
}

describe("OtpCodeStep", () => {
  it("is one labelled numeric one-time-code input and shows the masked email and expiry", () => {
    const { input } = renderStep();

    expect(input.id).toBe("test-otp-code");
    expect(input.getAttribute("inputmode")).toBe("numeric");
    expect(input.getAttribute("autocomplete")).toBe("one-time-code");
    expect(input.maxLength).toBe(6);
    expect(input.getAttribute("aria-describedby")).toBe("test-otp-hint");
    expect(screen.getByRole("heading", { name: "Verify your email" })).toBeTruthy();
    expect(screen.getByText("ca•••@example.test")).toBeTruthy();
    expect(screen.queryByText("candidate@example.test")).toBeNull();
    expect(screen.getByText(/expires in 10 minutes/)).toBeTruthy();
  });

  it("accepts a pasted code, even inside a message, and submits it", async () => {
    const { input, props } = renderStep();

    fireEvent.paste(input, { clipboardData: { getData: () => "Your GARA Innovation verification code is: 482913" } });
    expect(input.value).toBe("482913");
    fireEvent.paste(input, { clipboardData: { getData: () => "123 456" } });
    expect(input.value).toBe("123456");

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Verify email" }));
    });
    expect(props.onVerify).toHaveBeenCalledWith("123456");
    expect(screen.getByRole("button", { name: /Signing you in/ })).toHaveProperty("disabled", true);
  });

  it("keeps only digits while typing and asks for all six before verifying", async () => {
    const { input, props } = renderStep();
    fireEvent.change(input, { target: { value: "12ab3" } });
    expect(input.value).toBe("123");

    await act(async () => {
      fireEvent.submit(input.closest("form") as HTMLFormElement);
    });
    expect(screen.getByRole("alert").textContent).toContain("Enter the 6-digit code from the email.");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(props.onVerify).not.toHaveBeenCalled();
  });

  it("offers Resend only after a 60-second cooldown, then restarts it", async () => {
    vi.useFakeTimers();
    const { props } = renderStep();

    const resend = () => screen.getByRole("button", { name: /Resend code/ }) as HTMLButtonElement;
    expect(resend().textContent).toBe("Resend code in 60s");
    expect(resend().disabled).toBe(true);
    act(() => {
      vi.advanceTimersByTime(59_000);
    });
    expect(resend().textContent).toBe("Resend code in 1s");
    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    expect(resend().disabled).toBe(false);
    expect(resend().textContent).toBe("Resend code");

    await act(async () => {
      fireEvent.click(resend());
    });
    expect(props.onResend).toHaveBeenCalledTimes(1);
    expect(screen.getByText("We sent a new code to ca•••@example.test.")).toBeTruthy();
    expect(resend().textContent).toBe("Resend code in 60s");
  });

  it("can resend at once when the first code could not be sent", () => {
    renderStep({ codeJustSent: false, initialError: "We couldn't send a new code right now. Please try again in a moment." });
    expect((screen.getByRole("button", { name: "Resend code" }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.getByRole("alert").textContent).toContain("couldn't send");
  });

  it("maps verification failures to friendly text and never shows raw codes", async () => {
    const onVerify = vi.fn<(code: string) => Promise<OtpResult>>();
    const { input } = renderStep({ purpose: "sign-in", onVerify });
    const alertText = () => screen.getByRole("alert").textContent ?? "";

    onVerify.mockResolvedValueOnce({ ok: false, failure: { code: "INVALID_CODE", status: 401 } });
    await submitCode(input, "111111");
    expect(alertText()).toBe("That code isn't right. Check the email and try again.");
    expect(input.value).toBe("111111");

    onVerify.mockResolvedValueOnce({ ok: false, failure: { code: "OTP_HAS_EXPIRED", status: 400 } });
    await submitCode(input, "222222");
    expect(alertText()).toBe("This code has expired. Request a new code.");
    expect(input.value).toBe("");

    onVerify.mockResolvedValueOnce({ ok: false, failure: { code: "ACCOUNT_TEMPORARILY_LOCKED", status: 429 } });
    await submitCode(input, "333333");
    expect(alertText()).toContain("paused for 15 minutes");

    onVerify.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await submitCode(input, "444444");
    expect(alertText()).toBe("We couldn't reach the server. Check your connection and try again.");
    expect(document.body.textContent).not.toMatch(/INVALID_CODE|OTP_HAS_EXPIRED|ACCOUNT_TEMPORARILY_LOCKED|Failed to fetch/);
  });

  it("explains a rate-limited resend and calls onBack from the back link", async () => {
    const onResend = vi.fn(async (): Promise<OtpResult> => ({ ok: false, failure: { status: 429 } }));
    const { props } = renderStep({ codeJustSent: false, onResend });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Resend code" }));
    });
    expect(screen.getByRole("alert").textContent).toBe(
      "You've asked for several codes. Please wait a minute before requesting another."
    );
    fireEvent.click(screen.getByRole("button", { name: /Back to sign in/ }));
    expect(props.onBack).toHaveBeenCalled();
  });

  it("helpers: masking, input normalisation and error text", () => {
    expect(maskEmail("jane.doe@example.com")).toBe("ja•••@example.com");
    expect(maskEmail("j@example.com")).toBe("j•••@example.com");
    expect(normalizeOtpInput("GARA 2026: your code is 654321.")).toBe("654321");
    expect(normalizeOtpInput("12-34-56")).toBe("123456");
    for (const code of ["INVALID_OTP", "OTP_EXPIRED", "TOO_MANY_ATTEMPTS", "INVALID_TWO_FACTOR_COOKIE", "SOMETHING_NEW"]) {
      const text = describeOtpError({ code }, "verify");
      expect(text).not.toContain(code);
      expect(text.length).toBeGreaterThan(10);
    }
    expect(describeGoogleSignInError("account_not_linked")).toContain("Sign in with your email and password first");
    expect(describeGoogleSignInError("<b>weird</b>")).not.toContain("weird");
    expect(describeGoogleSignInError(null)).toBeNull();
  });
});

// ─── Sign-in and sign-up branching ──────────────────────────────────────────

function renderAuthScreen(initialMode: "login" | "register") {
  return render(React.createElement(AuthSplitScreen, { initialMode }));
}

function byId<T extends HTMLElement>(container: HTMLElement, id: string): T {
  const element = container.querySelector<T>(`#${id}`);
  if (!element) throw new Error(`#${id} not found`);
  return element;
}

async function submitLogin(container: HTMLElement, email: string, password: string): Promise<void> {
  const emailInput = byId<HTMLInputElement>(container, "auth-split-screen-login-email-address");
  fireEvent.change(emailInput, { target: { value: email } });
  fireEvent.change(byId(container, "auth-split-screen-login-password"), { target: { value: password } });
  await act(async () => {
    fireEvent.submit(emailInput.closest("form") as HTMLFormElement);
  });
}

async function verifyInDesktopStep(container: HTMLElement, idPrefix: string, code: string, submitName: string): Promise<void> {
  const input = byId<HTMLInputElement>(container, `${idPrefix}-code`);
  fireEvent.change(input, { target: { value: code } });
  const form = input.closest("form") as HTMLFormElement;
  const submit = Array.from(form.querySelectorAll("button")).find((button) => button.textContent === submitName);
  expect(submit).toBeDefined();
  await act(async () => {
    fireEvent.click(submit as HTMLButtonElement);
  });
}

describe("AuthSplitScreen sign-in branching", () => {
  it("switches to the verify-email step when the account is not verified yet", async () => {
    h.authClient.signIn.email.mockResolvedValue({
      data: null,
      error: { code: "EMAIL_NOT_VERIFIED", status: 403, message: "Email not verified" },
    });
    h.authClient.emailOtp.verifyEmail.mockResolvedValue({ data: { status: true }, error: null });
    const { container } = renderAuthScreen("login");

    await submitLogin(container, " Member@Example.test ", "Strong-Pass-123!");

    // The same step renders in the desktop panel and the mobile layout.
    expect(screen.getAllByRole("heading", { name: "Verify your email" })).toHaveLength(2);
    expect(screen.getAllByLabelText("Verification code")).toHaveLength(2);
    const desktopInput = byId(container, "auth-split-screen-login-otp-code");
    expect(desktopInput.closest("[inert]")).toBeNull();
    expect(byId(container, "auth-split-screen-register-email-address").closest("[inert]")).not.toBeNull();
    expect(h.authClient.twoFactor.sendOtp).not.toHaveBeenCalled();

    await verifyInDesktopStep(container, "auth-split-screen-login-otp", "123456", "Verify email");
    expect(h.authClient.emailOtp.verifyEmail).toHaveBeenCalledWith({ email: "member@example.test", otp: "123456" });
    expect(h.getPostLoginRedirectAction).toHaveBeenCalled();
    expect(h.router.replace).toHaveBeenCalledWith("/candidate/dashboard");
  });

  it("emails and asks for the sign-in code when the password step returns twoFactorRedirect", async () => {
    h.authClient.signIn.email.mockResolvedValue({ data: { twoFactorRedirect: true, twoFactorMethods: ["otp"] }, error: null });
    h.authClient.twoFactor.sendOtp.mockResolvedValue({ data: { status: true }, error: null });
    h.authClient.twoFactor.verifyOtp.mockResolvedValue({ data: { token: "t" }, error: null });
    h.getPostLoginRedirectAction.mockResolvedValue({ redirectTo: "/admin", mustChangePassword: false });
    const { container } = renderAuthScreen("login");

    await submitLogin(container, "admin@example.test", "Strong-Pass-123!");

    expect(h.authClient.twoFactor.sendOtp).toHaveBeenCalledTimes(1);
    expect(h.authClient.twoFactor.sendOtp).toHaveBeenCalledWith();
    expect(screen.getAllByRole("heading", { name: "Enter the code we emailed you" })).toHaveLength(2);
    expect(h.router.replace).not.toHaveBeenCalled();

    await verifyInDesktopStep(container, "auth-split-screen-login-otp", "654321", "Verify and sign in");
    expect(h.authClient.twoFactor.verifyOtp).toHaveBeenCalledWith({ code: "654321" });
    expect(h.router.replace).toHaveBeenCalledWith("/admin");
  });

  it("still shows the code step, with a retry, when the first sign-in code could not be sent", async () => {
    h.authClient.signIn.email.mockResolvedValue({ data: { twoFactorRedirect: true }, error: null });
    h.authClient.twoFactor.sendOtp.mockResolvedValue({ data: null, error: { status: 500, message: "SMTP stack trace" } });
    const { container } = renderAuthScreen("login");

    await submitLogin(container, "admin@example.test", "Strong-Pass-123!");

    expect(screen.getAllByText("We couldn't send a new code right now. Please try again in a moment.")).toHaveLength(2);
    expect(container.textContent).not.toContain("SMTP stack trace");
  });

  it("shows friendly sign-in errors, never the server message, and no code step", async () => {
    h.authClient.signIn.email.mockResolvedValueOnce({
      data: null,
      error: { code: "INVALID_EMAIL_OR_PASSWORD", status: 401, message: "Invalid email or password" },
    });
    const { container } = renderAuthScreen("login");
    await submitLogin(container, "member@example.test", "wrong");
    expect(screen.getAllByText("Invalid email or password. Please try again.").length).toBeGreaterThan(0);
    expect(screen.queryAllByLabelText("Verification code")).toHaveLength(0);

    h.authClient.signIn.email.mockResolvedValueOnce({
      data: null,
      error: { code: "FAILED_TO_CREATE_SESSION", status: 500, message: "TypeError at internal-adapter.mjs:42" },
    });
    await submitLogin(container, "member@example.test", "Strong-Pass-123!");
    expect(container.textContent).not.toContain("internal-adapter");
    expect(screen.getAllByText("We couldn't sign you in. Please try again.").length).toBeGreaterThan(0);
  });

  it("goes back to the password form from the code step", async () => {
    h.authClient.signIn.email.mockResolvedValue({ data: { twoFactorRedirect: true }, error: null });
    h.authClient.twoFactor.sendOtp.mockResolvedValue({ data: { status: true }, error: null });
    const { container } = renderAuthScreen("login");
    await submitLogin(container, "admin@example.test", "Strong-Pass-123!");

    fireEvent.click(screen.getAllByRole("button", { name: /Back to sign in/ })[0] as HTMLElement);

    expect(screen.queryAllByLabelText("Verification code")).toHaveLength(0);
    expect(byId<HTMLInputElement>(container, "auth-split-screen-login-email-address").value).toBe("admin@example.test");
    expect(byId<HTMLInputElement>(container, "auth-split-screen-login-password").value).toBe("");
  });

  it("explains a Google sign-in that could not link to an unverified password account", () => {
    h.search.value = "error=account_not_linked";
    renderAuthScreen("login");
    expect(screen.getAllByText(/Sign in with your email and password first/).length).toBeGreaterThan(0);
    expect(document.body.textContent).not.toContain("account_not_linked");
  });
});

describe("AuthSplitScreen sign-up", () => {
  it("sends the career interest with sign-up, then asks for the emailed code and signs in", async () => {
    h.authClient.signUp.email.mockResolvedValue({ data: { token: null, user: {} }, error: null });
    h.authClient.emailOtp.verifyEmail.mockResolvedValue({ data: { status: true }, error: null });
    h.authClient.emailOtp.sendVerificationOtp.mockResolvedValue({ data: { success: true }, error: null });
    const { container } = renderAuthScreen("register");

    fireEvent.change(byId(container, "auth-split-screen-register-full-name"), { target: { value: "New Candidate" } });
    const emailInput = byId<HTMLInputElement>(container, "auth-split-screen-register-email-address");
    fireEvent.change(emailInput, { target: { value: "New@Example.test" } });
    fireEvent.change(byId(container, "auth-split-screen-register-password"), { target: { value: "Strong-Pass-123!" } });
    const form = emailInput.closest("form") as HTMLFormElement;
    fireEvent.click(form.querySelector('input[name="register-interest"][value="INTERNSHIP"]') as HTMLInputElement);
    fireEvent.click(form.querySelector('input[type="checkbox"]') as HTMLInputElement);
    await act(async () => {
      fireEvent.submit(form);
    });

    expect(h.authClient.signUp.email).toHaveBeenCalledWith({
      name: "New Candidate",
      email: "new@example.test",
      password: "Strong-Pass-123!",
      careerInterest: "INTERNSHIP",
    });
    expect(screen.getAllByRole("heading", { name: "Verify your email" })).toHaveLength(2);
    expect(byId(container, "auth-split-screen-register-otp-code").closest("[inert]")).toBeNull();
    expect(screen.getAllByText("ne•••@example.test")).toHaveLength(2);

    await verifyInDesktopStep(container, "auth-split-screen-register-otp", "123456", "Verify email");
    expect(h.authClient.emailOtp.verifyEmail).toHaveBeenCalledWith({ email: "new@example.test", otp: "123456" });
    expect(h.router.replace).toHaveBeenCalledWith("/candidate/dashboard");
  });

  it("returns to the form with 'Use a different email'", async () => {
    h.authClient.signUp.email.mockResolvedValue({ data: { token: null, user: {} }, error: null });
    const { container } = renderAuthScreen("register");
    const emailInput = byId<HTMLInputElement>(container, "auth-split-screen-register-email-address");
    fireEvent.change(byId(container, "auth-split-screen-register-full-name"), { target: { value: "New Candidate" } });
    fireEvent.change(emailInput, { target: { value: "typo@example.test" } });
    fireEvent.change(byId(container, "auth-split-screen-register-password"), { target: { value: "Strong-Pass-123!" } });
    const form = emailInput.closest("form") as HTMLFormElement;
    fireEvent.click(form.querySelector('input[name="register-interest"][value="JOB"]') as HTMLInputElement);
    fireEvent.click(form.querySelector('input[type="checkbox"]') as HTMLInputElement);
    await act(async () => {
      fireEvent.submit(form);
    });

    fireEvent.click(screen.getAllByRole("button", { name: /Use a different email/ })[0] as HTMLElement);
    expect(byId<HTMLInputElement>(container, "auth-split-screen-register-email-address").value).toBe("typo@example.test");
  });
});
