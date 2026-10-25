import { ApplicationStatus, InterviewStatus, Prisma, Role } from "@prisma/client";
import { scheduleInterviewReminders } from "@/features/automation/interview-reminder-jobs";
import { staffPortalBase } from "@/features/automation/staff-recipients";
import { INTERVIEW_CLOSED_APPLICATION_STATUSES } from "../schemas";

/*
 * Building blocks shared by staff scheduling (RecruitmentService) and candidate
 * self-scheduling (InterviewBookingService), so a booked interview is created, validated,
 * reminded and announced exactly like one scheduled by HR.
 */

/** Roles that may be assigned to conduct an interview or manage an application. */
export const ASSIGNABLE_STAFF_ROLES: Role[] = [Role.INTERVIEWER, Role.MANAGER, Role.HR, Role.ADMIN];

export interface InterviewParticipant {
  id: string;
  name: string;
  email: string;
}

export interface InterviewerContact extends InterviewParticipant {
  roles: Role[];
}

/**
 * Loads a user who may conduct an interview (holds an assignable staff role), or null when
 * the user does not exist or holds no such role.
 */
export async function findAssignableStaff(
  tx: Prisma.TransactionClient,
  userId: string
): Promise<InterviewerContact | null> {
  const user = await tx.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true, roles: { select: { role: true } } },
  });
  if (!user) return null;
  const roles = user.roles.map((r) => r.role);
  if (!roles.some((role) => ASSIGNABLE_STAFF_ROLES.includes(role))) return null;
  return { id: user.id, name: user.name, email: user.email, roles };
}

/** Existing scheduling rule: no interviews on archived or closed (rejected, withdrawn, hired) applications. */
export function isInterviewEligibleApplication(application: {
  status: ApplicationStatus;
  isArchived: boolean;
}): boolean {
  return !application.isArchived && !INTERVIEW_CLOSED_APPLICATION_STATUSES.includes(application.status);
}

export type InterviewEmailTemplate = "INTERVIEW_INVITATION" | "INTERVIEW_RESCHEDULED" | "INTERVIEW_CANCELLED";

export interface InterviewNotificationContext {
  scheduleId: string;
  applicationId: string;
  /** SEQUENCE of the calendar invite carried by this email. */
  icsSequence: number;
  referenceCode: string;
  openingTitle: string;
  roundName: string;
  scheduledAt: Date;
  durationMinutes: number;
  meetingLink: string | null;
  candidate: InterviewParticipant;
  interviewer: InterviewerContact | null;
}

/** The interviewer receives interview emails only while they hold a staff role and are not the candidate. */
function interviewerRecipient(context: InterviewNotificationContext): InterviewerContact | null {
  const interviewer = context.interviewer;
  if (!interviewer || interviewer.id === context.candidate.id) return null;
  return interviewer.roles.some((role) => ASSIGNABLE_STAFF_ROLES.includes(role)) ? interviewer : null;
}

/**
 * Queues an interview email for the candidate and the assigned interviewer. Each payload
 * carries the structured calendar data the outbox processor turns into the .ics invite
 * (same UID for every email of the interview, SEQUENCE from `icsSequence`).
 */
export async function queueInterviewEmails(
  tx: Prisma.TransactionClient,
  templateName: InterviewEmailTemplate,
  context: InterviewNotificationContext,
  extra: Record<string, Prisma.InputJsonValue | null> = {}
): Promise<number> {
  const interviewer = interviewerRecipient(context);
  const attendees = [
    { email: context.candidate.email, name: context.candidate.name },
    ...(interviewer ? [{ email: interviewer.email, name: interviewer.name }] : []),
  ];
  const common: Record<string, Prisma.InputJsonValue | null> = {
    referenceCode: context.referenceCode,
    candidateName: context.candidate.name,
    openingTitle: context.openingTitle,
    roundName: context.roundName,
    scheduledAt: context.scheduledAt.toISOString(),
    durationMinutes: context.durationMinutes,
    meetingLink: context.meetingLink,
    calendar: {
      scheduleId: context.scheduleId,
      sequence: context.icsSequence,
      startsAt: context.scheduledAt.toISOString(),
      durationMinutes: context.durationMinutes,
      attendees,
    },
    ...extra,
  };

  await tx.notificationOutbox.create({
    data: {
      recipientEmail: context.candidate.email,
      templateName,
      payload: {
        ...common,
        recipientName: context.candidate.name,
        recipientRole: "CANDIDATE",
        href: `/candidate/applications/${context.applicationId}`,
      },
      status: "PENDING",
    },
  });

  if (!interviewer) return 1;

  await tx.notificationOutbox.create({
    data: {
      recipientEmail: interviewer.email,
      templateName,
      payload: {
        ...common,
        recipientName: interviewer.name,
        recipientRole: "INTERVIEWER",
        href: `${staffPortalBase(interviewer.roles)}/interviews`,
      },
      status: "PENDING",
    },
  });
  return 2;
}

export interface CreateInterviewScheduleInput {
  application: {
    id: string;
    referenceCode: string;
    openingTitle: string;
    candidate: InterviewParticipant;
  };
  roundNumber: number;
  roundName: string;
  scheduledAt: Date;
  durationMinutes: number;
  meetingLink: string | null;
  /** Already validated with `findAssignableStaff` by the caller. */
  interviewer: InterviewerContact | null;
  scheduledById: string;
}

/**
 * Creates the interview row, its 24-hour and 1-hour reminder jobs and the invitation emails
 * (with calendar invites) inside the caller's transaction. Callers validate the application
 * and interviewer first and write their own audit entry. The application stage is not
 * changed (OD-004).
 */
export async function createInterviewSchedule(
  tx: Prisma.TransactionClient,
  input: CreateInterviewScheduleInput
): Promise<{ id: string; applicationId: string }> {
  const created = await tx.interviewSchedule.create({
    data: {
      applicationId: input.application.id,
      roundNumber: input.roundNumber,
      roundName: input.roundName,
      scheduledAt: input.scheduledAt,
      durationMinutes: input.durationMinutes,
      meetingLink: input.meetingLink,
      interviewerId: input.interviewer?.id ?? null,
      scheduledById: input.scheduledById,
      status: InterviewStatus.SCHEDULED,
    },
    select: { id: true, applicationId: true },
  });

  // Scheduling is not a stage change, so no stage-history row is written (a no-op
  // X -> X row would corrupt stage lookups such as the offer revoke restore). The
  // interview row and the caller's audit entry are the interview history.

  // 24-hour and 1-hour reminders, committed atomically with the interview.
  await scheduleInterviewReminders(tx, { scheduleId: created.id, scheduledAt: input.scheduledAt });

  // New interviews start at SEQUENCE 0 (InterviewSchedule.icsSequence default).
  await queueInterviewEmails(tx, "INTERVIEW_INVITATION", {
    scheduleId: created.id,
    applicationId: input.application.id,
    icsSequence: 0,
    referenceCode: input.application.referenceCode,
    openingTitle: input.application.openingTitle,
    roundName: input.roundName,
    scheduledAt: input.scheduledAt,
    durationMinutes: input.durationMinutes,
    meetingLink: input.meetingLink,
    candidate: input.application.candidate,
    interviewer: input.interviewer,
  });

  return created;
}
