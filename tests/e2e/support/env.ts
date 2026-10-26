/** True when the journey suite has a dedicated test database (see global-setup.ts). */
export const hasE2EDatabase = Boolean(process.env.E2E_DATABASE_URL?.trim());

/** True when the app under test is a production build (`next start`). */
export const isProductionServer = process.env.E2E_SERVER_MODE === "production";

export const NO_DATABASE_SKIP_REASON =
  "Needs E2E_DATABASE_URL (a dedicated test database); skipped without one.";

/**
 * Journeys sign in with the fixed test code, which a production build (`next start`) never
 * accepts (see resolveFixedTestOtp in src/lib/auth/auth.ts).
 */
export const PRODUCTION_OTP_SKIP_REASON =
  "Sign-in needs the emailed code; the fixed test code is disabled in production builds.";
