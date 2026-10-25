import { CheckpointStatus, EvaluationStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  DEFAULT_WORKING_CALENDAR,
  workingDayService,
} from "@/features/internship-evaluation/services/working-day-service";
import { resolveEvaluationAccess } from "@/features/internship-evaluation/services/enrollment-access";
import { JOB_TYPES } from "./job-types";
import { queueAutomationEmailsOnce, type AutomationEmail } from "./outbox-once";
import { addDaysToKey, calendarDayKey, utcMidnight } from "./schedule";
import { staffPortalBase } from "./staff-recipients";

/**
 * Day number of `dateKey` in an evaluation, using the same working-day schedule that set the
 * evaluation's end date (default Monday–Friday calendar, OD-002). Null on non-working days
 * and outside the evaluation window.
 */
export function evaluationDayNumberOn(startDate: Date, workingDaysTarget: number, dateKey: string): number | null {
  const schedule = workingDayService.getDailyCheckpointsSchedule(startDate, workingDaysTarget, DEFAULT_WORKING_CALENDAR);
  const index = schedule.findIndex((day) => calendarDayKey(day) === dateKey);
  return index === -1 ? null : index + 1;
}

/**
 * CHECKPOINT_REMINDERS_DAILY (09:00 business time):
 *  - each intern in a running evaluation whose checkpoint for today is still PENDING gets a
 *    CHECKPOINT_REMINDER;
 *  - each supervisor with submitted checkpoints waiting for review gets one
 *    CHECKPOINT_REVIEW_REMINDER, provided they still hold evaluation access.
 * Idempotent per day through per-recipient outbox dedupe keys.
 */
export async function runCheckpointReminders(dateKey: string, now: Date): Promise<{ queued: number }> {
  const prefix = `${JOB_TYPES.CHECKPOINT_REMINDERS_DAILY}:${dateKey}:`;
  const emails: AutomationEmail[] = [];

  const enrollments = await prisma.internshipEnrollment.findMany({
    where: {
      status: EvaluationStatus.IN_PROGRESS,
      startDate: { not: null, lt: utcMidnight(addDaysToKey(dateKey, 1)) },
      checkpoints: { some: { status: CheckpointStatus.PENDING } },
    },
    select: {
      id: true,
      startDate: true,
      workingDaysTarget: true,
      user: { select: { name: true, email: true } },
      application: { select: { opening: { select: { title: true } } } },
      checkpoints: {
        where: { status: CheckpointStatus.PENDING },
        select: { dayNumber: true, title: true },
      },
    },
  });

  for (const enrollment of enrollments) {
    if (!enrollment.startDate) continue;
    const dayNumber = evaluationDayNumberOn(enrollment.startDate, enrollment.workingDaysTarget, dateKey);
    if (dayNumber === null) continue;
    const checkpoint = enrollment.checkpoints.find((cp) => cp.dayNumber === dayNumber);
    if (!checkpoint) continue;
    emails.push({
      recipientEmail: enrollment.user.email,
      templateName: "CHECKPOINT_REMINDER",
      payload: {
        recipientName: enrollment.user.name,
        openingTitle: enrollment.application.opening.title,
        dayNumber,
        checkpointTitle: checkpoint.title,
      },
      dedupeKey: `${prefix}intern:${enrollment.id}`,
    });
  }

  // Checkpoints can only be reviewed while the evaluation is running.
  const submitted = await prisma.evaluationCheckpoint.findMany({
    where: {
      status: CheckpointStatus.SUBMITTED,
      enrollment: { status: EvaluationStatus.IN_PROGRESS, supervisorId: { not: null } },
    },
    select: {
      dayNumber: true,
      enrollment: { select: { userId: true, supervisorId: true, user: { select: { name: true } } } },
    },
    orderBy: [{ enrollmentId: "asc" }, { dayNumber: "asc" }],
  });

  const bySupervisor = new Map<string, Array<{ internName: string; dayNumber: number }>>();
  for (const cp of submitted) {
    const supervisorId = cp.enrollment.supervisorId;
    if (!supervisorId || supervisorId === cp.enrollment.userId) continue;
    const list = bySupervisor.get(supervisorId) ?? [];
    list.push({ internName: cp.enrollment.user.name, dayNumber: cp.dayNumber });
    bySupervisor.set(supervisorId, list);
  }

  if (bySupervisor.size > 0) {
    const supervisors = await prisma.user.findMany({
      where: { id: { in: [...bySupervisor.keys()] } },
      select: { id: true, name: true, email: true, roles: { select: { role: true } } },
    });
    for (const supervisor of supervisors) {
      const roles = supervisor.roles.map((r) => r.role);
      // A supervisor who lost the evaluation role or permission cannot act, so is not reminded.
      if (!(await resolveEvaluationAccess({ id: supervisor.id, roles }))) continue;
      const items = bySupervisor.get(supervisor.id) ?? [];
      emails.push({
        recipientEmail: supervisor.email,
        templateName: "CHECKPOINT_REVIEW_REMINDER",
        payload: {
          recipientName: supervisor.name,
          pendingCount: items.length,
          items,
          href: `${staffPortalBase(roles)}/evaluations`,
        },
        dedupeKey: `${prefix}supervisor:${supervisor.id}`,
      });
    }
  }

  const result = await queueAutomationEmailsOnce(emails, { prefix, now });
  return { queued: result.queued };
}
