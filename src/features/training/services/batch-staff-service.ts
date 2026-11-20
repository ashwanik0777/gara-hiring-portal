import { Prisma, Role, TrainingEnrollmentStatus, TrainingSessionStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { AuthenticatedUser } from "@/lib/auth/guards";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import {
  assignmentSchema,
  attendanceSchema,
  demoResultSchema,
  demoSlotsSchema,
  fromLocalDateTime,
  gradeSchema,
  projectReviewSchema,
  sessionSchema,
} from "../learning-schemas";
import { computeTrainingProgress } from "../progress";
import type { z } from "zod";

/*
 * Staff side of the Industrial Training learning area (Phase 3B): administrators manage every
 * batch; mentors (MENTOR role) manage the batches they are assigned to.
 */

/** Enrollments that belong to a batch's class list. */
export const ROSTER_STATUSES: TrainingEnrollmentStatus[] = ["ACTIVE", "REFUND_REQUESTED", "COMPLETED", "FAILED"];
/** Enrollments that still learn (results not recorded). */
export const LEARNING_STATUSES: TrainingEnrollmentStatus[] = ["ACTIVE", "REFUND_REQUESTED"];

function isAdmin(user: AuthenticatedUser): boolean {
  return user.roles.includes(Role.ADMIN);
}

/** Administrator, or a mentor assigned to this batch. */
export async function assertBatchStaff(user: AuthenticatedUser, batchId: string): Promise<void> {
  if (isAdmin(user)) return;
  if (user.roles.includes(Role.MENTOR)) {
    const assigned = await prisma.trainingBatchMentor.findUnique({
      where: { batchId_userId: { batchId, userId: user.id } },
      select: { userId: true },
    });
    if (assigned) return;
  }
  throw new ForbiddenError("Only administrators and this batch's mentors can do this.");
}

function parse<T extends z.ZodType>(schema: T, input: unknown): z.output<T> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message ?? "Invalid input.");
  return parsed.data;
}

async function audit(
  tx: Prisma.TransactionClient,
  user: AuthenticatedUser,
  action: string,
  resourceType: string,
  resourceId: string,
  diffPayload: Prisma.InputJsonObject
) {
  await tx.auditLog.create({
    data: { actorId: user.id, actorRole: isAdmin(user) ? Role.ADMIN : Role.MENTOR, action, resourceType, resourceId, diffPayload },
  });
}

/** Results are final: a decided enrollment's record no longer changes. */
function assertStillLearning(status: TrainingEnrollmentStatus) {
  if (!LEARNING_STATUSES.includes(status)) {
    throw new ConflictError("The result for this student has been recorded; their record can no longer change.");
  }
}

// -----------------------------------------------------------------------------
// Queries
// -----------------------------------------------------------------------------

/** Batches the user can open in the learning area (all for administrators). */
export async function listStaffBatches(user: AuthenticatedUser) {
  if (!isAdmin(user) && !user.roles.includes(Role.MENTOR)) throw new ForbiddenError("Only administrators and mentors can open training batches.");
  return prisma.trainingBatch.findMany({
    where: isAdmin(user) ? {} : { mentors: { some: { userId: user.id } } },
    orderBy: { startDate: "desc" },
    take: 200,
    select: {
      id: true,
      name: true,
      status: true,
      startDate: true,
      endDate: true,
      program: { select: { title: true } },
      _count: { select: { enrollments: { where: { status: { in: ROSTER_STATUSES } } } } },
    },
  });
}

