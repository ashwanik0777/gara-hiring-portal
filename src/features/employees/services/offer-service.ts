import { prisma } from "@/lib/db";
import { AuthenticatedUser } from "@/lib/auth/guards";
import { Role, ApplicationStatus, OfferStatus } from "@prisma/client";
import {
  CreateJobOfferInput,
  CandidateOfferDecisionInput,
} from "../schemas";
import { JobOfferDetail } from "../types";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";

const OFFER_MANAGEMENT_ROLES: Role[] = [Role.ADMIN, Role.HR];

export class OfferService {
  private assertStaffAccess(user: AuthenticatedUser): void {
    const isAuthorized = user.roles.some((r) => OFFER_MANAGEMENT_ROLES.includes(r));
    if (!isAuthorized) {
      throw new ForbiddenError(
        "Job offer preparation, issuance, and revocation are restricted to authorized HR and Administrators."
      );
    }
  }

  /**
   * Prepares a draft job offer for a candidate application.
   * Gated: HR / Admin only.
   */
  async createDraftOffer(
    user: AuthenticatedUser,
    input: CreateJobOfferInput
  ): Promise<JobOfferDetail> {
    this.assertStaffAccess(user);

    const application = await prisma.application.findUnique({
      where: { id: input.applicationId },
      include: {
        candidate: {
          include: {
            user: { select: { id: true, name: true, email: true } },
          },
        },
        opening: { select: { id: true, title: true, type: true } },
        jobOffer: true,
      },
    });

    if (!application) {
      throw new NotFoundError("Application record not found.");
    }

    if (application.isArchived) {
      throw new ValidationError("Cannot prepare offer for an archived application.");
    }

    if (application.jobOffer && application.jobOffer.status !== OfferStatus.REVOKED && application.jobOffer.status !== OfferStatus.DECLINED) {
      throw new ValidationError(
        `An active job offer already exists for this application with status ${application.jobOffer.status}.`
      );
    }

    // Must be in an eligible stage
    const eligibleStatuses: ApplicationStatus[] = [
      ApplicationStatus.INTERVIEWED,
      ApplicationStatus.EVALUATION_SELECTED,
      ApplicationStatus.OFFERED,
      ApplicationStatus.SHORTLISTED,
    ];

    if (!eligibleStatuses.includes(application.status)) {
      throw new ValidationError(
        `Application is in state ${application.status}. Candidate must be interviewed or shortlisted before extending an offer.`
      );
    }

    const offer = await prisma.$transaction(async (tx) => {
      // If previous revoked/declined offer existed, remove or upsert
      if (application.jobOffer) {
        await tx.jobOffer.delete({
          where: { id: application.jobOffer.id },
        });
      }

      const created = await tx.jobOffer.create({
        data: {
          applicationId: application.id,
          status: OfferStatus.DRAFT,
          expectedJoiningDate: new Date(input.expectedJoiningDate),
          department: input.department.trim(),
          designation: input.designation.trim(),
          location: input.location?.trim() || null,
          termsSummary: input.termsSummary.trim(),
          notes: input.notes?.trim() || null,
        },
        include: {
          extendedBy: { select: { id: true, name: true, email: true } },
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: user.id,
          actorRole: user.roles[0] ?? "HR",
          action: "CREATE_DRAFT_JOB_OFFER",
          resourceType: "JOB_OFFER",
          resourceId: created.id,
          diffPayload: {
            applicationId: application.id,
            department: created.department,
            designation: created.designation,
            expectedJoiningDate: created.expectedJoiningDate,
          },
        },
      });

      return created;
    });

    return {
      id: offer.id,
      applicationId: application.id,
      referenceCode: application.referenceCode,
      candidateName: application.candidate.user.name,
      candidateEmail: application.candidate.user.email,
      openingTitle: application.opening.title,
      status: offer.status,
      expectedJoiningDate: offer.expectedJoiningDate,
      department: offer.department,
      designation: offer.designation,
      location: offer.location,
      termsSummary: offer.termsSummary,
      extendedBy: offer.extendedBy,
      extendedAt: offer.extendedAt,
      decisionAt: offer.decisionAt,
      declineReason: offer.declineReason,
      notes: offer.notes,
      createdAt: offer.createdAt,
    };
  }

