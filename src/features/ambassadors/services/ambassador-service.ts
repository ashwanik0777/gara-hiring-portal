import crypto from "crypto";
import { AmbassadorStatus, Prisma, Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { AuthenticatedUser } from "@/lib/auth/guards";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import { CAMPUS_AMBASSADOR_POLICY, LEGAL } from "@/config/site";
import { businessDateKey } from "@/lib/time/business-time";
import { payoutFieldEncryptor } from "@/lib/security/field-encryption";
import { resolveCollegeChoice } from "@/features/colleges/services/college-service";
import { queueAutomationEmailsOnce } from "@/features/automation/outbox-once";
import { AMBASSADOR_STATUS_TEMPLATE } from "@/infrastructure/email/templates/ambassador-emails";
import { getSiteUrl } from "@/lib/site-url";
import { ambassadorApplicationSchema, ambassadorDecisionSchema, upiSchema } from "../schemas";
import { buildReferralCode, commissionBucket, maskUpiId, normalizeReferralCode } from "../policy";

/*
 * Campus Ambassador programme (Phase 4): applications, approval as Lead or Associate, referral
 * codes and clicks, sign-up attribution, the ambassador's dashboard data and the leaderboard.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

function assertAdmin(user: AuthenticatedUser) {
  if (!user.roles.includes(Role.ADMIN)) throw new ForbiddenError("Only administrators can manage Campus Ambassadors.");
}

function parse<T extends import("zod").ZodType>(schema: T, input: unknown): import("zod").output<T> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message ?? "Invalid input.");
  return parsed.data;
}

/** Encryption context: a ciphertext only decrypts for this ambassador's UPI column. */
export function upiFieldContext(ambassadorId: string): string {
  return `ambassador-payout:${ambassadorId}:upi`;
}

export function referralLink(code: string): string {
  return `${getSiteUrl().replace(/\/+$/, "")}/?ref=${code}`;
}

// -----------------------------------------------------------------------------
// Student
// -----------------------------------------------------------------------------

export async function applyAsAmbassador(user: AuthenticatedUser, raw: unknown) {
  const input = parse(ambassadorApplicationSchema, raw);
  if (user.roles.some((role) => role !== Role.CANDIDATE && role !== Role.INTERN)) {
    throw new ForbiddenError("Staff accounts cannot apply as Campus Ambassadors.");
  }
  return prisma.$transaction(async (tx) => {
    const existing = await tx.campusAmbassador.findUnique({ where: { userId: user.id }, select: { id: true } });
    if (existing) throw new ConflictError("You have already applied.");
    const collegeId = await resolveCollegeChoice(tx, { collegeId: input.collegeId ?? null, collegeName: input.collegeName ?? null }, user.id);
    if (!collegeId) throw new ValidationError("Choose your college or type its full name.");
    // Anti-abuse: the same phone number on another application is flagged for staff.
    const samePhone = await tx.campusAmbassador.findFirst({ where: { phone: input.phone }, select: { id: true } });
    const created = await tx.campusAmbassador.create({
      data: {
        userId: user.id,
        collegeId,
        phone: input.phone,
        branch: input.branch ?? null,
        yearOfStudy: input.yearOfStudy,
        motivation: input.motivation,
        socialReach: input.socialReach ?? null,
        pastExperience: input.pastExperience ?? null,
        consentAt: new Date(),
        consentVersion: LEGAL.version,
        duplicateFlag: samePhone ? "Same phone number as another application" : null,
      },
      select: { id: true },
    });
    await tx.auditLog.create({
      data: { actorId: user.id, actorRole: "CANDIDATE", action: "AMBASSADOR_APPLIED", resourceType: "CampusAmbassador", resourceId: created.id, diffPayload: { collegeId } },
    });
    return created;
  });
}

/** Saves the UPI ID for payouts (approved ambassadors). A new ID needs a new RazorpayX fund account. */
export async function saveUpiId(user: AuthenticatedUser, raw: unknown) {
  const { upiId } = parse(upiSchema, raw);
  const ambassador = await prisma.campusAmbassador.findUnique({ where: { userId: user.id }, select: { id: true, status: true } });
  if (!ambassador) throw new NotFoundError("Ambassador not found");
  if (ambassador.status !== AmbassadorStatus.APPROVED) throw new ConflictError("Only active ambassadors can add a UPI ID.");
  const encrypted = payoutFieldEncryptor.encrypt(upiId, upiFieldContext(ambassador.id));
  await prisma.$transaction(async (tx) => {
    await tx.campusAmbassador.update({
      where: { id: ambassador.id },
      data: { upiIdEncrypted: encrypted, upiIdMasked: maskUpiId(upiId), razorpayFundAccountId: null },
    });
    await tx.auditLog.create({
      data: { actorId: user.id, actorRole: "CANDIDATE", action: "AMBASSADOR_UPI_SAVED", resourceType: "CampusAmbassador", resourceId: ambassador.id, diffPayload: { masked: maskUpiId(upiId) } },
    });
  });
}

/** Counts behind an ambassador's dashboard and the staff list. */
async function performance(ambassadorIds: string[], now: Date) {
  if (ambassadorIds.length === 0) return new Map<string, ReturnType<typeof emptyPerformance>>();
  const [clicks, signups, applications, commissions] = await Promise.all([
    prisma.referralClickDaily.groupBy({ by: ["ambassadorId"], where: { ambassadorId: { in: ambassadorIds } }, _sum: { clicks: true } }),
    prisma.user.groupBy({ by: ["referredByAmbassadorId"], where: { referredByAmbassadorId: { in: ambassadorIds } }, _count: { _all: true } }),
    prisma.application.findMany({
      where: { candidate: { user: { referredByAmbassadorId: { in: ambassadorIds } } } },
      select: { candidate: { select: { user: { select: { referredByAmbassadorId: true } } } } },
      take: 10_000,
    }),
    prisma.ambassadorCommission.findMany({
      where: { ambassadorId: { in: ambassadorIds } },
      select: { ambassadorId: true, amountPaise: true, status: true, payableAt: true, payoutId: true, enrollment: { select: { status: true } } },
    }),
  ]);
  const result = new Map(ambassadorIds.map((id) => [id, emptyPerformance()]));
  for (const row of clicks) result.get(row.ambassadorId)!.clicks = row._sum.clicks ?? 0;
  for (const row of signups) if (row.referredByAmbassadorId) result.get(row.referredByAmbassadorId)!.signups = row._count._all;
  for (const row of applications) {
    const id = row.candidate.user.referredByAmbassadorId;
    if (id) result.get(id)!.applications += 1;
  }
  for (const row of commissions) {
    const entry = result.get(row.ambassadorId)!;
    const bucket = commissionBucket({ status: row.status, payableAt: row.payableAt, payoutId: row.payoutId, enrollmentStatus: row.enrollment.status }, now);
    if (bucket === "reversed") continue;
    entry.paidEnrollments += 1;
    entry.earnings[bucket === "processing" ? "payable" : bucket] += row.amountPaise;
  }
  return result;
}

function emptyPerformance() {
  return { clicks: 0, signups: 0, applications: 0, paidEnrollments: 0, earnings: { pending: 0, payable: 0, paid: 0 } };
}

/** Top ambassadors by paid enrollments (overall, or within one college). */
export async function leaderboard(collegeId: string | null, limit = 10) {
  const rows = await prisma.ambassadorCommission.groupBy({
    by: ["ambassadorId"],
    where: { status: { not: "REVERSED" }, ambassador: { status: AmbassadorStatus.APPROVED, ...(collegeId ? { collegeId } : {}) } },
    _count: { _all: true },
    orderBy: { _count: { ambassadorId: "desc" } },
    take: limit,
  });
  const ambassadors = await prisma.campusAmbassador.findMany({
    where: { id: { in: rows.map((row) => row.ambassadorId) } },
    select: { id: true, user: { select: { name: true } }, college: { select: { name: true } } },
  });
  const byId = new Map(ambassadors.map((ambassador) => [ambassador.id, ambassador]));
  return rows.map((row, index) => ({
    rank: index + 1,
    ambassadorId: row.ambassadorId,
    name: byId.get(row.ambassadorId)?.user.name ?? "Ambassador",
    college: byId.get(row.ambassadorId)?.college?.name ?? null,
    paidEnrollments: row._count._all,
  }));
}

/** The signed-in user's application or dashboard. */
export async function getMyAmbassador(userId: string, now: Date) {
  const ambassador = await prisma.campusAmbassador.findUnique({
    where: { userId },
    select: {
      id: true,
      status: true,
      role: true,
      referralCode: true,
      trialEndsAt: true,
      approvedAt: true,
      decisionNote: true,
      upiIdMasked: true,
      collegeId: true,
      college: { select: { name: true } },
      createdAt: true,
      certificate: { select: { id: true, verificationCode: true, status: true } },
      payouts: { orderBy: { createdAt: "desc" }, take: 50, select: { id: true, netPaise: true, tdsPaise: true, grossPaise: true, status: true, method: true, utr: true, paidAt: true, createdAt: true } },
    },
  });
  if (!ambassador) return null;
  if (ambassador.status !== AmbassadorStatus.APPROVED && ambassador.status !== AmbassadorStatus.DEACTIVATED) {
    return { ...ambassador, stats: null, leaderboards: null };
  }
  const [stats, overall, college] = await Promise.all([
    performance([ambassador.id], now),
    leaderboard(null),
    ambassador.collegeId ? leaderboard(ambassador.collegeId) : Promise.resolve([]),
  ]);
  return { ...ambassador, stats: stats.get(ambassador.id) ?? emptyPerformance(), leaderboards: { overall, college } };
}

export type MyAmbassador = NonNullable<Awaited<ReturnType<typeof getMyAmbassador>>>;

// -----------------------------------------------------------------------------
// Referral clicks and attribution
// -----------------------------------------------------------------------------

/** Counts a referral link click for an active ambassador; returns the code when valid. */
export async function recordReferralClick(rawCode: unknown, now: Date): Promise<string | null> {
  const code = normalizeReferralCode(rawCode);
  if (!code) return null;
  const ambassador = await prisma.campusAmbassador.findUnique({ where: { referralCode: code }, select: { id: true, status: true } });
  if (!ambassador || ambassador.status !== AmbassadorStatus.APPROVED) return null;
  const day = businessDateKey(now);
  await prisma.referralClickDaily.upsert({
    where: { ambassadorId_day: { ambassadorId: ambassador.id, day } },
    create: { ambassadorId: ambassador.id, day, clicks: 1 },
    update: { clicks: { increment: 1 } },
  });
  return code;
}

/**
 * The ambassador behind a referral code for this student, or an error: unknown or inactive
 * codes and an ambassador's own code are refused (self-referral).
 */
export async function resolveReferralForStudent(db: Prisma.TransactionClient | typeof prisma, rawCode: unknown, studentUserId: string) {
  const code = normalizeReferralCode(rawCode);
  if (!code) throw new ValidationError("This referral code is not valid.");
  const ambassador = await db.campusAmbassador.findUnique({ where: { referralCode: code }, select: { id: true, userId: true, status: true } });
  if (!ambassador || ambassador.status !== AmbassadorStatus.APPROVED) throw new ValidationError("This referral code is not valid.");
  if (ambassador.userId === studentUserId) throw new ValidationError("You cannot use your own referral code.");
  return { ambassadorId: ambassador.id, code };
}

/**
 * Attributes a new account to the ambassador whose link it came through (last click within the
 * attribution window, never the ambassador themself, only accounts created inside the window).
 */
export async function attachReferralSignup(userId: string, rawCode: unknown, now: Date): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { referredByAmbassadorId: true, createdAt: true } });
  if (!user || user.referredByAmbassadorId) return;
  if (now.getTime() - user.createdAt.getTime() > CAMPUS_AMBASSADOR_POLICY.attributionDays * DAY_MS) return;
  let referral: { ambassadorId: string };
  try {
    referral = await resolveReferralForStudent(prisma, rawCode, userId);
  } catch {
    return;
  }
  await prisma.user.updateMany({
    where: { id: userId, referredByAmbassadorId: null },
    data: { referredByAmbassadorId: referral.ambassadorId, referredAt: now },
  });
}

