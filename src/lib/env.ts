import { z } from "zod";

export const DEV_DEFAULT_AUTH_SECRET =
  "gara-dev-secret-key-at-least-32-chars-long";

/**
 * Decodes the payout field-encryption key: exactly 32 bytes, given as 64 hex characters
 * or as base64 / base64url (44 characters with padding, 43 without). Returns null for
 * anything else, so a malformed key is rejected instead of silently weakened.
 */
export function decodePayoutEncryptionKey(value: string): Buffer | null {
  const trimmed = value.trim();
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    return Buffer.from(trimmed, "hex");
  }
  if (/^[A-Za-z0-9+/_-]{43}=?$/.test(trimmed)) {
    const decoded = Buffer.from(trimmed.replace(/-/g, "+").replace(/_/g, "/"), "base64");
    return decoded.length === 32 ? decoded : null;
  }
  return null;
}

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
  /**
   * How candidates provide documents. "link": an external share link (e.g. Google Drive),
   * used until the organisation runs its own storage server. "local": files uploaded to the
   * server's private disk (requires a persistent server and ALLOW_LOCAL_STORAGE_IN_PROD).
   */
  DOCUMENT_STORAGE_MODE: z.enum(["link", "local"]).default("link"),
  /**
   * Malware scanning for uploaded files (own-server deployments). "clamav" streams every
   * upload to a clamd daemon before it is stored and rejects the upload if clamd is
   * unreachable; "off" disables scanning (link mode stores no files).
   */
  VIRUS_SCAN_MODE: z.enum(["off", "clamav"]).default("off"),
  CLAMAV_HOST: z.string().default("127.0.0.1"),
  CLAMAV_PORT: z.coerce.number().int().min(1).max(65535).default(3310),
  /**
   * AES-256-GCM key for payout bank details (account number, PAN): 32 random bytes as
   * base64 or hex, e.g. `openssl rand -base64 32`. Without it, production refuses to save
   * those fields; development derives a local key from BETTER_AUTH_SECRET. An empty value
   * counts as not set.
   */
  PAYOUT_ENCRYPTION_KEY: z
    .string()
    .refine(
      (value) => value.trim() === "" || decodePayoutEncryptionKey(value) !== null,
      "PAYOUT_ENCRYPTION_KEY must be 32 bytes encoded as base64 (44 characters) or hex (64 characters)"
    )
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
      "CRON_SECRET is not configured, so the job runner endpoint (/api/jobs/run) cannot be authorized."
    );
  }

  if (currentEnv.DOCUMENT_STORAGE_MODE === "local" && currentEnv.VIRUS_SCAN_MODE === "off") {
    blockers.push(
      "Document uploads are enabled (DOCUMENT_STORAGE_MODE=local) but VIRUS_SCAN_MODE is off, so uploaded files are not malware-scanned."
    );
  }

  if (!currentEnv.PAYOUT_ENCRYPTION_KEY?.trim()) {
    blockers.push(
      "PAYOUT_ENCRYPTION_KEY is not configured, so payout bank details (account number, PAN) cannot be saved."
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
