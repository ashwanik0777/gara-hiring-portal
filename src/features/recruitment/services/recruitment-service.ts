import { prisma } from "@/lib/db";
import { AuthenticatedUser } from "@/lib/auth/guards";
import {
  Role,
  ApplicationStatus,
  InterviewStatus,
  Prisma,
} from "@prisma/client";
import {
  QueueFilters,
  RecruiterApplicationItem,
  RecruiterApplicationDetail,
} from "../types";
import {
  VALID_APPLICATION_TRANSITIONS,
  TransitionStatusInput,
  ScheduleInterviewInput,
  RescheduleInterviewInput,
  CancelInterviewInput,
  SubmitFeedbackInput,
} from "../schemas";
import { FormSchemaDefinition } from "@/features/application-forms/types";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";

const STAFF_ROLES: Role[] = [Role.ADMIN, Role.HR, Role.INTERVIEWER, Role.MANAGER];
const DECISION_ROLES: Role[] = [Role.ADMIN, Role.HR];

export class RecruitmentService {
  private assertStaffAccess(user: AuthenticatedUser): void {
    const isStaff = user.roles.some((r) => STAFF_ROLES.includes(r));
    if (!isStaff) {
      throw new ForbiddenError("Recruitment operational access requires staff authorization.");
    }
  }

  private assertDecisionAuthority(user: AuthenticatedUser): void {
    const isDecisionMaker = user.roles.some((r) => DECISION_ROLES.includes(r));
    if (!isDecisionMaker) {
      throw new ForbiddenError(
        "Recruitment stage transitions and final decisions are restricted to authorized HR and Administrators. Interviewers provide advisory recommendations only."
      );
    }
  }

