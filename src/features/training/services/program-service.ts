import { cacheLife, cacheTag } from "next/cache";
import { Prisma, Role, TrainingBatchStatus, TrainingProgramStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { AuthenticatedUser } from "@/lib/auth/guards";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import { atBusinessTime } from "@/lib/time/business-time";
import { deadlineFromDateKey } from "@/features/openings/listing";
import { rupeesToPaise } from "../money";
import { SEAT_TAKING_STATUSES } from "../policy";
import {
  trainingBatchSchema,
  trainingProgramSchema,
  type SyllabusWeek,
  type TrainingBatchInput,
  type TrainingProgramInput,
} from "../schemas";
import { scheduleFirstClassReminder } from "../first-class-reminder";

/** Cache tag of the public training reads; every programme or batch change expires it. */
export const PUBLIC_TRAINING_TAG = "training:public";

const PUBLIC_TRAINING_CACHE_LIFE = { stale: 300, revalidate: 300, expire: 86_400 } as const;

/** Batches students can still see: not cancelled and not completed. */
const VISIBLE_BATCH_STATUSES = [TrainingBatchStatus.UPCOMING, TrainingBatchStatus.RUNNING];

const publicBatchSelect = {
  id: true,
  name: true,
  startDate: true,
  firstClassAt: true,
  endDate: true,
  scheduleText: true,
  seats: true,
  enrollmentDeadline: true,
  status: true,
} as const;

const publicProgramSelect = {
  id: true,
  slug: true,
  title: true,
  summary: true,
  description: true,
  syllabus: true,
  durationWeeks: true,
  feePaise: true,
  prerequisites: true,
  outcomes: true,
  updatedAt: true,
  track: { select: { name: true, slug: true } },
  batches: {
    where: { status: { in: VISIBLE_BATCH_STATUSES } },
    orderBy: { startDate: "asc" as const },
    select: publicBatchSelect,
  },
} satisfies Prisma.TrainingProgramSelect;

function toPublicProgram<T extends { syllabus: Prisma.JsonValue }>(program: T) {
  return { ...program, syllabus: (Array.isArray(program.syllabus) ? program.syllabus : []) as unknown as SyllabusWeek[] };
}

/** Public Query (cached): published programmes with their visible batches. */
export async function listPublishedPrograms() {
  "use cache";
  cacheTag(PUBLIC_TRAINING_TAG);
  cacheLife(PUBLIC_TRAINING_CACHE_LIFE);

  const programs = await prisma.trainingProgram.findMany({
    where: { status: TrainingProgramStatus.PUBLISHED },
    select: publicProgramSelect,
    orderBy: { title: "asc" },
  });
  return programs.map(toPublicProgram);
}

export type PublicTrainingProgram = Awaited<ReturnType<typeof listPublishedPrograms>>[number];
export type PublicTrainingBatch = PublicTrainingProgram["batches"][number];

/** Public Query (cached): a published programme by slug, or null. */
export async function getPublishedProgramBySlug(slug: string): Promise<PublicTrainingProgram | null> {
  "use cache";
  cacheTag(PUBLIC_TRAINING_TAG);
  cacheLife(PUBLIC_TRAINING_CACHE_LIFE);

  const program = await prisma.trainingProgram.findFirst({
    where: { slug, status: TrainingProgramStatus.PUBLISHED },
    select: publicProgramSelect,
  });
  return program ? toPublicProgram(program) : null;
}

/**
 * Seats taken per batch, at request time (never cached): paid or completed enrollments, plus
 * pending checkouts whose seat hold has not expired.
 */
export async function seatsTakenByBatch(batchIds: string[], now: Date): Promise<Map<string, number>> {
  if (batchIds.length === 0) return new Map();
  const rows = await prisma.trainingEnrollment.groupBy({
    by: ["batchId"],
    where: {
      batchId: { in: batchIds },
      OR: [
        { status: { in: [...SEAT_TAKING_STATUSES] } },
        { status: "PENDING_PAYMENT", seatHoldExpiresAt: { gt: now } },
      ],
    },
    _count: { _all: true },
  });
  return new Map(rows.map((row) => [row.batchId, row._count._all]));
}

/** Whether a batch accepts new enrollments now (seats are checked separately). */
export function isBatchOpenForEnrollment(
  batch: { status: TrainingBatchStatus; startDate: Date; enrollmentDeadline: Date | null },
  now: Date
): boolean {
  if (batch.status !== TrainingBatchStatus.UPCOMING) return false;
  if (batch.enrollmentDeadline && now > batch.enrollmentDeadline) return false;
  return now < batch.startDate;
}

// -----------------------------------------------------------------------------
// Staff (administrators only; the sub-admin permission matrix has no training module yet)
// -----------------------------------------------------------------------------

function assertTrainingAdmin(user: AuthenticatedUser): void {
  if (!user.roles.includes(Role.ADMIN)) {
    throw new ForbiddenError("Only administrators can manage Industrial Training.");
  }
}

function parse<T>(schema: { safeParse: (value: unknown) => { success: true; data: T } | { success: false; error: { issues: Array<{ message: string }> } } }, input: unknown): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0]?.message ?? "Invalid details", parsed.error.issues);
  }
  return parsed.data;
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: unknown }).code === "P2002";
}

