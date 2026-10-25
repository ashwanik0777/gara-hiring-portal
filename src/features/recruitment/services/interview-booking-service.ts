import { prisma } from "@/lib/db";
import { assertPermission, type AuthenticatedUser } from "@/lib/auth/guards";
import { InterviewBookingStatus, InterviewSlotStatus, Prisma, Role } from "@prisma/client";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import {
  validateBookingSlotTimes,
  type BookInterviewSlotInput,
  type CancelBookingRequestInput,
  type CreateBookingRequestInput,
} from "../schemas";
import type {
  BookingRequestStatus,
  BookingSlotStatus,
  InterviewerOption,
  StaffBookingBoardItem,
  StaffBookingRequestView,
} from "../types";
import {
  UNASSIGNED_APPLICATION_MESSAGE,
  assertNotOwnApplication,
  isAssignedToApplication,
  isInterviewerScoped,
} from "./application-access";
import {
  ASSIGNABLE_STAFF_ROLES,
  createInterviewSchedule,
  findAssignableStaff,
  isInterviewEligibleApplication,
  type InterviewerContact,
} from "./interview-scheduling";
import { recruitmentService } from "./recruitment-service";

/** Staff roles that may offer interview times (with the canInterviews permission). */
const BOOKING_STAFF_ROLES: Role[] = [Role.ADMIN, Role.HR, Role.MANAGER, Role.INTERVIEWER];
const DECISION_ROLES: Role[] = [Role.ADMIN, Role.HR];
const STAFF_LIST_LIMIT = 50;

export const BOOKING_NOT_FOUND_MESSAGE = "This interview request isn't available.";
export const SLOT_UNAVAILABLE_MESSAGE =
  "Sorry, that time was just taken or is no longer available. Please choose another time.";

const staffRequestSelect = {
  id: true,
  applicationId: true,
  roundNumber: true,
  roundName: true,
  durationMinutes: true,
  meetingLink: true,
  status: true,
  createdAt: true,
  createdById: true,
  interviewerId: true,
  interviewer: { select: { name: true } },
  bookedSchedule: { select: { id: true, scheduledAt: true, status: true } },
  slots: { select: { id: true, startsAt: true, status: true }, orderBy: { startsAt: "asc" } },
} satisfies Prisma.InterviewBookingRequestSelect;

type StaffRequestRow = Prisma.InterviewBookingRequestGetPayload<{ select: typeof staffRequestSelect }>;

/**
 * Candidate self-scheduling: staff offer 2-8 times for an interview round and the candidate
 * books one from their portal, which creates the interview exactly like staff scheduling.
 */
export class InterviewBookingService {
  private assertBookingStaff(user: AuthenticatedUser): void {
    if (!user.roles.some((role) => BOOKING_STAFF_ROLES.includes(role))) {
      throw new ForbiddenError("Offering interview times requires a recruitment staff role.");
    }
  }

  private hasDecisionAuthority(user: AuthenticatedUser): boolean {
    return user.roles.some((role) => DECISION_ROLES.includes(role));
  }

  /**
   * Requests a staff member may see: never for their own application; interviewer-scoped
   * users only see requests they created or are the interviewer of.
   */
  private staffRequestVisibility(user: AuthenticatedUser): Prisma.InterviewBookingRequestWhereInput {
    const conditions: Prisma.InterviewBookingRequestWhereInput[] = [
      { application: { candidate: { userId: { not: user.id } } } },
    ];
    if (isInterviewerScoped(user)) {
      conditions.push({ OR: [{ createdById: user.id }, { interviewerId: user.id }] });
    }
    return { AND: conditions };
  }

  private canCancel(user: AuthenticatedUser, row: { status: string; createdById: string; interviewerId: string | null }) {
    if (row.status !== InterviewBookingStatus.PENDING) return false;
    return !isInterviewerScoped(user) || row.createdById === user.id || row.interviewerId === user.id;
  }

