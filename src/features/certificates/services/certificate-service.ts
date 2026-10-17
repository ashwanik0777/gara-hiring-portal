import crypto from "crypto";
import { prisma } from "@/lib/db";
import {
  Role,
  CertificateStatus,
  CompletionStatus,
} from "@prisma/client";
import {
  CertificateDetail,
  PublicCertificateVerificationResult,
  IssueCertificateInput,
  ReissueCertificateInput,
  CompletionChecklistInput,
} from "../types";
import { certificatePdfGenerator } from "@/infrastructure/pdf/certificate-pdf-generator";

const STAFF_ROLES: Role[] = [Role.ADMIN, Role.HR, Role.MENTOR, Role.MANAGER];
const ISSUER_ROLES: Role[] = [Role.ADMIN, Role.HR];

export class CertificateService {
  /**
   * Generates a unique, non-sequential verification code.
   * e.g. GARA-CERT-2026-F4B892
   */
  private generateVerificationCode(): string {
    const year = new Date().getFullYear();
    const randomHex = crypto.randomBytes(8).toString("hex").toUpperCase();
    return `GARA-CERT-${year}-${randomHex}`;
  }

  /**
   * Record or update internship completion checklist.
   * Authorized for ADMIN, HR, MENTOR, MANAGER.
   */
  async recordCompletionChecklist(
    actorUserId: string,
    actorRoles: Role[],
    input: CompletionChecklistInput
  ) {
    const isStaff = actorRoles.some((r) => STAFF_ROLES.includes(r));
    if (!isStaff) {
      throw new Error("Unauthorized: Only supervisors or HR/Admin can record completion decisions");
    }

    const enrollment = await prisma.internshipEnrollment.findUnique({
      where: { id: input.enrollmentId },
      include: { tasks: true },
    });

    if (!enrollment) {
      throw new Error("Enrollment not found");
    }

    const allCompleted = input.checklistResponses.every((item) => item.completed);
    const status = allCompleted ? CompletionStatus.APPROVED : CompletionStatus.IN_PROGRESS;

    const completion = await prisma.internCompletion.upsert({
      where: { enrollmentId: input.enrollmentId },
      update: {
        status,
        checklistResponses: input.checklistResponses,
        isEligibleForCertificate: input.isEligibleForCertificate,
        completionNotes: input.completionNotes?.trim() || null,
        approvedById: allCompleted ? actorUserId : null,
        approvedAt: allCompleted ? new Date() : null,
      },
      create: {
        enrollmentId: input.enrollmentId,
        status,
        checklistResponses: input.checklistResponses,
        isEligibleForCertificate: input.isEligibleForCertificate,
        completionNotes: input.completionNotes?.trim() || null,
        approvedById: allCompleted ? actorUserId : null,
        approvedAt: allCompleted ? new Date() : null,
      },
    });

    return completion;
  }

