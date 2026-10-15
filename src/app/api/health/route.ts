import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { checkProductionReadiness, env } from "@/lib/env";
import { FAQ_KNOWLEDGE_VERSION } from "@/infrastructure/ai/faq-knowledge-base";

export async function GET() {
  let databaseReachable = false;

  try {
    await prisma.$queryRaw`SELECT 1`;
    databaseReachable = true;
  } catch {
    databaseReachable = false;
  }

  const prodReadiness = checkProductionReadiness(env);

  const payload = {
    status: databaseReachable ? "ok" : "degraded",
    environment: env.NODE_ENV,
    checks: {
      database: databaseReachable ? "connected" : "unreachable",
      faqKnowledgeVersion: FAQ_KNOWLEDGE_VERSION,
      productionCredentialsReady: prodReadiness.ready,
      policyGatesEnforced: [
        "OD-001",
        "OD-003",
        "OD-006",
        "OD-007",
        "OD-008",
        "OD-009",
        "OD-010",
        "OD-011",
        "OD-013",
      ],
    },
    timestamp: new Date().toISOString(),
  };

  return NextResponse.json(payload, {
    status: databaseReachable ? 200 : 503,
    headers: {
      "Cache-Control": "no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
