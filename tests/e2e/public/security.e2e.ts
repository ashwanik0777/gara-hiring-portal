import { expect, test } from "@playwright/test";
import { isProductionServer } from "../support/env";

const PROTECTED_ROUTES = [
  { path: "/admin", callbackUrl: "/admin" },
  { path: "/subadmin", callbackUrl: "/subadmin" },
  { path: "/candidate/dashboard", callbackUrl: "/candidate/dashboard" },
  { path: "/hrms", callbackUrl: "/hrms" },
  { path: "/intern/dashboard", callbackUrl: "/intern/dashboard" },
];

test.describe("Protected routes", () => {
  for (const route of PROTECTED_ROUTES) {
    test(`${route.path} sends anonymous visitors to /login with a callbackUrl`, async ({
      page,
    }) => {
      await page.goto(route.path);

      await page.waitForURL((url) => url.pathname === "/login");
      const url = new URL(page.url());
      expect(url.searchParams.get("callbackUrl")).toBe(route.callbackUrl);
      // No protected content was rendered on the way.
      await expect(page.getByRole("button", { name: "Sign In", exact: true }).first()).toBeAttached();
    });
  }
});

test.describe("Security headers", () => {
  test("pages are served with the hardening headers", async ({ request }) => {
    const response = await request.get("/login");
    expect(response.ok()).toBe(true);
    const headers = response.headers();

    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(headers["permissions-policy"]).toContain("camera=()");
    expect(headers["strict-transport-security"]).toContain("max-age=");

    const csp = headers["content-security-policy"] ?? "";
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
  });

  test("the production CSP does not allow unsafe-eval", async ({ request }) => {
    test.skip(
      !isProductionServer,
      "React needs 'unsafe-eval' in development; run with E2E_SERVER_MODE=production after `npm run build`."
    );

    const response = await request.get("/login");
    const csp = response.headers()["content-security-policy"] ?? "";
    const scriptSrc = csp.split(";").find((directive) => directive.trim().startsWith("script-src"));
    expect(scriptSrc).toBeDefined();
    expect(scriptSrc).not.toContain("'unsafe-eval'");
  });
});

test.describe("Job runner endpoint", () => {
  test("/api/jobs/run rejects calls without the secret", async ({ request }) => {
    const anonymous = await request.get("/api/jobs/run");
    expect(anonymous.status()).toBe(401);
    expect(await anonymous.json()).toEqual({ error: "Unauthorized" });
    expect(anonymous.headers()["cache-control"]).toContain("no-store");

    const wrongSecret = await request.post("/api/jobs/run", {
      headers: { Authorization: "Bearer not-the-cron-secret-value" },
    });
    expect(wrongSecret.status()).toBe(401);
  });
});