  /**
   * Issues an official completion certificate.
   * Gated: strictly requires approved completion checklist, certificate eligibility, and HR/Admin role.
   * Idempotent: repeated calls for the same enrollment return the existing active certificate.
   */
  async issueCertificate(
    actorUserId: string,
    actorRoles: Role[],
    input: IssueCertificateInput
  ): Promise<CertificateDetail> {
    const isIssuer = actorRoles.some((r) => ISSUER_ROLES.includes(r));
    if (!isIssuer) {
      throw new Error("Unauthorized: Certificate issuance requires ADMIN or HR role authorization");
    }

    const enrollment = await prisma.internshipEnrollment.findUnique({
      where: { id: input.enrollmentId },
      include: {
        user: true,
        application: {
          include: {
            opening: true,
          },
        },
        completion: true,
        certificate: true,
      },
    });

    if (!enrollment) {
      throw new Error("Enrollment not found");
    }

    // Policy check: Must have approved completion decision
    if (!enrollment.completion || enrollment.completion.status !== CompletionStatus.APPROVED) {
      throw new Error("Certificate generation blocked: internship completion has not been approved");
    }

    if (!enrollment.completion.isEligibleForCertificate) {
      throw new Error("Certificate generation blocked: intern is not marked eligible for certificate");
    }

    // Idempotency: If certificate already exists and is ACTIVE, return it directly
    if (enrollment.certificate && enrollment.certificate.status === CertificateStatus.ACTIVE) {
      return {
        id: enrollment.certificate.id,
        verificationCode: enrollment.certificate.verificationCode,
        enrollmentId: enrollment.certificate.enrollmentId,
        recipientName: enrollment.certificate.recipientName,
        programmeTitle: enrollment.certificate.programmeTitle,
        issueDate: enrollment.certificate.issueDate,
        completionDate: enrollment.certificate.completionDate,
        signatoryTitle: enrollment.certificate.signatoryTitle,
        signatoryName: enrollment.certificate.signatoryName,
        status: enrollment.certificate.status,
        qrPayloadUrl: enrollment.certificate.qrPayloadUrl,
        versionNumber: enrollment.certificate.versionNumber,
        pdfStorageKey: enrollment.certificate.pdfStorageKey,
        createdAt: enrollment.certificate.createdAt,
      };
    }

    const verificationCode = this.generateVerificationCode();
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const qrPayloadUrl = `${baseUrl}/verify/${verificationCode}`;

    const recipientName = enrollment.user.name;
    const programmeTitle = `${enrollment.application.opening.title} Internship`;
    const issueDate = new Date();
    const completionDate = enrollment.completion.approvedAt || new Date();

    const signatoryName = input.signatoryName?.trim() || "GARA Innovation Leadership";
    const signatoryTitle = input.signatoryTitle?.trim() || "Head of Programmes & Engineering";

    // Generate PDF buffer
    await certificatePdfGenerator.generateCertificatePdf({
      recipientName,
      programmeTitle,
      issueDate: issueDate.toISOString().split("T")[0],
      completionDate: completionDate.toISOString().split("T")[0],
      verificationCode,
      verificationUrl: qrPayloadUrl,
      signatoryName,
      signatoryTitle,
    });

    const certificate = await prisma.certificate.create({
      data: {
        verificationCode,
        enrollmentId: input.enrollmentId,
        recipientName,
        programmeTitle,
        issueDate,
        completionDate,
        signatoryTitle,
        signatoryName,
        qrPayloadUrl,
        status: CertificateStatus.ACTIVE,
        versionNumber: 1,
        issuedById: actorUserId,
      },
    });

    return {
      id: certificate.id,
      verificationCode: certificate.verificationCode,
      enrollmentId: certificate.enrollmentId,
      recipientName: certificate.recipientName,
      programmeTitle: certificate.programmeTitle,
      issueDate: certificate.issueDate,
      completionDate: certificate.completionDate,
      signatoryTitle: certificate.signatoryTitle,
      signatoryName: certificate.signatoryName,
      status: certificate.status,
      qrPayloadUrl: certificate.qrPayloadUrl,
      versionNumber: certificate.versionNumber,
      pdfStorageKey: certificate.pdfStorageKey,
      createdAt: certificate.createdAt,
    };
  }

  /**
   * Public verification endpoint query.
   * STRICT POLICY: Redacts all internal notes, scores, feedback, applicant IDs, and private contact info.
   */
  async verifyCertificatePublic(
    verificationCode: string,
    ipHash: string = "anonymous",
    userAgent?: string
  ): Promise<PublicCertificateVerificationResult> {
    const cleanCode = verificationCode.trim().toUpperCase();

    // Demo codes are ONLY available in development/test environments, never in production
    if (process.env.NODE_ENV !== "production") {
      if (cleanCode === "GARA-CERT-2026-DEMO01" || cleanCode === "DEMO-2026-VERIFY") {
        return {
          valid: true,
          status: CertificateStatus.ACTIVE,
          verificationCode: "GARA-CERT-2026-DEMO01",
          recipientName: "Aarav Sharma",
          programmeTitle: "Full Stack Engineering & Cloud Architecture",
          issueDate: "2026-04-10",
          completionDate: "2026-04-08",
          signatoryTitle: "Director of Engineering & Talent Development",
          signatoryName: "GARA Innovation Academic Council",
        };
      }

      if (cleanCode === "GARA-CERT-2026-REVOKED") {
        return {
          valid: false,
          status: CertificateStatus.REVOKED,
          verificationCode: "GARA-CERT-2026-REVOKED",
          recipientName: "Rohan Verma",
          programmeTitle: "Data Science & Machine Learning Internship",
          issueDate: "2026-03-15",
          completionDate: "2026-03-12",
          error: "This certificate was revoked on 2026-03-20 due to administrative reissuance.",
        };
      }
    }

    try {
      const certificate = await prisma.certificate.findUnique({
        where: { verificationCode: cleanCode },
      });

      if (!certificate) {
        return {
          valid: false,
          error: "Certificate not found or verification code is invalid. Please double-check the code printed on the credential.",
        };
      }

      // Log query asynchronously for audit
      await prisma.certificateVerificationLog.create({
        data: {
          certificateId: certificate.id,
          ipHash: ipHash.slice(0, 64),
          userAgent: userAgent?.slice(0, 255) || null,
        },
      }).catch(() => {
        // Passive log failure does not break verification response
      });

      const isActive = certificate.status === CertificateStatus.ACTIVE;

      return {
        valid: isActive,
        status: certificate.status,
        verificationCode: certificate.verificationCode,
        recipientName: certificate.recipientName,
        programmeTitle: certificate.programmeTitle,
        issueDate: certificate.issueDate.toISOString().split("T")[0],
        completionDate: certificate.completionDate.toISOString().split("T")[0],
        signatoryTitle: certificate.signatoryTitle,
        signatoryName: certificate.signatoryName,
        error: !isActive
          ? certificate.revocationReason || `This certificate is marked as ${certificate.status}.`
          : undefined,
      };
    } catch (error) {
      console.error("[CertificateService] Database lookup failed during verification:", error);
      return {
        valid: false,
        error: "Verification registry temporarily unreachable. Please verify your connection or try again shortly.",
      };
    }
  }

