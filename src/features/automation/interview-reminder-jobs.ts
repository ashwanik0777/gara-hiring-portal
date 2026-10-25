import type { Prisma } from "@prisma/client";
import { cancelJobsByKeyPrefix, enqueueJob } from "@/infrastructure/jobs/job-queue";
import { JOB_TYPES } from "./job-types";
import { INTERVIEW_REMINDER_LEADS, type InterviewReminderLeadTime } from "./schedule";

/** Prefix shared by every reminder job of one interview (used to cancel them together). */
export function interviewReminderKeyPrefix(scheduleId: string): string {
  return `interview-reminder:${scheduleId}:`;
}

/**
 * Job dedupe key. It includes the interview time, so a rescheduled interview gets new jobs
 * while re-enqueueing the same time is a no-op.
 */
export function interviewReminderDedupeKey(
  scheduleId: string,
  scheduledAt: Date,
  leadTime: InterviewReminderLeadTime
): string {
  return `${interviewReminderKeyPrefix(scheduleId)}${scheduledAt.toISOString()}:${leadTime}`;
}

export interface InterviewReminderJobPayload {
  scheduleId: string;
  scheduledAt: string;
  leadTime: InterviewReminderLeadTime;
}

/**
 * Queues the 24-hour and 1-hour reminders for a scheduled interview. Reminder times that are
 * already past are skipped. Pass the transaction client so the jobs commit with the interview.
 */
export async function scheduleInterviewReminders(
  db: Prisma.TransactionClient,
  input: { scheduleId: string; scheduledAt: Date; now?: Date }
): Promise<number> {
  const now = input.now ?? new Date();
  let queued = 0;
  for (const lead of INTERVIEW_REMINDER_LEADS) {
    const runAt = new Date(input.scheduledAt.getTime() - lead.offsetMs);
    if (runAt.getTime() <= now.getTime()) {
      continue;
    }
    const payload: InterviewReminderJobPayload = {
      scheduleId: input.scheduleId,
      scheduledAt: input.scheduledAt.toISOString(),
      leadTime: lead.leadTime,
    };
    await enqueueJob(
      {
        type: JOB_TYPES.INTERVIEW_REMINDER,
        runAt,
        payload: { ...payload },
        dedupeKey: interviewReminderDedupeKey(input.scheduleId, input.scheduledAt, lead.leadTime),
      },
      db
    );
    queued += 1;
  }
  return queued;
}

/** Cancels every pending reminder of an interview (before a reschedule, or on cancellation). */
export async function cancelInterviewReminders(db: Prisma.TransactionClient, scheduleId: string): Promise<number> {
  return cancelJobsByKeyPrefix(interviewReminderKeyPrefix(scheduleId), db);
}
