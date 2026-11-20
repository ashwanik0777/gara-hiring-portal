import { ApplicationStatus, EvaluationStatus, OpeningType, type Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { AuthenticatedUser } from "@/lib/auth/guards";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import { COMPANY, confirmedCompanyFacts } from "@/config/site";
import { BUSINESS_TIME_ZONE } from "@/lib/time/business-time";
import { buildOfferLetterPdf } from "@/infrastructure/pdf/offer-letter-pdf-generator";
import type { OfferLetterPdfPayload } from "@/infrastructure/pdf/types";
import {
  assertEnrollmentInScope,
  assertEvaluationAccess,
  assertEvaluationDecisionAuthority,
  primaryActorRole,
} from "@/features/internship-evaluation/services/enrollment-access";
import { InternshipOfferSchema, type InternshipOfferInput } from "../schemas";

/** Business rule (product owner, 2026-11-19): internships are always free. Printed on every letter. */
export const INTERNSHIP_NO_FEE_STATEMENT =
  `Internships at ${COMPANY.brandName} are free. No fee, deposit, registration charge or certificate fee is ` +
  `charged at any stage. Anyone asking you to pay for this internship does not represent ${COMPANY.brandName}.`;

const offerSelect = {
  id: true,
  applicationId: true,
  designation: true,
  department: true,
  startDate: true,
  tenureText: true,
  stipendText: true,
  signatoryName: true,
  signatoryTitle: true,
  version: true,
  issuedAt: true,
  updatedAt: true,
} as const;

export type InternshipOfferRecord = {
  id: string;
  applicationId: string;
  designation: string;
  department: string;
  startDate: Date;
  tenureText: string;
  stipendText: string | null;
  signatoryName: string;
  signatoryTitle: string;
  version: number;
  issuedAt: Date;
  updatedAt: Date;
};

/** The application with what the letter and the rules need. */
async function loadApplication(applicationId: string) {
  const application = await prisma.application.findUnique({
    where: { id: applicationId },
    select: {
      id: true,
      referenceCode: true,
      status: true,
      opening: { select: { type: true, title: true, location: true } },
      candidate: { select: { userId: true, user: { select: { name: true } } } },
      enrollment: { select: { status: true, userId: true, supervisorId: true } },
      internshipOffer: { select: offerSelect },
    },
  });
  if (!application) throw new NotFoundError("Application not found");
  return application;
}

/** The PDF content of a letter (same wording for staff and the candidate). */
export function internshipOfferLetterPayload(
  offer: InternshipOfferRecord,
  application: { referenceCode: string; candidateName: string; location: string | null }
): OfferLetterPdfPayload {
  const facts = confirmedCompanyFacts();
  const statutory = facts.filter((fact) => fact.label !== "Registered office").map((fact) => `${fact.label}: ${fact.value}`);
  const office = facts.find((fact) => fact.label === "Registered office");
  const companyName = (COMPANY.registeredName ?? COMPANY.brandName).toUpperCase();
  return {
    offerReference: application.referenceCode,
    issuedAt: offer.updatedAt,
    candidateName: application.candidateName,
    designation: offer.designation,
    department: offer.department,
    location: application.location,
    expectedJoiningDate: offer.startDate,
    termsSummary: INTERNSHIP_NO_FEE_STATEMENT,
    extendedByName: null,
    timeZone: BUSINESS_TIME_ZONE,
    companyName,
    companyFacts: [statutory.join("  |  "), office ? `Registered office: ${office.value}` : ""].filter(Boolean),
    title: "Internship offer letter",
    introLine: `We are pleased to offer you an internship at ${COMPANY.brandName} on the terms below.`,
    joiningDateLabel: "Start date",
    extraDetails: [
      { label: "Tenure", value: offer.tenureText },
      { label: "Stipend", value: offer.stipendText ?? "" },
    ],
    termsHeading: "No fee",
    signatory: { name: offer.signatoryName, title: offer.signatoryTitle },
    closingNote: `Questions about this offer: ${COMPANY.contactEmail}`,
  };
}

export function internshipOfferFilename(referenceCode: string): string {
  return `GARA_Internship_Offer_${referenceCode.replace(/[^A-Za-z0-9-]/g, "")}.pdf`;
}

/** Staff Query: the offer letter of an application, or null. */
export async function getInternshipOfferForStaff(applicationId: string, user: AuthenticatedUser) {
  const access = await assertEvaluationAccess(user);
  const application = await loadApplication(applicationId);
  if (!application.enrollment) return null;
  assertEnrollmentInScope(access, user, application.enrollment);
  return application.internshipOffer;
}

/**
 * Staff Mutation: issue or update the internship offer letter. ADMIN/HR with evaluation
 * authority only, for internship applications whose supervised evaluation PASSED and that are
 * not yet joined. Updating raises the version; every change is audited.
 */
export async function saveInternshipOffer(user: AuthenticatedUser, rawInput: InternshipOfferInput) {
  const access = await assertEvaluationDecisionAuthority(user);
  const parsed = InternshipOfferSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0]?.message ?? "Invalid offer details", parsed.error.issues);
  }
  const input = parsed.data;
  const startDate = new Date(`${input.startDate}T00:00:00Z`);
  if (Number.isNaN(startDate.getTime()) || startDate.toISOString().slice(0, 10) !== input.startDate) {
    throw new ValidationError("Enter a valid start date");
  }

  const application = await loadApplication(input.applicationId);
  if (application.opening.type !== OpeningType.INTERNSHIP) {
    throw new ValidationError("Internship offer letters are only for internship openings.");
  }
  if (!application.enrollment || application.enrollment.status !== EvaluationStatus.PASSED) {
    throw new ValidationError("The offer letter becomes available once the supervised evaluation has PASSED.");
  }
  assertEnrollmentInScope(access, user, application.enrollment);
  if (application.status !== ApplicationStatus.EVALUATION_SELECTED) {
    throw new ConflictError("The offer letter can no longer be changed for this application (it has moved on).");
  }

  const data = {
    designation: input.designation,
    department: input.department,
    startDate,
    tenureText: input.tenureText,
    stipendText: input.stipendText ?? null,
    signatoryName: input.signatoryName,
    signatoryTitle: input.signatoryTitle,
  };

  return prisma.$transaction(async (tx) => {
    const existing = await tx.internshipOffer.findUnique({ where: { applicationId: application.id }, select: { version: true } });
    const offer = existing
      ? await tx.internshipOffer.update({
          where: { applicationId: application.id },
          data: { ...data, version: existing.version + 1, issuedById: user.id },
          select: offerSelect,
        })
      : await tx.internshipOffer.create({
          data: { ...data, applicationId: application.id, issuedById: user.id },
          select: offerSelect,
        });
    await tx.auditLog.create({
      data: {
        actorId: user.id,
        actorRole: primaryActorRole(user),
        action: existing ? "INTERNSHIP_OFFER_UPDATED" : "INTERNSHIP_OFFER_ISSUED",
        resourceType: "InternshipOffer",
        resourceId: offer.id,
        diffPayload: { ...input, applicationId: application.id, version: offer.version },
      },
    });
    return offer;
  });
}

