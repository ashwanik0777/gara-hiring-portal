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
import { manualPayoutSchema } from "../schemas";
import { commissionBucket, payoutTdsPaise } from "../policy";
import { upiFieldContext } from "./ambassador-service";

/*
 * Commission ledger and payouts (Phase 4). Rules from the product owner's plan: an entry when a
 * referred enrollment becomes active; payable only after that batch's refund window closes;
 * reversed automatically when the enrollment is refunded.
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
    where: { enrollmentId, status: "PENDING", payoutId: null },
    data: { status: "REVERSED", reversedAt: now },
  });
}

const PAYABLE_WHERE = (now: Date): Prisma.AmbassadorCommissionWhereInput => ({
  status: "PENDING",
  payoutId: null,
  payableAt: { lte: now },
  enrollment: { status: { notIn: ["REFUND_REQUESTED", "REFUNDED"] } },
});

/** Administrators: payable totals per ambassador, and payout history. */
export async function listPayouts(user: AuthenticatedUser, now: Date) {
  assertAdmin(user);
  const [payable, payouts] = await Promise.all([
    prisma.ambassadorCommission.groupBy({ by: ["ambassadorId"], where: PAYABLE_WHERE(now), _sum: { amountPaise: true }, _count: { _all: true } }),
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
        ambassador: { select: { user: { select: { name: true } } } },
      },
    }),
  ]);
  const ambassadors = await prisma.campusAmbassador.findMany({
    where: { id: { in: payable.map((row) => row.ambassadorId) } },
    select: { id: true, upiIdMasked: true, status: true, user: { select: { name: true, email: true } }, college: { select: { name: true } } },
  });
  const byId = new Map(ambassadors.map((ambassador) => [ambassador.id, ambassador]));
  return {
    payable: payable.map((row) => ({
      ambassadorId: row.ambassadorId,
      amountPaise: row._sum.amountPaise ?? 0,
      commissions: row._count._all,
      ambassador: byId.get(row.ambassadorId) ?? null,
    })),
    payouts,
    razorpayXReady: getRazorpayXAccountNumber() !== null,
    tdsPercent: CAMPUS_AMBASSADOR_POLICY.tdsPercent,
  };
}

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
    await tx.ambassadorCommission.updateMany({ where: { payoutId, status: "PENDING" }, data: { payoutId: null } });
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
  // A reversal after a "processed" report returns the commissions to the payable list.
  await prisma.$transaction(async (tx) => {
    await tx.ambassadorPayout.update({ where: { id: payout.id }, data: { status: "FAILED", failureReason: failureReason?.slice(0, 300) ?? "Payout failed" } });
    await tx.ambassadorCommission.updateMany({ where: { payoutId: payout.id }, data: { payoutId: null, status: "PENDING" } });
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
