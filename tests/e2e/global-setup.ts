import { execFileSync } from "node:child_process";
import path from "node:path";
import { describeDatabase, resolveE2EDatabaseUrl } from "./support/database-guard";

const ROOT = path.resolve(__dirname, "../..");

/**
 * Prepares the journey suite's database. Without E2E_DATABASE_URL it does nothing (the
 * journeys skip themselves). With it, it refuses anything that could be a real database,
 * applies the versioned migrations and seeds deterministic fixtures.
 */
export default async function globalSetup(): Promise<void> {
  // Throws for anything that could be a real database (checked again here, after the
  // config-time check, because this step writes to the database).
  const e2eDatabaseUrl = resolveE2EDatabaseUrl(ROOT);
  if (!e2eDatabaseUrl) {
    console.log("[e2e] E2E_DATABASE_URL is not set: database journeys will be skipped.");
    return;
  }

  console.log(`[e2e] Migrating test database ${describeDatabase(e2eDatabaseUrl)}`);
  execFileSync(
    path.join(ROOT, "node_modules", ".bin", "prisma"),
    ["migrate", "deploy", "--config", "prisma7.config.ts"],
    {
      cwd: ROOT,
      stdio: "inherit",
      // prisma7.config.ts loads .env with dotenv, which never overrides an exported value.
      env: { ...process.env, DATABASE_URL: e2eDatabaseUrl },
    }
  );

  console.log("[e2e] Seeding deterministic fixtures");
  // Loaded only here so database-free runs never load the Prisma client.
  const { seedE2EFixtures } = await import("./support/seed");
  await seedE2EFixtures(e2eDatabaseUrl);
}
