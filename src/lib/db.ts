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

// In production or cloud deployments with remote databases (Supabase, Neon, Railway, RDS),
// enable SSL with rejectUnauthorized: false so cloud connection poolers connect seamlessly.
const pool = new Pool({
  connectionString: env.DATABASE_URL,
  ssl: !isLocalhost ? { rejectUnauthorized: false } : undefined,
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
