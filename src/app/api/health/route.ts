import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { checkProductionReadiness, env } from "@/lib/env";
import { hasCronSecret } from "@/lib/security/cron-auth";
import { FAQ_KNOWLEDGE_VERSION } from "@/infrastructure/ai/faq-knowledge-base";

const NO_STORE = {
  "Cache-Control": "no-store, max-age=0",
  "X-Content-Type-Options": "nosniff",
};

/**
 * Liveness for uptime monitors. The public answer is only `status` and a timestamp; the
 * configuration details (environment, readiness, policy gates) are returned only to callers
 * presenting `Authorization: Bearer <CRON_SECRET>`, so the endpoint gives attackers nothing
 * to map the deployment with.
 */
export async function GET(request: NextRequest) {
  let databaseReachable = false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    databaseReachable = true;
  } catch {
    databaseReachable = false;
  }

  const status = databaseReachable ? "ok" : "degraded";
  const timestamp = new Date().toISOString();
  const httpStatus = databaseReachable ? 200 : 503;

  if (!hasCronSecret(request.headers.get("authorization"))) {
    return NextResponse.json({ status, timestamp }, { status: httpStatus, headers: NO_STORE });
  }

  const prodReadiness = checkProductionReadiness(env);
  return NextResponse.json(
    {
      status,
      environment: env.NODE_ENV,
      checks: {
        database: databaseReachable ? "connected" : "unreachable",
        faqKnowledgeVersion: FAQ_KNOWLEDGE_VERSION,
        productionCredentialsReady: prodReadiness.ready,
        productionBlockers: prodReadiness.blockers,
        policyGatesEnforced: ["OD-001", "OD-003", "OD-006", "OD-007", "OD-008", "OD-009", "OD-010", "OD-011", "OD-013"],
      },
      timestamp,
    },
    { status: httpStatus, headers: NO_STORE }
  );
}
