import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { enqueueJob } from "@/infrastructure/jobs/job-queue";
import type { JobHandler } from "@/infrastructure/jobs/job-runner";
import { JOB_TYPES } from "@/features/automation/job-types";
import { queueAutomationEmailsOnce } from "@/features/automation/outbox-once";
import { TRAINING_FIRST_CLASS_REMINDER_TEMPLATE } from "@/infrastructure/email/templates/training-emails";

/*
 * Reminder 24 hours before a batch's first live class (Phase 6). One job per batch and class
 * time: a changed first class gets a new job, and the old one finds the time changed and does
 * nothing. Students who enrol after the reminder went out are not reminded.
 */

const LEAD_MS = 24 * 60 * 60 * 1000;

export function firstClassReminderKey(batchId: string, firstClassAt: Date): string {
  return `${JOB_TYPES.TRAINING_FIRST_CLASS_REMINDER}:${batchId}:${firstClassAt.toISOString()}`;
}

/** Queues the reminder (pass the transaction client so it commits with the batch). */
export async function scheduleFirstClassReminder(
  db: Prisma.TransactionClient,
  batch: { id: string; firstClassAt: Date | null; status: string },
  now: Date
): Promise<void> {
  if (!batch.firstClassAt || batch.status === "CANCELLED" || batch.firstClassAt.getTime() <= now.getTime()) return;
  const runAt = new Date(Math.max(now.getTime(), batch.firstClassAt.getTime() - LEAD_MS));
  await enqueueJob(
    {
      type: JOB_TYPES.TRAINING_FIRST_CLASS_REMINDER,
      runAt,
      payload: { batchId: batch.id, firstClassAt: batch.firstClassAt.toISOString() },
      dedupeKey: firstClassReminderKey(batch.id, batch.firstClassAt),
    },
    db
  );
}

export const handleTrainingFirstClassReminder: JobHandler = async (payload, { now }) => {
  const data = payload && typeof payload === "object" && !Array.isArray(payload) ? (payload as Record<string, unknown>) : {};
  if (typeof data.batchId !== "string" || typeof data.firstClassAt !== "string") return;
  const batch = await prisma.trainingBatch.findUnique({
    where: { id: data.batchId },
    select: {
      id: true,
      name: true,
      status: true,
      firstClassAt: true,
      program: { select: { title: true } },
      enrollments: {
        where: { status: { in: ["ACTIVE", "REFUND_REQUESTED"] } },
        select: { id: true, user: { select: { name: true, email: true } } },
      },
    },
  });
  // The class moved, was cancelled or already took place: nothing to send.
  if (!batch?.firstClassAt || batch.firstClassAt.toISOString() !== data.firstClassAt || batch.status === "CANCELLED") return;
  if (batch.firstClassAt.getTime() <= now.getTime()) return;
  const prefix = `${firstClassReminderKey(batch.id, batch.firstClassAt)}:`;
  await queueAutomationEmailsOnce(
    batch.enrollments.map((enrollment) => ({
      recipientEmail: enrollment.user.email,
      templateName: TRAINING_FIRST_CLASS_REMINDER_TEMPLATE,
      payload: {
        recipientName: enrollment.user.name,
        programTitle: batch.program.title,
        batchName: batch.name,
        firstClassAt: batch.firstClassAt!.toISOString(),
        enrollmentId: enrollment.id,
      },
      dedupeKey: `${prefix}${enrollment.id}`,
    })),
    { prefix, now }
  );
};
