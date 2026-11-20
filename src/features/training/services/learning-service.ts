import { TrainingEnrollmentStatus, TrainingProjectStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { AuthenticatedUser } from "@/lib/auth/guards";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/errors";
import { TRAINING_POLICY } from "@/config/site";
import { projectSchema, submissionSchema } from "../learning-schemas";
import { computeTrainingProgress, hasBatchEnded } from "../progress";
import { SEAT_TAKING_STATUSES } from "../policy";
import { LEARNING_STATUSES } from "./batch-staff-service";
import { isBatchOpenForEnrollment } from "./program-service";

/*
 * Student side of the Industrial Training learning area (Phase 3B). Every function checks
 * that the enrollment belongs to the signed-in user.
 */

async function ownEnrollment(user: AuthenticatedUser, enrollmentId: string) {
  const enrollment = await prisma.trainingEnrollment.findUnique({
    where: { id: enrollmentId },
    select: {
      id: true,
      userId: true,
      status: true,
      batchId: true,
      batch: { select: { id: true, status: true, endDate: true, programId: true } },
    },
  });
  if (!enrollment || enrollment.userId !== user.id) throw new NotFoundError("Enrollment not found");
  return enrollment;
}

function assertLearning(status: TrainingEnrollmentStatus) {
  if (!LEARNING_STATUSES.includes(status)) {
    throw new ConflictError("Your result for this batch has been recorded; nothing more can be submitted.");
  }
}

/** The learning area of one enrollment: classes, assignments, project, demo slots and progress. */
export async function getLearningArea(user: AuthenticatedUser, enrollmentId: string, now: Date) {
  const enrollment = await prisma.trainingEnrollment.findUnique({
    where: { id: enrollmentId },
    select: {
      id: true,
      userId: true,
      status: true,
      reattemptOfId: true,
      resultAt: true,
      resultNote: true,
      reattempt: { select: { id: true, batch: { select: { name: true } } } },
      reattemptOf: { select: { reattemptOfId: true } },
      attendance: { select: { sessionId: true, present: true } },
      submissions: true,
      finalProject: true,
      certificate: { select: { id: true, verificationCode: true, status: true } },
      batch: {
        select: {
          id: true,
          name: true,
          status: true,
          startDate: true,
          endDate: true,
          programId: true,
          program: { select: { title: true, slug: true } },
          sessions: { orderBy: { startsAt: "asc" }, take: 500 },
          assignments: { orderBy: { dueAt: "asc" }, take: 300 },
          demoSlots: {
            where: { OR: [{ bookedEnrollmentId: enrollmentId }, { bookedEnrollmentId: null, startsAt: { gt: now } }] },
            orderBy: { startsAt: "asc" },
            take: 200,
            include: { mentor: { select: { name: true } } },
          },
        },
      },
    },
  });
  if (!enrollment || enrollment.userId !== user.id) throw new NotFoundError("Enrollment not found");
  if (!(SEAT_TAKING_STATUSES as readonly string[]).includes(enrollment.status)) {
    throw new NotFoundError("This enrollment has no learning area.");
  }

  const { batch } = enrollment;
  const myDemos = batch.demoSlots.filter((slot) => slot.bookedEnrollmentId === enrollment.id);
  const progress = computeTrainingProgress({
    now,
    assignments: batch.assignments,
    submissions: enrollment.submissions,
    sessions: batch.sessions,
    attendance: enrollment.attendance,
    project: enrollment.finalProject,
    demos: myDemos,
  });
  // Meeting links only for students who still attend.
  const attending = LEARNING_STATUSES.includes(enrollment.status);
  const sessions = batch.sessions.map((session) => ({ ...session, meetingUrl: attending ? session.meetingUrl : null }));
  const demoSlots = batch.demoSlots.map((slot) => ({
    ...slot,
    meetingUrl: slot.bookedEnrollmentId === enrollment.id ? slot.meetingUrl : null,
  }));

  // One free re-attempt per purchase: a re-attempt that fails again has none left.
  let depth = 0;
  if (enrollment.reattemptOfId) depth = enrollment.reattemptOf?.reattemptOfId ? 2 : 1;
  const canReattempt =
    enrollment.status === TrainingEnrollmentStatus.FAILED && !enrollment.reattempt && depth < TRAINING_POLICY.freeReattempts;

  return { ...enrollment, batch: { ...batch, sessions, demoSlots }, progress, canReattempt, batchEnded: hasBatchEnded(batch, now) };
}

export type LearningArea = Awaited<ReturnType<typeof getLearningArea>>;

/** Submit or replace an assignment before its due time (late submissions are not accepted). */
export async function submitAssignment(user: AuthenticatedUser, raw: unknown, now: Date) {
  const parsed = submissionSchema.safeParse(raw);
  if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message ?? "Invalid submission.");
  const input = parsed.data;
  const enrollment = await ownEnrollment(user, input.enrollmentId);
  assertLearning(enrollment.status);

  const assignment = await prisma.trainingAssignment.findUnique({
    where: { id: input.assignmentId },
    select: { id: true, batchId: true, dueAt: true },
  });
  if (!assignment || assignment.batchId !== enrollment.batchId) throw new NotFoundError("Assignment not found");
  if (now.getTime() > assignment.dueAt.getTime()) {
    throw new ConflictError("The due time for this assignment has passed; submissions are closed.");
  }

  const existing = await prisma.trainingSubmission.findUnique({
    where: { assignmentId_enrollmentId: { assignmentId: assignment.id, enrollmentId: enrollment.id } },
    select: { id: true, marks: true },
  });
  if (existing && existing.marks !== null) throw new ConflictError("This submission has been graded and cannot be replaced.");

  const data = { repoUrl: input.repoUrl ?? null, linkUrl: input.linkUrl ?? null, notes: input.notes ?? null, submittedAt: now };
  await prisma.trainingSubmission.upsert({
    where: { assignmentId_enrollmentId: { assignmentId: assignment.id, enrollmentId: enrollment.id } },
    create: { ...data, assignmentId: assignment.id, enrollmentId: enrollment.id },
    update: data,
  });
}

