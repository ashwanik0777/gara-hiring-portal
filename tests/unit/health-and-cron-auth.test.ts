// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { mockEnv, db } = vi.hoisted(() => ({
  mockEnv: { CRON_SECRET: "cron-secret-value" as string | undefined, NODE_ENV: "production" },
  db: { $queryRaw: vi.fn() },
}));

vi.mock("@/lib/env", () => ({
  env: mockEnv,
  checkProductionReadiness: () => ({ ready: false, blockers: ["SMTP not configured"] }),
}));
vi.mock("@/lib/db", () => ({ prisma: db }));

import { hasCronSecret } from "@/lib/security/cron-auth";
import { GET as health } from "@/app/api/health/route";

function request(authorization?: string): NextRequest {
  return new NextRequest("http://localhost/api/health", {
    headers: authorization ? { authorization } : {},
  });
}

beforeEach(() => {
  mockEnv.CRON_SECRET = "cron-secret-value";
  db.$queryRaw.mockReset().mockResolvedValue([{ "?column?": 1 }]);
});

describe("hasCronSecret", () => {
  it("accepts only the exact bearer token", () => {
    expect(hasCronSecret("Bearer cron-secret-value")).toBe(true);
    expect(hasCronSecret("Bearer cron-secret-valuX")).toBe(false);
    expect(hasCronSecret("Bearer cron")).toBe(false);
    expect(hasCronSecret("cron-secret-value")).toBe(false);
    expect(hasCronSecret(null)).toBe(false);
  });

  it("fails closed while the secret is not configured", () => {
    mockEnv.CRON_SECRET = undefined;
    expect(hasCronSecret("Bearer ")).toBe(false);
    expect(hasCronSecret("Bearer undefined")).toBe(false);
  });
});

describe("GET /api/health", () => {
  it("tells anonymous callers only whether the service is up", async () => {
    const response = await health(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    const body = await response.json();
    expect(Object.keys(body).sort()).toEqual(["status", "timestamp"]);
    expect(body.status).toBe("ok");
  });

  it("returns configuration details only with the cron secret", async () => {
    const response = await health(request("Bearer cron-secret-value"));
    const body = await response.json();
    expect(body.environment).toBe("production");
    expect(body.checks.productionBlockers).toEqual(["SMTP not configured"]);
  });

  it("reports a degraded status without details when the database is down", async () => {
    db.$queryRaw.mockRejectedValue(new Error("connection refused"));
    const response = await health(request());
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ status: "degraded" });
  });
});
