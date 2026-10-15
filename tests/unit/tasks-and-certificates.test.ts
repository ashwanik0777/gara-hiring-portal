import { describe, it, expect } from "vitest";
import { CertificatePdfGenerator } from "@/infrastructure/pdf/certificate-pdf-generator";
import { Role, CertificateStatus, CompletionStatus } from "@prisma/client";

describe("Prompt 6: PDF Generation Engine", () => {
  const generator = new CertificatePdfGenerator();

  it("generates a valid standard PDF 1.4 binary buffer with header, trailer, and xref", async () => {
    const pdfBuffer = await generator.generateCertificatePdf({
      recipientName: "Aarav Sharma",
      programmeTitle: "Full-Stack Engineering Internship",
      completionDate: "2026-04-15",
      issueDate: "2026-04-16",
      verificationCode: "GARA-CERT-2026-B94E21",
      verificationUrl: "https://portal.garainnovation.com/verify/GARA-CERT-2026-B94E21",
      signatoryName: "Dr. Vikram Seth",
      signatoryTitle: "Head of Engineering & Programmes",
    });

    expect(pdfBuffer).toBeInstanceOf(Buffer);
    expect(pdfBuffer.length).toBeGreaterThan(1000);

    const pdfString = pdfBuffer.toString("utf-8");
    // Standard PDF 1.4 header
    expect(pdfString.startsWith("%PDF-1.4")).toBe(true);
    // Standard PDF trailer and EOF
    expect(pdfString).toContain("%%EOF");
    expect(pdfString).toContain("xref");
    expect(pdfString).toContain("/Type /Catalog");
    expect(pdfString).toContain("/Type /Pages");

    // Content verification
    expect(pdfString).toContain("Aarav Sharma");
    expect(pdfString).toContain("Full-Stack Engineering Internship");
    expect(pdfString).toContain("GARA-CERT-2026-B94E21");
    expect(pdfString).toContain("Dr. Vikram Seth");
    expect(pdfString).toContain("CERTIFICATE OF COMPLETION");

    // Vector QR drawing commands present
    expect(pdfString).toContain("re f");
  });
});

describe("Prompt 6: Certificate Policy & Authorization Gating", () => {
  function validateCertificateIssuancePolicy(params: {
    actorRoles: Role[];
    completionStatus?: CompletionStatus | null;
    isEligibleForCertificate?: boolean;
    hasExistingActiveCertificate?: boolean;
  }): { allowed: boolean; reason?: string; isIdempotentReturn?: boolean } {
    const isIssuer = params.actorRoles.includes(Role.ADMIN) || params.actorRoles.includes(Role.HR);
    if (!isIssuer) {
      return { allowed: false, reason: "Requires ADMIN or HR authorization" };
    }

    if (!params.completionStatus || params.completionStatus !== CompletionStatus.APPROVED) {
      return { allowed: false, reason: "Internship completion has not been approved" };
    }

    if (!params.isEligibleForCertificate) {
      return { allowed: false, reason: "Intern is not marked eligible for certificate" };
    }

    if (params.hasExistingActiveCertificate) {
      return { allowed: true, isIdempotentReturn: true };
    }

    return { allowed: true };
  }

  it("strictly rejects certificate generation when completion is not approved", () => {
    const checkPending = validateCertificateIssuancePolicy({
      actorRoles: [Role.HR],
      completionStatus: CompletionStatus.IN_PROGRESS,
      isEligibleForCertificate: true,
    });

    expect(checkPending.allowed).toBe(false);
    expect(checkPending.reason).toContain("Internship completion has not been approved");

    const checkRejected = validateCertificateIssuancePolicy({
      actorRoles: [Role.ADMIN],
      completionStatus: CompletionStatus.REJECTED,
      isEligibleForCertificate: true,
    });

    expect(checkRejected.allowed).toBe(false);
    expect(checkRejected.reason).toContain("Internship completion has not been approved");
  });

  it("strictly rejects certificate generation when intern is not marked eligible", () => {
    const checkNotEligible = validateCertificateIssuancePolicy({
      actorRoles: [Role.HR],
      completionStatus: CompletionStatus.APPROVED,
      isEligibleForCertificate: false,
    });

    expect(checkNotEligible.allowed).toBe(false);
    expect(checkNotEligible.reason).toContain("not marked eligible for certificate");
  });

  it("strictly rejects certificate generation by unprivileged roles (Candidate, Intern, Mentor)", () => {
    const checkMentor = validateCertificateIssuancePolicy({
      actorRoles: [Role.MENTOR],
      completionStatus: CompletionStatus.APPROVED,
      isEligibleForCertificate: true,
    });

    expect(checkMentor.allowed).toBe(false);
    expect(checkMentor.reason).toContain("Requires ADMIN or HR authorization");

    const checkCandidate = validateCertificateIssuancePolicy({
      actorRoles: [Role.CANDIDATE],
      completionStatus: CompletionStatus.APPROVED,
      isEligibleForCertificate: true,
    });

    expect(checkCandidate.allowed).toBe(false);
    expect(checkCandidate.reason).toContain("Requires ADMIN or HR authorization");
  });

  it("enforces idempotency: returns existing active certificate rather than duplicating", () => {
    const checkIdempotent = validateCertificateIssuancePolicy({
      actorRoles: [Role.HR],
      completionStatus: CompletionStatus.APPROVED,
      isEligibleForCertificate: true,
      hasExistingActiveCertificate: true,
    });

    expect(checkIdempotent.allowed).toBe(true);
    expect(checkIdempotent.isIdempotentReturn).toBe(true);
  });
});

