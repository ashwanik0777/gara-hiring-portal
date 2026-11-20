import { Role, TrainingEnrollmentStatus, TrainingPaymentStatus, TrainingRefundStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { AuthenticatedUser } from "@/lib/auth/guards";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import { createRefund, fetchPayment, PaymentsUnavailableError } from "@/infrastructure/payments/razorpay";
import { logger } from "@/lib/logging/logger";
import { TRAINING_POLICY } from "@/config/site";
import { formatInr } from "../money";
import { canTransfer, isRefundWindowOpen, refundAmountPaise, SEAT_TAKING_STATUSES } from "../policy";
import { isBatchOpenForEnrollment } from "./program-service";
import { queueRefundUpdateEmail } from "../emails";
import { reverseCommission } from "@/features/ambassadors/services/commission-service";

function assertTrainingAdmin(user: AuthenticatedUser): void {
  if (!user.roles.includes(Role.ADMIN)) throw new ForbiddenError("Only administrators can decide refunds.");
}

/**
 * Student: ask for a refund. Allowed while the refund window is open (before the batch starts or
 * within 24 hours after the first live class); the time of the request decides.
 */
export async function requestRefund(user: AuthenticatedUser, input: { enrollmentId: string; reason: string }) {
  const reason = input.reason.trim();
  if (reason.length < 5 || reason.length > 1000) {
    throw new ValidationError("Please tell us briefly why you want a refund (5 to 1,000 characters).");
  }
  const now = new Date();
  // Razorpay's charges for the payment (fee incl. GST) are deducted from the refund. The fee is
  // read before the transaction; if Razorpay cannot be reached the request is still recorded
  // (the time of the request decides) and the amount is settled when an administrator approves.
  const paid = await prisma.trainingEnrollment.findUnique({
    where: { id: input.enrollmentId },
    select: { userId: true, payments: { where: { status: TrainingPaymentStatus.CAPTURED }, orderBy: { capturedAt: "asc" }, take: 1, select: { razorpayPaymentId: true } } },
  });
  const paymentId = paid?.userId === user.id ? paid.payments[0]?.razorpayPaymentId : null;
  const gatewayFeePaise = paymentId ? await gatewayFee(paymentId) : null;

  return prisma.$transaction(async (tx) => {
    const enrollment = await tx.trainingEnrollment.findUnique({
      where: { id: input.enrollmentId },
      include: {
        batch: { select: { startDate: true, firstClassAt: true } },
        payments: { where: { status: TrainingPaymentStatus.CAPTURED }, orderBy: { capturedAt: "asc" }, take: 1 },
      },
    });
    if (!enrollment || enrollment.userId !== user.id) throw new NotFoundError("Enrollment not found");
    if (enrollment.status !== TrainingEnrollmentStatus.ACTIVE) {
      throw new ConflictError("A refund can be requested only for an active enrollment.");
    }
    if (enrollment.reattemptOfId) {
      throw new ConflictError("A free re-attempt has nothing to refund.");
    }
    if (!isRefundWindowOpen(enrollment.batch, now)) {
      throw new ConflictError("The refund window for this batch has closed. You can move to a later batch once instead.");
    }
    const payment = enrollment.payments[0];
    if (!payment) throw new ConflictError("No payment was found for this enrollment.");

    const refund = await tx.trainingRefund.create({
      data: {
        enrollmentId: enrollment.id,
        paymentId: payment.id,
        reason,
        amountPaise: refundAmountPaise(enrollment.amountPaidPaise, gatewayFeePaise ?? 0),
        status: TrainingRefundStatus.REQUESTED,
        requestedAt: now,
      },
      select: { id: true, amountPaise: true },
    });
    await tx.trainingEnrollment.update({ where: { id: enrollment.id }, data: { status: TrainingEnrollmentStatus.REFUND_REQUESTED } });
    await tx.auditLog.create({
      data: {
        actorId: user.id,
        actorRole: "CANDIDATE",
        action: "TRAINING_REFUND_REQUESTED",
        resourceType: "TrainingRefund",
        resourceId: refund.id,
        diffPayload: { enrollmentId: enrollment.id, amountPaise: refund.amountPaise, reason },
      },
    });
    return refund;
  });
}

/** Razorpay's fee for a payment including GST (paise), or null when it cannot be read. */
async function gatewayFee(razorpayPaymentId: string): Promise<number | null> {
  try {
    const payment = await fetchPayment(razorpayPaymentId);
    return typeof payment.fee === "number" && payment.fee >= 0 ? payment.fee : null;
  } catch (error) {
    logger.warn("Razorpay fee could not be read for a refund", { reason: error instanceof Error ? error.name : "unknown" });
    return null;
  }
}

/**
 * Admin: approve (the refund is sent through Razorpay) or reject (with a note; the enrollment
 * becomes active again). An approval whose Razorpay call fails stays requested.
 */
export async function decideRefund(user: AuthenticatedUser, input: { refundId: string; approve: boolean; note?: string }) {
  assertTrainingAdmin(user);
  const note = input.note?.trim() || null;
  if (!input.approve && (!note || note.length < 5)) {
    throw new ValidationError("Please give the student a reason for rejecting the refund.");
  }

  const refund = await prisma.trainingRefund.findUnique({
    where: { id: input.refundId },
    include: { payment: { select: { razorpayPaymentId: true } }, enrollment: { select: { amountPaidPaise: true } } },
  });
  if (!refund) throw new NotFoundError("Refund request not found");
  if (refund.status !== TrainingRefundStatus.REQUESTED) {
    throw new ConflictError(`This refund request was already decided (${refund.status}).`);
  }

  if (!input.approve) {
    return prisma.$transaction(async (tx) => {
      const updated = await tx.trainingRefund.updateMany({
        where: { id: refund.id, status: TrainingRefundStatus.REQUESTED },
        data: { status: TrainingRefundStatus.REJECTED, decidedById: user.id, decidedAt: new Date(), decisionNote: note },
      });
      if (updated.count !== 1) throw new ConflictError("This refund request changed. Please reload.");
      await tx.trainingEnrollment.update({ where: { id: refund.enrollmentId }, data: { status: TrainingEnrollmentStatus.ACTIVE } });
      await queueRefundUpdateEmail(tx, refund.id, "REJECTED", new Date());
      await tx.auditLog.create({
        data: {
          actorId: user.id,
          actorRole: Role.ADMIN,
          action: "TRAINING_REFUND_REJECTED",
          resourceType: "TrainingRefund",
          resourceId: refund.id,
          diffPayload: { note },
        },
      });
      return { status: TrainingRefundStatus.REJECTED };
    });
  }

  if (!refund.payment.razorpayPaymentId) throw new ConflictError("The payment reference is missing; this refund cannot be sent.");
  // The amount is settled now from Razorpay's own record of its charges (fee incl. GST).
  let amountPaise = refund.amountPaise;
  if (TRAINING_POLICY.deductGatewayChargesFromRefunds) {
    const fee = await gatewayFee(refund.payment.razorpayPaymentId);
    if (fee === null) throw new PaymentsUnavailableError("Razorpay's charges for this payment could not be read. Please try again in a moment.");
    amountPaise = refundAmountPaise(refund.enrollment.amountPaidPaise, fee);
    if (amountPaise <= 0) throw new ConflictError("After Razorpay's charges there is nothing to refund.");
    if (amountPaise !== refund.amountPaise) {
      await prisma.trainingRefund.update({ where: { id: refund.id }, data: { amountPaise } });
    }
  }
  // Claim the request first so a double click cannot send two refunds.
  const claimed = await prisma.trainingRefund.updateMany({
    where: { id: refund.id, status: TrainingRefundStatus.REQUESTED },
    data: { status: TrainingRefundStatus.APPROVED, decidedById: user.id, decidedAt: new Date(), decisionNote: note },
  });
  if (claimed.count !== 1) throw new ConflictError("This refund request changed. Please reload.");

  let razorpayRefund: Awaited<ReturnType<typeof createRefund>>;
  try {
    razorpayRefund = await createRefund(refund.payment.razorpayPaymentId, amountPaise, { refundId: refund.id });
  } catch (error) {
    await prisma.trainingRefund.update({
      where: { id: refund.id },
      data: { status: TrainingRefundStatus.REQUESTED, decidedById: null, decidedAt: null },
    });
    if (error instanceof PaymentsUnavailableError && error.providerDescription) {
      // Razorpay pays refunds from the account balance; its message for a balance lower than the
      // refund is a generic "invalid request sent".
      throw new ConflictError(
        `Razorpay did not accept the refund ("${error.providerDescription}"). Refunds are paid from your Razorpay balance: if it is lower than ${formatInr(amountPaise)}, add funds or wait for more payments, then approve again. The request is still waiting.`
      );
    }
    throw error;
  }

  const processed = razorpayRefund.status === "processed";
  await prisma.$transaction(async (tx) => {
    await tx.trainingRefund.update({
      where: { id: refund.id },
      data: {
        razorpayRefundId: razorpayRefund.id,
        ...(processed ? { status: TrainingRefundStatus.PROCESSED, processedAt: new Date() } : {}),
      },
    });
    if (processed) {
      await tx.trainingEnrollment.update({ where: { id: refund.enrollmentId }, data: { status: TrainingEnrollmentStatus.REFUNDED } });
      await reverseCommission(tx, refund.enrollmentId, new Date());
      await queueRefundUpdateEmail(tx, refund.id, "PROCESSED", new Date());
    }
    await tx.auditLog.create({
      data: {
        actorId: user.id,
        actorRole: Role.ADMIN,
        action: "TRAINING_REFUND_APPROVED",
        resourceType: "TrainingRefund",
        resourceId: refund.id,
        diffPayload: { razorpayRefundId: razorpayRefund.id, amountPaise, amountPaidPaise: refund.enrollment.amountPaidPaise, razorpayStatus: razorpayRefund.status },
      },
    });
  });
  return { status: processed ? TrainingRefundStatus.PROCESSED : TrainingRefundStatus.APPROVED };
}

/** Webhook: Razorpay reports the outcome of a refund. Idempotent. */
export async function recordRefundUpdate(razorpayRefundId: string, outcome: "processed" | "failed"): Promise<void> {
  const refund = await prisma.trainingRefund.findUnique({ where: { razorpayRefundId }, select: { id: true, status: true, enrollmentId: true } });
  if (!refund) throw new NotFoundError("Unknown refund");
  if (refund.status === TrainingRefundStatus.PROCESSED || refund.status === TrainingRefundStatus.FAILED) return;

  await prisma.$transaction(async (tx) => {
    if (outcome === "processed") {
      await tx.trainingRefund.update({ where: { id: refund.id }, data: { status: TrainingRefundStatus.PROCESSED, processedAt: new Date() } });
      await tx.trainingEnrollment.update({ where: { id: refund.enrollmentId }, data: { status: TrainingEnrollmentStatus.REFUNDED } });
      await reverseCommission(tx, refund.enrollmentId, new Date());
      await queueRefundUpdateEmail(tx, refund.id, "PROCESSED", new Date());
    } else {
      // Staff see the failure and can contact the student; the enrollment stays "refund requested".
      await tx.trainingRefund.update({ where: { id: refund.id }, data: { status: TrainingRefundStatus.FAILED } });
      await queueRefundUpdateEmail(tx, refund.id, "FAILED", new Date());
    }
    await tx.auditLog.create({
      data: {
        actorId: null,
        actorRole: "SYSTEM",
        action: outcome === "processed" ? "TRAINING_REFUND_PROCESSED" : "TRAINING_REFUND_FAILED",
        resourceType: "TrainingRefund",
        resourceId: refund.id,
        diffPayload: { razorpayRefundId },
      },
    });
  });
}

/**
 * Student: move an active enrollment to a later batch of the same programme, free of charge,
 * once, after the refund window has closed. The target batch must be open and have a seat.
 */
export async function transferEnrollment(user: AuthenticatedUser, input: { enrollmentId: string; targetBatchId: string }) {
  const now = new Date();
  return prisma.$transaction(async (tx) => {
    const enrollment = await tx.trainingEnrollment.findUnique({
      where: { id: input.enrollmentId },
      include: { batch: { select: { id: true, programId: true, startDate: true, firstClassAt: true } } },
    });
    if (!enrollment || enrollment.userId !== user.id) throw new NotFoundError("Enrollment not found");
    if (enrollment.status !== TrainingEnrollmentStatus.ACTIVE) throw new ConflictError("Only an active enrollment can be transferred.");
    if (enrollment.reattemptOfId) throw new ConflictError("A free re-attempt cannot be transferred.");
    if (!canTransfer(enrollment, enrollment.batch, now)) {
      throw new ConflictError(
        isRefundWindowOpen(enrollment.batch, now)
          ? "Your refund window is still open; a transfer is available after it closes."
          : "You have already used your free transfer."
      );
    }

    await tx.$queryRaw`SELECT "id" FROM "training_batches" WHERE "id" = ${input.targetBatchId} FOR UPDATE`;
    const target = await tx.trainingBatch.findUnique({ where: { id: input.targetBatchId } });
    if (!target || target.programId !== enrollment.batch.programId || target.id === enrollment.batch.id) {
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
    const clash = await tx.trainingEnrollment.findUnique({ where: { userId_batchId: { userId: user.id, batchId: target.id } }, select: { id: true } });
    if (clash) throw new ConflictError("You already have an enrollment in that batch.");

    await tx.trainingEnrollment.update({
      where: { id: enrollment.id },
      data: { batchId: target.id, transferCount: { increment: 1 } },
    });
    await tx.auditLog.create({
      data: {
        actorId: user.id,
        actorRole: "CANDIDATE",
        action: "TRAINING_ENROLLMENT_TRANSFERRED",
        resourceType: "TrainingEnrollment",
        resourceId: enrollment.id,
        diffPayload: { fromBatchId: enrollment.batch.id, toBatchId: target.id },
      },
    });
    return { batchId: target.id };
  });
}

/** Admin: refund requests, open ones first. */
export async function listRefundsForStaff(user: AuthenticatedUser) {
  assertTrainingAdmin(user);
  return prisma.trainingRefund.findMany({
    orderBy: [{ status: "asc" }, { requestedAt: "desc" }],
    take: 300,
    select: {
      id: true,
      status: true,
      reason: true,
      amountPaise: true,
      requestedAt: true,
      decidedAt: true,
      decisionNote: true,
      razorpayRefundId: true,
      enrollment: {
        select: {
          receiptNo: true,
          user: { select: { name: true, email: true } },
          batch: { select: { name: true, program: { select: { title: true } } } },
        },
      },
    },
  });
}

export type StaffRefundRow = Awaited<ReturnType<typeof listRefundsForStaff>>[number];
