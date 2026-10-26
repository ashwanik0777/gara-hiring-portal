import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { CertificateStatus, CheckpointStatus, CompletionStatus, EvaluationStatus } from "@prisma/client";
import { NextRequest } from "next/server";

const {
  mockCertificateFindUnique,
  mockReissueFindFirst,
  mockVerificationLogCreate,
  mockEnforce,
  mockHeaders,
  mockCacheTag,
  mockCacheLife,
} = vi.hoisted(() => ({
  mockCertificateFindUnique: vi.fn(),
  mockReissueFindFirst: vi.fn(),
  mockVerificationLogCreate: vi.fn(),
  mockEnforce: vi.fn(),
  mockHeaders: vi.fn(),
  mockCacheTag: vi.fn(),
  mockCacheLife: vi.fn(),
}));

// Spies on the Cache Components APIs: the verification path must never enter a cache scope.
vi.mock("next/cache", () => ({
  cacheTag: (...args: unknown[]) => mockCacheTag(...args),
  cacheLife: (...args: unknown[]) => mockCacheLife(...args),
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  updateTag: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    certificate: {
      findUnique: (...args: unknown[]) => mockCertificateFindUnique(...args),
    },
    certificateReissueHistory: {
      findFirst: (...args: unknown[]) => mockReissueFindFirst(...args),
    },
    certificateVerificationLog: {
      create: (...args: unknown[]) => mockVerificationLogCreate(...args),
    },
  },
}));

vi.mock("@/lib/security/rate-limit", () => ({
  defaultRateLimiter: { enforce: (...args: unknown[]) => mockEnforce(...args) },
  RATE_LIMIT_POLICIES: {
    CERTIFICATE_VERIFY: { scope: "public:verify_certificate", maxRequests: 30, windowSeconds: 60 },
  },
}));

vi.mock("next/headers", () => ({
  headers: () => mockHeaders(),
}));

import { certificateService } from "@/features/certificates/services/certificate-service";
import { POST as verifyPost, GET as verifyGet } from "@/app/api/certificates/verify/route";
import VerifyCodePage from "@/app/verify/[code]/page";
import { RateLimitError } from "@/lib/errors";

const IP_HASH = "a".repeat(64);

function activeCertificate(overrides: Record<string, unknown> = {}) {
  return {
    id: "cert-uuid-1",
    verificationCode: "GARA-CERT-2026-X89K21",
    recipientName: "Test Recipient",
    programmeTitle: "AI & Autonomous Systems Engineering",
    issueDate: new Date("2026-04-12T00:00:00Z"),
    completionDate: new Date("2026-04-10T00:00:00Z"),
    signatoryTitle: "Programme Lead",
    signatoryName: "Test Signatory",
    status: CertificateStatus.ACTIVE,
    revocationReason: "Internal reason that must never be public",
    enrollment: {
      status: EvaluationStatus.PASSED,
      checkpoints: [{ status: CheckpointStatus.REVIEWED }, { status: CheckpointStatus.REVIEWED }],
      completion: { status: CompletionStatus.APPROVED },
    },
    ...overrides,
  };
}