/**
 * The letter as a PDF: the candidate may download their own; staff need evaluation access to the
 * internship (supervisors only for their interns).
 */
export async function getInternshipOfferPdf(
  applicationId: string,
  actor: { id: string; roles: Role[] }
): Promise<{ buffer: Buffer; filename: string }> {
  const application = await loadApplication(applicationId);
  const offer = application.internshipOffer;
  if (!offer) throw new NotFoundError("No internship offer letter for this application");

  if (application.candidate.userId !== actor.id) {
    if (!application.enrollment) throw new ForbiddenError("You do not have access to this letter.");
    const access = await assertEvaluationAccess(actor);
    assertEnrollmentInScope(access, actor, application.enrollment);
  }

  const buffer = buildOfferLetterPdf(
    internshipOfferLetterPayload(offer, {
      referenceCode: application.referenceCode,
      candidateName: application.candidate.user.name,
      location: application.opening.location,
    })
  );
  return { buffer, filename: internshipOfferFilename(application.referenceCode) };
}

/** Candidate Query: the offer letter of the candidate's own application, or null. */
export async function getInternshipOfferForCandidate(applicationId: string, userId: string) {
  return prisma.internshipOffer.findFirst({
    where: { applicationId, application: { candidate: { userId } } },
    select: { designation: true, department: true, startDate: true, tenureText: true, version: true, updatedAt: true },
  });
}
