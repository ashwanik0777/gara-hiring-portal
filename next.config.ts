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
    value: "camera=(), microphone=(), geolocation=()",
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