function programData(input: ReturnType<typeof trainingProgramSchema.parse>) {
  return {
    title: input.title,
    slug: input.slug,
    trackId: input.trackId || null,
    summary: input.summary,
    description: input.description,
    syllabus: [...input.syllabus].sort((a, b) => a.week - b.week) as unknown as Prisma.InputJsonValue,
    durationWeeks: input.durationWeeks,
    feePaise: rupeesToPaise(input.feeRupees) as number,
    prerequisites: input.prerequisites ?? null,
    outcomes: input.outcomes ?? null,
    status: input.status,
  };
}

/** Staff Query: every programme with its batch count. */
export async function listProgramsForStaff(user: AuthenticatedUser) {
  assertTrainingAdmin(user);
  return prisma.trainingProgram.findMany({
    select: {
      id: true,
      slug: true,
      title: true,
      feePaise: true,
      durationWeeks: true,
      status: true,
      updatedAt: true,
      _count: { select: { batches: true } },
    },
    orderBy: { updatedAt: "desc" },
  });
}

/** Staff Query: a programme with all its batches and their enrollment counts. */
export async function getProgramForStaff(id: string, user: AuthenticatedUser) {
  assertTrainingAdmin(user);
  const program = await prisma.trainingProgram.findUnique({
    where: { id },
    include: {
      batches: {
        orderBy: { startDate: "desc" },
        include: { _count: { select: { enrollments: true } } },
      },
    },
  });
  if (!program) throw new NotFoundError("Programme not found");
  return toPublicProgram(program);
}

export type StaffTrainingProgram = Awaited<ReturnType<typeof getProgramForStaff>>;