/** Submit or update the final project (until it is passed or failed, and before the batch ends). */
export async function submitFinalProject(user: AuthenticatedUser, raw: unknown, now: Date) {
  const parsed = projectSchema.safeParse(raw);
  if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message ?? "Invalid project.");
  const input = parsed.data;
  const enrollment = await ownEnrollment(user, input.enrollmentId);
  assertLearning(enrollment.status);
  if (hasBatchEnded(enrollment.batch, now)) throw new ConflictError("The batch has ended; projects can no longer be submitted.");

  const existing = await prisma.trainingFinalProject.findUnique({ where: { enrollmentId: enrollment.id }, select: { status: true } });
  if (existing && (existing.status === TrainingProjectStatus.PASSED || existing.status === TrainingProjectStatus.FAILED)) {
    throw new ConflictError("Your project has been reviewed and can no longer be changed.");
  }
  const data = {
    title: input.title,
    description: input.description ?? null,
    repoUrl: input.repoUrl,
    liveUrl: input.liveUrl ?? null,
    status: TrainingProjectStatus.SUBMITTED,
    submittedAt: now,
  };
  await prisma.trainingFinalProject.upsert({
    where: { enrollmentId: enrollment.id },
    create: { ...data, enrollmentId: enrollment.id },
    update: data,
  });
}

/**
 * Book a demo slot of the own batch: one upcoming booking at a time, none after a passed demo.
 * After a failed demo the student may book another slot until the batch ends.
 */
export async function bookDemoSlot(user: AuthenticatedUser, input: { enrollmentId: string; slotId: string }, now: Date) {
  const enrollment = await ownEnrollment(user, input.enrollmentId);
  assertLearning(enrollment.status);
  if (hasBatchEnded(enrollment.batch, now)) throw new ConflictError("The batch has ended.");

  const mine = await prisma.trainingDemoSlot.findMany({
    where: { bookedEnrollmentId: enrollment.id },
    select: { result: true, startsAt: true },
  });
  if (mine.some((slot) => slot.result === "PASSED")) throw new ConflictError("You have already passed the live demo.");
  if (mine.some((slot) => slot.result === null)) {
    throw new ConflictError("You already have a demo booked. Cancel it first to choose another slot.");
  }

  const slot = await prisma.trainingDemoSlot.findUnique({ where: { id: input.slotId }, select: { batchId: true, startsAt: true } });
  if (!slot || slot.batchId !== enrollment.batchId) throw new NotFoundError("Demo slot not found");
  if (slot.startsAt.getTime() <= now.getTime()) throw new ConflictError("This slot has already started.");
  const booked = await prisma.trainingDemoSlot.updateMany({
    where: { id: input.slotId, bookedEnrollmentId: null },
    data: { bookedEnrollmentId: enrollment.id, bookedAt: now },
  });
  if (booked.count !== 1) throw new ConflictError("Someone booked this slot a moment ago. Please choose another.");
}