  private toStaffView(user: AuthenticatedUser, row: StaffRequestRow, now: Date): StaffBookingRequestView {
    const slots = row.slots.map((slot) => ({
      id: slot.id,
      startsAt: slot.startsAt.toISOString(),
      status: slot.status as BookingSlotStatus,
      isPast: slot.startsAt.getTime() <= now.getTime(),
    }));
    const openSlotCount = slots.filter((slot) => slot.status === InterviewSlotStatus.OPEN && !slot.isPast).length;
    return {
      id: row.id,
      applicationId: row.applicationId,
      roundNumber: row.roundNumber,
      roundName: row.roundName,
      durationMinutes: row.durationMinutes,
      meetingLink: row.meetingLink,
      status: row.status as BookingRequestStatus,
      interviewerName: row.interviewer?.name ?? null,
      createdAt: row.createdAt.toISOString(),
      slots,
      openSlotCount,
      noTimesLeft: row.status === InterviewBookingStatus.PENDING && openSlotCount === 0,
      bookedInterview: row.bookedSchedule
        ? {
            id: row.bookedSchedule.id,
            scheduledAt: row.bookedSchedule.scheduledAt.toISOString(),
            status: row.bookedSchedule.status,
          }
        : null,
      canCancel: this.canCancel(user, row),
    };
  }

  /**
   * Interviewers the user may pick: HR/Admin see every assignable staff member; managers and
   * interviewers may only assign themselves (or leave the round unassigned).
   */
  async listInterviewerOptions(user: AuthenticatedUser): Promise<InterviewerOption[]> {
    this.assertBookingStaff(user);
    await assertPermission(user, "canInterviews");
    if (this.hasDecisionAuthority(user)) {
      return recruitmentService.listInterviewerOptions(user);
    }
    return [
      {
        id: user.id,
        name: user.name,
        email: user.email,
        roles: user.roles.filter((role) => ASSIGNABLE_STAFF_ROLES.includes(role)),
      },
    ];
  }

  /**
   * Offers interview times to the candidate and emails them a link to choose one.
   */
  async createBookingRequest(
    user: AuthenticatedUser,
    input: CreateBookingRequestInput,
    now: Date = new Date()
  ): Promise<{ requestId: string; applicationId: string }> {
    this.assertBookingStaff(user);
    await assertPermission(user, "canInterviews");

    const slotCheck = validateBookingSlotTimes(input.slots, now);
    if (!slotCheck.ok) {
      throw new ValidationError(slotCheck.error);
    }
    const slots = slotCheck.slots;
    const meetingLink = input.meetingLink || null;
    const interviewerId = input.interviewerId || null;

    return prisma.$transaction(async (tx) => {
      const app = await tx.application.findUnique({
        where: { id: input.applicationId },
        select: {
          id: true,
          referenceCode: true,
          status: true,
          isArchived: true,
          assignedRecruiterId: true,
          candidate: { select: { user: { select: { id: true, name: true, email: true } } } },
          opening: { select: { title: true } },
          interviewSchedules: { select: { interviewerId: true } },
        },
      });
      if (!app) throw new NotFoundError("Application not found.");

      assertNotOwnApplication(user, app.candidate.user.id);
      if (
        isInterviewerScoped(user) &&
        !isAssignedToApplication(user.id, {
          assignedRecruiterId: app.assignedRecruiterId,
          interviewerIds: app.interviewSchedules.map((s) => s.interviewerId),
        })
      ) {
        throw new ForbiddenError(UNASSIGNED_APPLICATION_MESSAGE);
      }

      if (!isInterviewEligibleApplication(app)) {
        throw new ValidationError(`Interview times cannot be offered for an application in status ${app.status}.`);
      }

      if (interviewerId) {
        if (interviewerId === app.candidate.user.id) {
          throw new ValidationError("A candidate cannot be assigned as their own interviewer.");
        }
        if (!this.hasDecisionAuthority(user) && interviewerId !== user.id) {
          throw new ForbiddenError(
            "Only HR or an administrator can assign another interviewer. Assign yourself or leave it unassigned."
          );
        }
        if (!(await findAssignableStaff(tx, interviewerId))) {
          throw new ValidationError(
            "The selected interviewer must be a staff member with the Interviewer, Manager, HR or Admin role."
          );
        }
      }

      const pendingForRound = await tx.interviewBookingRequest.count({
        where: {
          applicationId: app.id,
          roundNumber: input.roundNumber,
          status: InterviewBookingStatus.PENDING,
        },
      });
      if (pendingForRound > 0) {
        throw new ConflictError(
          "Interview times for this round are already waiting for the candidate. Cancel that request before offering new times."
        );
      }

      const request = await tx.interviewBookingRequest.create({
        data: {
          applicationId: app.id,
          roundNumber: input.roundNumber,
          roundName: input.roundName,
          durationMinutes: input.durationMinutes,
          interviewerId,
          meetingLink,
          status: InterviewBookingStatus.PENDING,
          createdById: user.id,
          slots: { create: slots.map((startsAt) => ({ startsAt })) },
        },
        select: { id: true },
      });

      const options = slots.map((slot) => slot.toISOString());
      await tx.notificationOutbox.create({
        data: {
          recipientEmail: app.candidate.user.email,
          templateName: "INTERVIEW_BOOKING_REQUEST",
          payload: {
            referenceCode: app.referenceCode,
            candidateName: app.candidate.user.name,
            openingTitle: app.opening.title,
            roundName: input.roundName,
            durationMinutes: input.durationMinutes,
            options,
            href: `/candidate/interviews/${request.id}`,
          },
          status: "PENDING",
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: user.id,
          actorRole: user.roles[0] ?? "STAFF",
          action: "CREATE_INTERVIEW_BOOKING_REQUEST",
          resourceType: "INTERVIEW_BOOKING_REQUEST",
          resourceId: request.id,
          diffPayload: {
            applicationId: app.id,
            roundNumber: input.roundNumber,
            roundName: input.roundName,
            durationMinutes: input.durationMinutes,
            interviewerId,
            hasMeetingLink: Boolean(meetingLink),
            options,
            applicationStatus: app.status,
          },
        },
      });

      return { requestId: request.id, applicationId: app.id };
    });
  }

