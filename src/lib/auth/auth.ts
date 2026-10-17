import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";

const authBaseUrl =
  (process.env.BETTER_AUTH_URL && !process.env.BETTER_AUTH_URL.includes("localhost"))
    ? process.env.BETTER_AUTH_URL
    : process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : (env.BETTER_AUTH_URL || "http://localhost:3000");

const trustedOrigins = [
  authBaseUrl,
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "https://gara-hiring-portal.vercel.app",
  "https://*.vercel.app",
];
if (process.env.BETTER_AUTH_URL && !trustedOrigins.includes(process.env.BETTER_AUTH_URL)) {
  trustedOrigins.push(process.env.BETTER_AUTH_URL);
}
if (process.env.VERCEL_URL) {
  const vercelOrigin = `https://${process.env.VERCEL_URL}`;
  if (!trustedOrigins.includes(vercelOrigin)) {
    trustedOrigins.push(vercelOrigin);
  }
}
if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
  const prodOrigin = `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  if (!trustedOrigins.includes(prodOrigin)) {
    trustedOrigins.push(prodOrigin);
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
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24,     // Refresh session every 24 hours
  },
  trustedOrigins,
  advanced: {
    useSecureCookies: authBaseUrl.startsWith("https://") || process.env.NODE_ENV === "production",
  },
  secret: env.BETTER_AUTH_SECRET,
  baseURL: authBaseUrl,
});