describe("features/certificates/certificate-verification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVerificationLogCreate.mockResolvedValue({ id: "log-1" });
    mockReissueFindFirst.mockResolvedValue(null);
    mockEnforce.mockResolvedValue({ allowed: true, remaining: 29, retryAfterSeconds: 0 });
    mockHeaders.mockResolvedValue(new Headers({ "x-real-ip": "203.0.113.7", "user-agent": "vitest" }));
  });

  describe("certificateService.verifyCertificatePublic", () => {
    it("no longer accepts fabricated demo codes", async () => {
      mockCertificateFindUnique.mockResolvedValueOnce(null);
      const result = await certificateService.verifyCertificatePublic("GARA-CERT-2026-DEMO01", IP_HASH);
      expect(result.valid).toBe(false);
      expect(result.recipientName).toBeUndefined();
    });

    it("verifies a live active certificate, logs the hashed IP and reports fulfilled requirements", async () => {
      mockCertificateFindUnique.mockResolvedValueOnce(activeCertificate());

      const result = await certificateService.verifyCertificatePublic("gara-cert-2026-x89k21", IP_HASH, "agent");

      expect(result.valid).toBe(true);
      expect(result.recipientName).toBe("Test Recipient");
      expect(result.completionDate).toBe("2026-04-10");
      expect(result.issueDate).toBe("2026-04-12");
      expect(result.evaluationRequirementsFulfilled).toBe(true);
      expect(mockVerificationLogCreate.mock.calls[0][0].data.ipHash).toBe(IP_HASH);
      // Internal fields are never part of the public DTO
      expect(result).not.toHaveProperty("id");
      expect(JSON.stringify(result)).not.toContain("Internal reason");
    });

    it("does not claim fulfilled checkpoints when the record does not show them", async () => {
      mockCertificateFindUnique.mockResolvedValueOnce(
        activeCertificate({
          enrollment: {
            status: EvaluationStatus.PASSED,
            checkpoints: [{ status: CheckpointStatus.REVIEWED }, { status: CheckpointStatus.PENDING }],
            completion: { status: CompletionStatus.APPROVED },
          },
        })
      );
      const result = await certificateService.verifyCertificatePublic("GARA-CERT-2026-X89K21", IP_HASH);
      expect(result.valid).toBe(true);
      expect(result.evaluationRequirementsFulfilled).toBe(false);
    });

    it("reports revoked certificates without personal data or the free-text revocation reason", async () => {
      mockCertificateFindUnique.mockResolvedValueOnce(activeCertificate({ status: CertificateStatus.REVOKED }));

      const result = await certificateService.verifyCertificatePublic("GARA-CERT-2026-X89K21", IP_HASH);

      expect(result.valid).toBe(false);
      expect(result.status).toBe(CertificateStatus.REVOKED);
      expect(result.error).toBe("This certificate has been revoked by the issuer.");
      expect(result.recipientName).toBeUndefined();
      expect(JSON.stringify(result)).not.toContain("Internal reason");
    });

    it("reports a code replaced by a reissue as SUPERSEDED instead of not found", async () => {
      mockCertificateFindUnique.mockResolvedValueOnce(null);
      mockReissueFindFirst.mockResolvedValueOnce({ certificateId: "cert-uuid-1" });

      const result = await certificateService.verifyCertificatePublic("GARA-CERT-2026-OLDCODE", IP_HASH);

      expect(mockReissueFindFirst.mock.calls[0][0].where).toEqual({ previousCode: "GARA-CERT-2026-OLDCODE" });
      expect(result.valid).toBe(false);
      expect(result.status).toBe(CertificateStatus.SUPERSEDED);
      expect(result.recipientName).toBeUndefined();
      expect(result.error).toContain("superseded");
      expect(mockVerificationLogCreate).toHaveBeenCalled();
    });

    it("returns invalid result when code does not exist in database", async () => {
      mockCertificateFindUnique.mockResolvedValueOnce(null);
      const result = await certificateService.verifyCertificatePublic("GARA-NONEXISTENT-CODE", IP_HASH);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("not found or verification code is invalid");
    });

    it("rejects oversized codes without querying the database", async () => {
      const result = await certificateService.verifyCertificatePublic("X".repeat(65), IP_HASH);
      expect(result.valid).toBe(false);
      expect(mockCertificateFindUnique).not.toHaveBeenCalled();
    });
  });

  describe("API Route: /api/certificates/verify", () => {
    it("POST returns 400 when code is missing or empty", async () => {
      const req = new NextRequest("http://localhost:3000/api/certificates/verify", {
        method: "POST",
        body: JSON.stringify({ code: "   " }),
      });
      const res = await verifyPost(req);
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toContain("Verification code is required");
    });

    it("POST returns verified credential when valid code is provided", async () => {
      mockCertificateFindUnique.mockResolvedValueOnce(activeCertificate());
      const req = new NextRequest("http://localhost:3000/api/certificates/verify", {
        method: "POST",
        body: JSON.stringify({ code: "GARA-CERT-2026-X89K21" }),
      });
      const res = await verifyPost(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.result.valid).toBe(true);
      expect(data.result.recipientName).toBe("Test Recipient");
    });

    it("GET returns verified credential via query parameter", async () => {
      mockCertificateFindUnique.mockResolvedValueOnce(activeCertificate());
      const req = new NextRequest("http://localhost:3000/api/certificates/verify?code=GARA-CERT-2026-X89K21", {
        method: "GET",
      });
      const res = await verifyGet(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.result.valid).toBe(true);
    });
  });

  describe("Public page: /verify/[code] (BUG-23)", () => {
    it("rate limits lookups per hashed client IP and never logs them as anonymous", async () => {
      mockCertificateFindUnique.mockResolvedValueOnce(activeCertificate());

      const page = await VerifyCodePage({ params: Promise.resolve({ code: "GARA-CERT-2026-X89K21" }) });
      const html = renderToStaticMarkup(page);

      const [identifier] = mockEnforce.mock.calls[0];
      expect(identifier).toMatch(/^[0-9a-f]{64}$/);
      expect(identifier).not.toContain("203.0.113.7");
      const loggedHash = mockVerificationLogCreate.mock.calls[0][0].data.ipHash;
      expect(loggedHash).toBe(identifier);
      expect(loggedHash).not.toBe("anonymous");
      expect(html).toContain("Test Recipient");
      expect(html).toContain("every checkpoint reviewed");
      expect(html).not.toContain("Tamper-Proof");
    });

    it("renders a friendly rate-limited state without querying the registry", async () => {
      mockEnforce.mockRejectedValueOnce(new RateLimitError(30));

      const page = await VerifyCodePage({ params: Promise.resolve({ code: "GARA-CERT-2026-X89K21" }) });
      const html = renderToStaticMarkup(page);

      expect(html).toContain("Too many verification requests");
      expect(mockCertificateFindUnique).not.toHaveBeenCalled();
    });

    it("uses neutral wording when the record does not show fulfilled evaluation requirements", async () => {
      mockCertificateFindUnique.mockResolvedValueOnce(
        activeCertificate({
          enrollment: { status: EvaluationStatus.PASSED, checkpoints: [], completion: { status: CompletionStatus.APPROVED } },
        })
      );
      const html = renderToStaticMarkup(
        await VerifyCodePage({ params: Promise.resolve({ code: "GARA-CERT-2026-X89K21" }) })
      );
      expect(html).not.toContain("every checkpoint reviewed");
      expect(html).not.toContain("7-working-day evaluation checkpoints");
    });
  });

  describe("verification is never cached (a revocation must be visible immediately)", () => {
    it("queries the registry on every lookup and never opens a cache scope", async () => {
      mockCertificateFindUnique.mockResolvedValue(activeCertificate());

      await certificateService.verifyCertificatePublic("GARA-CERT-2026-X89K21", IP_HASH);
      await certificateService.verifyCertificatePublic("GARA-CERT-2026-X89K21", IP_HASH);
      renderToStaticMarkup(
        await VerifyCodePage({ params: Promise.resolve({ code: "GARA-CERT-2026-X89K21" }) })
      );

      expect(mockCertificateFindUnique).toHaveBeenCalledTimes(3);
      expect(mockCacheTag).not.toHaveBeenCalled();
      expect(mockCacheLife).not.toHaveBeenCalled();
    });

    it("reports a certificate as revoked on the lookup right after it was active", async () => {
      mockCertificateFindUnique
        .mockResolvedValueOnce(activeCertificate())
        .mockResolvedValueOnce(activeCertificate({ status: CertificateStatus.REVOKED }));

      const before = await certificateService.verifyCertificatePublic("GARA-CERT-2026-X89K21", IP_HASH);
      const after = await certificateService.verifyCertificatePublic("GARA-CERT-2026-X89K21", IP_HASH);

      expect(before.valid).toBe(true);
      expect(after.valid).toBe(false);
      expect(after.status).toBe(CertificateStatus.REVOKED);
    });

    it("declares no cache directive anywhere on the verification path", () => {
      const files = [
        "src/features/certificates/services/certificate-service.ts",
        "src/app/api/certificates/verify/route.ts",
        "src/app/verify/page.tsx",
        "src/app/verify/[code]/page.tsx",
        "src/components/verification/verification-portal.tsx",
      ];
      for (const file of files) {
        const source = fs.readFileSync(path.join(process.cwd(), file), "utf8");
        expect(source, file).not.toMatch(/["']use cache/);
        expect(source, file).not.toMatch(/\bunstable_cache\b/);
      }
    });
  });
});