/** Staff Mutation: create a programme. */
export async function createProgram(rawInput: TrainingProgramInput, user: AuthenticatedUser) {
  assertTrainingAdmin(user);
  const input = parse(trainingProgramSchema, rawInput);
  try {
    return await prisma.$transaction(async (tx) => {
      const program = await tx.trainingProgram.create({ data: programData(input), select: { id: true, slug: true } });
      await tx.auditLog.create({
        data: {
          actorId: user.id,
          actorRole: Role.ADMIN,
          action: "TRAINING_PROGRAM_CREATED",
          resourceType: "TrainingProgram",
          resourceId: program.id,
          diffPayload: { title: input.title, slug: input.slug, status: input.status },
        },
      });
      return program;
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw new ConflictError(`A programme with the slug "${input.slug}" already exists.`);
    throw error;
  }
}

/** Staff Mutation: edit a programme (the fee change applies to new enrollments only). */
export async function updateProgram(id: string, rawInput: TrainingProgramInput, user: AuthenticatedUser) {
  assertTrainingAdmin(user);
  const input = parse(trainingProgramSchema, rawInput);
  try {
    return await prisma.$transaction(async (tx) => {
      const existing = await tx.trainingProgram.findUnique({ where: { id }, select: { slug: true, feePaise: true } });
      if (!existing) throw new NotFoundError("Programme not found");
      const data = programData(input);
      const program = await tx.trainingProgram.update({ where: { id }, data, select: { id: true, slug: true } });
      await tx.auditLog.create({
        data: {
          actorId: user.id,
          actorRole: Role.ADMIN,
          action: "TRAINING_PROGRAM_UPDATED",
          resourceType: "TrainingProgram",
          resourceId: id,
          diffPayload: { ...data, previousSlug: existing.slug, previousFeePaise: existing.feePaise },
        },
      });
      return { ...program, previousSlug: existing.slug };
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw new ConflictError(`A programme with the slug "${input.slug}" already exists.`);
    throw error;
  }
}

/** Dates of a batch: the start is midnight India time; end and deadline cover their whole day. */
function batchData(input: ReturnType<typeof trainingBatchSchema.parse>) {
  const firstClassAt = input.firstClassAt
    ? atBusinessTime(input.firstClassAt.slice(0, 10), Number(input.firstClassAt.slice(11, 13)), Number(input.firstClassAt.slice(14, 16)))
    : null;
  return {
    name: input.name,
    startDate: atBusinessTime(input.startDate, 0, 0),
    firstClassAt,
    endDate: input.endDate ? deadlineFromDateKey(input.endDate) : null,
    scheduleText: input.scheduleText ?? null,
    seats: input.seats,
    enrollmentDeadline: input.enrollmentDeadline ? deadlineFromDateKey(input.enrollmentDeadline) : null,
    status: input.status,
  };
}

/** Staff Mutation: add a batch to a programme. */
export async function createBatch(rawInput: TrainingBatchInput, user: AuthenticatedUser) {
  assertTrainingAdmin(user);
  const input = parse(trainingBatchSchema, rawInput);
  return prisma.$transaction(async (tx) => {
    const program = await tx.trainingProgram.findUnique({ where: { id: input.programId }, select: { id: true } });
    if (!program) throw new NotFoundError("Programme not found");
    const batch = await tx.trainingBatch.create({ data: { ...batchData(input), programId: input.programId }, select: { id: true, firstClassAt: true, status: true } });
    await scheduleFirstClassReminder(tx, batch, new Date());
    await tx.auditLog.create({
      data: {
        actorId: user.id,
        actorRole: Role.ADMIN,
        action: "TRAINING_BATCH_CREATED",
        resourceType: "TrainingBatch",
        resourceId: batch.id,
        diffPayload: { ...input },
      },
    });
    return batch;
  });
}

/** Staff Mutation: edit a batch. Seats can never drop below the seats already taken. */
export async function updateBatch(id: string, rawInput: TrainingBatchInput, user: AuthenticatedUser) {
  assertTrainingAdmin(user);
  const input = parse(trainingBatchSchema, rawInput);
  return prisma.$transaction(async (tx) => {
    // Lock the batch so a checkout cannot take a seat between the count and the update.
    await tx.$queryRaw`SELECT "id" FROM "training_batches" WHERE "id" = ${id} FOR UPDATE`;
    const existing = await tx.trainingBatch.findUnique({ where: { id }, select: { programId: true } });
    if (!existing || existing.programId !== input.programId) throw new NotFoundError("Batch not found");
    const taken = await tx.trainingEnrollment.count({
      where: {
        batchId: id,
        OR: [
          { status: { in: [...SEAT_TAKING_STATUSES] } },
          { status: "PENDING_PAYMENT", seatHoldExpiresAt: { gt: new Date() } },
        ],
      },
    });
    if (input.seats < taken) {
      throw new ValidationError(`${taken} seats are already taken; seats cannot be lower than that.`);
    }
    const batch = await tx.trainingBatch.update({ where: { id }, data: batchData(input), select: { id: true, firstClassAt: true, status: true } });
    await scheduleFirstClassReminder(tx, batch, new Date());
    await tx.auditLog.create({
      data: {
        actorId: user.id,
        actorRole: Role.ADMIN,
        action: "TRAINING_BATCH_UPDATED",
        resourceType: "TrainingBatch",
        resourceId: id,
        diffPayload: { ...input },
      },
    });
    return batch;
  });
}
