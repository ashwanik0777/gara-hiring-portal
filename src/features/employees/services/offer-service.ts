import { prisma } from "@/lib/db";
import { assertPermission, hasPermission, type AuthenticatedUser } from "@/lib/auth/guards";
import { Role, ApplicationStatus, OfferStatus, Prisma } from "@prisma/client";
import {
  CreateJobOfferInput,
  CandidateOfferDecisionInput,
  RevokeJobOfferInput,
} from "../schemas";
import { JobOfferDetail } from "../types";
import { VALID_APPLICATION_TRANSITIONS } from "@/features/recruitment/schemas";
import { assertNotOwnApplication } from "@/features/recruitment/services/application-access";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "@/lib/errors";

const OFFER_MANAGEMENT_ROLES: Role[] = [Role.ADMIN, Role.HR];

/** Offer states a candidate may see. Drafts, revoked and expired offers stay internal. */
const CANDIDATE_VISIBLE_OFFER_STATUSES: OfferStatus[] = [
  OfferStatus.EXTENDED,
  OfferStatus.ACCEPTED,
  OfferStatus.DECLINED,
];

/** Offer states that may still be revoked by staff. */
const REVOCABLE_OFFER_STATUSES: OfferStatus[] = [OfferStatus.DRAFT, OfferStatus.EXTENDED];

/**
 * Stage restored when an extended offer is revoked and the stage it was extended from cannot
 * be determined (e.g. legacy data without stage history). INTERVIEWED is the earliest stage
 * from which VALID_APPLICATION_TRANSITIONS allows an offer, so the fallback never skips the
 * application ahead and keeps every explicit follow-up (another round, evaluation, a new
 * decision) available to staff.
 */
export const REVOKE_FALLBACK_APPLICATION_STATUS: ApplicationStatus = ApplicationStatus.INTERVIEWED;

const offerDetailInclude = {
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
} satisfies Prisma.JobOfferInclude;

type OfferWithDetail = Prisma.JobOfferGetPayload<{ include: typeof offerDetailInclude }>;

/**
 * An offer may be prepared/extended only from a stage whose transition map allows OFFERED.
 * An application already in OFFERED without any offer record (legacy data) is also accepted.
 */
function canMoveToOffered(status: ApplicationStatus): boolean {
  return (
    status === ApplicationStatus.OFFERED ||
    (VALID_APPLICATION_TRANSITIONS[status] ?? []).includes(ApplicationStatus.OFFERED)
  );
}

export class OfferService {
  /**
   * Offer preparation, extension and revocation: HR/Admin role plus the employees permission.
   */
  private async assertOfferManager(user: AuthenticatedUser): Promise<void> {
    const isAuthorized = user.roles.some((r) => OFFER_MANAGEMENT_ROLES.includes(r));
    if (!isAuthorized) {
      throw new ForbiddenError(
        "Job offer preparation, issuance, and revocation are restricted to authorized HR and Administrators."
      );
    }
    await assertPermission(user, "canEmployees");
  }

  private async isOfferManager(user: AuthenticatedUser): Promise<boolean> {
    if (!user.roles.some((r) => OFFER_MANAGEMENT_ROLES.includes(r))) {
      return false;
    }
    return hasPermission(user, "canEmployees");
  }

  /**
   * Prepares a draft job offer for a candidate application.
   * Gated: HR / Admin with canEmployees. Offer history is never deleted: the schema allows
   * one offer per application, so a replacement offer cannot be created here.
   */
  async createDraftOffer(
    user: AuthenticatedUser,
    input: CreateJobOfferInput
  ): Promise<JobOfferDetail> {
    await this.assertOfferManager(user);

    const offer = await prisma.$transaction(async (tx) => {
      const application = await tx.application.findUnique({
        where: { id: input.applicationId },
        include: {
          jobOffer: { select: { status: true } },
          candidate: { select: { userId: true } },
        },
      });

      if (!application) {
        throw new NotFoundError("Application record not found.");
      }

      assertNotOwnApplication(user, application.candidate.userId);

      if (application.isArchived) {
        throw new ValidationError("Cannot prepare offer for an archived application.");
      }

      if (application.jobOffer) {
        throw new ConflictError(
          `A job offer record already exists for this application (status ${application.jobOffer.status}). Offer history is preserved, so a replacement offer cannot be prepared for the same application.`
        );
      }

      if (!canMoveToOffered(application.status)) {
        throw new ValidationError(
          `Application is in state ${application.status}. An offer can only be prepared once the application may move to OFFERED (e.g. after the interview stage).`
        );
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
        include: offerDetailInclude,
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
            expectedJoiningDate: created.expectedJoiningDate.toISOString(),
          },
        },
      });

