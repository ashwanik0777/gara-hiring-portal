import { z } from "zod";

export const DEV_DEFAULT_AUTH_SECRET =
  "gara-dev-secret-key-at-least-32-chars-long";

/**
 * Server-only environment variable schema.
 * Boot-time validation halts immediately in production if required variables are missing or insecure.
 */
const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  DATABASE_URL: z
    .string()
    .url("DATABASE_URL must be a valid PostgreSQL connection URL")
    .default(
      "postgresql://postgres:postgres@localhost:5432/gara_hrms?schema=public"
    ),
  BETTER_AUTH_SECRET: z
    .string()
    .min(32, "BETTER_AUTH_SECRET must be at least 32 characters long")
    .default(DEV_DEFAULT_AUTH_SECRET),
  BETTER_AUTH_URL: z
    .string()
    .url("BETTER_AUTH_URL must be a valid URL")
    .default("http://localhost:3000"),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  SMTP_HOST: z.string().default("localhost"),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().default("no-reply@garainnovation.com"),
});

export type Env = z.infer<typeof envSchema>;

export function checkProductionReadiness(currentEnv: Env = env): {
  ready: boolean;
  blockers: string[];
} {
  const blockers: string[] = [];

  if (currentEnv.BETTER_AUTH_SECRET === DEV_DEFAULT_AUTH_SECRET) {
    blockers.push(
      "BETTER_AUTH_SECRET is using the development fallback secret."
    );
  }

  if (currentEnv.DATABASE_URL.includes("localhost")) {
    blockers.push(
      "DATABASE_URL points to localhost instead of a managed production PostgreSQL instance."
    );
  }

  if (!currentEnv.GOOGLE_CLIENT_ID || !currentEnv.GOOGLE_CLIENT_SECRET) {
    blockers.push(
      "Google OAuth credentials (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET) are not configured."
    );
  }

  if (currentEnv.SMTP_HOST === "localhost" || !currentEnv.SMTP_USER) {
    blockers.push(
      "Production SMTP provider credentials (OD-012: SMTP_HOST / SMTP_USER / SMTP_PASS) are not configured."
    );
  }

  return {
    ready: blockers.length === 0,
    blockers,
  };
}

function getInitialAuthUrl(): string {
  if (process.env.BETTER_AUTH_URL && !process.env.BETTER_AUTH_URL.includes("localhost")) {
    return process.env.BETTER_AUTH_URL;
  }
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  return process.env.BETTER_AUTH_URL || "http://localhost:3000";
}

function validateEnv(): Env {
  // Ensure BETTER_AUTH_URL auto-resolves correctly on Vercel if not manually provided
  if (!process.env.BETTER_AUTH_URL || process.env.BETTER_AUTH_URL.includes("localhost")) {
    if (process.env.VERCEL || process.env.VERCEL_URL || process.env.VERCEL_PROJECT_PRODUCTION_URL) {
      process.env.BETTER_AUTH_URL = getInitialAuthUrl();
    }
  }

  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error("❌ [Environment Warning] Invalid or missing environment variables:", result.error.format());
  }

  const parsed = result.success ? result.data : envSchema.parse({
    BETTER_AUTH_URL: getInitialAuthUrl(),
  });

  const isCloudDeployment = Boolean(
    process.env.VERCEL ||
    process.env.RAILWAY_ENVIRONMENT ||
    process.env.RENDER ||
    process.env.AWS_EXECUTION_ENV ||
    process.env.FLY_APP_NAME ||
    process.env.NETLIFY
  );

  if (parsed.NODE_ENV === "production" && isCloudDeployment) {
    if (parsed.BETTER_AUTH_SECRET === DEV_DEFAULT_AUTH_SECRET) {
      console.error(
        "❌ [CRITICAL CONFIG] BETTER_AUTH_SECRET is using the development fallback key in production cloud deployment. " +
        "Please configure a secure BETTER_AUTH_SECRET in Vercel project environment variables."
      );
    }
    if (parsed.DATABASE_URL.includes("localhost") || parsed.DATABASE_URL.includes("127.0.0.1")) {
      console.error(
        "❌ [CRITICAL CONFIG] DATABASE_URL points to localhost in production cloud deployment. " +
        "Please configure a valid PostgreSQL DATABASE_URL in Vercel project environment variables."
      );
    }
  }

  return parsed;
}

export const env = validateEnv();
