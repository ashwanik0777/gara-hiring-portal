import crypto from "crypto";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import type { AuthenticatedUser } from "@/lib/auth/guards";
import {
  Role,
  CertificateStatus,
  CompletionStatus,
  EvaluationStatus,
  Prisma,
} from "@prisma/client";
import {
  CertificateDetail,
  PublicCertificateVerificationResult,
  IssueCertificateInput,
  ReissueCertificateInput,
  RevokeCertificateInput,
  CompletionChecklistInput,
} from "../types";
import { COMPLETION_CHECKLIST_TEMPLATE, VERIFICATION_CODE_MAX_LENGTH } from "../constants";
import { certificatePdfGenerator } from "@/infrastructure/pdf/certificate-pdf-generator";
import type { CertificatePdfPayload } from "@/infrastructure/pdf/types";
import { COMPANY, confirmedCompanyFacts } from "@/config/site";
import { CERTIFICATE_TYPES, formatCertificateCode, type CertificateTypeKey } from "../certificate-types";
import {
  assertEnrollmentInScope,
  assertEvaluationAccess,
  assertEvaluationDecisionAuthority,
  primaryActorRole,
  rethrowUniqueAsConflict,
} from "@/features/internship-evaluation/services/enrollment-access";
import {
  AppError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "@/lib/errors";

const NOT_FOUND_MESSAGE =
  "Certificate not found or verification code is invalid. Please double-check the code printed on the credential.";
const SUPERSEDED_MESSAGE =
  "This verification code has been superseded by a reissued certificate. Please ask the certificate holder for the current certificate or its verification code.";
const REVOKED_MESSAGE = "This certificate has been revoked by the issuer.";
const INACTIVE_MESSAGE = "This certificate is no longer active.";

interface StoredChecklistItem {
  id: string;
  label: string;
  required: boolean;
  completed: boolean;
}

const StoredChecklistSchema = z.array(
  z.object({
    id: z.string(),
    completed: z.boolean(),
  })
);

/**
 * Public base URL for verification links / QR payloads. Uses the validated BETTER_AUTH_URL
 * (which env.ts resolves from the Vercel deployment URL when unset) and never falls back to
 * localhost in production.
 */
function getPublicBaseUrl(): string {
  const configured = env.BETTER_AUTH_URL.replace(/\/+$/, "");
  const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(configured);
  if (isLocal && env.NODE_ENV === "production") {
    throw new AppError(
      "The public certificate verification URL is not configured.",
      "CONFIGURATION_ERROR",
      503
    );
  }
  return configured;
}

/**
 * Builds the stored checklist from the server-side template. Unknown or duplicate ids are
 * rejected; items not submitted count as not completed.
 */
function buildChecklist(responses: CompletionChecklistInput["checklistResponses"]): StoredChecklistItem[] {
  const templateIds = new Set(COMPLETION_CHECKLIST_TEMPLATE.map((item) => item.id));
  const submitted = new Map<string, boolean>();
  for (const response of responses) {
    if (!templateIds.has(response.id)) {
      throw new ValidationError("The checklist contains an unknown item.");
    }
    if (submitted.has(response.id)) {
      throw new ValidationError("The checklist contains duplicate items.");
    }
    submitted.set(response.id, response.completed === true);
  }
  return COMPLETION_CHECKLIST_TEMPLATE.map((item) => ({
    id: item.id,
    label: item.label,
    required: item.required,
    completed: submitted.get(item.id) === true,
  }));
}

/** True only when the template is non-empty and every required item is completed. */
function areRequiredItemsCompleted(checklist: Pick<StoredChecklistItem, "id" | "completed">[]): boolean {
  const required = COMPLETION_CHECKLIST_TEMPLATE.filter((item) => item.required);
  if (required.length === 0) {
    return false;
  }
  return required.every((item) =>
    checklist.some((entry) => entry.id === item.id && entry.completed === true)
  );
}

function storedChecklistComplete(value: Prisma.JsonValue): boolean {
  const parsed = StoredChecklistSchema.safeParse(value);
  return parsed.success && areRequiredItemsCompleted(parsed.data);
}

/**
 * Locks the enrollment row for the rest of the transaction. Completion decisions and certificate
 * issuance both take this lock so their eligibility reads and writes are serialized.
 */
async function lockEnrollmentRow(tx: Prisma.TransactionClient, enrollmentId: string): Promise<void> {
  await tx.$queryRaw`SELECT "id" FROM "internship_enrollments" WHERE "id" = ${enrollmentId} FOR UPDATE`;
}

function toCertificateDetail(certificate: {
  id: string;
  verificationCode: string;
  enrollmentId: string | null;
  trainingEnrollmentId?: string | null;
  recipientName: string;
  programmeTitle: string;
  issueDate: Date;
  completionDate: Date;
  signatoryTitle: string;
  signatoryName: string;
  status: CertificateStatus;
  qrPayloadUrl: string;
  versionNumber: number;
  pdfStorageKey: string | null;
  createdAt: Date;
  type: CertificateTypeKey;
  collegeName: string | null;
  domain: string | null;
  periodStart: Date | null;
  projectTitle: string | null;
  grade: string | null;
  secondSignatoryName: string | null;
  secondSignatoryTitle: string | null;
  revokedAt?: Date | null;
}): CertificateDetail {
  return {
    id: certificate.id,
    verificationCode: certificate.verificationCode,
    enrollmentId: certificate.enrollmentId,
    trainingEnrollmentId: certificate.trainingEnrollmentId ?? null,
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
    type: certificate.type,
    collegeName: certificate.collegeName,
    domain: certificate.domain,
    periodStart: certificate.periodStart,
    projectTitle: certificate.projectTitle,
    grade: certificate.grade,
    secondSignatoryName: certificate.secondSignatoryName,
    secondSignatoryTitle: certificate.secondSignatoryTitle,
    revokedAt: certificate.revokedAt ?? null,
  };
}

const isoDate = (date: Date) => date.toISOString().split("T")[0];

/** Everything the PDF prints, from the certificate's stored snapshot (same at issue and download). */
export function certificatePdfPayload(certificate: {
  type: CertificateTypeKey;
  recipientName: string;
  programmeTitle: string;
  issueDate: Date;
  completionDate: Date;
  verificationCode: string;
  qrPayloadUrl: string;
  signatoryName: string;
  signatoryTitle: string;
  collegeName: string | null;
  domain: string | null;
  periodStart: Date | null;
  projectTitle: string | null;
  grade: string | null;
  secondSignatoryName: string | null;
  secondSignatoryTitle: string | null;
}): CertificatePdfPayload {
  const details = CERTIFICATE_TYPES[certificate.type];
  const facts = confirmedCompanyFacts()
    .filter((fact) => fact.label === "CIN" || fact.label === "Udyam Registration No.")
    .map((fact) => `${fact.label}: ${fact.value}`)
    .join("    |    ");
  return {
    companyName: (COMPANY.registeredName ?? COMPANY.brandName).toUpperCase(),
    companyFacts: facts || null,
    title: details.title,
    statement: details.statement,
    recipientName: certificate.recipientName,
    programmeTitle: certificate.programmeTitle,
    issueDate: isoDate(certificate.issueDate),
    completionDate: isoDate(certificate.completionDate),
    verificationCode: certificate.verificationCode,
    verificationUrl: certificate.qrPayloadUrl,
    signatoryName: certificate.signatoryName,
    signatoryTitle: certificate.signatoryTitle,
    collegeName: certificate.collegeName,
    domain: certificate.domain,
    periodStart: certificate.periodStart ? isoDate(certificate.periodStart) : null,
    projectTitle: certificate.projectTitle,
    grade: certificate.grade,
    secondSignatoryName: certificate.secondSignatoryName,
    secondSignatoryTitle: certificate.secondSignatoryTitle,
  };
}

/** The source record of a certificate, for access checks. */
const CERTIFICATE_SOURCE_INCLUDE = {
  enrollment: { select: { userId: true, supervisorId: true } },
  trainingEnrollment: { select: { userId: true, batchId: true } },
  ambassador: { select: { userId: true } },
} as const;

interface CertificateSources {
  enrollment: { userId: string; supervisorId: string | null } | null;
  trainingEnrollment: { userId: string; batchId: string } | null;
  ambassador: { userId: string } | null;
}

/**
 * Revoke and reissue: internship certificates follow the evaluation scope; training and
 * Campus Ambassador certificates are for administrators only.
 */
function assertCertificateDecisionScope(
  access: Awaited<ReturnType<typeof assertEvaluationDecisionAuthority>>,
  user: AuthenticatedUser,
  certificate: CertificateSources
): void {
  if (certificate.enrollment) {
    assertEnrollmentInScope(access, user, certificate.enrollment);
    return;
  }
  if (!user.roles.includes(Role.ADMIN)) {
    throw new ForbiddenError("Only administrators can change Industrial Training certificates.");
  }
}

/** Training certificate downloads by staff: administrators and the batch's mentors. */
async function canViewTrainingCertificate(
  actor: { id: string; roles: Role[] },
  trainingEnrollment: { batchId: string } | null
): Promise<boolean> {
  if (!trainingEnrollment) return false;
  if (actor.roles.includes(Role.ADMIN)) return true;
  const mentor = await prisma.trainingBatchMentor.findUnique({
    where: { batchId_userId: { batchId: trainingEnrollment.batchId, userId: actor.id } },
    select: { userId: true },
  });
  return mentor !== null;
}

/** A new certificate ID: GARA-{type prefix}-{year}-{6 characters}, from a CSPRNG. */
export function generateCertificateCode(type: CertificateTypeKey, now = new Date()): string {
  return formatCertificateCode(type, now.getFullYear(), (max) => crypto.randomInt(max));
}

export class CertificateService {

  /**
   * Record or update the internship completion checklist.
   * Authorized for ADMIN/HR and the assigned supervisor (canEvaluations). The checklist is
   * validated against the server-side template; APPROVED requires every required item.
   * Safety gate pending OD-009: only a PASSED evaluation can receive a completion decision.
   */
  async recordCompletionChecklist(user: AuthenticatedUser, input: CompletionChecklistInput) {
    const access = await assertEvaluationAccess(user);

    const checklist = buildChecklist(input.checklistResponses);
    const allRequiredCompleted = areRequiredItemsCompleted(checklist);
    const status = allRequiredCompleted ? CompletionStatus.APPROVED : CompletionStatus.IN_PROGRESS;
    const completionNotes = input.completionNotes?.trim() || null;
    const now = new Date();

    const checklistJson = checklist as unknown as Prisma.InputJsonValue;
    const data = {
      status,
      checklistResponses: checklistJson,
      isEligibleForCertificate: input.isEligibleForCertificate,
      completionNotes,
      approvedById: allRequiredCompleted ? user.id : null,
      approvedAt: allRequiredCompleted ? now : null,
    };

    return prisma.$transaction(async (tx) => {
      // Serializes with certificate issuance, which takes the same enrollment row lock.
      await lockEnrollmentRow(tx, input.enrollmentId);

      const enrollment = await tx.internshipEnrollment.findUnique({
        where: { id: input.enrollmentId },
        select: {
          id: true,
          userId: true,
          supervisorId: true,
          status: true,
          completion: { select: { status: true, isEligibleForCertificate: true } },
          certificate: { select: { status: true } },
        },
      });

      if (!enrollment) {
        throw new NotFoundError("Enrollment not found");
      }
      assertEnrollmentInScope(access, user, enrollment);

      if (enrollment.status !== EvaluationStatus.PASSED) {
        throw new ValidationError(
          "A completion decision can only be recorded after the evaluation is recorded as PASSED."
        );
      }
      if (enrollment.certificate?.status === CertificateStatus.ACTIVE) {
        throw new ConflictError(
          "A certificate has already been issued for this internship; the completion decision can no longer be changed."
        );
      }

      const completion = await tx.internCompletion.upsert({
        where: { enrollmentId: input.enrollmentId },
        update: data,
        create: { enrollmentId: input.enrollmentId, ...data },
        select: { id: true, enrollmentId: true, status: true },
      });

      await tx.auditLog.create({
        data: {
          actorId: user.id,
          actorRole: primaryActorRole(user),
          action: "COMPLETION_DECISION_RECORDED",
          resourceType: "InternCompletion",
          resourceId: completion.id,
          diffPayload: {
            enrollmentId: input.enrollmentId,
            fromStatus: enrollment.completion?.status ?? null,
            toStatus: status,
            fromEligible: enrollment.completion?.isEligibleForCertificate ?? null,
            toEligible: input.isEligibleForCertificate,
            checklist: checklistJson,
            completionNotes,
          },
        },
      });

      return completion;
    });
  }

  /**
   * Issues an official completion certificate.
   * Gated: ADMIN/HR with canEvaluations, evaluation PASSED (safety gate pending OD-009), approved
   * completion with every required checklist item, and explicit eligibility.
   * Idempotent: repeated calls for the same enrollment return the existing active certificate.
   */
  async issueCertificate(user: AuthenticatedUser, input: IssueCertificateInput): Promise<CertificateDetail> {
    const access = await assertEvaluationDecisionAuthority(user);

    const signatoryName = input.signatoryName?.trim();
    const signatoryTitle = input.signatoryTitle?.trim();
    if (!signatoryName || !signatoryTitle) {
      throw new ValidationError("Signatory name and title are required to issue a certificate.");
    }
    const secondSignatoryName = input.secondSignatoryName?.trim() || null;
    const secondSignatoryTitle = input.secondSignatoryTitle?.trim() || null;
    if (Boolean(secondSignatoryName) !== Boolean(secondSignatoryTitle)) {
      throw new ValidationError("Enter both the name and the title of the second signatory, or neither.");
    }

    const verificationCode = generateCertificateCode("INTERNSHIP_COMPLETION");
    const qrPayloadUrl = `${getPublicBaseUrl()}/verify/${verificationCode}`;

    try {
      const certificate = await prisma.$transaction(async (tx) => {
        // Completion and eligibility are read under the enrollment row lock (also taken by
        // recordCompletionChecklist), so a concurrent revocation cannot lose to issuance.
        await lockEnrollmentRow(tx, input.enrollmentId);

        const enrollment = await tx.internshipEnrollment.findUnique({
          where: { id: input.enrollmentId },
          include: {
            user: true,
            application: {
              include: {
                opening: { include: { track: { select: { name: true } } } },
                candidate: { select: { college: { select: { name: true } } } },
              },
            },
            completion: true,
            certificate: true,
          },
        });

        if (!enrollment) {
          throw new NotFoundError("Enrollment not found");
        }
        assertEnrollmentInScope(access, user, enrollment);

        // Idempotency: an existing ACTIVE certificate is returned unchanged.
        if (enrollment.certificate?.status === CertificateStatus.ACTIVE) {
          return enrollment.certificate;
        }
        if (enrollment.certificate) {
          throw new ConflictError(
            `A ${enrollment.certificate.status} certificate already exists for this internship. Issuing a replacement certificate is not configured (OD-009).`
          );
        }

        if (enrollment.status !== EvaluationStatus.PASSED) {
          throw new ValidationError(
            "Certificate generation blocked: the supervised evaluation has not been recorded as PASSED."
          );
        }

        // Policy check: Must have approved completion decision
        if (!enrollment.completion || enrollment.completion.status !== CompletionStatus.APPROVED) {
          throw new ValidationError("Certificate generation blocked: internship completion has not been approved");
        }

        if (!storedChecklistComplete(enrollment.completion.checklistResponses)) {
          throw new ValidationError(
            "Certificate generation blocked: the completion checklist does not have every required item completed. Record the checklist again."
          );
        }

        if (!enrollment.completion.isEligibleForCertificate) {
          throw new ValidationError("Certificate generation blocked: intern is not marked eligible for certificate");
        }

        const { opening } = enrollment.application;
        const snapshot = {
          type: "INTERNSHIP_COMPLETION" as const,
          recipientName: enrollment.user.name,
          programmeTitle: `${opening.title} Internship`,
          issueDate: new Date(),
          completionDate: enrollment.completion.approvedAt || new Date(),
          verificationCode,
          qrPayloadUrl,
          signatoryName,
          signatoryTitle,
          secondSignatoryName,
          secondSignatoryTitle,
          // Printed details, captured now so later profile or opening edits never change them.
          collegeName: enrollment.application.candidate.college?.name ?? null,
          domain: opening.track?.name ?? opening.department,
          periodStart: input.periodStart ? new Date(`${input.periodStart}T00:00:00Z`) : enrollment.startDate,
          projectTitle: input.projectTitle?.trim() || null,
          grade: input.grade?.trim() || null,
        };

        // Render once so a generator failure blocks issuance instead of producing an unusable record.
        await certificatePdfGenerator.generateCertificatePdf(certificatePdfPayload(snapshot));

        const created = await tx.certificate.create({
          data: {
            ...snapshot,
            enrollmentId: input.enrollmentId,
            status: CertificateStatus.ACTIVE,
            versionNumber: 1,
            issuedById: user.id,
          },
        });

        await tx.auditLog.create({
          data: {
            actorId: user.id,
            actorRole: primaryActorRole(user),
            action: "CERTIFICATE_ISSUED",
            resourceType: "Certificate",
            resourceId: created.id,
            diffPayload: {
              enrollmentId: input.enrollmentId,
              verificationCode,
              signatoryName,
              signatoryTitle,
            },
          },
        });

        return created;
      });

      return toCertificateDetail(certificate);
    } catch (error) {
      rethrowUniqueAsConflict(error, "A certificate was already issued for this internship. Please reload.");
    }
  }

  /**
   * Public verification endpoint query.
   * STRICT POLICY: Redacts all internal notes, scores, feedback, applicant IDs, and private contact info.
   * Non-active certificates and superseded codes return no personal data and no free-text reasons.
   */
  async verifyCertificatePublic(
    verificationCode: string,
    ipHash: string,
    userAgent?: string
  ): Promise<PublicCertificateVerificationResult> {
    const cleanCode = verificationCode.trim().toUpperCase();
    if (!cleanCode || cleanCode.length > VERIFICATION_CODE_MAX_LENGTH) {
      return { valid: false, error: NOT_FOUND_MESSAGE };
    }

    const logLookup = async (certificateId: string) => {
      await prisma.certificateVerificationLog
        .create({
          data: {
            certificateId,
            ipHash: ipHash.slice(0, 64),
            userAgent: userAgent?.slice(0, 255) || null,
          },
        })
        .catch(() => {
          // Passive log failure does not break verification response
        });
    };

    try {
      const certificate = await prisma.certificate.findUnique({
        where: { verificationCode: cleanCode },
        select: {
          id: true,
          type: true,
          verificationCode: true,
          recipientName: true,
          programmeTitle: true,
          periodStart: true,
          issueDate: true,
          completionDate: true,
          status: true,
          revokedAt: true,
        },
      });

      if (!certificate) {
        // BUG-14: codes replaced by a reissue are reported as superseded, not "not found".
        const superseded = await prisma.certificateReissueHistory.findFirst({
          where: { previousCode: cleanCode },
          select: { certificateId: true },
        });
        if (superseded) {
          await logLookup(superseded.certificateId);
          return {
            valid: false,
            status: CertificateStatus.SUPERSEDED,
            verificationCode: cleanCode,
            error: SUPERSEDED_MESSAGE,
          };
        }
        return { valid: false, error: NOT_FOUND_MESSAGE };
      }

      await logLookup(certificate.id);

      // Only the fields the careers plan allows: status, name, programme, dates, issue date.
      const publicFields = {
        status: certificate.status,
        verificationCode: certificate.verificationCode,
        typeLabel: CERTIFICATE_TYPES[certificate.type].label,
        recipientName: certificate.recipientName,
        programmeTitle: certificate.programmeTitle,
        ...(certificate.periodStart ? { periodStart: isoDate(certificate.periodStart) } : {}),
        issueDate: isoDate(certificate.issueDate),
        completionDate: isoDate(certificate.completionDate),
      };

      if (certificate.status === CertificateStatus.REVOKED) {
        // A revoked certificate still identifies whose it was; the reason is never shown.
        return {
          valid: false,
          ...publicFields,
          ...(certificate.revokedAt ? { revokedOn: isoDate(certificate.revokedAt) } : {}),
          error: REVOKED_MESSAGE,
        };
      }
      if (certificate.status !== CertificateStatus.ACTIVE) {
        return {
          valid: false,
          status: certificate.status,
          verificationCode: certificate.verificationCode,
          error: certificate.status === CertificateStatus.SUPERSEDED ? SUPERSEDED_MESSAGE : INACTIVE_MESSAGE,
        };
      }

      return { valid: true, ...publicFields };
    } catch (error) {
      console.error("[CertificateService] Database lookup failed during verification:", error);
      return {
        valid: false,
        error: "Verification registry temporarily unreachable. Please verify your connection or try again shortly.",
      };
    }
  }

  /**
   * Revoke an ACTIVE certificate (for example for plagiarism, misconduct, false information or an
   * issuing error, as the Terms state). Same authority as issuing. The reason is recorded for
   * staff and the audit log; public verification shows only that the certificate is revoked.
   */
  async revokeCertificate(user: AuthenticatedUser, input: RevokeCertificateInput): Promise<CertificateDetail> {
    const access = await assertEvaluationDecisionAuthority(user);
    const reason = input.reason.trim();
    if (reason.length < 10) {
      throw new ValidationError("Please give a revocation reason of at least 10 characters.");
    }

    const current = await prisma.certificate.findUnique({
      where: { id: input.certificateId },
      include: CERTIFICATE_SOURCE_INCLUDE,
    });
    if (!current) {
      throw new NotFoundError("Certificate not found");
    }
    assertCertificateDecisionScope(access, user, current);
    if (current.status !== CertificateStatus.ACTIVE) {
      throw new ConflictError(`Only active certificates can be revoked (current status: ${current.status}).`);
    }

    const revoked = await prisma.$transaction(async (tx) => {
      const updated = await tx.certificate.updateMany({
        where: { id: current.id, status: CertificateStatus.ACTIVE },
        data: { status: CertificateStatus.REVOKED, revokedAt: new Date(), revocationReason: reason },
      });
      if (updated.count !== 1) {
        throw new ConflictError("The certificate changed while it was being revoked. Please reload.");
      }
      await tx.auditLog.create({
        data: {
          actorId: user.id,
          actorRole: primaryActorRole(user),
          action: "CERTIFICATE_REVOKED",
          resourceType: "Certificate",
          resourceId: current.id,
          diffPayload: { verificationCode: current.verificationCode, reason },
        },
      });
      return tx.certificate.findUniqueOrThrow({ where: { id: current.id } });
    });

    return toCertificateDetail(revoked);
  }

  /**
   * Reissue an ACTIVE certificate with a correction reason and audit trail. The previous code is
   * kept in CertificateReissueHistory so public verification reports it as superseded.
   */
  async reissueCertificate(user: AuthenticatedUser, input: ReissueCertificateInput): Promise<CertificateDetail> {
    const access = await assertEvaluationDecisionAuthority(user);

    const currentCert = await prisma.certificate.findUnique({
      where: { id: input.certificateId },
      include: CERTIFICATE_SOURCE_INCLUDE,
    });

    if (!currentCert) {
      throw new NotFoundError("Certificate not found");
    }
    assertCertificateDecisionScope(access, user, currentCert);

    if (currentCert.status !== CertificateStatus.ACTIVE) {
      throw new ConflictError(`Only active certificates can be reissued (current status: ${currentCert.status}).`);
    }

    const reason = input.reason.trim();
    if (reason.length === 0) {
      throw new ValidationError("A reissue reason is required.");
    }

    const newCode = generateCertificateCode(currentCert.type);
    const qrPayloadUrl = `${getPublicBaseUrl()}/verify/${newCode}`;
    const signatoryName = input.signatoryName?.trim() || currentCert.signatoryName;
    const signatoryTitle = input.signatoryTitle?.trim() || currentCert.signatoryTitle;

    try {
      const updatedCert = await prisma.$transaction(async (tx) => {
        const updated = await tx.certificate.updateMany({
          where: {
            id: currentCert.id,
            verificationCode: currentCert.verificationCode,
            status: CertificateStatus.ACTIVE,
          },
          data: {
            verificationCode: newCode,
            qrPayloadUrl,
            signatoryName,
            signatoryTitle,
            versionNumber: currentCert.versionNumber + 1,
          },
        });
        if (updated.count !== 1) {
          throw new ConflictError("The certificate changed while it was being reissued. Please reload.");
        }

        await tx.certificateReissueHistory.create({
          data: {
            certificateId: currentCert.id,
            previousCode: currentCert.verificationCode,
            newCode,
            reason,
            requestedById: user.id,
          },
        });

        await tx.auditLog.create({
          data: {
            actorId: user.id,
            actorRole: primaryActorRole(user),
            action: "CERTIFICATE_REISSUED",
            resourceType: "Certificate",
            resourceId: currentCert.id,
            diffPayload: {
              previousCode: currentCert.verificationCode,
              newCode,
              fromVersion: currentCert.versionNumber,
              toVersion: currentCert.versionNumber + 1,
              reason,
            },
          },
        });

        return tx.certificate.findUniqueOrThrow({ where: { id: currentCert.id } });
      });

      return toCertificateDetail(updatedCert);
    } catch (error) {
      rethrowUniqueAsConflict(error, "The certificate could not be reissued. Please try again.");
    }
  }

  /**
   * Retrieve PDF binary buffer for download. Interns may download their own certificate;
   * staff need evaluation access to the enrollment. Non-active certificates are refused.
   */
  async getCertificatePdfBuffer(
    certificateId: string,
    actorUserId: string,
    actorRoles: Role[]
  ): Promise<Buffer> {
    const cert = await prisma.certificate.findUnique({
      where: { id: certificateId },
      include: CERTIFICATE_SOURCE_INCLUDE,
    });

    if (!cert) {
      throw new NotFoundError("Certificate not found");
    }

    const ownerId = cert.enrollment?.userId ?? cert.trainingEnrollment?.userId ?? cert.ambassador?.userId;
    if (ownerId !== actorUserId) {
      const actor = { id: actorUserId, roles: actorRoles };
      if (cert.enrollment) {
        const access = await assertEvaluationAccess(actor);
        assertEnrollmentInScope(access, actor, cert.enrollment);
      } else if (cert.ambassador ? !actor.roles.includes(Role.ADMIN) : !(await canViewTrainingCertificate(actor, cert.trainingEnrollment))) {
        throw new NotFoundError("Certificate not found");
      }
    }

    if (cert.status !== CertificateStatus.ACTIVE) {
      throw new ConflictError("This certificate is no longer active and cannot be downloaded.");
    }

    return certificatePdfGenerator.generateCertificatePdf(certificatePdfPayload(cert));
  }
}

export const certificateService = new CertificateService();
