import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { emailOTP, twoFactor } from "better-auth/plugins";
import { after } from "next/server";
import { z } from "zod";
import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";
import { defaultRateLimiter, type RateLimitPolicy } from "@/lib/security/rate-limit";
import { RateLimitError } from "@/lib/errors";
import { CareerInterest } from "@/types/enums";
import { env } from "@/lib/env";
import { logger } from "@/lib/logging/logger";
import { NodemailerEmailAdapter } from "@/infrastructure/email/outbox-processor";
import {
  buildOtpCodeEmail,
  buildPasswordResetEmail,
  type OtpEmailPurpose,
} from "@/infrastructure/email/email-templates";

const PASSWORD_RESET_TOKEN_TTL_SECONDS = 60 * 60; // 1 hour

/**
 * Emailed one-time codes (product-owner decision 2026-10-26): a new email/password account
 * verifies its email with a code, and every password sign-in asks for a fresh code.
 */
export const OTP_LENGTH = 6;
export const OTP_TTL_MINUTES = 10;
/** Wrong guesses allowed per code; the two-factor plugin also locks the account after 10. */
export const OTP_ALLOWED_ATTEMPTS = 5;

/**
 * Endpoints that would bypass the decisions (password + emailed code at every password
 * sign-in, no trusted devices). They answer 404.
 */
export const DISABLED_AUTH_PATHS = [
  // Passwordless sign-in with only an emailed code would skip the password.
  "/sign-in/email-otp",
  // Email-OTP variants of password reset and email change; the reset keeps the emailed link.
  "/email-otp/request-password-reset",
  "/forget-password/email-otp",
  "/email-otp/reset-password",
  "/email-otp/request-email-change",
  "/email-otp/change-email",
  // Not used: the code is checked by /email-otp/verify-email.
  "/email-otp/check-verification-otp",
  // The emailed sign-in code cannot be switched off or replaced by the user.
  "/two-factor/enable",
  "/two-factor/disable",
  // Authenticator apps (TOTP) and backup codes are not offered.
  "/two-factor/get-totp-uri",
  "/two-factor/verify-totp",
  "/two-factor/generate-backup-codes",
  "/two-factor/verify-backup-code",
  // Link-based email verification is replaced by the emailed code.
  "/send-verification-email",
  "/verify-email",
  // Account changes the portal does not offer. The name feeds certificates and the offer
  // e-signature match, so it is changed only through staff-controlled records.
  "/update-user",
  "/change-email",
  "/change-password",
  "/delete-user",
  "/delete-user/callback",
  "/update-session",
  // Linked OAuth accounts and their tokens are never needed in the browser.
  "/link-social",
  "/unlink-account",
  "/list-accounts",
  "/account-info",
  "/get-access-token",
  "/refresh-token",
] as const;

/**
 * Per-IP limits for sending and checking codes (database storage, production only), on top
 * of the plugins' per-code attempt counters and the two-factor account lockout.
 */
export const OTP_RATE_LIMIT_RULES = {
  "/email-otp/send-verification-otp": { window: 60, max: 3 },
  "/two-factor/send-otp": { window: 60, max: 3 },
  "/email-otp/verify-email": { window: 60, max: 10 },
  "/two-factor/verify-otp": { window: 60, max: 10 },
} as const;

/** Two-factor endpoints whose `trustDevice` flag would let a device skip future codes. */
const TRUST_DEVICE_PATHS: ReadonlySet<string> = new Set(["/two-factor/send-otp", "/two-factor/verify-otp"]);

const authBaseUrl =
  (process.env.BETTER_AUTH_URL && !process.env.BETTER_AUTH_URL.includes("localhost"))
    ? process.env.BETTER_AUTH_URL
    : process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : (env.BETTER_AUTH_URL || "http://localhost:3000");

/**
 * Explicit allow-list of origins. No wildcards: a pattern such as `*.vercel.app`
 * would trust every site hosted on Vercel for redirects and origin checks.
 */
