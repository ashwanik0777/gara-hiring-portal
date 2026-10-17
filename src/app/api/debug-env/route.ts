import { NextResponse } from "next/server";

/**
 * Temporary diagnostic endpoint — shows which env vars are set vs. missing on Vercel.
 * Masks actual values for security. DELETE THIS after debugging.
 */
export async function GET() {
  const mask = (val: string | undefined) => {
    if (!val) return "NOT SET";
    if (val.length <= 8) return `SET (${val.length} chars)`;
    return `SET (${val.length} chars): ${val.substring(0, 6)}...${val.substring(val.length - 4)}`;
  };

  return NextResponse.json({
    DATABASE_URL: mask(process.env.DATABASE_URL),
    BETTER_AUTH_SECRET: mask(process.env.BETTER_AUTH_SECRET),
    BETTER_AUTH_URL: mask(process.env.BETTER_AUTH_URL),
    GOOGLE_CLIENT_ID: mask(process.env.GOOGLE_CLIENT_ID),
    GOOGLE_CLIENT_SECRET: mask(process.env.GOOGLE_CLIENT_SECRET),
    SMTP_HOST: mask(process.env.SMTP_HOST),
    SMTP_PORT: mask(process.env.SMTP_PORT),
    SMTP_USER: mask(process.env.SMTP_USER),
    SMTP_PASS: mask(process.env.SMTP_PASS),
    SMTP_FROM: mask(process.env.SMTP_FROM),
    NODE_ENV: process.env.NODE_ENV,
    VERCEL: process.env.VERCEL,
    VERCEL_URL: mask(process.env.VERCEL_URL),
    VERCEL_PROJECT_PRODUCTION_URL: mask(process.env.VERCEL_PROJECT_PRODUCTION_URL),
  }, {
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}