  /**
   * Withdraws a request that is still waiting for the candidate and tells the candidate.
   */
  async cancelBookingRequest(
    user: AuthenticatedUser,
    input: CancelBookingRequestInput
  ): Promise<{ requestId: string; applicationId: string }> {
    this.assertBookingStaff(user);
    await assertPermission(user, "canInterviews");

    return prisma.$transaction(async (tx) => {
      const request = await tx.interviewBookingRequest.findUnique({
        where: { id: input.requestId },
        select: {
          id: true,
          applicationId: true,
          roundNumber: true,
          roundName: true,
          status: true,
          createdById: true,
          interviewerId: true,
          application: {
            select: {
              referenceCode: true,
              candidate: { select: { user: { select: { id: true, name: true, email: true } } } },
              opening: { select: { title: true } },
            },
          },
        },
      });
      if (!request) throw new NotFoundError("Interview booking request not found.");

      assertNotOwnApplication(user, request.application.candidate.user.id);
      if (isInterviewerScoped(user) && request.createdById !== user.id && request.interviewerId !== user.id) {
        throw new ForbiddenError("You can only cancel interview times you offered or that are assigned to you.");
      }
      if (request.status !== InterviewBookingStatus.PENDING) {
        throw new ValidationError("Only requests that are still waiting for the candidate can be cancelled.");
      }

      const updated = await tx.interviewBookingRequest.updateMany({
        where: { id: request.id, status: InterviewBookingStatus.PENDING },
        data: { status: InterviewBookingStatus.CANCELLED },
      });
      if (updated.count !== 1) {
        throw new ConflictError("The candidate has just booked a time or the request changed. Reload the page and try again.");
      }
      await tx.interviewSlotOption.updateMany({
        where: { requestId: request.id, status: InterviewSlotStatus.OPEN },
        data: { status: InterviewSlotStatus.RELEASED },
      });

      await tx.notificationOutbox.create({
        data: {
          recipientEmail: request.application.candidate.user.email,
          templateName: "INTERVIEW_BOOKING_CANCELLED",
          payload: {
            referenceCode: request.application.referenceCode,
            candidateName: request.application.candidate.user.name,
            openingTitle: request.application.opening.title,
            roundName: request.roundName,
            reason: input.reason,
            href: `/candidate/applications/${request.applicationId}`,
          },
          status: "PENDING",
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: user.id,
          actorRole: user.roles[0] ?? "STAFF",
          action: "CANCEL_INTERVIEW_BOOKING_REQUEST",
          resourceType: "INTERVIEW_BOOKING_REQUEST",
          resourceId: request.id,
          diffPayload: {
            applicationId: request.applicationId,
            roundNumber: request.roundNumber,
            roundName: request.roundName,
            reason: input.reason,
          },
        },
      });

      return { requestId: request.id, applicationId: request.applicationId };
    });
  }