/** Everything the batch workspace shows, with each student's progress. */
export async function getBatchWorkspace(user: AuthenticatedUser, batchId: string, now: Date) {
  await assertBatchStaff(user, batchId);
  const batch = await prisma.trainingBatch.findUnique({
    where: { id: batchId },
    select: {
      id: true,
      name: true,
      status: true,
      startDate: true,
      endDate: true,
      firstClassAt: true,
      program: { select: { id: true, title: true, slug: true } },
      mentors: { select: { userId: true, user: { select: { name: true, email: true } } }, orderBy: { createdAt: "asc" } },
      sessions: { orderBy: { startsAt: "asc" }, take: 500 },
      assignments: {
        orderBy: { dueAt: "asc" },
        take: 300,
        include: {
          submissions: {
            orderBy: { submittedAt: "asc" },
            include: { enrollment: { select: { id: true, status: true, user: { select: { name: true } } } } },
          },
        },
      },
      demoSlots: {
        orderBy: { startsAt: "asc" },
        take: 500,
        include: {
          mentor: { select: { name: true } },
          bookedEnrollment: { select: { id: true, status: true, user: { select: { name: true } } } },
        },
      },
      enrollments: {
        where: { status: { in: ROSTER_STATUSES } },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          status: true,
          reattemptOfId: true,
          resultAt: true,
          resultNote: true,
          user: { select: { name: true, email: true } },
          attendance: { select: { sessionId: true, present: true } },
          submissions: { select: { assignmentId: true, marks: true } },
          finalProject: true,
          demoBookings: { select: { result: true } },
          certificate: { select: { id: true, verificationCode: true, status: true } },
        },
      },
    },
  });
  if (!batch) throw new NotFoundError("Batch not found");

  const roster = batch.enrollments.map((enrollment) => ({
    ...enrollment,
    progress: computeTrainingProgress({
      now,
      assignments: batch.assignments,
      submissions: enrollment.submissions,
      sessions: batch.sessions,
      attendance: enrollment.attendance,
      project: enrollment.finalProject,
      demos: enrollment.demoBookings,
    }),
  }));
  return { ...batch, roster };
}

export type BatchWorkspace = Awaited<ReturnType<typeof getBatchWorkspace>>;

/** Users who can be assigned as mentors (MENTOR role). */
export async function listMentorCandidates(user: AuthenticatedUser) {
  if (!isAdmin(user)) throw new ForbiddenError("Only administrators can assign mentors.");
  return prisma.user.findMany({
    where: { roles: { some: { role: Role.MENTOR } } },
    orderBy: { name: "asc" },
    take: 300,
    select: { id: true, name: true, email: true },
  });
}

// -----------------------------------------------------------------------------
// Mentors (administrators)
// -----------------------------------------------------------------------------

export async function setBatchMentor(user: AuthenticatedUser, input: { batchId: string; userId: string; assigned: boolean }) {
  if (!isAdmin(user)) throw new ForbiddenError("Only administrators can assign mentors.");
  const batch = await prisma.trainingBatch.findUnique({ where: { id: input.batchId }, select: { id: true } });
  if (!batch) throw new NotFoundError("Batch not found");
  return prisma.$transaction(async (tx) => {
    if (input.assigned) {
      const mentor = await tx.userRole.findFirst({ where: { userId: input.userId, role: Role.MENTOR }, select: { id: true } });
      if (!mentor) throw new ValidationError("Only users with the Mentor role can be assigned to a batch.");
      await tx.trainingBatchMentor.upsert({
        where: { batchId_userId: { batchId: input.batchId, userId: input.userId } },
        create: { batchId: input.batchId, userId: input.userId, assignedById: user.id },
        update: {},
      });
    } else {
      await tx.trainingBatchMentor.deleteMany({ where: { batchId: input.batchId, userId: input.userId } });
    }
    await audit(tx, user, input.assigned ? "TRAINING_MENTOR_ASSIGNED" : "TRAINING_MENTOR_REMOVED", "TrainingBatch", input.batchId, {
      mentorId: input.userId,
    });
  });
}

// -----------------------------------------------------------------------------
// Sessions and attendance
// -----------------------------------------------------------------------------