  /**
   * Extends the job offer to the candidate.
   * Transitions JobOffer to EXTENDED and Application to OFFERED.
   */
  async extendOffer(user: AuthenticatedUser, offerId: string): Promise<void> {
    this.assertStaffAccess(user);

    const offer = await prisma.jobOffer.findUnique({
      where: { id: offerId },
      include: {
        application: {
          include: {
            candidate: {
              include: {
                user: { select: { id: true, name: true, email: true } },
              },
            },
            opening: { select: { title: true } },
          },
        },
      },
    });

    if (!offer) {
      throw new NotFoundError("Job offer not found.");
    }

    if (offer.status !== OfferStatus.DRAFT) {
      throw new ValidationError(
        `Cannot extend offer: current offer status is ${offer.status}. Only DRAFT offers can be extended.`
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.jobOffer.update({
        where: { id: offer.id },
        data: {
          status: OfferStatus.EXTENDED,
          extendedById: user.id,
          extendedAt: new Date(),
        },
      });

      await tx.application.update({
        where: { id: offer.applicationId },
        data: {
          status: ApplicationStatus.OFFERED,
        },
      });

      await tx.applicationStatusHistory.create({
        data: {
          applicationId: offer.applicationId,
          fromStatus: offer.application.status,
          toStatus: ApplicationStatus.OFFERED,
          actorId: user.id,
          internalNotes: `Formal offer extended for ${offer.designation} (${offer.department})`,
          candidateMessage: `Congratulations! A formal offer has been extended for ${offer.designation} at GARA Innovation. Please review and respond in your candidate portal.`,
        },
      });

      // Outbox notification
      await tx.notificationOutbox.create({
        data: {
          recipientEmail: offer.application.candidate.user.email,
          templateName: "JOB_OFFER_EXTENDED",
          payload: {
            candidateName: offer.application.candidate.user.name,
            designation: offer.designation,
            department: offer.department,
            expectedJoiningDate: offer.expectedJoiningDate.toISOString(),
            applicationReference: offer.application.referenceCode,
          },
          status: "PENDING",
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: user.id,
          actorRole: user.roles[0] ?? "HR",
          action: "EXTEND_JOB_OFFER",
          resourceType: "JOB_OFFER",
          resourceId: offer.id,
          diffPayload: {
            candidateId: offer.application.candidate.id,
            designation: offer.designation,
          },
        },
      });
    });
  }

  /**
   * Candidate accepts or declines the extended offer.
   * Gated: Authenticated candidate who owns the application.
   */
  async candidateDecideOffer(
    user: AuthenticatedUser,
    input: CandidateOfferDecisionInput
  ): Promise<void> {
    const offer = await prisma.jobOffer.findUnique({
      where: { id: input.offerId },
      include: {
        application: {
          include: {
            candidate: {
              include: {
                user: { select: { id: true, name: true, email: true } },
              },
            },
            opening: { select: { title: true } },
          },
        },
      },
    });

    if (!offer) {
      throw new NotFoundError("Job offer not found.");
    }

    if (offer.application.candidate.user.id !== user.id) {
      throw new ForbiddenError("You are not authorized to respond to this job offer.");
    }

    if (offer.status !== OfferStatus.EXTENDED) {
      throw new ValidationError(
        `Cannot respond to offer: Current status is ${offer.status}. You can only respond to active EXTENDED offers.`
      );
    }

    await prisma.$transaction(async (tx) => {
      const now = new Date();
      if (input.decision === "ACCEPT") {
        await tx.jobOffer.update({
          where: { id: offer.id },
          data: {
            status: OfferStatus.ACCEPTED,
            decisionAt: now,
          },
        });

        await tx.application.update({
          where: { id: offer.applicationId },
          data: {
            status: ApplicationStatus.OFFER_ACCEPTED,
          },
        });

        await tx.applicationStatusHistory.create({
          data: {
            applicationId: offer.applicationId,
            fromStatus: ApplicationStatus.OFFERED,
            toStatus: ApplicationStatus.OFFER_ACCEPTED,
            actorId: user.id,
            internalNotes: "Candidate formally accepted the job offer terms via portal.",
            candidateMessage: "Thank you for accepting the offer. Our HR team will reach out with onboarding next steps.",
          },
        });

        await tx.auditLog.create({
          data: {
            actorId: user.id,
            actorRole: Role.CANDIDATE,
            action: "ACCEPT_JOB_OFFER",
            resourceType: "JOB_OFFER",
            resourceId: offer.id,
            diffPayload: { decision: "ACCEPT", decisionAt: now },
          },
        });
      } else {
        await tx.jobOffer.update({
          where: { id: offer.id },
          data: {
            status: OfferStatus.DECLINED,
            decisionAt: now,
            declineReason: input.declineReason || "Declined by candidate",
          },
        });

        await tx.application.update({
          where: { id: offer.applicationId },
          data: {
            status: ApplicationStatus.WITHDRAWN,
          },
        });

        await tx.applicationStatusHistory.create({
          data: {
            applicationId: offer.applicationId,
            fromStatus: ApplicationStatus.OFFERED,
            toStatus: ApplicationStatus.WITHDRAWN,
            actorId: user.id,
            internalNotes: `Candidate declined offer. Reason: ${input.declineReason || "None provided"}`,
            candidateMessage: "You have declined the offer. We appreciate your time and interest in GARA Innovation.",
          },
        });

        await tx.auditLog.create({
          data: {
            actorId: user.id,
            actorRole: Role.CANDIDATE,
            action: "DECLINE_JOB_OFFER",
            resourceType: "JOB_OFFER",
            resourceId: offer.id,
            diffPayload: {
              decision: "DECLINE",
              reason: input.declineReason,
              decisionAt: now,
            },
          },
        });
      }
    });
  }