// -----------------------------------------------------------------------------
// Staff
// -----------------------------------------------------------------------------

export async function listAmbassadorsForStaff(user: AuthenticatedUser, filter: { status?: AmbassadorStatus | null }, now: Date) {
  assertAdmin(user);
  const ambassadors = await prisma.campusAmbassador.findMany({
    where: filter.status ? { status: filter.status } : {},
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 300,
    select: {
      id: true,
      status: true,
      role: true,
      referralCode: true,
      phone: true,
      branch: true,
      yearOfStudy: true,
      motivation: true,
      socialReach: true,
      pastExperience: true,
      duplicateFlag: true,
      trialEndsAt: true,
      approvedAt: true,
      decisionNote: true,
      upiIdMasked: true,
      createdAt: true,
      user: { select: { name: true, email: true } },
      college: { select: { id: true, name: true } },
      certificate: { select: { id: true, verificationCode: true, status: true } },
    },
  });
  const stats = await performance(ambassadors.map((ambassador) => ambassador.id), now);
  return ambassadors.map((ambassador) => ({ ...ambassador, stats: stats.get(ambassador.id) ?? emptyPerformance() }));
}

export type StaffAmbassadorRow = Awaited<ReturnType<typeof listAmbassadorsForStaff>>[number];

const DECISION_FROM: Record<"APPROVE" | "REJECT" | "DEACTIVATE", AmbassadorStatus[]> = {
  APPROVE: [AmbassadorStatus.PENDING, AmbassadorStatus.DEACTIVATED],
  REJECT: [AmbassadorStatus.PENDING],
  DEACTIVATE: [AmbassadorStatus.APPROVED],
};

