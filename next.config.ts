import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

// React needs 'unsafe-eval' only in development (error stack reconstruction).
// 'unsafe-inline' stays until a nonce-based CSP is adopted (requires dynamic rendering).
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const securityHeaders = [
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "X-Frame-Options",
    value: "DENY",
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()",
  },
  {
    // Pages opened from other sites get no window handle back to this one (and vice versa).
    key: "Cross-Origin-Opener-Policy",
    value: "same-origin",
  },
  {
    // Other sites cannot embed this app's responses (images, PDFs, JSON) in their pages.
    key: "Cross-Origin-Resource-Policy",
    value: "same-site",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  {
    key: "Content-Security-Policy",
    value: contentSecurityPolicy,
  },
];

/**
 * Production builds only: every *.vercel.app address of this project answers with a
 * permanent redirect to the canonical domain (the configured site URL), so search engines
 * index one copy of each page and shared links always show the real domain. API routes are
 * left alone so external cron calls and webhooks keep working on any host. Read at build
 * time, when Vercel provides VERCEL_ENV and the site URL.
 */
function canonicalHostRedirects() {
  if (process.env.VERCEL_ENV !== "production") return [];
  const configured = process.env.BETTER_AUTH_URL;
  const origin =
    configured && !configured.includes("localhost")
      ? configured
      : process.env.VERCEL_PROJECT_PRODUCTION_URL
        ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
        : null;
  if (!origin) return [];

  let canonical: URL;
  try {
    canonical = new URL(origin);
  } catch {
    return [];
  }
  // Never redirect a vercel.app host to itself (that would loop).
  if (canonical.hostname.endsWith(".vercel.app")) return [];

  return [
    {
      source: "/:path((?!api(?:/|$)).*)",
      has: [{ type: "host" as const, value: ".+\\.vercel\\.app" }],
      destination: `${canonical.origin}/:path`,
      permanent: true,
    },
  ];
}

const nextConfig: NextConfig = {
  // Nothing identifies the framework in response headers.
  poweredByHeader: false,
  experimental: {
    agentFeedback: true,
    serverActions: {
      // Resume uploads allow 5 MB; leave room for multipart overhead.
      bodySizeLimit: "6mb",
    },
  },
  cacheComponents: true,
  partialPrefetching: true,
  serverExternalPackages: ["@prisma/client", "@prisma/adapter-pg", "pg"],
  async redirects() {
    return [
      ...canonicalHostRedirects(),
      {
        source: "/recruitment",
        destination: "/admin/applications",
        permanent: false,
      },
      {
        source: "/recruitment/:path*",
        destination: "/admin/:path*",
        permanent: false,
      },
      {
        source: "/candidate",
        destination: "/candidate/dashboard",
        permanent: false,
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
