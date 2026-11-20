import { AmbassadorStatus, CertificateStatus, Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { AuthenticatedUser } from "@/lib/auth/guards";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import { getSiteUrl } from "@/lib/site-url";
import { businessDateKey } from "@/lib/time/business-time";
import { certificatePdfGenerator } from "@/infrastructure/pdf/certificate-pdf-generator";
import { certificatePdfPayload, generateCertificateCode } from "@/features/certificates/services/certificate-service";
import { ambassadorCertificateSchema } from "../schemas";

/**
 * Administrators: issue the CAMPUS_AMBASSADOR certificate (one per ambassador) for the period
 * from approval to the chosen last day. The certificate is verifiable like every other.
 */
export async function issueAmbassadorCertificate(user: AuthenticatedUser, raw: unknown, now: Date) {
  if (!user.roles.includes(Role.ADMIN)) throw new ForbiddenError("Only administrators can issue ambassador certificates.");
  const parsed = ambassadorCertificateSchema.safeParse(raw);
  if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message ?? "Invalid certificate details.");
  const input = parsed.data;

  const verificationCode = generateCertificateCode("CAMPUS_AMBASSADOR", now);
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "campus_ambassadors" WHERE "id" = ${input.ambassadorId} FOR UPDATE`;
    const ambassador = await tx.campusAmbassador.findUnique({
      where: { id: input.ambassadorId },
      select: { id: true, status: true, role: true, approvedAt: true, user: { select: { name: true } }, college: { select: { name: true } }, certificate: { select: { id: true } } },
    });
    if (!ambassador) throw new NotFoundError("Ambassador not found");
    if (ambassador.certificate) throw new ConflictError("This ambassador already has a certificate.");
    if (!ambassador.approvedAt || (ambassador.status !== AmbassadorStatus.APPROVED && ambassador.status !== AmbassadorStatus.DEACTIVATED)) {
      throw new ConflictError("Only an approved (or former) ambassador can receive the certificate.");
    }
    if (input.periodEnd < businessDateKey(ambassador.approvedAt) || input.periodEnd > businessDateKey(now)) {
      throw new ValidationError("The last day must be between the approval date and today.");
    }
    const details = {
      type: "CAMPUS_AMBASSADOR" as const,
      recipientName: ambassador.user.name,
      programmeTitle: ambassador.role === "LEAD" ? "Campus Ambassador (Lead)" : "Campus Ambassador",
      issueDate: now,
      completionDate: new Date(`${input.periodEnd}T00:00:00Z`),
      verificationCode,
      qrPayloadUrl: `${getSiteUrl().replace(/\/+$/, "")}/verify/${verificationCode}`,
      signatoryName: input.signatoryName,
      signatoryTitle: input.signatoryTitle,
      secondSignatoryName: null,
      secondSignatoryTitle: null,
      collegeName: ambassador.college?.name ?? null,
      domain: null,
      periodStart: new Date(`${businessDateKey(ambassador.approvedAt)}T00:00:00Z`),
      projectTitle: null,
      grade: null,
    };
    await certificatePdfGenerator.generateCertificatePdf(certificatePdfPayload(details));
    const certificate = await tx.certificate.create({
      data: { ...details, ambassadorId: ambassador.id, status: CertificateStatus.ACTIVE, versionNumber: 1, issuedById: user.id },
      select: { id: true, verificationCode: true },
    });
    await tx.auditLog.create({
      data: {
        actorId: user.id,
        actorRole: Role.ADMIN,
        action: "CERTIFICATE_ISSUED",
        resourceType: "Certificate",
        resourceId: certificate.id,
        diffPayload: { ambassadorId: ambassador.id, verificationCode, type: "CAMPUS_AMBASSADOR" },
      },
    });
    return certificate;
  });
}
