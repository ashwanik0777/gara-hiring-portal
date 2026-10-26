import { execFileSync } from "node:child_process";
import { defineConfig, devices } from "@playwright/test";
import { resolveE2EDatabaseUrl } from "./tests/e2e/support/database-guard";
import { E2E_FIXED_OTP } from "./tests/e2e/support/fixtures";

/**
 * End-to-end tests (tests/e2e).
 *
 * - Public suite: needs no database. The dev server is started with DATABASE_URL pointed
 *   at a closed local port, so no test can read or write a real database.
 * - Journey suite: runs only when E2E_DATABASE_URL names a dedicated test database (see
 *   tests/e2e/global-setup.ts for the guards); otherwise every journey is skipped.
 *
 * Optional variables:
 *   E2E_PORT         port of the app server (default: a free port picked at start-up)
 *   E2E_SERVER_MODE  "dev" (default, `next dev`) or "production" (`next start`; run
 *                    `npm run build` first). Production-only assertions skip in dev.
 *   E2E_DATABASE_URL dedicated test database for the journey suite
 */

/** Picks a free TCP port once; workers re-load this file and inherit the env value. */
function resolvePort(): number {
  if (!process.env.E2E_PORT) {
    const script =
      "const s=require('node:net').createServer();" +
      "s.listen(0,'127.0.0.1',()=>{process.stdout.write(String(s.address().port));s.close();});";
    process.env.E2E_PORT = execFileSync(process.execPath, ["-e", script], {
      encoding: "utf8",
    }).trim();
  }
  const port = Number(process.env.E2E_PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`E2E_PORT must be a TCP port number, received "${process.env.E2E_PORT}".`);
  }
  return port;
}

const port = resolvePort();
const baseURL = `http://localhost:${port}`;
const serverMode = process.env.E2E_SERVER_MODE === "production" ? "production" : "dev";
process.env.E2E_SERVER_MODE = serverMode;

// Validated before the app server starts: a non-test database is refused outright.
const e2eDatabaseUrl = resolveE2EDatabaseUrl(__dirname);
// Nothing listens on port 1: database calls fail fast instead of reaching .env's database.
const NO_DATABASE_URL = "postgresql://e2e_no_database:unused@127.0.0.1:1/e2e_no_database";

export default defineConfig({
  testDir: "tests/e2e",
  // *.e2e.ts (not *.spec.ts / *.test.ts) so Vitest never collects these files.
  testMatch: "**/*.e2e.ts",
  globalSetup: "./tests/e2e/global-setup.ts",
  // Artifacts stay under the git-ignored tests/ directory.
  outputDir: "tests/.e2e-results",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 1,
  workers: process.env.CI ? 2 : undefined,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI
    ? [["list"], ["html", { open: "never", outputFolder: "tests/.e2e-report" }]]
    : [["list"]],
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    // The first request to a route compiles it in dev mode.
    navigationTimeout: 45_000,
    actionTimeout: 15_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "mobile-375",
      // Database journeys run once, on desktop; the mobile project covers public pages.
      testIgnore: "**/journeys/**",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 375, height: 667 },
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
        userAgent: devices["Pixel 5"].userAgent,
      },
    },
  ],
  webServer: {
    command:
      serverMode === "production"
        ? `npm run start -- --port ${port}`
        : `npm run dev -- --port ${port}`,
    url: `${baseURL}/login`,
    // Never reuse a server for the journeys: it could be connected to another database.
    reuseExistingServer: !process.env.CI && !e2eDatabaseUrl,
    timeout: 240_000,
    stdout: "ignore",
    stderr: "pipe",
    env: {
      DATABASE_URL: e2eDatabaseUrl ?? NO_DATABASE_URL,
      // Test-only fixed one-time code for the journeys. The server ignores it unless it runs
      // outside production on this same dedicated test database (resolveFixedTestOtp in
      // src/lib/auth/auth.ts); without a test database it is cleared.
      E2E_DATABASE_URL: e2eDatabaseUrl ?? "",
      E2E_FIXED_OTP: e2eDatabaseUrl ? E2E_FIXED_OTP : "",
      BETTER_AUTH_URL: baseURL,
      // Outbound email must never leave a test run.
      SMTP_HOST: "127.0.0.1",
      SMTP_PORT: "1",
      SMTP_USER: "",
      SMTP_PASS: "",
      DOCUMENT_STORAGE_MODE: "link",
      VIRUS_SCAN_MODE: "off",
      NEXT_TELEMETRY_DISABLED: "1",
    },
  },
});
