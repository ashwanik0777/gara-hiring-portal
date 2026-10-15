import { describe, it, expect, vi, beforeEach } from "vitest";
import { CertificateStatus } from "@prisma/client";
import { certificateService } from "@/features/certificates/services/certificate-service";
import { POST as verifyPost, GET as verifyGet } from "@/app/api/certificates/verify/route";
import { NextRequest } from "next/server";

const mockCertificateFindUnique = vi.fn();
const mockVerificationLogCreate = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    certificate: {
      findUnique: (...args: unknown[]) => mockCertificateFindUnique(...args),
    },
    certificateVerificationLog: {
      create: (...args: unknown[]) => mockVerificationLogCreate(...args),
    },
  },
}));

describe("features/certificates/certificate-verification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("certificateService.verifyCertificatePublic", () => {
    it("returns verified credential for standard demo code GARA-CERT-2026-DEMO01", async () => {
      const result = await certificateService.verifyCertificatePublic("GARA-CERT-2026-DEMO01");
      expect(result.valid).toBe(true);
      expect(result.status).toBe(CertificateStatus.ACTIVE);
      expect(result.recipientName).toBe("Aarav Sharma");
      expect(result.verificationCode).toBe("GARA-CERT-2026-DEMO01");
      expect(result.programmeTitle).toContain("Full Stack Engineering");
      expect(result.signatoryName).toBe("GARA Innovation Academic Council");
    });

    it("returns revoked status for demo code GARA-CERT-2026-REVOKED", async () => {
      const result = await certificateService.verifyCertificatePublic("gara-cert-2026-revoked");
      expect(result.valid).toBe(false);
      expect(result.status).toBe(CertificateStatus.REVOKED);
      expect(result.error).toContain("revoked");
    });

    it("verifies live active certificate from database and logs audit entry", async () => {
      mockCertificateFindUnique.mockResolvedValueOnce({
        id: "cert-uuid-1",
        verificationCode: "GARA-CERT-2026-X89K21",
        recipientName: "Priya Nair",
        programmeTitle: "AI & Autonomous Systems Engineering",
        issueDate: new Date("2026-04-12T00:00:00Z"),
        completionDate: new Date("2026-04-10T00:00:00Z"),
        signatoryTitle: "Managing Director",
        signatoryName: "GARA Leadership Board",
        status: CertificateStatus.ACTIVE,
      });
      mockVerificationLogCreate.mockResolvedValueOnce({ id: "log-1" });

      const result = await certificateService.verifyCertificatePublic("GARA-CERT-2026-X89K21", "hash-ip-123");

      expect(result.valid).toBe(true);
      expect(result.recipientName).toBe("Priya Nair");
      expect(result.programmeTitle).toBe("AI & Autonomous Systems Engineering");
      expect(result.completionDate).toBe("2026-04-10");
      expect(result.issueDate).toBe("2026-04-12");
      expect(mockVerificationLogCreate).toHaveBeenCalled();
    });

    it("returns invalid result when code does not exist in database", async () => {
      mockCertificateFindUnique.mockResolvedValueOnce(null);

      const result = await certificateService.verifyCertificatePublic("GARA-NONEXISTENT-CODE");

      expect(result.valid).toBe(false);
      expect(result.error).toContain("not found or verification code is invalid");
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
      const req = new NextRequest("http://localhost:3000/api/certificates/verify", {
        method: "POST",
        body: JSON.stringify({ code: "GARA-CERT-2026-DEMO01" }),
      });
      const res = await verifyPost(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.result.valid).toBe(true);
      expect(data.result.recipientName).toBe("Aarav Sharma");
    });

    it("GET returns verified credential via query parameter", async () => {
      const req = new NextRequest("http://localhost:3000/api/certificates/verify?code=GARA-CERT-2026-DEMO01", {
        method: "GET",
      });
      const res = await verifyGet(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.result.valid).toBe(true);
      expect(data.result.recipientName).toBe("Aarav Sharma");
    });
  });
});