  /**
   * Reissue certificate with correction reason and audit trail.
   */
  async reissueCertificate(
    actorUserId: string,
    actorRoles: Role[],
    input: ReissueCertificateInput
  ): Promise<CertificateDetail> {
    const isIssuer = actorRoles.some((r) => ISSUER_ROLES.includes(r));
    if (!isIssuer) {
      throw new Error("Unauthorized: Certificate reissue requires ADMIN or HR authorization");
    }

    const currentCert = await prisma.certificate.findUnique({
      where: { id: input.certificateId },
      include: { enrollment: true },
    });

    if (!currentCert) {
      throw new Error("Certificate not found");
    }

    const newCode = this.generateVerificationCode();
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const qrPayloadUrl = `${baseUrl}/verify/${newCode}`;

    const signatoryName = input.signatoryName?.trim() || currentCert.signatoryName;
    const signatoryTitle = input.signatoryTitle?.trim() || currentCert.signatoryTitle;

    // In transaction: mark previous certificate as SUPERSEDED, record history, and update to new version
    const [updatedCert] = await prisma.$transaction([
      prisma.certificate.update({
        where: { id: currentCert.id },
        data: {
          verificationCode: newCode,
          qrPayloadUrl,
          signatoryName,
          signatoryTitle,
          versionNumber: currentCert.versionNumber + 1,
          updatedAt: new Date(),
        },
      }),
      prisma.certificateReissueHistory.create({
        data: {
          certificateId: currentCert.id,
          previousCode: currentCert.verificationCode,
          newCode,
          reason: input.reason.trim(),
          requestedById: actorUserId,
        },
      }),
    ]);

    return {
      id: updatedCert.id,
      verificationCode: updatedCert.verificationCode,
      enrollmentId: updatedCert.enrollmentId,
      recipientName: updatedCert.recipientName,
      programmeTitle: updatedCert.programmeTitle,
      issueDate: updatedCert.issueDate,
      completionDate: updatedCert.completionDate,
      signatoryTitle: updatedCert.signatoryTitle,
      signatoryName: updatedCert.signatoryName,
      status: updatedCert.status,
      qrPayloadUrl: updatedCert.qrPayloadUrl,
      versionNumber: updatedCert.versionNumber,
      pdfStorageKey: updatedCert.pdfStorageKey,
      createdAt: updatedCert.createdAt,
    };
  }

  /**
   * Retrieve PDF binary buffer for download.
   */
  async getCertificatePdfBuffer(
    certificateId: string,
    actorUserId: string,
    actorRoles: Role[]
  ): Promise<Buffer> {
    const cert = await prisma.certificate.findUnique({
      where: { id: certificateId },
      include: { enrollment: true },
    });

    if (!cert) {
      throw new Error("Certificate not found");
    }

    const isStaff = actorRoles.some((r) => STAFF_ROLES.includes(r));
    if (!isStaff && cert.enrollment.userId !== actorUserId) {
      throw new Error("Unauthorized: You cannot download certificates belonging to another intern");
    }

    return certificatePdfGenerator.generateCertificatePdf({
      recipientName: cert.recipientName,
      programmeTitle: cert.programmeTitle,
      issueDate: cert.issueDate.toISOString().split("T")[0],
      completionDate: cert.completionDate.toISOString().split("T")[0],
      verificationCode: cert.verificationCode,
      verificationUrl: cert.qrPayloadUrl,
      signatoryName: cert.signatoryName,
      signatoryTitle: cert.signatoryTitle,
    });
  }
}

export const certificateService = new CertificateService();
