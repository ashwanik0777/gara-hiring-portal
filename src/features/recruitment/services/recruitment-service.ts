import { prisma } from "@/lib/db";
import { assertPermission, type AuthenticatedUser } from "@/lib/auth/guards";
import {
  Role,
  ApplicationStatus,
  InterviewStatus,
  OfferStatus,
  Prisma,
} from "@prisma/client";
import {
  QueueFilters,
  RecruiterApplicationItem,
  RecruiterApplicationDetail,
  InterviewerOption,
} from "../types";
import {
  VALID_APPLICATION_TRANSITIONS,
  FLOW_OWNED_APPLICATION_STATUSES,
  INTERVIEW_CLOSED_APPLICATION_STATUSES,
  FEEDBACK_LOCKED_APPLICATION_STATUSES,
  TransitionStatusInput,
  AssignRecruiterInput,
  ScheduleInterviewInput,
  RescheduleInterviewInput,
  CancelInterviewInput,
  SubmitFeedbackInput,
} from "../schemas";
import { FormSchemaDefinition } from "@/features/application-forms/types";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "@/lib/errors";
import {
  RECRUITMENT_STAFF_ROLES,
  OWN_APPLICATION_VIEW_MESSAGE,
  UNASSIGNED_APPLICATION_MESSAGE,
  assertNotOwnApplication,
  isAssignedToApplication,
  isInterviewerScoped,
  staffApplicationVisibility,
} from "./application-access";

