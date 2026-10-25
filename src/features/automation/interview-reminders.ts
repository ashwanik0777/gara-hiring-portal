import { z } from "zod";
import { InterviewStatus, Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logging/logger";
import type { JobHandler } from "@/infrastructure/jobs/job-runner";
import { INTERVIEW_CLOSED_APPLICATION_STATUSES } from "@/features/recruitment/schemas";
import { interviewReminderDedupeKey } from "./interview-reminder-jobs";
import { queueAutomationEmailsOnce, type AutomationEmail } from "./outbox-once";
import { staffPortalBase } from "./staff-recipients";

/** Interviews that are still going ahead (a reschedule keeps the interview open). */
const OPEN_INTERVIEW_STATUSES: InterviewStatus[] = [InterviewStatus.SCHEDULED, InterviewStatus.RESCHEDULED];

/** Roles that may conduct an interview (mirrors the recruitment service's assignable roles). */
const INTERVIEWER_ROLES: Role[] = [Role.INTERVIEWER, Role.MANAGER, Role.HR, Role.ADMIN];

const InterviewReminderPayloadSchema = z.object({
  scheduleId: z.string().min(1),
  scheduledAt: z.iso.datetime(),
  leadTime: z.enum(["24h", "1h"]),
});

/**
 * INTERVIEW_REMINDER: emails the candidate and the assigned interviewer. The interview is
 * re-read first and nothing is sent unless it is still open at exactly the time the job was
 * queued for (a reschedule queues new jobs; a cancellation cancels them, this is the backstop),
 * it has not started yet, and its application is still active.
 */
export const handleInterviewReminder: JobHandler = async (payload, { now }) => {
  const parsed = InterviewReminderPayloadSchema.safeParse(payload);
  if (!parsed.success) {
    logger.warn("Interview reminder job has an invalid payload; skipping");
    return;
  }
  const { scheduleId, leadTime } = parsed.data;
  const queuedFor = new Date(parsed.data.scheduledAt);

  const schedule = await prisma.interviewSchedule.findUnique({
    where: { id: scheduleId },
    select: {
      id: true,
      status: true,
      scheduledAt: true,
      roundName: true,
      durationMinutes: true,
      meetingLink: true,
      applicationId: true,
      interviewer: {
        select: { id: true, name: true, email: true, roles: { select: { role: true } } },
      },
      application: {
        select: {
          status: true,
          isArchived: true,
          opening: { select: { title: true } },
          candidate: { select: { user: { select: { id: true, name: true, email: true } } } },
        },
      },
    },
  });

  if (!schedule || !OPEN_INTERVIEW_STATUSES.includes(schedule.status)) return;
  if (schedule.scheduledAt.getTime() !== queuedFor.getTime()) return;
  if (schedule.scheduledAt.getTime() <= now.getTime()) return;
  if (
    schedule.application.isArchived ||
    INTERVIEW_CLOSED_APPLICATION_STATUSES.includes(schedule.application.status)
  ) {
    return;
  }

  const candidate = schedule.application.candidate.user;
  const baseKey = interviewReminderDedupeKey(schedule.id, schedule.scheduledAt, leadTime);
  const common = {
    candidateName: candidate.name,
    openingTitle: schedule.application.opening.title,
    roundName: schedule.roundName,
    scheduledAt: schedule.scheduledAt.toISOString(),
    durationMinutes: schedule.durationMinutes,
    meetingLink: schedule.meetingLink,
    leadTime,
  };

  const emails: AutomationEmail[] = [
    {
      recipientEmail: candidate.email,
      templateName: "INTERVIEW_REMINDER",
      payload: {
        ...common,
        recipientName: candidate.name,
        recipientRole: "CANDIDATE",
        href: `/candidate/applications/${schedule.applicationId}`,
      },
      dedupeKey: `${baseKey}:CANDIDATE`,
    },
  ];

  const interviewer = schedule.interviewer;
  const interviewerRoles = interviewer?.roles.map((r) => r.role) ?? [];
  if (
    interviewer &&
    interviewer.id !== candidate.id &&
    interviewerRoles.some((role) => INTERVIEWER_ROLES.includes(role))
  ) {
    emails.push({
      recipientEmail: interviewer.email,
      templateName: "INTERVIEW_REMINDER",
      payload: {
        ...common,
        recipientName: interviewer.name,
        recipientRole: "INTERVIEWER",
        href: `${staffPortalBase(interviewerRoles)}/interviews`,
      },
      dedupeKey: `${baseKey}:INTERVIEWER`,
    });
  }

  await queueAutomationEmailsOnce(emails, { prefix: `${baseKey}:`, now });
};