  /**
   * The candidate books one of the offered times. One transaction with conditional writes:
   * request PENDING -> BOOKED, the chosen option OPEN -> BOOKED (count-checked), every other
   * open option -> RELEASED, then the interview is created exactly like staff scheduling
   * (same validations, reminder jobs and invitation emails with calendar invites).
   * Requests of other candidates are reported as not found.
   */
  async bookSlot(
    user: AuthenticatedUser,
    input: BookInterviewSlotInput,
    now: Date = new Date()
  ): Promise<{ requestId: string; applicationId: string; scheduleId: string }> {
    return prisma.$transaction(async (tx) => {
      const request = await tx.interviewBookingRequest.findUnique({
        where: { id: input.requestId },
        select: {
          id: true,
          applicationId: true,
          roundNumber: true,
          roundName: true,
          durationMinutes: true,
          interviewerId: true,
          meetingLink: true,
          status: true,
          createdById: true,
          slots: { where: { id: input.slotId }, select: { id: true, startsAt: true, status: true } },
          application: {
            select: {
              id: true,
              referenceCode: true,
              status: true,
              isArchived: true,
              candidate: { select: { user: { select: { id: true, name: true, email: true } } } },
              opening: { select: { title: true } },
            },
          },
        },
      });

      if (!request || request.application.candidate.user.id !== user.id) {
        throw new NotFoundError(BOOKING_NOT_FOUND_MESSAGE);
      }
      if (request.status === InterviewBookingStatus.BOOKED) {
        throw new ConflictError("You have already booked a time for this interview.");
      }
      if (request.status !== InterviewBookingStatus.PENDING) {
        throw new ConflictError("These interview times were withdrawn by the hiring team.");
      }
      const slot = request.slots[0];
      if (!slot) {
        throw new ValidationError("That time is not one of the options offered for this interview.");
      }
      if (slot.status !== InterviewSlotStatus.OPEN || slot.startsAt.getTime() <= now.getTime()) {
        throw new ConflictError(SLOT_UNAVAILABLE_MESSAGE);
      }

      // Same validations as staff scheduling, with messages written for the candidate.
      if (!isInterviewEligibleApplication(request.application)) {
        throw new ValidationError("This application is no longer active, so an interview can't be booked.");
      }
      let interviewer: InterviewerContact | null = null;
      if (request.interviewerId) {
        interviewer = await findAssignableStaff(tx, request.interviewerId);
        if (!interviewer || interviewer.id === user.id) {
          throw new ValidationError("This interview can't be booked online right now. Please contact the hiring team.");
        }
      }

      const claimedRequest = await tx.interviewBookingRequest.updateMany({
        where: { id: request.id, status: InterviewBookingStatus.PENDING },
        data: { status: InterviewBookingStatus.BOOKED },
      });
      if (claimedRequest.count !== 1) {
        throw new ConflictError("You have already booked a time for this interview.");
      }
      const claimedSlot = await tx.interviewSlotOption.updateMany({
        where: {
          id: slot.id,
          requestId: request.id,
          status: InterviewSlotStatus.OPEN,
          startsAt: { gt: now },
        },
        data: { status: InterviewSlotStatus.BOOKED },
      });
      if (claimedSlot.count !== 1) {
        throw new ConflictError(SLOT_UNAVAILABLE_MESSAGE);
      }
      await tx.interviewSlotOption.updateMany({
        where: { requestId: request.id, id: { not: slot.id }, status: InterviewSlotStatus.OPEN },
        data: { status: InterviewSlotStatus.RELEASED },
      });

      // Scheduled on behalf of the staff member who offered the times.
      const schedule = await createInterviewSchedule(tx, {
        application: {
          id: request.application.id,
          referenceCode: request.application.referenceCode,
          openingTitle: request.application.opening.title,
          candidate: request.application.candidate.user,
        },
        roundNumber: request.roundNumber,
        roundName: request.roundName,
        scheduledAt: slot.startsAt,
        durationMinutes: request.durationMinutes,
        meetingLink: request.meetingLink,
        interviewer,
        scheduledById: request.createdById,
      });

      await tx.interviewBookingRequest.update({
        where: { id: request.id },
        data: { bookedScheduleId: schedule.id },
      });

      const actorRole = user.roles[0] ?? Role.CANDIDATE;
      await tx.auditLog.create({
        data: {
          actorId: user.id,
          actorRole,
          action: "BOOK_INTERVIEW_SLOT",
          resourceType: "INTERVIEW_BOOKING_REQUEST",
          resourceId: request.id,
          diffPayload: {
            applicationId: request.applicationId,
            slotId: slot.id,
            scheduleId: schedule.id,
            scheduledAt: slot.startsAt.toISOString(),
          },
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: user.id,
          actorRole,
          action: "SCHEDULE_INTERVIEW",
          resourceType: "INTERVIEW_SCHEDULE",
          resourceId: schedule.id,
          diffPayload: {
            applicationId: request.applicationId,
            roundNumber: request.roundNumber,
            scheduledAt: slot.startsAt.toISOString(),
            interviewerId: request.interviewerId,
            roundName: request.roundName,
            applicationStatus: request.application.status,
            source: "CANDIDATE_SELF_SCHEDULING",
            bookingRequestId: request.id,
            scheduledById: request.createdById,
          },
        },
      });

      return { requestId: request.id, applicationId: request.applicationId, scheduleId: schedule.id };
    });
  }