function buildTrustedOrigins(): string[] {
  const origins = new Set<string>([authBaseUrl]);
  if (process.env.BETTER_AUTH_URL) {
    origins.add(process.env.BETTER_AUTH_URL);
  }
  if (process.env.VERCEL_URL) {
    origins.add(`https://${process.env.VERCEL_URL}`);
  }
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    origins.add(`https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`);
  }
  if (process.env.NODE_ENV !== "production") {
    origins.add("http://localhost:3000");
    origins.add("http://127.0.0.1:3000");
  }
  return Array.from(origins);
}

/**
 * Runs work after the response is sent so auth endpoints respond in the same time whether
 * or not the account exists (prevents timing-based enumeration).
 */
function runAfterResponse(task: () => Promise<void>, failureMessage: string): void {
  const guarded = async () => {
    try {
      await task();
    } catch (error) {
      logger.error(failureMessage, error);
    }
  };
  try {
    after(guarded);
  } catch {
    void guarded();
  }
}

/**
 * TEST-ONLY SEAM for the Playwright journey suite. Codes are stored hashed, so a test cannot
 * read them back from the database; with this seam every emailed code is a fixed value.
 * Returns that code, or null. It is active only when ALL of these hold:
 * - NODE_ENV is not "production" and the app is not running on Vercel;
 * - E2E_FIXED_OTP is exactly six digits;
 * - E2E_DATABASE_URL is set and is the database this app is connected to (DATABASE_URL),
 *   i.e. Playwright started this server against the database it validated;
 * - that database's host or name contains "test" (the naming rule enforced by
 *   tests/e2e/support/database-guard.ts, which also refuses the `.env` database).
 * A production build therefore always issues random codes.
 */