export async function saveSession(user: AuthenticatedUser, sessionId: string | null, raw: unknown) {
  const input = parse(sessionSchema, raw);
  await assertBatchStaff(user, input.batchId);
  const data = {
    title: input.title,
    startsAt: fromLocalDateTime(input.startsAt),
    durationMinutes: input.durationMinutes,
    meetingUrl: input.meetingUrl ?? null,
    recordingUrl: input.recordingUrl ?? null,
  };
  return prisma.$transaction(async (tx) => {
    let id = sessionId;
    if (sessionId) {
      const existing = await tx.trainingSession.findUnique({ where: { id: sessionId }, select: { batchId: true } });
      if (!existing || existing.batchId !== input.batchId) throw new NotFoundError("Class not found");
      await tx.trainingSession.update({ where: { id: sessionId }, data });
    } else {
      id = (await tx.trainingSession.create({ data: { ...data, batchId: input.batchId }, select: { id: true } })).id;
    }
    await audit(tx, user, sessionId ? "TRAINING_SESSION_UPDATED" : "TRAINING_SESSION_CREATED", "TrainingSession", id ?? "", {
      batchId: input.batchId,
      title: input.title,
      startsAt: data.startsAt.toISOString(),
    });
    return { id };
  });
}

/** Cancels a class that has no attendance yet (cancelled classes do not count). */
export async function cancelSession(user: AuthenticatedUser, sessionId: string) {
  const session = await prisma.trainingSession.findUnique({ where: { id: sessionId }, select: { batchId: true, attendanceTakenAt: true } });
  if (!session) throw new NotFoundError("Class not found");
  await assertBatchStaff(user, session.batchId);
  if (session.attendanceTakenAt) throw new ConflictError("Attendance was taken for this class; it cannot be cancelled.");
  await prisma.$transaction(async (tx) => {
    await tx.trainingSession.update({ where: { id: sessionId }, data: { status: TrainingSessionStatus.CANCELLED } });
    await audit(tx, user, "TRAINING_SESSION_CANCELLED", "TrainingSession", sessionId, { batchId: session.batchId });
  });
}

/** Saves the attendance sheet of a class that has started (students still learning only). */
export async function saveAttendance(user: AuthenticatedUser, raw: unknown, now: Date) {
  const input = parse(attendanceSchema, raw);
  const session = await prisma.trainingSession.findUnique({
    where: { id: input.sessionId },
    select: { id: true, batchId: true, startsAt: true, status: true },
  });
  if (!session) throw new NotFoundError("Class not found");
  await assertBatchStaff(user, session.batchId);
  if (session.status === TrainingSessionStatus.CANCELLED) throw new ConflictError("This class was cancelled.");
  if (session.startsAt.getTime() > now.getTime()) throw new ConflictError("Attendance can be taken once the class has started.");

  const ids = input.entries.map((entry) => entry.enrollmentId);
  if (new Set(ids).size !== ids.length) throw new ValidationError("A student appears twice in the attendance sheet.");
  const enrollments = await prisma.trainingEnrollment.findMany({
    where: { id: { in: ids }, batchId: session.batchId },
    select: { id: true, status: true },
  });
  if (enrollments.length !== ids.length) throw new ValidationError("The attendance sheet lists a student who is not in this batch.");
  const learning = new Set(enrollments.filter((enrollment) => LEARNING_STATUSES.includes(enrollment.status)).map((enrollment) => enrollment.id));

  await prisma.$transaction(async (tx) => {
    for (const entry of input.entries) {
      if (!learning.has(entry.enrollmentId)) continue; // decided results stay unchanged
      await tx.trainingAttendance.upsert({
        where: { sessionId_enrollmentId: { sessionId: session.id, enrollmentId: entry.enrollmentId } },
        create: { sessionId: session.id, enrollmentId: entry.enrollmentId, present: entry.present, markedById: user.id, markedAt: now },
        update: { present: entry.present, markedById: user.id, markedAt: now },
      });
    }
    await tx.trainingSession.update({ where: { id: session.id }, data: { attendanceTakenAt: now, attendanceTakenById: user.id } });
    await audit(tx, user, "TRAINING_ATTENDANCE_SAVED", "TrainingSession", session.id, {
      present: input.entries.filter((entry) => entry.present).length,
      total: input.entries.length,
    });
  });
}

