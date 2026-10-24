import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { after } from "next/server";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { logger } from "@/lib/logging/logger";
import { NodemailerEmailAdapter } from "@/infrastructure/email/outbox-processor";
import { buildPasswordResetEmail } from "@/infrastructure/email/email-templates";

const PASSWORD_RESET_TOKEN_TTL_SECONDS = 60 * 60; // 1 hour

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
  const origins = new Set<string>([authBaseUrl, "https://gara-hiring-portal.vercel.app"]);
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
 * Runs work after the response is sent so the reset endpoint responds in the same
 * time whether or not the account exists (prevents timing-based enumeration).
 */
function runAfterResponse(task: () => Promise<void>): void {
  const guarded = async () => {
    try {
      await task();
    } catch (error) {
      logger.error("Password reset email delivery failed", error);
    }
  };
  try {
    after(guarded);
  } catch {
    void guarded();
  }
}

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    maxPasswordLength: 128,
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
      });
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
    },
    encryptOAuthTokens: true,
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24,     // Refresh session every 24 hours
  },
  rateLimit: {
    enabled: process.env.NODE_ENV === "production",
    // Shared across serverless instances; per-instance memory is trivially bypassed.
    storage: "database",
  },
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