      return created;
    });

    return this.toDetail(offer, true);
  }

  /**
   * Extends the job offer to the candidate.
   * Transitions JobOffer DRAFT -> EXTENDED and the Application to OFFERED atomically.
   */
  async extendOffer(
    user: AuthenticatedUser,
    offerId: string
  ): Promise<{ applicationId: string }> {
    await this.assertOfferManager(user);

    return prisma.$transaction(async (tx) => {
      const offer = await tx.jobOffer.findUnique({
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

      assertNotOwnApplication(user, offer.application.candidate.user.id);

      if (offer.status !== OfferStatus.DRAFT) {
        throw new ValidationError(
          `Cannot extend offer: current offer status is ${offer.status}. Only DRAFT offers can be extended.`
        );
      }

      const application = offer.application;
      if (application.isArchived || !canMoveToOffered(application.status)) {
        throw new ValidationError(
          `Cannot extend offer: the application is in status ${application.status}, which cannot move to OFFERED.`
        );
      }

      const offerUpdate = await tx.jobOffer.updateMany({
        where: { id: offer.id, status: OfferStatus.DRAFT },
        data: {
          status: OfferStatus.EXTENDED,
          extendedById: user.id,
          extendedAt: new Date(),
        },
      });
      if (offerUpdate.count !== 1) {
        throw new ConflictError("The offer was changed by another action. Reload and try again.");
      }

      if (application.status !== ApplicationStatus.OFFERED) {
        const appUpdate = await tx.application.updateMany({
          where: { id: application.id, status: application.status },
          data: { status: ApplicationStatus.OFFERED },
        });
        if (appUpdate.count !== 1) {
          throw new ConflictError(
            "The application stage was changed by another action. Reload and try again."
          );
        }
      }

      await tx.applicationStatusHistory.create({
        data: {
          applicationId: application.id,
          fromStatus: application.status,
          toStatus: ApplicationStatus.OFFERED,
          actorId: user.id,
          internalNotes: `Formal offer extended for ${offer.designation} (${offer.department})`,
          candidateMessage: `Congratulations! A formal offer has been extended for ${offer.designation} at GARA Innovation. Please review and respond in your candidate portal.`,
        },
      });

      // Outbox notification
      await tx.notificationOutbox.create({
        data: {
          recipientEmail: application.candidate.user.email,
          templateName: "JOB_OFFER_EXTENDED",
          payload: {
            candidateName: application.candidate.user.name,
            designation: offer.designation,
            department: offer.department,
            expectedJoiningDate: offer.expectedJoiningDate.toISOString(),
            applicationReference: application.referenceCode,
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
            candidateId: application.candidate.id,
            designation: offer.designation,
            previousApplicationStatus: application.status,
          },
        },
      });

      return { applicationId: application.id };
    });
  }

  /**
   * Candidate accepts or declines the extended offer.
   * Gated: authenticated candidate who owns the application. The application must still be
   * OFFERED. A decline is recorded on the offer only; the application stage is left for staff
   * to transition explicitly (OD-020).
   */
  async candidateDecideOffer(
    user: AuthenticatedUser,
    input: CandidateOfferDecisionInput
  ): Promise<{ applicationId: string }> {
    return prisma.$transaction(async (tx) => {
      const offer = await tx.jobOffer.findUnique({
        where: { id: input.offerId },
        include: {
          application: {
            include: {
              candidate: {
                include: {
                  user: { select: { id: true } },
                },
              },
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
          "This offer is no longer open for a response."
        );
      }

      if (offer.application.status !== ApplicationStatus.OFFERED) {
        throw new ValidationError(
          "This application is no longer awaiting an offer decision."
        );
      }

      const now = new Date();
      const accepted = input.decision === "ACCEPT";
      const declineReason = input.declineReason?.trim() || null;

      // Conditional writes: a concurrent revoke or stage change makes this decision fail.
      const offerUpdate = await tx.jobOffer.updateMany({
        where: { id: offer.id, status: OfferStatus.EXTENDED },
        data: accepted
          ? { status: OfferStatus.ACCEPTED, decisionAt: now }
          : { status: OfferStatus.DECLINED, decisionAt: now, declineReason },
      });
      if (offerUpdate.count !== 1) {
        throw new ConflictError("This offer is no longer open for a response.");
      }

      if (accepted) {
        const appUpdate = await tx.application.updateMany({
          where: { id: offer.applicationId, status: ApplicationStatus.OFFERED },
          data: { status: ApplicationStatus.OFFER_ACCEPTED },
        });
        if (appUpdate.count !== 1) {
          throw new ConflictError("This application is no longer awaiting an offer decision.");
        }

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
      } else {
        // Conditional touch: locks the row and fails if the stage moved concurrently.
        const appCheck = await tx.application.updateMany({
          where: { id: offer.applicationId, status: ApplicationStatus.OFFERED },
          data: { updatedAt: now },
        });
        if (appCheck.count !== 1) {
          throw new ConflictError("This application is no longer awaiting an offer decision.");
        }

        // Timeline entry only: the application stage is unchanged.
        await tx.applicationStatusHistory.create({
          data: {
            applicationId: offer.applicationId,
            fromStatus: ApplicationStatus.OFFERED,
            toStatus: ApplicationStatus.OFFERED,
            actorId: user.id,
            internalNotes: `Candidate declined the offer. Reason: ${declineReason ?? "None provided"}`,
            candidateMessage: "You have declined the offer. Thank you for letting us know.",
          },
        });
      }

      await tx.auditLog.create({
        data: {
          actorId: user.id,
          actorRole: Role.CANDIDATE,
          action: accepted ? "ACCEPT_JOB_OFFER" : "DECLINE_JOB_OFFER",
          resourceType: "JOB_OFFER",
          resourceId: offer.id,
          diffPayload: accepted
            ? { decision: "ACCEPT", decisionAt: now.toISOString() }
            : { decision: "DECLINE", reason: declineReason, decisionAt: now.toISOString() },
        },
      });

      return { applicationId: offer.applicationId };
    });
  }

  /**
   * Revokes a draft or extended offer.
   * Gated: HR / Admin with canEmployees. When an extended offer is revoked, the application
   * returns to the stage it had before the offer was extended, so it is never left hireable
   * or showing an offer the candidate can no longer act on.
   */
  async revokeOffer(
    user: AuthenticatedUser,
    input: RevokeJobOfferInput
  ): Promise<{ applicationId: string }> {
    await this.assertOfferManager(user);

    return prisma.$transaction(async (tx) => {
      const offer = await tx.jobOffer.findUnique({
        where: { id: input.offerId },
        include: {
          application: {
            select: { id: true, status: true, candidate: { select: { userId: true } } },
          },
        },
      });

      if (!offer) {
        throw new NotFoundError("Job offer not found.");
      }

      assertNotOwnApplication(user, offer.application.candidate.userId);

      if (!REVOCABLE_OFFER_STATUSES.includes(offer.status)) {
        throw new ValidationError(
          offer.status === OfferStatus.ACCEPTED
            ? "Cannot revoke an already accepted offer. Employee record lifecycle procedures must be initiated instead."
            : `Cannot revoke an offer in status ${offer.status}.`
        );
      }

      const reason = input.reason?.trim() || null;

      // Conditional write: fails if the candidate accepted/declined concurrently.
      const offerUpdate = await tx.jobOffer.updateMany({
        where: { id: offer.id, status: offer.status },
        data: {
          status: OfferStatus.REVOKED,
          declineReason: reason,
        },
      });
      if (offerUpdate.count !== 1) {
        throw new ConflictError("The offer was changed by another action. Reload and try again.");
      }

      let restoredStatus: ApplicationStatus | null = null;
      let usedFallbackStage = false;
      if (
        offer.status === OfferStatus.EXTENDED &&
        offer.application.status === ApplicationStatus.OFFERED
      ) {
        // The latest real move INTO OFFERED. Rows that stay in OFFERED (offer decline,
        // earlier revokes, legacy interview timeline entries) are not stage changes and
        // must never be mistaken for the pre-offer stage.
        const extensionEntry = await tx.applicationStatusHistory.findFirst({
          where: {
            applicationId: offer.applicationId,
            toStatus: ApplicationStatus.OFFERED,
            fromStatus: { not: ApplicationStatus.OFFERED },
          },
          orderBy: { createdAt: "desc" },
          select: { fromStatus: true },
        });
        const previous = Object.values(ApplicationStatus).find(
          (status) => status === extensionEntry?.fromStatus
        );
        // Only restore a stage from which the offer could legitimately have been extended;
        // otherwise use the documented fallback so the application never stays OFFERED
        // without a live offer.
        const canRestorePrevious =
          previous !== undefined &&
          previous !== ApplicationStatus.OFFERED &&
          (VALID_APPLICATION_TRANSITIONS[previous] ?? []).includes(ApplicationStatus.OFFERED);
        const target = canRestorePrevious ? previous : REVOKE_FALLBACK_APPLICATION_STATUS;
        usedFallbackStage = !canRestorePrevious;

        const appUpdate = await tx.application.updateMany({
          where: { id: offer.applicationId, status: ApplicationStatus.OFFERED },
          data: { status: target },
        });
        if (appUpdate.count !== 1) {
          throw new ConflictError(
            "The application stage was changed by another action. Reload and try again."
          );
        }
        restoredStatus = target;
      }

      await tx.applicationStatusHistory.create({
        data: {
          applicationId: offer.applicationId,
          fromStatus: offer.application.status,
          toStatus: restoredStatus ?? offer.application.status,
          actorId: user.id,
          internalNotes: `Job offer revoked (${offer.status}). Reason: ${reason ?? "None provided"}${
            usedFallbackStage
              ? `. The pre-offer stage could not be determined; the application was returned to ${REVOKE_FALLBACK_APPLICATION_STATUS}.`
              : ""
          }`,
          candidateMessage: null,
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: user.id,
          actorRole: user.roles[0] ?? "HR",
          action: "REVOKE_JOB_OFFER",
          resourceType: "JOB_OFFER",
          resourceId: offer.id,
          diffPayload: {
            previousOfferStatus: offer.status,
            reason,
            applicationStatusBefore: offer.application.status,
            applicationStatusAfter: restoredStatus ?? offer.application.status,
            usedFallbackStage,
          },
        },
      });

      return { applicationId: offer.applicationId };
    });
  }

  /**
   * Projects an offer for the viewer. Candidates never receive internal notes,
   * the revoke reason or staff contact details.
   */
  private toDetail(offer: OfferWithDetail, isStaffView: boolean): JobOfferDetail {
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
      extendedBy: isStaffView ? offer.extendedBy : null,
      extendedAt: offer.extendedAt,
      decisionAt: offer.decisionAt,
      declineReason:
        isStaffView || offer.status === OfferStatus.DECLINED ? offer.declineReason : null,
      // Staff notes are confidential and NEVER sent to candidate
      notes: isStaffView ? offer.notes : null,
      createdAt: offer.createdAt,
    };
  }

  /**
   * Returns the projection the user may see, or null when the offer is not visible to them.
   * The candidate always receives the candidate projection of their own offer, even when they
   * also hold an offer-management role (separation of duties).
   */
  private async projectForViewer(
    user: AuthenticatedUser,
    offer: OfferWithDetail
  ): Promise<JobOfferDetail | null> {
    const isCandidateOwner = offer.application.candidate.user.id === user.id;
    if (isCandidateOwner) {
      return CANDIDATE_VISIBLE_OFFER_STATUSES.includes(offer.status)
        ? this.toDetail(offer, false)
        : null;
    }
    if (await this.isOfferManager(user)) {
      return this.toDetail(offer, true);
    }
    return null;
  }

  /**
   * Retrieves offer detail with strict role-based data projection.
   * Throws when the viewer may not see the offer.
   */
  async getOfferDetail(
    user: AuthenticatedUser,
    offerId: string
  ): Promise<JobOfferDetail> {
    const offer = await prisma.jobOffer.findUnique({
      where: { id: offerId },
      include: offerDetailInclude,
    });

    if (!offer) {
      throw new NotFoundError("Job offer not found.");
    }

    const projection = await this.projectForViewer(user, offer);
    if (!projection) {
      throw new ForbiddenError("You are not authorized to view this offer.");
    }
    return projection;
  }

  /**
   * Retrieves the offer for an application, or null when none exists or the viewer may not
   * see it (e.g. interviewers without the employees permission, or a candidate viewing a
   * draft/revoked offer). Never throws for visibility so application pages render safely.
   */
  async getOfferByApplicationId(
    user: AuthenticatedUser,
    applicationId: string
  ): Promise<JobOfferDetail | null> {
    const offer = await prisma.jobOffer.findUnique({
      where: { applicationId },
      include: offerDetailInclude,
    });

    if (!offer) return null;
    return this.projectForViewer(user, offer);
  }
}

export const offerService = new OfferService();
