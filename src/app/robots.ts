import type { MetadataRoute } from "next";
import { connection } from "next/server";
import { absoluteUrl } from "@/lib/site-url";

/**
 * Private areas that crawlers must never index: staff consoles, self-service portals,
 * authentication screens, API routes, certificate lookups and the sign-in-only apply form.
 */
const ROBOTS_DISALLOWED_PATHS = [
  "/admin",
  "/subadmin",
  "/candidate",
  "/intern",
  "/hrms",
  "/dashboard",
  "/api",
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
  "/set-password",
  "/verify",
  "/careers/*/apply",
] as const;

export default async function robots(): Promise<MetadataRoute.Robots> {
  // Resolve the public origin at request time so the sitemap URL matches the deployment.
  await connection();
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/careers"],
        disallow: [...ROBOTS_DISALLOWED_PATHS],
      },
    ],
    sitemap: absoluteUrl("/sitemap.xml"),
  };
}