export function resolveFixedTestOtp(
  source: Readonly<Record<string, string | undefined>> = process.env
): string | null {
  if (source.NODE_ENV === "production" || source.VERCEL) {
    return null;
  }
  const code = source.E2E_FIXED_OTP?.trim();
  if (!code || code.length !== OTP_LENGTH || !/^\d+$/.test(code)) {
    return null;
  }
  const e2eDatabaseUrl = source.E2E_DATABASE_URL?.trim();
  if (!e2eDatabaseUrl || e2eDatabaseUrl !== source.DATABASE_URL?.trim()) {
    return null;
  }
  try {
    const url = new URL(e2eDatabaseUrl);
    const host = url.hostname.toLowerCase();
    const database = decodeURIComponent(url.pathname.replace(/^\//, "")).toLowerCase();
    return host.includes("test") || database.includes("test") ? code : null;
  } catch {
    return null;
  }
}

const fixedTestOtp = resolveFixedTestOtp();
if (fixedTestOtp) {
  logger.warn("Test-only fixed one-time code is active (dedicated E2E database).");
}

type TwoFactorOtpStore =
  | "hashed"
  | { encrypt: (code: string) => Promise<string>; decrypt: (stored: string) => Promise<string> };

function twoFactorOtpStore(fixedCode: string | null): TwoFactorOtpStore {
  if (!fixedCode) {
    return "hashed";
  }
  // Test seam only (see resolveFixedTestOtp): the two-factor plugin has no code generator
  // hook, so a marker is stored and every challenge accepts only the fixed code.
  return {
    encrypt: async () => "e2e-fixed-otp",
    decrypt: async () => fixedCode,
  };
}

/** Error name and code only: a transport error message could echo message content. */
function describeDeliveryFailure(error: unknown): Record<string, string> {
  if (error instanceof Error) {
    const code = "code" in error && typeof error.code === "string" ? error.code : undefined;
    return code ? { errorName: error.name, errorCode: code } : { errorName: error.name };
  }
  return { errorName: typeof error };
}

export interface OtpEmailRequest {
  email: string;
  name?: string | null;
  code: string;
  purpose: OtpEmailPurpose;
}

/**
 * Emails a one-time code directly (codes are time-critical, so not through the outbox).
 * Verification codes go only to accounts that still need verifying; the endpoint answers
 * the same either way. Never logs the code; delivery failures are logged without it.
 */
export async function deliverOtpEmail(request: OtpEmailRequest): Promise<void> {
  try {
    let name = request.name ?? null;
    if (request.purpose === "verify-email") {
      const account = await prisma.user.findUnique({
        where: { email: request.email.toLowerCase() },
        select: { name: true, emailVerified: true },
      });
      if (!account || account.emailVerified) {
        return;
      }
      name = account.name;
    }
    const message = buildOtpCodeEmail({
      name,
      code: request.code,
      purpose: request.purpose,
      expiresInMinutes: OTP_TTL_MINUTES,
    });
    await new NodemailerEmailAdapter().sendEmail({
      to: request.email,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
  } catch (error) {
    logger.error("One-time code email delivery failed", undefined, {
      purpose: request.purpose,
      ...describeDeliveryFailure(error),
    });
  }
}

function scheduleOtpEmail(request: OtpEmailRequest): void {
  runAfterResponse(() => deliverOtpEmail(request), "One-time code email delivery failed");
}

/**
 * Placeholder two-factor row so the plugin's account lockout applies to the user. The
 * secret and backup codes are random/empty and unused (TOTP and backup codes are off).
 */
function twoFactorLockoutRow(userId: string) {
  return { userId, secret: randomBytes(32).toString("base64url"), backupCodes: "[]" };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Same values as CareerInterestSchema (src/features/lifecycle/schemas.ts), built from the
 * shared enum because src/lib must not import feature modules; a unit test keeps them equal.
 */
const careerInterestInput = z.enum(CareerInterest);

/**
 * What a new account signed up for: `careerInterest` from the `/sign-up/email` body (Better
 * Auth passes extra body fields through without writing them to the user row). Invalid or
 * missing values, and every other creation path (Google), give null ("not chosen").
 */
function signUpCareerInterest(context: { path?: string; body?: unknown } | null | undefined): CareerInterest | null {
  if (context?.path !== "/sign-up/email" || !isRecord(context.body)) {
    return null;
  }
  const parsed = careerInterestInput.safeParse(context.body.careerInterest);
  return parsed.success ? parsed.data : null;
}

/**
 * Runs once for every account Better Auth creates (email sign-up and Google). Staff created
 * by an administrator (src/features/subadmins/actions.ts) do not pass through here. Each step
 * is independent and idempotent; a failure is logged and does not undo the sign-up.
 */
async function provisionNewAccount(
  user: { id: string },
  context: { path?: string; body?: unknown } | null | undefined
): Promise<void> {
  try {
    await prisma.twoFactor.create({ data: twoFactorLockoutRow(user.id) });
  } catch (error) {
    logger.error("Could not create the two-factor lockout record", error, { userId: user.id });
  }
  // The candidate profile exists from sign-up, so registration analytics also count
  // accounts that have not verified their email or applied yet.
  const careerInterest = signUpCareerInterest(context);
  try {
    await prisma.candidateProfile.upsert({
      where: { userId: user.id },
      create: { userId: user.id, careerInterest },
      // Never replaces a chosen interest with "not chosen".
      update: careerInterest ? { careerInterest } : {},
    });
  } catch (error) {
    logger.error("Could not create the candidate profile", error, { userId: user.id });
  }
}

/**
 * Per-address limits for the public email-verification code endpoints, on top of the per-IP
 * rules: an attacker rotating IP addresses still gets only a handful of codes and guesses
 * per account per hour.
 */
export const OTP_EMAIL_RATE_LIMITS = {
  SEND: { scope: "auth:otp_send_per_email", maxRequests: 5, windowSeconds: 60 * 60 },
  VERIFY: { scope: "auth:otp_verify_per_email", maxRequests: 15, windowSeconds: 60 * 60 },
} satisfies Record<string, RateLimitPolicy>;

function normalizedEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  return email.length > 0 && email.length <= 320 ? email : null;
}

/** Only a hash of the address is stored with the rate-limit counters. */
async function enforcePerAddressLimit(email: string, policy: RateLimitPolicy): Promise<void> {
  const actor = createHash("sha256").update(email).digest("hex");
  try {
    await defaultRateLimiter.enforce(actor, policy);
  } catch (error) {
    if (error instanceof RateLimitError) {
      throw new APIError("TOO_MANY_REQUESTS", {
        code: "TOO_MANY_ATTEMPTS",
        message: "Too many attempts. Please wait a while and try again.",
      });
    }
    throw error;
  }
}

/** True only for an existing email/password account whose email is not verified yet. */
async function accountAwaitsEmailVerification(email: string): Promise<boolean> {
  const account = await prisma.user.findUnique({ where: { email }, select: { emailVerified: true } });
  return Boolean(account && !account.emailVerified);
}

/**
 * Runs before every auth endpoint: no trusted devices (decision 2026-10-26); the public code
 * endpoints only serve accounts that still need to verify their email. Without that check
 * `/email-otp/verify-email` (which signs the person in) would let anyone who guesses a code
 * sign in to an already verified account without its password.
 */
const enforceOtpDecisions = createAuthMiddleware(async (ctx) => {
  const body = isRecord(ctx.body) ? ctx.body : {};
  if (TRUST_DEVICE_PATHS.has(ctx.path) && body.trustDevice !== undefined && body.trustDevice !== false) {
    throw new APIError("BAD_REQUEST", {
      code: "TRUSTED_DEVICE_NOT_SUPPORTED",
      message: "Trusted devices are not supported. A code is required at every sign-in.",
    });
  }
  if (ctx.path === "/email-otp/send-verification-otp") {
    if (body.type !== "email-verification") {
      throw new APIError("BAD_REQUEST", {
        code: "OTP_TYPE_NOT_SUPPORTED",
        message: "Only email verification codes can be requested.",
      });
    }
    const email = normalizedEmail(body.email);
    if (!email) return; // the endpoint rejects a missing or malformed address itself
    await enforcePerAddressLimit(email, OTP_EMAIL_RATE_LIMITS.SEND);
    if (!(await accountAwaitsEmailVerification(email))) {
      // Same answer as a real send, so nothing reveals whether the account exists; no code
      // is created for unknown or already verified accounts.
      return ctx.json({ success: true });
    }
    return;
  }
  if (ctx.path === "/email-otp/verify-email") {
    const email = normalizedEmail(body.email);
    if (!email) return;
    await enforcePerAddressLimit(email, OTP_EMAIL_RATE_LIMITS.VERIFY);
    if (!(await accountAwaitsEmailVerification(email))) {
      throw new APIError("BAD_REQUEST", { code: "INVALID_OTP", message: "Invalid OTP" });
    }
  }
});

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    maxPasswordLength: 128,
    // Sign-in answers EMAIL_NOT_VERIFIED (after the password check) until the code is entered.
    requireEmailVerification: true,
    resetPasswordTokenExpiresIn: PASSWORD_RESET_TOKEN_TTL_SECONDS,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) => {
      runAfterResponse(async () => {
        const email = buildPasswordResetEmail({
          name: user.name,
          resetUrl: url,
          expiresInMinutes: PASSWORD_RESET_TOKEN_TTL_SECONDS / 60,
        });
        await new NodemailerEmailAdapter().sendEmail({
          to: user.email,
          subject: email.subject,
          text: email.text,
          html: email.html,
        });
      }, "Password reset email delivery failed");
    },
    onPasswordReset: async ({ user }) => {
      // A completed reset replaces any temporary password, so the forced change is satisfied.
      await prisma.$transaction([
        prisma.user.update({
          where: { id: user.id },
          data: { mustChangePassword: false },
        }),
        prisma.auditLog.create({
          data: {
            actorId: user.id,
            action: "PASSWORD_RESET_COMPLETED",
            resourceType: "USER",
            resourceId: user.id,
          },
        }),
      ]);
    },
  },
  // The email-otp plugin (overrideDefaultEmailVerification) sends these as 6-digit codes.
  emailVerification: {
    sendOnSignUp: true,
    sendOnSignIn: true,
    autoSignInAfterVerification: true,
  },
  socialProviders: {
    google: {
      clientId: env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: env.GOOGLE_CLIENT_SECRET ?? "",
      enabled: Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET),
    },
  },
  account: {
    accountLinking: {
      enabled: true,
      trustedProviders: ["google"],
      // Google is never linked to a password account whose email is not verified yet (that
      // account may have been registered by someone else); the user verifies it first.
      requireLocalEmailVerified: true,
    },
    encryptOAuthTokens: true,
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24,     // Refresh session every 24 hours
    // No cookieCache: revocation (password reset, staff removal) applies immediately.
  },
  rateLimit: {
    enabled: process.env.NODE_ENV === "production",
    // Shared across serverless instances; per-instance memory is trivially bypassed.
    storage: "database",
    customRules: {
      ...OTP_RATE_LIMIT_RULES,
      // Reading the current session is a cheap lookup made on most page views; counting it
      // would add a database write to each of them without protecting anything.
      "/get-session": false,
    },
  },
  disabledPaths: [...DISABLED_AUTH_PATHS],
  hooks: {
    before: enforceOtpDecisions,
  },
  databaseHooks: {
    user: {
      create: {
        // The two-factor plugin's schema default is false; every account gets the code.
        before: async () => ({ data: { twoFactorEnabled: true } }),
        // `context` is the endpoint that created the user (its body holds careerInterest).
        after: async (user, context) => provisionNewAccount(user, context),
      },
    },
  },
  plugins: [
    emailOTP({
      overrideDefaultEmailVerification: true,
      otpLength: OTP_LENGTH,
      expiresIn: OTP_TTL_MINUTES * 60,
      allowedAttempts: OTP_ALLOWED_ATTEMPTS,
      storeOTP: "hashed",
      // No account is ever created by an emailed code.
      disableSignUp: true,
      ...(fixedTestOtp ? { generateOTP: () => fixedTestOtp } : {}),
      sendVerificationOTP: async ({ email, otp, type }) => {
        // Only email verification is reachable; the other code flows are disabled.
        if (type !== "email-verification") {
          return;
        }
        scheduleOtpEmail({ email, code: otp, purpose: "verify-email" });
      },
    }),
    twoFactor({
      // Matches only /sign-in/email (and username/phone sign-in, not enabled): Google sign-in
      // is not asked for a code.
      otpOptions: {
        period: OTP_TTL_MINUTES, // minutes
        digits: OTP_LENGTH,
        allowedAttempts: OTP_ALLOWED_ATTEMPTS,
        storeOTP: twoFactorOtpStore(fixedTestOtp),
        sendOTP: async ({ user, otp }) => {
          scheduleOtpEmail({ email: user.email, name: user.name, code: otp, purpose: "sign-in" });
        },
      },
      totpOptions: { disable: true },
      // Default thresholds: 10 consecutive failed codes lock sign-in for 15 minutes.
      accountLockout: { enabled: true },
    }),
  ],
  trustedOrigins: buildTrustedOrigins(),
  advanced: {
    useSecureCookies: authBaseUrl.startsWith("https://") || process.env.NODE_ENV === "production",
    ipAddress: {
      ipAddressHeaders: ["x-real-ip", "x-forwarded-for"],
    },
  },
  secret: env.BETTER_AUTH_SECRET,
  baseURL: authBaseUrl,
});