  /**
   * Revokes an extended or draft offer.
   * Gated: HR / Admin only.
   */
  async revokeOffer(
    user: AuthenticatedUser,
    offerId: string,
    reason?: string
  ): Promise<void> {
    this.assertStaffAccess(user);

    const offer = await prisma.jobOffer.findUnique({
      where: { id: offerId },
      include: {
        application: true,
      },
    });

    if (!offer) {
      throw new NotFoundError("Job offer not found.");
    }

    if (offer.status === OfferStatus.ACCEPTED) {
      throw new ValidationError(
        "Cannot revoke an already accepted offer. Employee record lifecycle procedures must be initiated instead."
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.jobOffer.update({
        where: { id: offer.id },
        data: {
          status: OfferStatus.REVOKED,
          declineReason: reason || "Offer revoked by administration",
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: user.id,
          actorRole: user.roles[0] ?? "HR",
          action: "REVOKE_JOB_OFFER",
          resourceType: "JOB_OFFER",
          resourceId: offer.id,
          diffPayload: { reason },
        },
      });
    });
  }

  /**
   * Retrieves offer detail with strict role-based data projection.
   */
  async getOfferDetail(
    user: AuthenticatedUser,
    offerId: string
  ): Promise<JobOfferDetail> {
    const offer = await prisma.jobOffer.findUnique({
      where: { id: offerId },
      include: {
        application: {
          include: {
            candidate: {
              include: {
                user: { select: { id: true, name: true, email: true } },
              },
            },
            opening: { select: { title: true } },
          },
        },
        extendedBy: { select: { id: true, name: true, email: true } },
      },
    });

    if (!offer) {
      throw new NotFoundError("Job offer not found.");
    }

    const isStaff = user.roles.some((r) => OFFER_MANAGEMENT_ROLES.includes(r));
    const isCandidateOwner = offer.application.candidate.user.id === user.id;

    if (!isStaff && !isCandidateOwner) {
      throw new ForbiddenError("You are not authorized to view this offer.");
    }

    return {
      id: offer.id,
      applicationId: offer.applicationId,
      referenceCode: offer.application.referenceCode,
      candidateName: offer.application.candidate.user.name,
      candidateEmail: offer.application.candidate.user.email,
      openingTitle: offer.application.opening.title,
      status: offer.status,
      expectedJoiningDate: offer.expectedJoiningDate,
      department: offer.department,
      designation: offer.designation,
      location: offer.location,
      termsSummary: offer.termsSummary,
      extendedBy: offer.extendedBy,
      extendedAt: offer.extendedAt,
      decisionAt: offer.decisionAt,
      declineReason: offer.declineReason,
      // Staff notes are confidential and NEVER sent to candidate
      notes: isStaff ? offer.notes : null,
      createdAt: offer.createdAt,
    };
  }

  /**
   * Retrieves offer by application ID.
   */
  async getOfferByApplicationId(
    user: AuthenticatedUser,
    applicationId: string
  ): Promise<JobOfferDetail | null> {
    const offer = await prisma.jobOffer.findUnique({
      where: { applicationId },
      select: { id: true },
    });

    if (!offer) return null;
    return this.getOfferDetail(user, offer.id);
  }
}

export const offerService = new OfferService();
