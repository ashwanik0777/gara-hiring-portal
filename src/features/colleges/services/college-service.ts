import { CollegeStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { assertPermission, type AuthenticatedUser } from "@/lib/auth/guards";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/errors";
import { cleanCollegeName, COLLEGE_NAME_MAX, COLLEGE_NAME_MIN, normalizeCollegeName } from "../college-name";
import { APPLICANT_DETAIL_FIELDS } from "@/features/applications/applicant-details";

export const COLLEGE_SEARCH_LIMIT = 10;

export interface CollegeSuggestion {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
}

/**
 * Suggestions for the apply form: approved colleges, plus the ones this user added that still
 * wait for approval (so a student finds their own entry again). Other students' unapproved
 * entries are never shown.
 */
export async function searchColleges(query: string, userId: string): Promise<CollegeSuggestion[]> {
  const term = cleanCollegeName(query);
  if (term.length < 2) return [];
  return prisma.college.findMany({
    where: {
      name: { contains: term, mode: "insensitive" },
      OR: [{ status: CollegeStatus.APPROVED }, { createdById: userId }],
    },
    select: { id: true, name: true, city: true, state: true },
    orderBy: [{ status: "asc" }, { name: "asc" }],
    take: COLLEGE_SEARCH_LIMIT,
  });
}

export interface CollegeChoice {
  /** A college picked from the suggestions. */
  collegeId?: string | null;
  /** A college typed by the student (used when nothing was picked). */
  collegeName?: string | null;
}

/**
 * The college id for a student's choice, inside the caller's transaction. A picked college must
 * be approved or added by this user; a typed name reuses the row with the same normalized name or
 * adds a PENDING one. Returns null when no college was given.
 */
export async function resolveCollegeChoice(
  tx: Prisma.TransactionClient,
  choice: CollegeChoice,
  userId: string
): Promise<string | null> {
  if (choice.collegeId) {
    const college = await tx.college.findUnique({
      where: { id: choice.collegeId },
      select: { id: true, status: true, createdById: true },
    });
    if (!college || (college.status !== CollegeStatus.APPROVED && college.createdById !== userId)) {
      throw new ValidationError("Choose your college from the list or type its full name.", [
        { field: APPLICANT_DETAIL_FIELDS.collegeName, message: "Choose your college from the list or type its full name." },
      ]);
    }
    return college.id;
  }

  const name = cleanCollegeName(choice.collegeName ?? "");
  if (!name) return null;
  const normalizedName = normalizeCollegeName(name);
  if (name.length < COLLEGE_NAME_MIN || name.length > COLLEGE_NAME_MAX || normalizedName.length < COLLEGE_NAME_MIN) {
    throw new ValidationError("Enter your college's full name.", [
      { field: APPLICANT_DETAIL_FIELDS.collegeName, message: "Enter your college's full name." },
    ]);
  }

  const college = await tx.college.upsert({
    where: { normalizedName },
    update: {},
    create: { name, normalizedName, status: CollegeStatus.PENDING, createdById: userId },
    select: { id: true },
  });
  return college.id;
}

// -----------------------------------------------------------------------------
// Staff moderation (approve, rename and merge duplicates)
// -----------------------------------------------------------------------------

export const STAFF_COLLEGE_LIMIT = 500;

/** Staff Query: colleges waiting for approval first, then the approved list. */
export async function listCollegesForStaff(user: AuthenticatedUser) {
  await assertPermission(user, "canApplications");
  return prisma.college.findMany({
    select: {
      id: true,
      name: true,
      city: true,
      state: true,
      status: true,
      createdAt: true,
      _count: { select: { candidates: true } },
    },
    orderBy: [{ status: "desc" }, { name: "asc" }],
    take: STAFF_COLLEGE_LIMIT,
  });
}

export type StaffCollege = Awaited<ReturnType<typeof listCollegesForStaff>>[number];

export interface CollegeUpdateInput {
  name: string;
  city?: string | null;
  state?: string | null;
  approve: boolean;
}

/** Staff Mutation: correct a college's name or place and, optionally, approve it. */
export async function updateCollege(id: string, input: CollegeUpdateInput, user: AuthenticatedUser) {
  await assertPermission(user, "canApplications");
  const name = cleanCollegeName(input.name);
  const normalizedName = normalizeCollegeName(name);
  if (name.length < COLLEGE_NAME_MIN || name.length > COLLEGE_NAME_MAX || normalizedName.length < COLLEGE_NAME_MIN) {
    throw new ValidationError("Enter the college's full name.");
  }
  const city = input.city?.trim() ? cleanCollegeName(input.city).slice(0, 80) : null;
  const state = input.state?.trim() ? cleanCollegeName(input.state).slice(0, 80) : null;

  try {
    return await prisma.$transaction(async (tx) => {
      const existing = await tx.college.findUnique({ where: { id }, select: { id: true, status: true } });
      if (!existing) throw new NotFoundError("College does not exist.");
      const status = input.approve ? CollegeStatus.APPROVED : existing.status;
      const college = await tx.college.update({
        where: { id },
        data: { name, normalizedName, city, state, status },
        select: { id: true, status: true },
      });
      await tx.auditLog.create({
        data: {
          actorId: user.id,
          actorRole: user.roles[0],
          action: input.approve && existing.status !== CollegeStatus.APPROVED ? "COLLEGE_APPROVED" : "COLLEGE_UPDATED",
          resourceType: "college",
          resourceId: id,
          diffPayload: { name, city, state, status },
        },
      });
      return college;
    });
  } catch (error) {
    if (typeof error === "object" && error !== null && (error as { code?: unknown }).code === "P2002") {
      throw new ConflictError("Another college already has this name. Merge the two colleges instead.");
    }
    throw error;
  }
}

/**
 * Staff Mutation: merges a duplicate college into the one to keep. Students and ambassadors move
 * to the kept college and the duplicate is removed. Certificates keep the college name printed
 * on them. Refused when both colleges have an approved Campus Ambassador Lead.
 */
export async function mergeColleges(input: { sourceId: string; targetId: string }, user: AuthenticatedUser) {
  await assertPermission(user, "canApplications");
  if (input.sourceId === input.targetId) throw new ValidationError("Choose two different colleges.");
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "colleges" WHERE "id" IN (${input.sourceId}, ${input.targetId}) FOR UPDATE`;
    const [source, target] = await Promise.all([
      tx.college.findUnique({ where: { id: input.sourceId }, select: { id: true, name: true, status: true } }),
      tx.college.findUnique({ where: { id: input.targetId }, select: { id: true, name: true, status: true } }),
    ]);
    if (!source || !target) throw new NotFoundError("College does not exist.");
    const leads = await tx.campusAmbassador.count({
      where: { collegeId: { in: [source.id, target.id] }, role: "LEAD", status: "APPROVED" },
    });
    if (leads > 1) throw new ConflictError("Both colleges have a Campus Ambassador Lead. Deactivate one Lead first.");

    const students = await tx.candidateProfile.updateMany({ where: { collegeId: source.id }, data: { collegeId: target.id } });
    const ambassadors = await tx.campusAmbassador.updateMany({ where: { collegeId: source.id }, data: { collegeId: target.id } });
    await tx.college.delete({ where: { id: source.id } });
    if (source.status === CollegeStatus.APPROVED && target.status !== CollegeStatus.APPROVED) {
      await tx.college.update({ where: { id: target.id }, data: { status: CollegeStatus.APPROVED } });
    }
    await tx.auditLog.create({
      data: {
        actorId: user.id,
        actorRole: user.roles[0],
        action: "COLLEGE_MERGED",
        resourceType: "college",
        resourceId: target.id,
        diffPayload: { mergedId: source.id, mergedName: source.name, keptName: target.name, students: students.count, ambassadors: ambassadors.count },
      },
    });
    return { students: students.count, ambassadors: ambassadors.count };
  });
}