export async function decideAmbassador(user: AuthenticatedUser, raw: unknown, now: Date) {
  assertAdmin(user);
  const input = parse(ambassadorDecisionSchema, raw);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      return await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "campus_ambassadors" WHERE "id" = ${input.ambassadorId} FOR UPDATE`;
        const ambassador = await tx.campusAmbassador.findUnique({
          where: { id: input.ambassadorId },
          select: { id: true, status: true, collegeId: true, referralCode: true, approvedAt: true, user: { select: { name: true, email: true } } },
        });
        if (!ambassador) throw new NotFoundError("Ambassador not found");
        if (!DECISION_FROM[input.decision].includes(ambassador.status)) {
          throw new ConflictError(`This ambassador is ${ambassador.status.toLowerCase()}; that decision is not possible.`);
        }

        let status: AmbassadorStatus;
        let data: Prisma.CampusAmbassadorUpdateInput;
        if (input.decision === "APPROVE") {
          if (input.role === "LEAD") {
            if (!ambassador.collegeId) throw new ValidationError("A Lead needs a college.");
            const lead = await tx.campusAmbassador.findFirst({
              where: { collegeId: ambassador.collegeId, role: "LEAD", status: AmbassadorStatus.APPROVED, id: { not: ambassador.id } },
              select: { id: true },
            });
            if (lead) throw new ConflictError("This college already has a Lead. Approve as Associate, or deactivate the current Lead first.");
          }
          status = AmbassadorStatus.APPROVED;
          data = {
            status,
            role: input.role,
            referralCode: ambassador.referralCode ?? buildReferralCode(ambassador.user.name, (max) => crypto.randomInt(max)),
            approvedAt: ambassador.approvedAt ?? now,
            trialEndsAt: ambassador.approvedAt ? undefined : new Date(now.getTime() + CAMPUS_AMBASSADOR_POLICY.trialDays * DAY_MS),
          };
        } else {
          status = input.decision === "REJECT" ? AmbassadorStatus.REJECTED : AmbassadorStatus.DEACTIVATED;
          data = { status };
        }
        const updated = await tx.campusAmbassador.update({
          where: { id: ambassador.id },
          data: { ...data, decidedById: user.id, decidedAt: now, decisionNote: input.note ?? null },
          select: { referralCode: true, status: true },
        });
        await tx.auditLog.create({
          data: {
            actorId: user.id,
            actorRole: Role.ADMIN,
            action: `AMBASSADOR_${status}`,
            resourceType: "CampusAmbassador",
            resourceId: ambassador.id,
            diffPayload: { role: input.role ?? null, note: input.note ?? null, referralCode: updated.referralCode },
          },
        });
        await queueAutomationEmailsOnce(
          [
            {
              recipientEmail: ambassador.user.email,
              templateName: AMBASSADOR_STATUS_TEMPLATE,
              payload: {
                recipientName: ambassador.user.name,
                status,
                role: input.role ?? null,
                referralCode: updated.referralCode,
                referralLink: updated.referralCode ? referralLink(updated.referralCode) : null,
                note: status === AmbassadorStatus.APPROVED ? null : (input.note ?? null),
              },
              dedupeKey: `${AMBASSADOR_STATUS_TEMPLATE}:${ambassador.id}:${status}:${now.getTime()}`,
            },
          ],
          { prefix: AMBASSADOR_STATUS_TEMPLATE, now, db: tx }
        );
        return updated;
      });
    } catch (error) {
      // A generated referral code that already exists: try another one.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002" && attempt < 4) continue;
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictError("This college already has a Lead, or the referral code could not be generated. Please try again.");
      }
      throw error;
    }
  }
  throw new ConflictError("The decision could not be saved. Please try again.");
}
