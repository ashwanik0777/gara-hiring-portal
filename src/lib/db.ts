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

/**
 * Normalizes connection string to sslmode=verify-full if sslmode=require is supplied.
 * Eliminates node-postgres pg v9 security warnings while guaranteeing rigorous certificate verification.
 */
function getNormalizedConnectionString(connectionString: string): string {
  if (connectionString.includes("sslmode=require")) {
    return connectionString.replace("sslmode=require", "sslmode=verify-full");
  }
  return connectionString;
}

const pool = new Pool({
  connectionString: getNormalizedConnectionString(env.DATABASE_URL),
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
