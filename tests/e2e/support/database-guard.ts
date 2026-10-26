import fs from "node:fs";
import path from "node:path";
import { parseEnv } from "node:util";

/**
 * Refuses any E2E database that could be a real one. The journey suite migrates and seeds
 * the database it is given, so it must be a dedicated, clearly named test database.
 */

interface DatabaseIdentity {
  host: string;
  port: string;
  database: string;
}

function parseDatabaseUrl(raw: string, label: string): DatabaseIdentity {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`[e2e] ${label} is not a valid PostgreSQL connection URL.`);
  }
  if (url.protocol !== "postgresql:" && url.protocol !== "postgres:") {
    throw new Error(`[e2e] ${label} must use the postgresql:// scheme.`);
  }
  return {
    // Neon exposes the same database on a "-pooler" host; treat both as one database.
    host: url.hostname.toLowerCase().replace("-pooler", ""),
    port: url.port || "5432",
    database: decodeURIComponent(url.pathname.replace(/^\//, "")).toLowerCase(),
  };
}

/** Host and database name only — never credentials — for log and error messages. */
export function describeDatabase(raw: string): string {
  try {
    const url = new URL(raw);
    return `${url.hostname}:${url.port || "5432"}/${url.pathname.replace(/^\//, "")}`;
  } catch {
    return "(unparseable URL)";
  }
}

/**
 * Throws unless `e2eUrl` differs from every application database URL and its host or
 * database name contains "test".
 */
export function assertDedicatedTestDatabase(
  e2eUrl: string,
  applicationUrls: Array<{ label: string; url: string | undefined }>
): void {
  const target = parseDatabaseUrl(e2eUrl, "E2E_DATABASE_URL");

  for (const { label, url } of applicationUrls) {
    if (!url) continue;
    if (url.trim() === e2eUrl.trim()) {
      throw new Error(`[e2e] Refusing to run: E2E_DATABASE_URL is identical to ${label}.`);
    }
    let other: DatabaseIdentity;
    try {
      other = parseDatabaseUrl(url, label);
    } catch {
      continue; // an unparseable application URL cannot be the same database
    }
    if (
      other.host === target.host &&
      other.port === target.port &&
      other.database === target.database
    ) {
      throw new Error(
        `[e2e] Refusing to run: E2E_DATABASE_URL points at the same database as ${label} (${describeDatabase(e2eUrl)}).`
      );
    }
  }

  if (!target.host.includes("test") && !target.database.includes("test")) {
    throw new Error(
      `[e2e] Refusing to run: the host or database name of E2E_DATABASE_URL must contain "test" (got ${describeDatabase(e2eUrl)}).`
    );
  }
}

/**
 * Validates E2E_DATABASE_URL (when set) against the application's DATABASE_URL from the
 * project's .env file and the environment. Returns the URL, or undefined when unset.
 * Called from playwright.config.ts (before the app server starts) and from global setup.
 */
export function resolveE2EDatabaseUrl(projectRoot: string): string | undefined {
  const e2eUrl = process.env.E2E_DATABASE_URL?.trim();
  if (!e2eUrl) return undefined;

  const envFile = path.join(projectRoot, ".env");
  const envFileUrl = fs.existsSync(envFile)
    ? parseEnv(fs.readFileSync(envFile, "utf8")).DATABASE_URL
    : undefined;

  assertDedicatedTestDatabase(e2eUrl, [
    { label: "DATABASE_URL in .env", url: envFileUrl },
    { label: "the DATABASE_URL environment variable", url: process.env.DATABASE_URL },
  ]);
  return e2eUrl;
}