  /** Booking requests of one application for the staff detail page (newest first). */
  async listRequestsForApplication(
    user: AuthenticatedUser,
    applicationId: string,
    now: Date = new Date()
  ): Promise<StaffBookingRequestView[]> {
    this.assertBookingStaff(user);
    await assertPermission(user, "canInterviews");

    const rows = await prisma.interviewBookingRequest.findMany({
      where: { applicationId, AND: [this.staffRequestVisibility(user)] },
      select: staffRequestSelect,
      orderBy: { createdAt: "desc" },
      take: STAFF_LIST_LIMIT,
    });
    return rows.map((row) => this.toStaffView(user, row, now));
  }

  /** Requests still waiting for candidates, for the staff interview board (oldest first). */
  async listPendingRequestsForBoard(user: AuthenticatedUser, now: Date = new Date()): Promise<StaffBookingBoardItem[]> {
    this.assertBookingStaff(user);
    await assertPermission(user, "canInterviews");

    const rows = await prisma.interviewBookingRequest.findMany({
      where: { status: InterviewBookingStatus.PENDING, AND: [this.staffRequestVisibility(user)] },
      select: {
        ...staffRequestSelect,
        application: {
          select: {
            candidate: { select: { user: { select: { name: true } } } },
            opening: { select: { title: true, department: true } },
          },
        },
      },
      orderBy: { createdAt: "asc" },
      take: STAFF_LIST_LIMIT,
    });
    return rows.map(({ application, ...row }) => ({
      ...this.toStaffView(user, row, now),
      candidateName: application.candidate.user.name,
      openingTitle: application.opening.title,
      openingDepartment: application.opening.department,
    }));
  }
}

export const interviewBookingService = new InterviewBookingService();

