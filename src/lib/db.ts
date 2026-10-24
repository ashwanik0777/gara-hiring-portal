import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { env } from "@/lib/env";

/**
 * Prisma Client singleton with PostgreSQL driver adapter.
 * Prevents multiple connection pools during Next.js Hot Module Replacement.
 */
declare global {
  var prismaGlobal: PrismaClient | undefined;
}

const isLocalhost =
  env.DATABASE_URL.includes("localhost") ||
  env.DATABASE_URL.includes("127.0.0.1");

// Standardize sslmode to avoid pg-connection-string security warnings when connecting to cloud DBs
const poolConnectionString = env.DATABASE_URL.replace(
  "sslmode=require",
  "sslmode=verify-full"
);

// Remote databases (Neon, Supabase, Railway, RDS) always use TLS with certificate
// verification. DATABASE_SSL_REJECT_UNAUTHORIZED=false is an explicit, documented
// opt-out for providers whose CA is not in the Node.js trust store.
const rejectUnauthorized = env.DATABASE_SSL_REJECT_UNAUTHORIZED !== "false";
const pool = new Pool({
  connectionString: poolConnectionString,
  ssl: !isLocalhost ? { rejectUnauthorized } : undefined,
  max: process.env.NODE_ENV === "production" ? 10 : 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});
const adapter = new PrismaPg(pool);

export const prisma =
  globalThis.prismaGlobal ??
  new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalThis.prismaGlobal = prisma;
}