// -----------------------------------------------------------------------------
// Assignments and grading
// -----------------------------------------------------------------------------

export async function saveAssignment(user: AuthenticatedUser, assignmentId: string | null, raw: unknown) {
  const input = parse(assignmentSchema, raw);
  await assertBatchStaff(user, input.batchId);
  const data = { title: input.title, description: input.description, dueAt: fromLocalDateTime(input.dueAt), maxMarks: input.maxMarks };
  return prisma.$transaction(async (tx) => {
    let id = assignmentId;
    if (assignmentId) {
      const existing = await tx.trainingAssignment.findUnique({
        where: { id: assignmentId },
        select: { batchId: true, submissions: { select: { marks: true } } },
      });
      if (!existing || existing.batchId !== input.batchId) throw new NotFoundError("Assignment not found");
      const highest = Math.max(0, ...existing.submissions.map((submission) => submission.marks ?? 0));
      if (input.maxMarks < highest) throw new ValidationError(`Maximum marks cannot be below marks already given (${highest}).`);
      await tx.trainingAssignment.update({ where: { id: assignmentId }, data });
    } else {
      id = (await tx.trainingAssignment.create({ data: { ...data, batchId: input.batchId, createdById: user.id }, select: { id: true } })).id;
    }
    await audit(tx, user, assignmentId ? "TRAINING_ASSIGNMENT_UPDATED" : "TRAINING_ASSIGNMENT_CREATED", "TrainingAssignment", id ?? "", {
      batchId: input.batchId,
      title: input.title,
      dueAt: data.dueAt.toISOString(),
      maxMarks: input.maxMarks,
    });
    return { id };
  });
}

/** Removes an assignment nobody has submitted yet. */
export async function deleteAssignment(user: AuthenticatedUser, assignmentId: string) {
  const assignment = await prisma.trainingAssignment.findUnique({
    where: { id: assignmentId },
    select: { batchId: true, title: true, _count: { select: { submissions: true } } },
  });
  if (!assignment) throw new NotFoundError("Assignment not found");
  await assertBatchStaff(user, assignment.batchId);
  if (assignment._count.submissions > 0) throw new ConflictError("Students have submitted this assignment; it cannot be removed.");
  await prisma.$transaction(async (tx) => {
    await tx.trainingAssignment.delete({ where: { id: assignmentId } });
    await audit(tx, user, "TRAINING_ASSIGNMENT_DELETED", "TrainingAssignment", assignmentId, { batchId: assignment.batchId, title: assignment.title });
  });
}

export async function gradeSubmission(user: AuthenticatedUser, raw: unknown, now: Date) {
  const input = parse(gradeSchema, raw);
  const submission = await prisma.trainingSubmission.findUnique({
    where: { id: input.submissionId },
    select: { id: true, assignment: { select: { batchId: true, maxMarks: true } }, enrollment: { select: { status: true } } },
  });
  if (!submission) throw new NotFoundError("Submission not found");
  await assertBatchStaff(user, submission.assignment.batchId);
  assertStillLearning(submission.enrollment.status);
  if (input.marks > submission.assignment.maxMarks) {
    throw new ValidationError(`Marks cannot exceed the maximum of ${submission.assignment.maxMarks}.`);
  }
  await prisma.$transaction(async (tx) => {
    await tx.trainingSubmission.update({
      where: { id: submission.id },
      data: { marks: input.marks, feedback: input.feedback ?? null, gradedById: user.id, gradedAt: now },
    });
    await audit(tx, user, "TRAINING_SUBMISSION_GRADED", "TrainingSubmission", submission.id, { marks: input.marks });
  });
}

