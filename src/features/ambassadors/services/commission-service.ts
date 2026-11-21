import { AmbassadorStatus, Prisma, Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { AuthenticatedUser } from "@/lib/auth/guards";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import { logger } from "@/lib/logging/logger";
import { CAMPUS_AMBASSADOR_POLICY } from "@/config/site";
import { payoutFieldEncryptor } from "@/lib/security/field-encryption";
import { queueAutomationEmailsOnce } from "@/features/automation/outbox-once";
import { AMBASSADOR_PAYOUT_TEMPLATE } from "@/infrastructure/email/templates/ambassador-emails";
import { createContact, createUpiFundAccount, createUpiPayout, getRazorpayXAccountNumber } from "@/infrastructure/payments/razorpayx";
import { formatInr } from "@/features/training/money";
import { refundWindowClosesAt } from "@/features/training/policy";
import { commissionReviewSchema, manualPayoutSchema } from "../schemas";
import { commissionBucket, payoutTdsPaise } from "../policy";
import { upiFieldContext } from "./ambassador-service";

/*
 * Commission ledger and payouts (Phase 4). Rules from the product owner: an entry when a referred
 * enrollment becomes active; reversed automatically when the enrollment is refunded. Payment is at
 * GARA's discretion (decision 2026-11-21): after the batch's refund window closes, an
 * administrator reviews the ambassador's work and approves or declines each commission; only
 * approved commissions are paid. Nothing is ever paid automatically.
 */

function assertAdmin(user: AuthenticatedUser) {
  if (!user.roles.includes(Role.ADMIN)) throw new ForbiddenError("Only administrators can pay ambassadors.");
}

/** Called inside the payment transaction when an enrollment becomes active. */
export async function createCommissionForEnrollment(tx: Prisma.TransactionClient, enrollmentId: string): Promise<void> {
  const enrollment = await tx.trainingEnrollment.findUnique({
    where: { id: enrollmentId },
    select: {
      userId: true,
      referralCode: true,
      amountPaidPaise: true,
      reattemptOfId: true,
      commission: { select: { id: true } },
      batch: { select: { startDate: true, firstClassAt: true } },
    },
  });
  if (!enrollment?.referralCode || enrollment.commission || enrollment.reattemptOfId || enrollment.amountPaidPaise <= 0) return;
  const ambassador = await tx.campusAmbassador.findUnique({
    where: { referralCode: enrollment.referralCode },
    select: { id: true, userId: true, status: true },
  });
  // Inactive ambassadors and self-referrals earn nothing.
  if (!ambassador || ambassador.status !== AmbassadorStatus.APPROVED || ambassador.userId === enrollment.userId) return;
  await tx.ambassadorCommission.create({
    data: {
      ambassadorId: ambassador.id,
      enrollmentId,
      amountPaise: CAMPUS_AMBASSADOR_POLICY.commissionPaise,
      payableAt: refundWindowClosesAt(enrollment.batch),
    },
  });
}

/** Called inside the refund transaction: an unpaid commission of a refunded enrollment is reversed. */
export async function reverseCommission(tx: Prisma.TransactionClient, enrollmentId: string, now: Date): Promise<void> {
  await tx.ambassadorCommission.updateMany({
    where: { enrollmentId, status: { in: ["PENDING", "APPROVED", "DECLINED"] }, payoutId: null },
    data: { status: "REVERSED", reversedAt: now },
  });
}

/** Approved by an administrator, not yet in a payout, and its enrollment is not being refunded. */
const PAYABLE_WHERE = (now: Date): Prisma.AmbassadorCommissionWhereInput => ({
  status: "APPROVED",
  payoutId: null,
  payableAt: { lte: now },
  enrollment: { status: { notIn: ["REFUND_REQUESTED", "REFUNDED"] } },
});

/** Commissions an administrator may decide on (or change their mind about) until paid. */
const REVIEWABLE_WHERE = (now: Date): Prisma.AmbassadorCommissionWhereInput => ({
  status: { in: ["PENDING", "APPROVED", "DECLINED"] },
  payoutId: null,
  payableAt: { lte: now },
  enrollment: { status: { notIn: ["REFUND_REQUESTED", "REFUNDED"] } },
});

/** Administrators: how many commissions wait for a decision (shown on the ambassadors page). */
export async function countCommissionsToReview(user: AuthenticatedUser, now: Date): Promise<number> {
  assertAdmin(user);
  return prisma.ambassadorCommission.count({ where: { ...REVIEWABLE_WHERE(now), status: "PENDING" } });
}

/**
 * Administrators: approve or decline some of one ambassador's commissions after reviewing their
 * work. Approving makes them payable; declining (with an internal reason) means they are not paid
 * unless approved later. Only commissions whose refund window has closed can be decided.
 */
export async function reviewCommissions(user: AuthenticatedUser, raw: unknown, now: Date) {
  assertAdmin(user);
  const parsed = commissionReviewSchema.safeParse(raw);
  if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message ?? "Invalid decision.");
  const { ambassadorId, commissionIds, decision, note } = parsed.data;
  const ids = [...new Set(commissionIds)];
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "campus_ambassadors" WHERE "id" = ${ambassadorId} FOR UPDATE`;
    const rows = await tx.ambassadorCommission.findMany({
      where: { ...REVIEWABLE_WHERE(now), ambassadorId, id: { in: ids } },
      select: { id: true, amountPaise: true },
    });
    if (rows.length !== ids.length) {
      throw new ConflictError("Some of these enrollments can no longer be decided (refunded, already paid or not ready). Reload the page.");
    }
    const status = decision === "APPROVE" ? "APPROVED" : "DECLINED";
    await tx.ambassadorCommission.updateMany({
      where: { id: { in: ids } },
      data: { status, reviewedAt: now, reviewedById: user.id, reviewNote: note.length > 0 ? note : null },
    });
    const amountPaise = rows.reduce((sum, row) => sum + row.amountPaise, 0);
    await tx.auditLog.create({
      data: {
        actorId: user.id,
        actorRole: Role.ADMIN,
        action: decision === "APPROVE" ? "AMBASSADOR_COMMISSIONS_APPROVED" : "AMBASSADOR_COMMISSIONS_DECLINED",
        resourceType: "CampusAmbassador",
        resourceId: ambassadorId,
        diffPayload: { commissionIds: ids, amountPaise, ...(note ? { note } : {}) },
      },
    });
    return { count: ids.length, amountPaise, status };
  });
}

/** Upper bound for the open (unpaid) commissions loaded on the payouts page. */
export const OPEN_COMMISSIONS_LIMIT = 2000;

export type PayoutCommission = {
  id: string;
  amountPaise: number;
  createdAt: Date;
  payableAt: Date;
  reviewedAt: Date | null;
  reviewNote: string | null;
  student: string;
  programme: string;
  batch: string;
};

export type PayoutAmbassadorGroup = {
  ambassador: { id: string; name: string; email: string; college: string | null; upiIdMasked: string | null; status: string };
  commissions: PayoutCommission[];
  amountPaise: number;
};

/**
 * Administrators: the payouts workspace. Open commissions grouped per ambassador into
 * waiting (refund window open or a refund pending), review (to decide), approved (ready to pay)
 * and declined; plus payout history and totals. Nothing here pays anyone.
 */
export async function getPayoutsOverview(user: AuthenticatedUser, now: Date) {
  assertAdmin(user);
  const [open, payouts, paid] = await Promise.all([
    prisma.ambassadorCommission.findMany({
      where: { status: { in: ["PENDING", "APPROVED", "DECLINED"] }, payoutId: null },
      orderBy: { createdAt: "asc" },
      take: OPEN_COMMISSIONS_LIMIT,
      select: {
        id: true,
        amountPaise: true,
        status: true,
        payableAt: true,
        createdAt: true,
        reviewedAt: true,
        reviewNote: true,
        enrollment: { select: { status: true, user: { select: { name: true } }, batch: { select: { name: true, program: { select: { title: true } } } } } },
        ambassador: { select: { id: true, upiIdMasked: true, status: true, user: { select: { name: true, email: true } }, college: { select: { name: true } } } },
      },
    }),
    prisma.ambassadorPayout.findMany({
      orderBy: { createdAt: "desc" },
      take: 200,
      select: {
        id: true,
        grossPaise: true,
        tdsPaise: true,
        netPaise: true,
        method: true,
        status: true,
        utr: true,
        failureReason: true,
        createdAt: true,
        paidAt: true,
        ambassador: { select: { user: { select: { name: true } }, college: { select: { name: true } } } },
      },
    }),
    prisma.ambassadorPayout.aggregate({ where: { status: "PAID" }, _sum: { netPaise: true } }),
  ]);

  type Bucket = "waiting" | "review" | "approved" | "declined";
  const groups: Record<Bucket, Map<string, PayoutAmbassadorGroup>> = {
    waiting: new Map(),
    review: new Map(),
    approved: new Map(),
    declined: new Map(),
  };
  for (const row of open) {
    const notReady = row.payableAt.getTime() > now.getTime() || row.enrollment.status === "REFUND_REQUESTED" || row.enrollment.status === "REFUNDED";
    const bucket: Bucket = row.status === "DECLINED" ? "declined" : notReady ? "waiting" : row.status === "APPROVED" ? "approved" : "review";
    const map = groups[bucket];
    const group =
      map.get(row.ambassador.id) ??
      {
        ambassador: {
          id: row.ambassador.id,
          name: row.ambassador.user.name,
          email: row.ambassador.user.email,
          college: row.ambassador.college?.name ?? null,
          upiIdMasked: row.ambassador.upiIdMasked,
          status: row.ambassador.status,
        },
        commissions: [],
        amountPaise: 0,
      };
    group.commissions.push({
      id: row.id,
      amountPaise: row.amountPaise,
      createdAt: row.createdAt,
      payableAt: row.payableAt,
      reviewedAt: row.reviewedAt,
      reviewNote: row.reviewNote,
      student: row.enrollment.user.name,
      programme: row.enrollment.batch.program.title,
      batch: row.enrollment.batch.name,
    });
    group.amountPaise += row.amountPaise;
    map.set(row.ambassador.id, group);
  }
  const list = (bucket: Bucket) => [...groups[bucket].values()].sort((a, b) => b.amountPaise - a.amountPaise);
  const sum = (bucket: Bucket) => list(bucket).reduce((total, group) => total + group.amountPaise, 0);
  const count = (bucket: Bucket) => list(bucket).reduce((total, group) => total + group.commissions.length, 0);

  return {
    waiting: list("waiting"),
    review: list("review"),
    approved: list("approved"),
    declined: list("declined"),
    payouts,
    totals: {
      reviewCount: count("review"),
      reviewPaise: sum("review"),
      approvedPaise: sum("approved"),
      approvedCount: count("approved"),
      declinedCount: count("declined"),
      waitingCount: count("waiting"),
      paidPaise: paid._sum.netPaise ?? 0,
    },
    razorpayXReady: getRazorpayXAccountNumber() !== null,
    tdsPercent: CAMPUS_AMBASSADOR_POLICY.tdsPercent,
  };
}

export type PayoutsOverview = Awaited<ReturnType<typeof getPayoutsOverview>>;

async function claimPayable(tx: Prisma.TransactionClient, ambassadorId: string, now: Date) {
  await tx.$queryRaw`SELECT "id" FROM "campus_ambassadors" WHERE "id" = ${ambassadorId} FOR UPDATE`;
  const commissions = await tx.ambassadorCommission.findMany({ where: { ...PAYABLE_WHERE(now), ambassadorId }, select: { id: true, amountPaise: true } });
  if (commissions.length === 0) throw new ConflictError("Nothing is payable to this ambassador right now.");
  return { ids: commissions.map((commission) => commission.id), grossPaise: commissions.reduce((sum, commission) => sum + commission.amountPaise, 0) };
}

async function queuePayoutEmail(tx: Prisma.TransactionClient, payoutId: string, now: Date) {
  const payout = await tx.ambassadorPayout.findUnique({
    where: { id: payoutId },
    select: { grossPaise: true, tdsPaise: true, netPaise: true, utr: true, ambassador: { select: { user: { select: { name: true, email: true } } } } },
  });
  if (!payout) return;
  await queueAutomationEmailsOnce(
    [
      {
        recipientEmail: payout.ambassador.user.email,
        templateName: AMBASSADOR_PAYOUT_TEMPLATE,
        payload: {
          recipientName: payout.ambassador.user.name,
          gross: formatInr(payout.grossPaise),
          tds: formatInr(payout.tdsPaise),
          net: formatInr(payout.netPaise),
          utr: payout.utr,
        },
        dedupeKey: `${AMBASSADOR_PAYOUT_TEMPLATE}:${payoutId}`,
      },
    ],
    { prefix: AMBASSADOR_PAYOUT_TEMPLATE, now, db: tx }
  );
}

/** Administrators: record a payout made outside the portal (bank transfer) with its UTR. */
export async function recordManualPayout(user: AuthenticatedUser, raw: unknown, now: Date) {
  assertAdmin(user);
  const parsed = manualPayoutSchema.safeParse(raw);
  if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message ?? "Invalid payout.");
  const input = parsed.data;
  return prisma.$transaction(async (tx) => {
    const { ids, grossPaise } = await claimPayable(tx, input.ambassadorId, now);
    const tdsPaise = Math.round(input.tdsRupees * 100);
    if (tdsPaise >= grossPaise) throw new ValidationError("TDS must be less than the commission.");
    const payout = await tx.ambassadorPayout.create({
      data: {
        ambassadorId: input.ambassadorId,
        grossPaise,
        tdsPaise,
        netPaise: grossPaise - tdsPaise,
        method: "MANUAL",
        status: "PAID",
        utr: input.utr.toUpperCase(),
        createdById: user.id,
        paidAt: now,
      },
      select: { id: true },
    });
    await tx.ambassadorCommission.updateMany({ where: { id: { in: ids } }, data: { status: "PAID", payoutId: payout.id } });
    await tx.auditLog.create({
      data: {
        actorId: user.id,
        actorRole: Role.ADMIN,
        action: "AMBASSADOR_PAYOUT_RECORDED",
        resourceType: "AmbassadorPayout",
        resourceId: payout.id,
        diffPayload: { ambassadorId: input.ambassadorId, grossPaise, tdsPaise, commissions: ids.length, utr: input.utr.toUpperCase() },
      },
    });
    await queuePayoutEmail(tx, payout.id, now);
    return payout;
  });
}

/**
 * Administrators: pay the payable commissions through RazorpayX to the ambassador's UPI ID.
 * Needs RazorpayX configured and the TDS rule decided. The commissions are claimed for the
 * payout first; a refused API call releases them again.
 */
export async function payViaRazorpayX(user: AuthenticatedUser, ambassadorId: string, now: Date) {
  assertAdmin(user);
  if (!getRazorpayXAccountNumber()) throw new ConflictError("RazorpayX payouts are not configured yet.");
  const tdsPercent = CAMPUS_AMBASSADOR_POLICY.tdsPercent;
  if (tdsPercent === null) throw new ConflictError("The TDS rule for commissions is not decided yet; record a bank payout with its UTR instead.");

  const ambassador = await prisma.campusAmbassador.findUnique({
    where: { id: ambassadorId },
    select: { id: true, upiIdEncrypted: true, razorpayContactId: true, razorpayFundAccountId: true, user: { select: { name: true, email: true } } },
  });
  if (!ambassador) throw new NotFoundError("Ambassador not found");
  if (!ambassador.upiIdEncrypted) throw new ConflictError("This ambassador has not added a UPI ID.");

  const payout = await prisma.$transaction(async (tx) => {
    const { ids, grossPaise } = await claimPayable(tx, ambassadorId, now);
    const tdsPaise = payoutTdsPaise(grossPaise, tdsPercent) ?? 0;
    const created = await tx.ambassadorPayout.create({
      data: { ambassadorId, grossPaise, tdsPaise, netPaise: grossPaise - tdsPaise, method: "RAZORPAYX", status: "PROCESSING", createdById: user.id },
      select: { id: true, netPaise: true },
    });
    await tx.ambassadorCommission.updateMany({ where: { id: { in: ids } }, data: { payoutId: created.id } });
    await tx.auditLog.create({
      data: {
        actorId: user.id,
        actorRole: Role.ADMIN,
        action: "AMBASSADOR_PAYOUT_STARTED",
        resourceType: "AmbassadorPayout",
        resourceId: created.id,
        diffPayload: { ambassadorId, grossPaise, tdsPaise, commissions: ids.length },
      },
    });
    return created;
  });

  try {
    let contactId = ambassador.razorpayContactId;
    if (!contactId) {
      contactId = (await createContact({ name: ambassador.user.name, email: ambassador.user.email, referenceId: ambassador.id })).id;
      await prisma.campusAmbassador.update({ where: { id: ambassador.id }, data: { razorpayContactId: contactId } });
    }
    let fundAccountId = ambassador.razorpayFundAccountId;
    if (!fundAccountId) {
      const upiId = payoutFieldEncryptor.decrypt(ambassador.upiIdEncrypted, upiFieldContext(ambassador.id));
      fundAccountId = (await createUpiFundAccount({ contactId, upiId })).id;
      await prisma.campusAmbassador.update({ where: { id: ambassador.id }, data: { razorpayFundAccountId: fundAccountId } });
    }
    const remote = await createUpiPayout({ fundAccountId, amountPaise: payout.netPaise, referenceId: payout.id, idempotencyKey: payout.id });
    await prisma.ambassadorPayout.update({ where: { id: payout.id }, data: { razorpayPayoutId: remote.id } });
    if (remote.status === "processed") await recordPayoutUpdate(remote.id, "processed", remote.utr, null);
    return { payoutId: payout.id, status: remote.status };
  } catch (error) {
    await releasePayout(payout.id, error instanceof Error ? error.message.slice(0, 300) : "Payout refused");
    throw error;
  }
}

async function releasePayout(payoutId: string, reason: string) {
  await prisma.$transaction(async (tx) => {
    await tx.ambassadorPayout.update({ where: { id: payoutId }, data: { status: "FAILED", failureReason: reason } });
    // The approved commissions return to the "ready to pay" list.
    await tx.ambassadorCommission.updateMany({ where: { payoutId, status: "APPROVED" }, data: { payoutId: null } });
  });
}

/** Webhook (payout.processed / failed / reversed / rejected): idempotent. */
export async function recordPayoutUpdate(
  razorpayPayoutId: string,
  outcome: "processed" | "failed",
  utr: string | null,
  failureReason: string | null
): Promise<void> {
  const payout = await prisma.ambassadorPayout.findUnique({ where: { razorpayPayoutId }, select: { id: true, status: true } });
  if (!payout) throw new NotFoundError("Unknown payout");
  if (outcome === "processed") {
    if (payout.status === "PAID") return;
    if (payout.status === "FAILED") {
      // Its commissions were released already; staff must reconcile instead of paying twice.
      logger.error("RazorpayX reported a payout processed after it had failed", undefined, { payoutId: payout.id });
      await prisma.auditLog.create({
        data: { actorId: null, actorRole: "SYSTEM", action: "AMBASSADOR_PAYOUT_NEEDS_RECONCILIATION", resourceType: "AmbassadorPayout", resourceId: payout.id, diffPayload: { razorpayPayoutId, utr } },
      });
      return;
    }
    const now = new Date();
    await prisma.$transaction(async (tx) => {
      await tx.ambassadorPayout.update({ where: { id: payout.id }, data: { status: "PAID", utr: utr?.slice(0, 40) ?? null, paidAt: now } });
      await tx.ambassadorCommission.updateMany({ where: { payoutId: payout.id }, data: { status: "PAID" } });
      await tx.auditLog.create({
        data: { actorId: null, actorRole: "SYSTEM", action: "AMBASSADOR_PAYOUT_PAID", resourceType: "AmbassadorPayout", resourceId: payout.id, diffPayload: { razorpayPayoutId, utr } },
      });
      await queuePayoutEmail(tx, payout.id, now);
    });
    return;
  }
  if (payout.status === "FAILED") return;
  // A reversal after a "processed" report returns the commissions to the approved (payable) list.
  await prisma.$transaction(async (tx) => {
    await tx.ambassadorPayout.update({ where: { id: payout.id }, data: { status: "FAILED", failureReason: failureReason?.slice(0, 300) ?? "Payout failed" } });
    await tx.ambassadorCommission.updateMany({ where: { payoutId: payout.id }, data: { payoutId: null, status: "APPROVED" } });
    await tx.auditLog.create({
      data: { actorId: null, actorRole: "SYSTEM", action: "AMBASSADOR_PAYOUT_FAILED", resourceType: "AmbassadorPayout", resourceId: payout.id, diffPayload: { razorpayPayoutId, failureReason } },
    });
  });
  logger.warn("Ambassador payout failed", { payoutId: payout.id });
}

/** The ambassador's own commissions with their state (for the dashboard). */
export async function listMyCommissions(ambassadorId: string, now: Date) {
  const rows = await prisma.ambassadorCommission.findMany({
    where: { ambassadorId },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: {
      id: true,
      amountPaise: true,
      status: true,
      payableAt: true,
      payoutId: true,
      createdAt: true,
      enrollment: { select: { status: true, batch: { select: { name: true, program: { select: { title: true } } } } } },
    },
  });
  return rows.map((row) => ({
    ...row,
    bucket: commissionBucket({ status: row.status, payableAt: row.payableAt, payoutId: row.payoutId, enrollmentStatus: row.enrollment.status }, now),
  }));
}
