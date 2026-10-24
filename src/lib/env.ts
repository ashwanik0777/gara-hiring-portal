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
  DATABASE_SSL_REJECT_UNAUTHORIZED: z.enum(["true", "false"]).optional(),
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
  CRON_SECRET: z
    .string()
    .min(16, "CRON_SECRET must be at least 16 characters long")
    .optional(),
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

  if (!currentEnv.CRON_SECRET) {
    blockers.push(
      "CRON_SECRET is not configured, so the notification outbox retry cron cannot be authorized."
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

function isCloudDeployment(): boolean {
  return Boolean(
    process.env.VERCEL ||
      process.env.RAILWAY_ENVIRONMENT ||
      process.env.RENDER ||
      process.env.AWS_EXECUTION_ENV ||
      process.env.FLY_APP_NAME ||
      process.env.NETLIFY
  );
}

/**
 * True while serving production traffic. `next build` also runs with
 * NODE_ENV=production but may not have runtime secrets, so it is excluded.
 */
function isProductionRuntime(): boolean {
  return (
    process.env.NODE_ENV === "production" &&
    process.env.NEXT_PHASE !== "phase-production-build"
  );
}

function validateEnv(): Env {
  // Ensure BETTER_AUTH_URL auto-resolves correctly on Vercel if not manually provided
  if (!process.env.BETTER_AUTH_URL || process.env.BETTER_AUTH_URL.includes("localhost")) {
    if (process.env.VERCEL || process.env.VERCEL_URL || process.env.VERCEL_PROJECT_PRODUCTION_URL) {
      process.env.BETTER_AUTH_URL = getInitialAuthUrl();
    }
  }

  const result = envSchema.safeParse(process.env);
  let parsed: Env;

  if (result.success) {
    parsed = result.data;
  } else {
    const invalidKeys = Array.from(
      new Set(result.error.issues.map((issue) => String(issue.path[0])))
    );

    if (isProductionRuntime()) {
      // Fail closed: never boot production with silently substituted defaults.
      throw new Error(
        `[Environment] Invalid or missing environment variables: ${invalidKeys.join(", ")}`
      );
    }

    console.error(
      `❌ [Environment Warning] Invalid environment variables (falling back to defaults for these keys only): ${invalidKeys.join(", ")}`
    );
    const sanitizedSource: Record<string, string | undefined> = { ...process.env };
    for (const key of invalidKeys) {
      delete sanitizedSource[key];
    }
    parsed = envSchema.parse(sanitizedSource);
  }

  if (isProductionRuntime()) {
    if (parsed.BETTER_AUTH_SECRET === DEV_DEFAULT_AUTH_SECRET) {
      throw new Error(
        "[Environment] BETTER_AUTH_SECRET must be configured with a unique high-entropy value in production."
      );
    }
    if (
      isCloudDeployment() &&
      (parsed.DATABASE_URL.includes("localhost") || parsed.DATABASE_URL.includes("127.0.0.1"))
    ) {
      throw new Error(
        "[Environment] DATABASE_URL points to localhost in a production cloud deployment."
      );
    }
  }

  return parsed;
}

export const env = validateEnv();