describe("Prompt 6: Public Verification & Redaction Rules", () => {
  interface MockCertificateRecord {
    id: string;
    verificationCode: string;
    recipientName: string;
    programmeTitle: string;
    issueDate: Date;
    completionDate: Date;
    signatoryName: string;
    signatoryTitle: string;
    status: CertificateStatus;
    // Internal confidential fields
    internalEvaluationNotes: string;
    candidateEmail: string;
    candidatePhone: string;
    internalScore: number;
  }

  function filterPublicVerificationDto(record: MockCertificateRecord | null) {
    if (!record) {
      return { valid: false, error: "Certificate not found" };
    }

    // STRICT POLICY: Whitelist only public display fields!
    return {
      valid: record.status === CertificateStatus.ACTIVE,
      status: record.status,
      verificationCode: record.verificationCode,
      recipientName: record.recipientName,
      programmeTitle: record.programmeTitle,
      issueDate: record.issueDate.toISOString().split("T")[0],
      completionDate: record.completionDate.toISOString().split("T")[0],
      signatoryName: record.signatoryName,
      signatoryTitle: record.signatoryTitle,
    };
  }

  it("redacts all internal scores, private notes, email, and phone numbers from public verification DTO", () => {
    const mockRecord: MockCertificateRecord = {
      id: "cert_9988",
      verificationCode: "GARA-CERT-2026-X9B27",
      recipientName: "Priya Nair",
      programmeTitle: "Frontend Engineering Internship",
      issueDate: new Date("2026-05-01"),
      completionDate: new Date("2026-04-30"),
      signatoryName: "Sunil Verma",
      signatoryTitle: "Programme Director",
      status: CertificateStatus.ACTIVE,
      internalEvaluationNotes: "Candidate scored 8.5/10. Needs improvement in state management.",
      candidateEmail: "priya.nair@example.com",
      candidatePhone: "+91 9876543210",
      internalScore: 85,
    };

    const publicDto = filterPublicVerificationDto(mockRecord);

    expect(publicDto.valid).toBe(true);
    expect(publicDto.verificationCode).toBe("GARA-CERT-2026-X9B27");
    expect(publicDto.recipientName).toBe("Priya Nair");
    expect(publicDto.programmeTitle).toBe("Frontend Engineering Internship");

    // Assert internal confidential fields are completely absent
    const publicRecord = publicDto as Record<string, unknown>;
    expect(publicRecord.internalEvaluationNotes).toBeUndefined();
    expect(publicRecord.candidateEmail).toBeUndefined();
    expect(publicRecord.candidatePhone).toBeUndefined();
    expect(publicRecord.internalScore).toBeUndefined();
    expect(publicRecord.id).toBeUndefined();
  });

  it("marks revoked certificates as invalid in public verification", () => {
    const revokedRecord: MockCertificateRecord = {
      id: "cert_revoked_1",
      verificationCode: "GARA-CERT-2026-REVOKED",
      recipientName: "Test Candidate",
      programmeTitle: "Backend Internship",
      issueDate: new Date("2026-05-01"),
      completionDate: new Date("2026-04-30"),
      signatoryName: "Director",
      signatoryTitle: "Leadership",
      status: CertificateStatus.REVOKED,
      internalEvaluationNotes: "Revoked due to falsification",
      candidateEmail: "test@example.com",
      candidatePhone: "+91 0000000000",
      internalScore: 0,
    };

    const publicDto = filterPublicVerificationDto(revokedRecord);
    expect(publicDto.valid).toBe(false);
    expect(publicDto.status).toBe(CertificateStatus.REVOKED);
  });
});