const STAFF_ROLES: Role[] = RECRUITMENT_STAFF_ROLES;
const DECISION_ROLES: Role[] = [Role.ADMIN, Role.HR];
/** Roles that may be assigned to conduct an interview or manage an application. */
const ASSIGNABLE_STAFF_ROLES: Role[] = [Role.INTERVIEWER, Role.MANAGER, Role.HR, Role.ADMIN];
const OPEN_INTERVIEW_STATUSES: InterviewStatus[] = [
  InterviewStatus.SCHEDULED,
  InterviewStatus.RESCHEDULED,
];

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
   * Verifies that a user chosen as interviewer or recruiter exists and holds a staff role.
   */
  private async assertAssignableStaff(
    tx: Prisma.TransactionClient,
    userId: string,
    label: string
  ): Promise<void> {
    const assignee = await tx.user.findUnique({
      where: { id: userId },
      select: { id: true, roles: { select: { role: true } } },
    });
    const isStaff = assignee?.roles.some((r) => ASSIGNABLE_STAFF_ROLES.includes(r.role)) ?? false;
    if (!assignee || !isStaff) {
      throw new ValidationError(
        `The selected ${label} must be a staff member with the Interviewer, Manager, HR or Admin role.`
      );
    }
  }

  /**
   * Retrieves applications queue with flexible filtering and search.
   * Staff never see their own application here; interviewer-scoped users only see
   * applications they are assigned to.
   */
  async getRecruitmentQueue(
    user: AuthenticatedUser,
    filters?: QueueFilters
  ): Promise<RecruiterApplicationItem[]> {
    this.assertStaffAccess(user);
    await assertPermission(user, "canApplications");

    const scoped = isInterviewerScoped(user);
    const where: Prisma.ApplicationWhereInput = {
      isArchived: false,
      AND: [staffApplicationVisibility(user)],
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
          // Interviewer-scoped users only see their own interview rounds.
          where: scoped ? { interviewerId: user.id } : undefined,
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
   * Counts non-archived applications per stage, limited to the applications the user may
   * see in the queue so pipeline statistics never reveal records outside their scope.
   */
  async getRecruitmentStatusCounts(
    user: AuthenticatedUser
  ): Promise<{ counts: Partial<Record<ApplicationStatus, number>>; total: number }> {
    this.assertStaffAccess(user);
    await assertPermission(user, "canApplications");

    const groups = await prisma.application.groupBy({
      by: ["status"],
      where: { isArchived: false, AND: [staffApplicationVisibility(user)] },
      _count: { status: true },
    });

    const counts: Partial<Record<ApplicationStatus, number>> = {};
    let total = 0;
    for (const group of groups) {
      counts[group.status] = group._count.status;
      total += group._count.status;
    }
    return { counts, total };
  }

  /**
   * Retrieves complete application detail for staff cockpit.
   * Includes internal screening notes, interviewer feedback, and audit history.
   * Interviewer-scoped users may only open applications they are assigned to and receive a
   * reduced projection: their own interview rounds and feedback only, no internal notes and
   * no staff email addresses.
   */
  async getRecruiterApplicationDetail(
    applicationId: string,
    user: AuthenticatedUser
  ): Promise<RecruiterApplicationDetail> {
    this.assertStaffAccess(user);
    await assertPermission(user, "canApplications");
    const scoped = isInterviewerScoped(user);

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

    // Separation of duties: the candidate never sees the staff view of their own application.
    if (app.candidate.user.id === user.id) {
      throw new ForbiddenError(OWN_APPLICATION_VIEW_MESSAGE);
    }

    if (
      scoped &&
      !isAssignedToApplication(user.id, {
        assignedRecruiterId: app.assignedRecruiterId,
        interviewerIds: app.interviewSchedules.map((s) => s.interviewerId),
      })
    ) {
      throw new ForbiddenError(UNASSIGNED_APPLICATION_MESSAGE);
    }

    const visibleSchedules = scoped
      ? app.interviewSchedules.filter((s) => s.interviewerId === user.id)
      : app.interviewSchedules;

    return {
      id: app.id,
      referenceCode: app.referenceCode,
      status: app.status,
      createdAt: app.createdAt,
      updatedAt: app.updatedAt,
      restrictedView: scoped,
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
        internalNotes: scoped ? null : h.internalNotes,
        candidateMessage: h.candidateMessage,
        createdAt: h.createdAt,
        actor: h.actor
          ? { id: h.actor.id, name: h.actor.name, email: scoped ? null : h.actor.email }
          : null,
      })),
      interviewSchedules: visibleSchedules.map((s) => ({
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
        // Interviewer-scoped users only receive feedback they authored themselves.
        feedback:
          s.feedback && (!scoped || s.feedback.interviewerId === user.id)
            ? {
                id: s.feedback.id,
                recommendation: s.feedback.recommendation,
                ratings: (s.feedback.ratings ?? {}) as Record<string, unknown>,
                summaryNotes: s.feedback.summaryNotes,
                submittedAt: s.feedback.submittedAt,
                interviewerId: s.feedback.interviewerId,
                interviewerName: s.feedback.interviewer.name,
              }
            : null,
      })),
    };
  }

  /**
   * Lists interview sessions for the staff interview board.
   * Requires staff role and the canInterviews module permission. Interviews for the user's
   * own application are never listed; interviewer-scoped users only see the rounds they
   * conduct and only their own recommendation.
   */
  async getInterviewSchedules(
    user: AuthenticatedUser,
    options: { order?: "asc" | "desc" } = {}
  ) {
    this.assertStaffAccess(user);
    await assertPermission(user, "canInterviews");
    const scoped = isInterviewerScoped(user);

    const schedules = await prisma.interviewSchedule.findMany({
      where: {
        application: { candidate: { userId: { not: user.id } } },
        ...(scoped ? { interviewerId: user.id } : {}),
      },
      select: {
        id: true,
        applicationId: true,
        roundNumber: true,
        roundName: true,
        scheduledAt: true,
        durationMinutes: true,
        meetingLink: true,
        status: true,
        application: {
          select: {
            candidate: {
              select: {
                user: { select: { name: true } },
              },
            },
            opening: {
              select: { title: true, department: true },
            },
          },
        },
        interviewer: {
          select: { name: true },
        },
        feedback: {
          select: { recommendation: true, interviewerId: true },
        },
      },
      orderBy: { scheduledAt: options.order ?? "asc" },
    });

    return schedules.map(({ feedback, ...schedule }) => ({
      ...schedule,
      feedback:
        feedback && (!scoped || feedback.interviewerId === user.id)
          ? { recommendation: feedback.recommendation }
          : null,
    }));
  }

  /**
   * Lists staff members that may be assigned as interviewers.
   * Restricted to users who may schedule interviews (HR/Admin with canInterviews).
   */
  async listInterviewerOptions(user: AuthenticatedUser): Promise<InterviewerOption[]> {
    this.assertDecisionAuthority(user);
    await assertPermission(user, "canInterviews");

    const users = await prisma.user.findMany({
      where: { roles: { some: { role: { in: ASSIGNABLE_STAFF_ROLES } } } },
      select: {
        id: true,
        name: true,
        email: true,
        roles: { select: { role: true } },
      },
      orderBy: { name: "asc" },
    });

    return users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      roles: u.roles
        .map((r) => r.role)
        .filter((role) => ASSIGNABLE_STAFF_ROLES.includes(role)),
    }));
  }

  /**
   * Executes an authorized recruitment stage transition.
   * Enforces state machine validation and decision authority. Offer and hiring
   * statuses are owned by their dedicated flows and cannot be set here.
   */
  async transitionApplicationStatus(
    user: AuthenticatedUser,
    input: TransitionStatusInput
  ): Promise<{ applicationId: string; notificationQueued: boolean }> {
    this.assertDecisionAuthority(user);
    await assertPermission(user, "canApplications");

    if (FLOW_OWNED_APPLICATION_STATUSES.includes(input.toStatus)) {
      throw new ValidationError(
        `${input.toStatus} can only be reached through the job offer and hiring workflow (extend offer, candidate acceptance, employee creation).`
      );
    }

    return prisma.$transaction(async (tx) => {
      const app = await tx.application.findUnique({
        where: { id: input.applicationId },
        include: {
          candidate: {
            include: {
              user: { select: { id: true, email: true, name: true } },
            },
          },
          opening: { select: { title: true, type: true } },
          jobOffer: { select: { status: true } },
        },
      });

      if (!app) {
        throw new NotFoundError("Application record not found.");
      }

      assertNotOwnApplication(user, app.candidate.user.id);

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

      // An extended offer must be revoked through the offer flow first so the
      // offer and the application never disagree.
      if (app.jobOffer?.status === OfferStatus.EXTENDED) {
        throw new ValidationError(
          "This application has an extended job offer awaiting the candidate's decision. Revoke the offer before changing the application stage."
        );
      }

      const updated = await tx.application.updateMany({
        where: { id: app.id, status: app.status },
        data: {
          status: input.toStatus,
          isArchived: input.toStatus === ApplicationStatus.ARCHIVED,
          archivedAt: input.toStatus === ApplicationStatus.ARCHIVED ? new Date() : undefined,
        },
      });
      if (updated.count !== 1) {
        throw new ConflictError(
          "The application stage was changed by another action. Reload the page and try again."
        );
      }

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

      return { applicationId: app.id, notificationQueued: Boolean(input.candidateMessage) };
    });
  }

  /**
   * Assigns an authorized recruiter to manage an application.
   */
  async assignRecruiter(
    user: AuthenticatedUser,
    input: AssignRecruiterInput
  ): Promise<void> {
    this.assertDecisionAuthority(user);
    await assertPermission(user, "canApplications");

    await prisma.$transaction(async (tx) => {
      const app = await tx.application.findUnique({
        where: { id: input.applicationId },
        select: { id: true, assignedRecruiterId: true, candidate: { select: { userId: true } } },
      });
      if (!app) throw new NotFoundError("Application not found.");

      assertNotOwnApplication(user, app.candidate.userId);

      if (input.recruiterId) {
        if (input.recruiterId === app.candidate.userId) {
          throw new ValidationError("A candidate cannot be assigned as recruiter on their own application.");
        }
        await this.assertAssignableStaff(tx, input.recruiterId, "recruiter");
      }

      await tx.application.update({
        where: { id: app.id },
        data: { assignedRecruiterId: input.recruiterId },
      });

      await tx.auditLog.create({
        data: {
          actorId: user.id,
          actorRole: user.roles[0] ?? "STAFF",
          action: "ASSIGN_APPLICATION_RECRUITER",
          resourceType: "APPLICATION",
          resourceId: app.id,
          diffPayload: {
            fromRecruiterId: app.assignedRecruiterId,
            toRecruiterId: input.recruiterId,
          },
        },
      });
    });
  }

  /**
   * Schedules an interview round with an assigned interviewer.
   * The application stage is not changed automatically (OD-004): staff transition it explicitly.
   */
  async scheduleInterview(
    user: AuthenticatedUser,
    input: ScheduleInterviewInput
  ): Promise<{ scheduleId: string; applicationId: string }> {
    this.assertDecisionAuthority(user);
    await assertPermission(user, "canInterviews");

    const scheduledDate = new Date(input.scheduledAt);
    if (isNaN(scheduledDate.getTime())) {
      throw new ValidationError("Invalid interview scheduled date/time.");
    }

    const schedule = await prisma.$transaction(async (tx) => {
      const app = await tx.application.findUnique({
        where: { id: input.applicationId },
        include: {
          candidate: {
            include: {
              user: { select: { id: true, email: true, name: true } },
            },
          },
          opening: { select: { title: true } },
        },
      });

      if (!app) throw new NotFoundError("Application not found.");

      assertNotOwnApplication(user, app.candidate.user.id);

      if (app.isArchived || INTERVIEW_CLOSED_APPLICATION_STATUSES.includes(app.status)) {
        throw new ValidationError(
          `Interviews cannot be scheduled for an application in status ${app.status}.`
        );
      }

      if (input.interviewerId) {
        if (input.interviewerId === app.candidate.user.id) {
          throw new ValidationError("A candidate cannot be assigned as their own interviewer.");
        }
        await this.assertAssignableStaff(tx, input.interviewerId, "interviewer");
      }

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

      // Scheduling is not a stage change, so no stage-history row is written (a no-op
      // X -> X row would corrupt stage lookups such as the offer revoke restore). The
      // interview row and the audit entry below are the interview history.

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

      await tx.auditLog.create({
        data: {
          actorId: user.id,
          actorRole: user.roles[0] ?? "STAFF",
          action: "SCHEDULE_INTERVIEW",
          resourceType: "INTERVIEW_SCHEDULE",
          resourceId: createdSchedule.id,
          diffPayload: {
            applicationId: app.id,
            roundNumber: input.roundNumber,
            scheduledAt: scheduledDate.toISOString(),
            interviewerId: input.interviewerId ?? null,
            roundName: input.roundName,
            applicationStatus: app.status,
          },
        },
      });

      return createdSchedule;
    });

    return { scheduleId: schedule.id, applicationId: schedule.applicationId };
  }

  /**
   * Reschedules an existing interview round, recording justification.
   * Completed and cancelled interviews cannot be rescheduled.
   */
  async rescheduleInterview(
    user: AuthenticatedUser,
    input: RescheduleInterviewInput
  ): Promise<{ applicationId: string }> {
    this.assertDecisionAuthority(user);
    await assertPermission(user, "canInterviews");

    const newDate = new Date(input.newScheduledAt);
    if (isNaN(newDate.getTime())) {
      throw new ValidationError("Invalid new scheduled date/time.");
    }

    return prisma.$transaction(async (tx) => {
      const schedule = await tx.interviewSchedule.findUnique({
        where: { id: input.scheduleId },
        include: {
          application: {
            include: {
              candidate: {
                include: { user: { select: { id: true, email: true, name: true } } },
              },
            },
          },
        },
      });

      if (!schedule) throw new NotFoundError("Interview schedule not found.");

      assertNotOwnApplication(user, schedule.application.candidate.user.id);

      if (!OPEN_INTERVIEW_STATUSES.includes(schedule.status)) {
        throw new ValidationError(
          `A ${schedule.status} interview cannot be rescheduled.`
        );
      }

      if (
        schedule.application.isArchived ||
        INTERVIEW_CLOSED_APPLICATION_STATUSES.includes(schedule.application.status)
      ) {
        throw new ValidationError(
          `Interviews cannot be rescheduled for an application in status ${schedule.application.status}.`
        );
      }

      const updated = await tx.interviewSchedule.updateMany({
        where: { id: schedule.id, status: { in: OPEN_INTERVIEW_STATUSES } },
        data: {
          scheduledAt: newDate,
          status: InterviewStatus.RESCHEDULED,
          rescheduleReason: input.rescheduleReason,
        },
      });
      if (updated.count !== 1) {
        throw new ConflictError("The interview was updated by another action. Reload and try again.");
      }

      // Not a stage change: the interview history is kept in the audit log instead of a
      // no-op stage-history row.
      await tx.auditLog.create({
        data: {
          actorId: user.id,
          actorRole: user.roles[0] ?? "STAFF",
          action: "RESCHEDULE_INTERVIEW",
          resourceType: "INTERVIEW_SCHEDULE",
          resourceId: schedule.id,
          diffPayload: {
            applicationId: schedule.applicationId,
            roundName: schedule.roundName,
            previousStatus: schedule.status,
            previousScheduledAt: schedule.scheduledAt.toISOString(),
            newScheduledAt: newDate.toISOString(),
            reason: input.rescheduleReason,
            applicationStatus: schedule.application.status,
          },
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

      return { applicationId: schedule.applicationId };
    });
  }

  /**
   * Cancels a scheduled interview round with reason.
   * Completed and already-cancelled interviews cannot be cancelled.
   */
  async cancelInterview(
    user: AuthenticatedUser,
    input: CancelInterviewInput
  ): Promise<{ applicationId: string }> {
    this.assertDecisionAuthority(user);
    await assertPermission(user, "canInterviews");

    return prisma.$transaction(async (tx) => {
      const schedule = await tx.interviewSchedule.findUnique({
        where: { id: input.scheduleId },
        include: {
          application: {
            include: {
              candidate: {
                include: { user: { select: { id: true, email: true, name: true } } },
              },
            },
          },
        },
      });

      if (!schedule) throw new NotFoundError("Interview schedule not found.");

      assertNotOwnApplication(user, schedule.application.candidate.user.id);

      if (!OPEN_INTERVIEW_STATUSES.includes(schedule.status)) {
        throw new ValidationError(`A ${schedule.status} interview cannot be cancelled.`);
      }

      const updated = await tx.interviewSchedule.updateMany({
        where: { id: schedule.id, status: { in: OPEN_INTERVIEW_STATUSES } },
        data: {
          status: InterviewStatus.CANCELLED,
          cancellationReason: input.cancellationReason,
        },
      });
      if (updated.count !== 1) {
        throw new ConflictError("The interview was updated by another action. Reload and try again.");
      }

      // Not a stage change: the interview history is kept in the audit log instead of a
      // no-op stage-history row.
      await tx.auditLog.create({
        data: {
          actorId: user.id,
          actorRole: user.roles[0] ?? "STAFF",
          action: "CANCEL_INTERVIEW",
          resourceType: "INTERVIEW_SCHEDULE",
          resourceId: schedule.id,
          diffPayload: {
            applicationId: schedule.applicationId,
            roundName: schedule.roundName,
            previousStatus: schedule.status,
            scheduledAt: schedule.scheduledAt.toISOString(),
            reason: input.cancellationReason,
            applicationStatus: schedule.application.status,
          },
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

      return { applicationId: schedule.applicationId };
    });
  }

  /**
   * Submits structured interviewer evaluation & advisory recommendation.
   * Only the assigned interviewer, HR or an administrator may submit feedback; feedback
   * stays attributed to its author and only the author may edit it. The application
   * stage is not changed automatically (OD-004).
   */
  async submitInterviewFeedback(
    user: AuthenticatedUser,
    input: SubmitFeedbackInput
  ): Promise<{ applicationId: string }> {
    this.assertStaffAccess(user);
    await assertPermission(user, "canInterviews");

    return prisma.$transaction(async (tx) => {
      const schedule = await tx.interviewSchedule.findUnique({
        where: { id: input.scheduleId },
        include: {
          application: {
            select: { id: true, status: true, candidate: { select: { userId: true } } },
          },
          feedback: {
            select: {
              id: true,
              interviewerId: true,
              recommendation: true,
              ratings: true,
              summaryNotes: true,
            },
          },
        },
      });

      if (!schedule) throw new NotFoundError("Interview schedule not found.");

      // Separation of duties applies to everyone, including the HR/Admin bypass below.
      assertNotOwnApplication(user, schedule.application.candidate.userId);

      // Enforce that only the assigned interviewer or HR/Admin can evaluate
      const isHrOrAdmin = user.roles.includes(Role.ADMIN) || user.roles.includes(Role.HR);
      const isAssigned = schedule.interviewerId === user.id;

      if (!isHrOrAdmin && !isAssigned) {
        throw new ForbiddenError(
          "You are not the designated interviewer assigned to submit feedback for this session."
        );
      }

      if (schedule.status === InterviewStatus.CANCELLED) {
        throw new ValidationError("Feedback cannot be submitted for a cancelled interview.");
      }

      const ratings = input.ratings as Prisma.InputJsonValue;
      const existing = schedule.feedback;

      if (existing) {
        if (existing.interviewerId !== user.id) {
          throw new ForbiddenError(
            "Feedback for this session was submitted by another interviewer and can only be edited by its author."
          );
        }
        if (FEEDBACK_LOCKED_APPLICATION_STATUSES.includes(schedule.application.status)) {
          throw new ValidationError(
            `Feedback can no longer be edited because the application has reached the ${schedule.application.status} decision.`
          );
        }

        const updated = await tx.interviewFeedback.updateMany({
          where: { id: existing.id, interviewerId: user.id },
          data: {
            ratings,
            recommendation: input.recommendation,
            summaryNotes: input.summaryNotes,
          },
        });
        if (updated.count !== 1) {
          throw new ConflictError("The feedback was changed by another action. Reload and try again.");
        }
      } else {
        // Feedback is always attributed to the submitting user (interviewer or HR/Admin).
        await tx.interviewFeedback.create({
          data: {
            scheduleId: schedule.id,
            interviewerId: user.id,
            ratings,
            recommendation: input.recommendation,
            summaryNotes: input.summaryNotes,
          },
        });
      }

      const completed = await tx.interviewSchedule.updateMany({
        where: { id: schedule.id, status: { not: InterviewStatus.CANCELLED } },
        data: { status: InterviewStatus.COMPLETED },
      });
      if (completed.count !== 1) {
        throw new ConflictError("The interview was cancelled by another action. Reload and try again.");
      }

      await tx.auditLog.create({
        data: {
          actorId: user.id,
          actorRole: user.roles[0] ?? "STAFF",
          action: existing ? "UPDATE_INTERVIEW_FEEDBACK" : "SUBMIT_INTERVIEW_FEEDBACK",
          resourceType: "INTERVIEW_SCHEDULE",
          resourceId: schedule.id,
          diffPayload: {
            applicationId: schedule.applicationId,
            recommendation: input.recommendation,
            // Previous values are kept so feedback edits never lose history.
            previous: existing
              ? {
                  recommendation: existing.recommendation,
                  ratings: existing.ratings as Prisma.InputJsonValue,
                  summaryNotes: existing.summaryNotes,
                }
              : null,
          },
        },
      });

      return { applicationId: schedule.applicationId };
    });
  }
}

export const recruitmentService = new RecruitmentService();