  /**
   * Retrieves applications queue with flexible filtering and search.
   */
  async getRecruitmentQueue(
    user: AuthenticatedUser,
    filters?: QueueFilters
  ): Promise<RecruiterApplicationItem[]> {
    this.assertStaffAccess(user);

    const where: Prisma.ApplicationWhereInput = {
      isArchived: false,
    };

    if (filters?.status) {
      where.status = filters.status;
    }
    if (filters?.openingId) {
      where.openingId = filters.openingId;
    }
    if (filters?.assignedRecruiterId) {
      where.assignedRecruiterId = filters.assignedRecruiterId;
    }

    if (filters?.search) {
      const query = filters.search.trim();
      where.OR = [
        { referenceCode: { contains: query, mode: "insensitive" } },
        { candidate: { user: { name: { contains: query, mode: "insensitive" } } } },
        { candidate: { user: { email: { contains: query, mode: "insensitive" } } } },
      ];
    }

    const applications = await prisma.application.findMany({
      where,
      include: {
        opening: {
          select: {
            id: true,
            title: true,
            slug: true,
            department: true,
            type: true,
            location: true,
          },
        },
        candidate: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        },
        assignedRecruiter: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        interviewSchedules: {
          orderBy: { scheduledAt: "desc" },
          take: 1,
          include: {
            interviewer: {
              select: { name: true },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return applications.map((app) => {
      const latestInt = app.interviewSchedules[0];
      return {
        id: app.id,
        referenceCode: app.referenceCode,
        status: app.status,
        createdAt: app.createdAt,
        updatedAt: app.updatedAt,
        opening: app.opening,
        candidate: {
          id: app.candidate.id,
          userId: app.candidate.user.id,
          fullName: app.candidate.user.name,
          email: app.candidate.user.email,
          phone: app.candidate.phone,
          location: app.candidate.location,
        },
        assignedRecruiter: app.assignedRecruiter,
        latestInterview: latestInt
          ? {
              id: latestInt.id,
              roundName: latestInt.roundName,
              scheduledAt: latestInt.scheduledAt,
              status: latestInt.status,
              interviewerName: latestInt.interviewer?.name ?? null,
            }
          : null,
      };
    });
  }

  /**
   * Retrieves complete application detail for staff cockpit.
   * Includes internal screening notes, interviewer feedback, and audit history.
   */
  async getRecruiterApplicationDetail(
    applicationId: string,
    user: AuthenticatedUser
  ): Promise<RecruiterApplicationDetail> {
    this.assertStaffAccess(user);

    const app = await prisma.application.findUnique({
      where: { id: applicationId },
      include: {
        opening: {
          select: {
            id: true,
            title: true,
            slug: true,
            department: true,
            type: true,
            location: true,
          },
        },
        candidate: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        },
        formVersion: {
          select: {
            versionNumber: true,
            schemaDefinition: true,
          },
        },
        assignedRecruiter: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        statusHistory: {
          orderBy: { createdAt: "asc" },
          include: {
            actor: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        },
        interviewSchedules: {
          orderBy: { scheduledAt: "asc" },
          include: {
            interviewer: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
            scheduledBy: {
              select: {
                id: true,
                name: true,
              },
            },
            feedback: {
              include: {
                interviewer: {
                  select: { name: true },
                },
              },
            },
          },
        },
      },
    });

    if (!app) {
      throw new NotFoundError("Application record not found.");
    }

    return {
      id: app.id,
      referenceCode: app.referenceCode,
      status: app.status,
      createdAt: app.createdAt,
      updatedAt: app.updatedAt,
      opening: app.opening,
      candidate: {
        id: app.candidate.id,
        userId: app.candidate.user.id,
        fullName: app.candidate.user.name,
        email: app.candidate.user.email,
        phone: app.candidate.phone,
        location: app.candidate.location,
      },
      assignedRecruiter: app.assignedRecruiter,
      formVersion: {
        versionNumber: app.formVersion.versionNumber,
        schemaDefinition: app.formVersion.schemaDefinition as unknown as FormSchemaDefinition,
      },
      submittedResponses: (app.submittedResponses ?? {}) as Record<string, unknown>,
      resumeStorageKey: app.resumeStorageKey,
      resumeDownloadUrl: `/api/candidate/applications/${app.id}/resume`,
      statusHistory: app.statusHistory.map((h) => ({
        id: h.id,
        fromStatus: h.fromStatus,
        toStatus: h.toStatus,
        internalNotes: h.internalNotes,
        candidateMessage: h.candidateMessage,
        createdAt: h.createdAt,
        actor: h.actor,
      })),
      interviewSchedules: app.interviewSchedules.map((s) => ({
        id: s.id,
        roundNumber: s.roundNumber,
        roundName: s.roundName,
        scheduledAt: s.scheduledAt,
        durationMinutes: s.durationMinutes,
        meetingLink: s.meetingLink,
        status: s.status,
        interviewer: s.interviewer,
        scheduledBy: s.scheduledBy,
        rescheduleReason: s.rescheduleReason,
        cancellationReason: s.cancellationReason,
        feedback: s.feedback
          ? {
              id: s.feedback.id,
              recommendation: s.feedback.recommendation,
              ratings: (s.feedback.ratings ?? {}) as Record<string, unknown>,
              summaryNotes: s.feedback.summaryNotes,
              submittedAt: s.feedback.submittedAt,
              interviewerName: s.feedback.interviewer.name,
            }
          : null,
      })),
    };
  }

  /**
   * Executes an authorized recruitment stage transition.
   * Enforces state machine validation and decision authority.
   */
  async transitionApplicationStatus(
    user: AuthenticatedUser,
    input: TransitionStatusInput
  ): Promise<void> {
    this.assertDecisionAuthority(user);

    const app = await prisma.application.findUnique({
      where: { id: input.applicationId },
      include: {
        candidate: {
          include: {
            user: { select: { email: true, name: true } },
          },
        },
        opening: { select: { title: true, type: true } },
      },
    });

    if (!app) {
      throw new NotFoundError("Application record not found.");
    }

    if (
      input.toStatus === ApplicationStatus.EVALUATION_SELECTED &&
      app.opening.type !== "INTERNSHIP"
    ) {
      throw new ValidationError(
        "7-working-day supervised evaluation is restricted to internship openings. Full-time positions proceed directly to offer preparation."
      );
    }

    const allowedNextStatuses = VALID_APPLICATION_TRANSITIONS[app.status] ?? [];
    if (!allowedNextStatuses.includes(input.toStatus)) {
      throw new ValidationError(
        `Invalid status transition: Cannot transition application from ${app.status} to ${input.toStatus}. Allowed transitions: ${allowedNextStatuses.join(", ") || "None (Terminal State)"}`
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.application.update({
        where: { id: app.id },
        data: {
          status: input.toStatus,
          isArchived: input.toStatus === ApplicationStatus.ARCHIVED,
          archivedAt: input.toStatus === ApplicationStatus.ARCHIVED ? new Date() : undefined,
        },
      });

      await tx.applicationStatusHistory.create({
        data: {
          applicationId: app.id,
          fromStatus: app.status,
          toStatus: input.toStatus,
          actorId: user.id,
          internalNotes: input.internalNotes || null,
          candidateMessage: input.candidateMessage || null,
        },
      });

      // If a candidate-facing notification is supplied, queue it in the outbox
      if (input.candidateMessage) {
        await tx.notificationOutbox.create({
          data: {
            recipientEmail: app.candidate.user.email,
            templateName: "APPLICATION_STAGE_UPDATE",
            payload: {
              referenceCode: app.referenceCode,
              candidateName: app.candidate.user.name,
              openingTitle: app.opening.title,
              newStatus: input.toStatus,
              message: input.candidateMessage,
            },
            status: "PENDING",
          },
        });
      }

      await tx.auditLog.create({
        data: {
          actorId: user.id,
          actorRole: user.roles[0] ?? "STAFF",
          action: "TRANSITION_APPLICATION_STAGE",
          resourceType: "APPLICATION",
          resourceId: app.id,
          diffPayload: {
            fromStatus: app.status,
            toStatus: input.toStatus,
            hasInternalNotes: Boolean(input.internalNotes),
          },
        },
      });
    });
  }

  /**
   * Assigns an authorized recruiter to manage an application.
   */
  async assignRecruiter(
    user: AuthenticatedUser,
    applicationId: string,
    recruiterId: string | null
  ): Promise<void> {
    this.assertDecisionAuthority(user);

    const app = await prisma.application.findUnique({
      where: { id: applicationId },
    });
    if (!app) throw new NotFoundError("Application not found.");

    await prisma.application.update({
      where: { id: applicationId },
      data: { assignedRecruiterId: recruiterId },
    });
  }

  /**
   * Schedules an interview round with an assigned interviewer.
   */
  async scheduleInterview(
    user: AuthenticatedUser,
    input: ScheduleInterviewInput
  ): Promise<{ scheduleId: string }> {
    this.assertDecisionAuthority(user);

    const app = await prisma.application.findUnique({
      where: { id: input.applicationId },
      include: {
        candidate: {
          include: {
            user: { select: { email: true, name: true } },
          },
        },
        opening: { select: { title: true } },
      },
    });

    if (!app) throw new NotFoundError("Application not found.");

    const scheduledDate = new Date(input.scheduledAt);
    if (isNaN(scheduledDate.getTime())) {
      throw new ValidationError("Invalid interview scheduled date/time.");
    }

    const schedule = await prisma.$transaction(async (tx) => {
      const createdSchedule = await tx.interviewSchedule.create({
        data: {
          applicationId: app.id,
          roundNumber: input.roundNumber,
          roundName: input.roundName,
          scheduledAt: scheduledDate,
          durationMinutes: input.durationMinutes,
          meetingLink: input.meetingLink || null,
          interviewerId: input.interviewerId || null,
          scheduledById: user.id,
          status: InterviewStatus.SCHEDULED,
        },
      });

      // Advance application status to INTERVIEW_SCHEDULED if shortlisted or screened
      if (
        app.status === ApplicationStatus.SHORTLISTED ||
        app.status === ApplicationStatus.INTERVIEWED
      ) {
        await tx.application.update({
          where: { id: app.id },
          data: { status: ApplicationStatus.INTERVIEW_SCHEDULED },
        });

        await tx.applicationStatusHistory.create({
          data: {
            applicationId: app.id,
            fromStatus: app.status,
            toStatus: ApplicationStatus.INTERVIEW_SCHEDULED,
            actorId: user.id,
            internalNotes: `Scheduled Round ${input.roundNumber}: ${input.roundName}`,
            candidateMessage: `Your interview for ${input.roundName} has been scheduled for ${scheduledDate.toLocaleString()}.`,
          },
        });
      }

      // Queue email notification
      await tx.notificationOutbox.create({
        data: {
          recipientEmail: app.candidate.user.email,
          templateName: "INTERVIEW_INVITATION",
          payload: {
            referenceCode: app.referenceCode,
            candidateName: app.candidate.user.name,
            openingTitle: app.opening.title,
            roundName: input.roundName,
            scheduledAt: scheduledDate.toISOString(),
            durationMinutes: input.durationMinutes,
            meetingLink: input.meetingLink ?? null,
          },
          status: "PENDING",
        },
      });

      return createdSchedule;
    });

    return { scheduleId: schedule.id };
  }

  /**
   * Reschedules an existing interview round, recording justification.
   */
  async rescheduleInterview(
    user: AuthenticatedUser,
    input: RescheduleInterviewInput
  ): Promise<void> {
    this.assertDecisionAuthority(user);

    const schedule = await prisma.interviewSchedule.findUnique({
      where: { id: input.scheduleId },
      include: {
        application: {
          include: {
            candidate: {
              include: { user: { select: { email: true, name: true } } },
            },
          },
        },
      },
    });

    if (!schedule) throw new NotFoundError("Interview schedule not found.");

    const newDate = new Date(input.newScheduledAt);
    if (isNaN(newDate.getTime())) {
      throw new ValidationError("Invalid new scheduled date/time.");
    }

    await prisma.$transaction(async (tx) => {
      await tx.interviewSchedule.update({
        where: { id: schedule.id },
        data: {
          scheduledAt: newDate,
          status: InterviewStatus.RESCHEDULED,
          rescheduleReason: input.rescheduleReason,
        },
      });

      await tx.applicationStatusHistory.create({
        data: {
          applicationId: schedule.applicationId,
          fromStatus: schedule.application.status,
          toStatus: schedule.application.status,
          actorId: user.id,
          internalNotes: `Rescheduled ${schedule.roundName}: ${input.rescheduleReason}`,
          candidateMessage: `Your interview for ${schedule.roundName} has been rescheduled to ${newDate.toLocaleString()}.`,
        },
      });

      await tx.notificationOutbox.create({
        data: {
          recipientEmail: schedule.application.candidate.user.email,
          templateName: "INTERVIEW_RESCHEDULED",
          payload: {
            candidateName: schedule.application.candidate.user.name,
            roundName: schedule.roundName,
            newScheduledAt: newDate.toISOString(),
            reason: input.rescheduleReason,
          },
          status: "PENDING",
        },
      });
    });
  }

  /**
   * Cancels a scheduled interview round with reason.
   */
  async cancelInterview(
    user: AuthenticatedUser,
    input: CancelInterviewInput
  ): Promise<void> {
    this.assertDecisionAuthority(user);

    const schedule = await prisma.interviewSchedule.findUnique({
      where: { id: input.scheduleId },
      include: {
        application: {
          include: {
            candidate: {
              include: { user: { select: { email: true, name: true } } },
            },
          },
        },
      },
    });

    if (!schedule) throw new NotFoundError("Interview schedule not found.");

    await prisma.$transaction(async (tx) => {
      await tx.interviewSchedule.update({
        where: { id: schedule.id },
        data: {
          status: InterviewStatus.CANCELLED,
          cancellationReason: input.cancellationReason,
        },
      });

      await tx.applicationStatusHistory.create({
        data: {
          applicationId: schedule.applicationId,
          fromStatus: schedule.application.status,
          toStatus: schedule.application.status,
          actorId: user.id,
          internalNotes: `Cancelled ${schedule.roundName}: ${input.cancellationReason}`,
          candidateMessage: `Your scheduled interview for ${schedule.roundName} has been cancelled. Our team will follow up with further updates.`,
        },
      });

      await tx.notificationOutbox.create({
        data: {
          recipientEmail: schedule.application.candidate.user.email,
          templateName: "INTERVIEW_CANCELLED",
          payload: {
            candidateName: schedule.application.candidate.user.name,
            roundName: schedule.roundName,
            reason: input.cancellationReason,
          },
          status: "PENDING",
        },
      });
    });
  }

  /**
   * Submits structured interviewer evaluation & advisory recommendation.
   * Enforces that only the assigned interviewer (or Admin) can submit feedback.
   */
  async submitInterviewFeedback(
    user: AuthenticatedUser,
    input: SubmitFeedbackInput
  ): Promise<void> {
    this.assertStaffAccess(user);

    const schedule = await prisma.interviewSchedule.findUnique({
      where: { id: input.scheduleId },
      include: { application: true },
    });

    if (!schedule) throw new NotFoundError("Interview schedule not found.");

    // Enforce that only the assigned interviewer or an administrator can evaluate
    const isAdmin = user.roles.includes(Role.ADMIN) || user.roles.includes(Role.HR);
    const isAssigned = schedule.interviewerId === user.id;

    if (!isAdmin && !isAssigned) {
      throw new ForbiddenError(
        "You are not the designated interviewer assigned to submit feedback for this session."
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.interviewFeedback.upsert({
        where: { scheduleId: schedule.id },
        create: {
          scheduleId: schedule.id,
          interviewerId: user.id,
          ratings: input.ratings as Prisma.InputJsonValue,
          recommendation: input.recommendation,
          summaryNotes: input.summaryNotes,
        },
        update: {
          ratings: input.ratings as Prisma.InputJsonValue,
          recommendation: input.recommendation,
          summaryNotes: input.summaryNotes,
        },
      });

      await tx.interviewSchedule.update({
        where: { id: schedule.id },
        data: { status: InterviewStatus.COMPLETED },
      });

      // Update application status to INTERVIEWED if currently INTERVIEW_SCHEDULED
      if (schedule.application.status === ApplicationStatus.INTERVIEW_SCHEDULED) {
        await tx.application.update({
          where: { id: schedule.applicationId },
          data: { status: ApplicationStatus.INTERVIEWED },
        });

        await tx.applicationStatusHistory.create({
          data: {
            applicationId: schedule.applicationId,
            fromStatus: ApplicationStatus.INTERVIEW_SCHEDULED,
            toStatus: ApplicationStatus.INTERVIEWED,
            actorId: user.id,
            internalNotes: `Interviewer recommendation submitted: ${input.recommendation}. Advisory summary: ${input.summaryNotes}`,
            candidateMessage: `Your interview for ${schedule.roundName} has concluded and is under review.`,
          },
        });
      }
    });
  }
}

export const recruitmentService = new RecruitmentService();