/** Cancel an own booking before the slot starts. */
export async function cancelDemoBooking(user: AuthenticatedUser, input: { enrollmentId: string; slotId: string }, now: Date) {
  const enrollment = await ownEnrollment(user, input.enrollmentId);
  assertLearning(enrollment.status);
  const released = await prisma.trainingDemoSlot.updateMany({
    where: { id: input.slotId, bookedEnrollmentId: enrollment.id, result: null, startsAt: { gt: now } },
    data: { bookedEnrollmentId: null, bookedAt: null },
  });
  if (released.count !== 1) throw new ConflictError("This booking can no longer be cancelled.");
}

/**
 * Free re-attempt after a fail: a new, unpaid enrollment in a later open batch of the same
 * programme (one per purchase). It has no refund and no transfer.
 */
export async function startReattempt(user: AuthenticatedUser, input: { enrollmentId: string; targetBatchId: string }, now: Date) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "training_enrollments" WHERE "id" = ${input.enrollmentId} FOR UPDATE`;
    const failed = await tx.trainingEnrollment.findUnique({
      where: { id: input.enrollmentId },
      select: {
        id: true,
        userId: true,
        status: true,
        listPricePaise: true,
        reattemptOfId: true,
        reattempt: { select: { id: true } },
        batch: { select: { id: true, programId: true } },
      },
    });
    if (!failed || failed.userId !== user.id) throw new NotFoundError("Enrollment not found");
    if (failed.status !== TrainingEnrollmentStatus.FAILED) throw new ConflictError("A re-attempt is available only after a fail.");
    if (failed.reattempt) throw new ConflictError("You have already started your re-attempt.");
    if (failed.reattemptOfId && TRAINING_POLICY.freeReattempts <= 1) {
      throw new ConflictError("Your free re-attempt has been used.");
    }

    await tx.$queryRaw`SELECT "id" FROM "training_batches" WHERE "id" = ${input.targetBatchId} FOR UPDATE`;
    const target = await tx.trainingBatch.findUnique({ where: { id: input.targetBatchId } });
    if (!target || target.programId !== failed.batch.programId || target.id === failed.batch.id) {
      throw new ValidationError("Choose a later batch of the same programme.");
    }
    if (!isBatchOpenForEnrollment(target, now)) throw new ConflictError("That batch is not open for enrollment.");
    const taken = await tx.trainingEnrollment.count({
      where: {
        batchId: target.id,
        OR: [{ status: { in: [...SEAT_TAKING_STATUSES] } }, { status: TrainingEnrollmentStatus.PENDING_PAYMENT, seatHoldExpiresAt: { gt: now } }],
      },
    });
    if (taken >= target.seats) throw new ConflictError("That batch is full.");
    const clash = await tx.trainingEnrollment.findUnique({
      where: { userId_batchId: { userId: user.id, batchId: target.id } },
      select: { id: true, status: true },
    });
    if (clash && clash.status !== TrainingEnrollmentStatus.PENDING_PAYMENT && clash.status !== TrainingEnrollmentStatus.CANCELLED) {
      throw new ConflictError("You already have an enrollment in that batch.");
    }

    const data = {
      status: TrainingEnrollmentStatus.ACTIVE,
      listPricePaise: failed.listPricePaise,
      discountPaise: 0,
      amountPaidPaise: 0,
      seatHoldExpiresAt: null,
      reattemptOfId: failed.id,
    };
    const created = clash
      ? await tx.trainingEnrollment.update({ where: { id: clash.id }, data, select: { id: true } })
      : await tx.trainingEnrollment.create({ data: { ...data, userId: user.id, batchId: target.id }, select: { id: true } });
    await tx.auditLog.create({
      data: {
        actorId: user.id,
        actorRole: "CANDIDATE",
        action: "TRAINING_REATTEMPT_STARTED",
        resourceType: "TrainingEnrollment",
        resourceId: created.id,
        diffPayload: { failedEnrollmentId: failed.id, batchId: target.id },
      },
    });
    return created;
  });
}
