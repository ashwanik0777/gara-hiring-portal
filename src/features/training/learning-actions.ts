"use server";

import { z } from "zod";
import { revalidatePath, updateTag } from "next/cache";
import { requireAuth, type AuthenticatedUser } from "@/lib/auth/guards";
import { toActionError } from "@/lib/errors";
import { defaultRateLimiter, type RateLimitPolicy } from "@/lib/security/rate-limit";
import { scheduleOutboxFlush } from "@/infrastructure/email/outbox-dispatch";
import {
  cancelSession,
  createDemoSlots,
  deleteAssignment,
  deleteDemoSlot,
  gradeSubmission,
  recordDemoResult,
  reviewProject,
  saveAssignment,
  saveAttendance,
  saveSession,
  setBatchMentor,
} from "./services/batch-staff-service";
import { bookDemoSlot, cancelDemoBooking, startReattempt, submitAssignment, submitFinalProject } from "./services/learning-service";
import { decideTrainingResult } from "./services/result-service";
import { PUBLIC_TRAINING_TAG } from "./services/program-service";

type Result<T = null> = { success: true; data: T } | { success: false; error: string };

/** Student writes in the learning area: generous for real use, tight enough to stop floods. */
const STUDENT_LEARNING_RATE_LIMIT: RateLimitPolicy = { scope: "training:learning", maxRequests: 30, windowSeconds: 60 };

const uuid = z.uuid();

async function run<T>(fallback: string, work: (user: AuthenticatedUser, now: Date) => Promise<T>, options: { student?: boolean } = {}): Promise<Result<T>> {
  try {
    const user = await requireAuth();
    if (options.student) await defaultRateLimiter.enforce(user.id, STUDENT_LEARNING_RATE_LIMIT);
    const data = await work(user, new Date());
    revalidatePath("/candidate/training", "layout");
    return { success: true, data };
  } catch (error) {
    return { success: false, error: toActionError(error, fallback) };
  }
}

// ----------------------------------------------------------------------------- staff

export async function setBatchMentorAction(input: { batchId: string; userId: string; assigned: boolean }) {
  return run("The mentor could not be saved.", (user) =>
    setBatchMentor(user, { batchId: uuid.parse(input.batchId), userId: uuid.parse(input.userId), assigned: input.assigned === true })
  );
}

export async function saveSessionAction(sessionId: string | null, input: unknown) {
  return run("The class could not be saved.", (user) => saveSession(user, sessionId ? uuid.parse(sessionId) : null, input));
}

export async function cancelSessionAction(sessionId: string) {
  return run("The class could not be cancelled.", (user) => cancelSession(user, uuid.parse(sessionId)));
}

export async function saveAttendanceAction(input: unknown) {
  return run("The attendance could not be saved.", (user, now) => saveAttendance(user, input, now));
}

export async function saveAssignmentAction(assignmentId: string | null, input: unknown) {
  return run("The assignment could not be saved.", (user) => saveAssignment(user, assignmentId ? uuid.parse(assignmentId) : null, input));
}

export async function deleteAssignmentAction(assignmentId: string) {
  return run("The assignment could not be removed.", (user) => deleteAssignment(user, uuid.parse(assignmentId)));
}

export async function gradeSubmissionAction(input: unknown) {
  return run("The marks could not be saved.", (user, now) => gradeSubmission(user, input, now));
}

export async function reviewProjectAction(input: unknown) {
  return run("The review could not be saved.", (user, now) => reviewProject(user, input, now));
}

export async function createDemoSlotsAction(input: unknown) {
  return run("The demo slots could not be created.", (user, now) => createDemoSlots(user, input, now));
}

export async function deleteDemoSlotAction(slotId: string) {
  return run("The demo slot could not be removed.", (user) => deleteDemoSlot(user, uuid.parse(slotId)));
}

export async function recordDemoResultAction(input: unknown) {
  return run("The demo result could not be saved.", (user, now) => recordDemoResult(user, input, now));
}

export async function decideTrainingResultAction(input: unknown) {
  const result = await run("The result could not be saved.", (user, now) => decideTrainingResult(user, input, now));
  if (result.success) scheduleOutboxFlush();
  return result;
}

// ----------------------------------------------------------------------------- student

export async function submitAssignmentAction(input: unknown) {
  return run("Your submission could not be saved.", (user, now) => submitAssignment(user, input, now), { student: true });
}

export async function submitFinalProjectAction(input: unknown) {
  return run("Your project could not be saved.", (user, now) => submitFinalProject(user, input, now), { student: true });
}

export async function bookDemoSlotAction(input: { enrollmentId: string; slotId: string }) {
  return run(
    "The slot could not be booked.",
    (user, now) => bookDemoSlot(user, { enrollmentId: uuid.parse(input.enrollmentId), slotId: uuid.parse(input.slotId) }, now),
    { student: true }
  );
}

export async function cancelDemoBookingAction(input: { enrollmentId: string; slotId: string }) {
  return run(
    "The booking could not be cancelled.",
    (user, now) => cancelDemoBooking(user, { enrollmentId: uuid.parse(input.enrollmentId), slotId: uuid.parse(input.slotId) }, now),
    { student: true }
  );
}

export async function startReattemptAction(input: { enrollmentId: string; targetBatchId: string }) {
  const result = await run(
    "The re-attempt could not be started.",
    async (user, now) => {
      const created = await startReattempt(user, { enrollmentId: uuid.parse(input.enrollmentId), targetBatchId: uuid.parse(input.targetBatchId) }, now);
      return { enrollmentId: created.id };
    },
    { student: true }
  );
  if (result.success) updateTag(PUBLIC_TRAINING_TAG);
  return result;
}