// -----------------------------------------------------------------------------
// Final project and live demo
// -----------------------------------------------------------------------------

export async function reviewProject(user: AuthenticatedUser, raw: unknown, now: Date) {
  const input = parse(projectReviewSchema, raw);
  const project = await prisma.trainingFinalProject.findUnique({
    where: { id: input.projectId },
    select: { id: true, enrollment: { select: { batchId: true, status: true } } },
  });
  if (!project) throw new NotFoundError("Project not found");
  await assertBatchStaff(user, project.enrollment.batchId);
  assertStillLearning(project.enrollment.status);
  await prisma.$transaction(async (tx) => {
    await tx.trainingFinalProject.update({
      where: { id: project.id },
      data: { status: input.status, marks: input.marks, feedback: input.feedback ?? null, reviewedById: user.id, reviewedAt: now },
    });
    await audit(tx, user, "TRAINING_PROJECT_REVIEWED", "TrainingFinalProject", project.id, { status: input.status, marks: input.marks });
  });
}

/** Opens demo slots; the creating staff member runs them. */
export async function createDemoSlots(user: AuthenticatedUser, raw: unknown, now: Date) {
  const input = parse(demoSlotsSchema, raw);
  await assertBatchStaff(user, input.batchId);
  const starts = [...new Set(input.startsAt)].map(fromLocalDateTime);
  if (starts.some((start) => start.getTime() <= now.getTime())) throw new ValidationError("Demo slots must be in the future.");
  await prisma.$transaction(async (tx) => {
    await tx.trainingDemoSlot.createMany({
      data: starts.map((startsAt) => ({
        batchId: input.batchId,
        mentorId: user.id,
        startsAt,
        durationMinutes: input.durationMinutes,
        meetingUrl: input.meetingUrl ?? null,
      })),
    });
    await audit(tx, user, "TRAINING_DEMO_SLOTS_CREATED", "TrainingBatch", input.batchId, { count: starts.length });
  });
  return { created: starts.length };
}

/** Removes a demo slot nobody has booked. */
export async function deleteDemoSlot(user: AuthenticatedUser, slotId: string) {
  const slot = await prisma.trainingDemoSlot.findUnique({ where: { id: slotId }, select: { batchId: true } });
  if (!slot) throw new NotFoundError("Demo slot not found");
  await assertBatchStaff(user, slot.batchId);
  const removed = await prisma.trainingDemoSlot.deleteMany({ where: { id: slotId, bookedEnrollmentId: null } });
  if (removed.count !== 1) throw new ConflictError("A student has booked this slot; it cannot be removed.");
}

export async function recordDemoResult(user: AuthenticatedUser, raw: unknown, now: Date) {
  const input = parse(demoResultSchema, raw);
  const slot = await prisma.trainingDemoSlot.findUnique({
    where: { id: input.slotId },
    select: { id: true, batchId: true, startsAt: true, bookedEnrollment: { select: { id: true, status: true } } },
  });
  if (!slot) throw new NotFoundError("Demo slot not found");
  await assertBatchStaff(user, slot.batchId);
  if (!slot.bookedEnrollment) throw new ConflictError("Nobody booked this slot.");
  assertStillLearning(slot.bookedEnrollment.status);
  if (slot.startsAt.getTime() > now.getTime()) throw new ConflictError("The result can be recorded once the demo has started.");
  await prisma.$transaction(async (tx) => {
    await tx.trainingDemoSlot.update({
      where: { id: slot.id },
      data: { result: input.result, resultNote: input.note ?? null, resultAt: now, resultById: user.id },
    });
    await audit(tx, user, "TRAINING_DEMO_RESULT", "TrainingDemoSlot", slot.id, {
      enrollmentId: slot.bookedEnrollment?.id ?? null,
      result: input.result,
    });
  });
}
