import { Prisma, TrainingEnrollmentStatus, TrainingPaymentStatus, TrainingProgramStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { AuthenticatedUser } from "@/lib/auth/guards";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import { logger } from "@/lib/logging/logger";
import { LEGAL } from "@/config/site";
import {
  capturePayment,
  createOrder,
  fetchPayment,
  getRazorpayConfig,
  isValidPaymentSignature,
  PaymentsUnavailableError,
} from "@/infrastructure/payments/razorpay";
import { isBatchOpenForEnrollment } from "./program-service";
import { SEAT_HOLD_MINUTES, SEAT_TAKING_STATUSES } from "../policy";
import { queuePaymentReceivedEmail } from "../emails";
import { attachReferralSignup, resolveReferralForStudent } from "@/features/ambassadors/services/ambassador-service";
import { createCommissionForEnrollment } from "@/features/ambassadors/services/commission-service";
import { referralDiscountPaise } from "@/features/ambassadors/policy";

/** Enrollments that already hold a paid seat in a batch (a second checkout is refused). */
const ALREADY_ENROLLED: TrainingEnrollmentStatus[] = ["ACTIVE", "REFUND_REQUESTED", "COMPLETED", "FAILED"];

export interface CheckoutSession {
  keyId: string;
  orderId: string;
  amountPaise: number;
  listPricePaise: number;
  discountPaise: number;
  enrollmentId: string;
  programTitle: string;
  batchName: string;
  prefill: { name: string; email: string };
}

/** "GARA-RCPT-2026-000042" from the receipt sequence (sequential; gaps possible, reuse never). */
export async function nextReceiptNumber(tx: Prisma.TransactionClient, now: Date): Promise<string> {
  const [row] = await tx.$queryRaw<Array<{ value: bigint }>>`SELECT nextval('training_receipt_seq') AS value`;
  return `GARA-RCPT-${now.getFullYear()}-${String(row.value).padStart(6, "0")}`;
}

/**
 * Step 1 of checkout: reserve a seat for 15 minutes and create a Razorpay order for the fee
 * stored on the server. Requires a signed-in account with a verified email and the consent to
 * the Refund Policy and Terms.
 */
export async function startCheckout(
  user: AuthenticatedUser,
  input: { batchId: string; consent: boolean; referralCode?: string | null }
): Promise<CheckoutSession> {
  const config = getRazorpayConfig();
  if (!config) throw new PaymentsUnavailableError();
  if (input.consent !== true) {
    throw new ValidationError("Please accept the Refund Policy and the Terms of Service to continue.");
  }

  const account = await prisma.user.findUnique({ where: { id: user.id }, select: { name: true, email: true, emailVerified: true } });
  if (!account) throw new NotFoundError("Account not found");
  if (!account.emailVerified) {
    throw new ForbiddenError("Verify your email address before paying.");
  }

  const now = new Date();
  const reserved = await prisma.$transaction(async (tx) => {
    // Serialize checkouts of one batch so two students cannot take the last seat.
    await tx.$queryRaw`SELECT "id" FROM "training_batches" WHERE "id" = ${input.batchId} FOR UPDATE`;
    const batch = await tx.trainingBatch.findUnique({
      where: { id: input.batchId },
      include: { program: { select: { title: true, feePaise: true, status: true } } },
    });
    if (!batch || batch.program.status !== TrainingProgramStatus.PUBLISHED) {
      throw new NotFoundError("This batch is not available.");
    }
    if (!isBatchOpenForEnrollment(batch, now)) {
      throw new ConflictError("Enrollment for this batch has closed.");
    }

    const existing = await tx.trainingEnrollment.findUnique({
      where: { userId_batchId: { userId: user.id, batchId: batch.id } },
      select: { id: true, status: true },
    });
    if (existing && ALREADY_ENROLLED.includes(existing.status)) {
      throw new ConflictError("You are already enrolled in this batch.");
    }
    if (existing?.status === TrainingEnrollmentStatus.REFUNDED) {
      throw new ConflictError("You were refunded for this batch. Please choose another batch or contact us.");
    }

    const taken = await tx.trainingEnrollment.count({
      where: {
        batchId: batch.id,
        ...(existing ? { id: { not: existing.id } } : {}),
        OR: [
          { status: { in: [...SEAT_TAKING_STATUSES] } },
          { status: TrainingEnrollmentStatus.PENDING_PAYMENT, seatHoldExpiresAt: { gt: now } },
        ],
      },
    });
    if (taken >= batch.seats) {
      throw new ConflictError("This batch is full.");
    }

    // Campus Ambassador code (Phase 4): validated here, never trusted from the browser.
    const referral = input.referralCode ? await resolveReferralForStudent(tx, input.referralCode, user.id) : null;
    const discountPaise = referral ? referralDiscountPaise(batch.program.feePaise) : 0;
    const data = {
      status: TrainingEnrollmentStatus.PENDING_PAYMENT,
      listPricePaise: batch.program.feePaise,
      discountPaise,
      referralCode: referral?.code ?? null,
      amountPaidPaise: 0,
      seatHoldExpiresAt: new Date(now.getTime() + SEAT_HOLD_MINUTES * 60_000),
      consentAt: now,
      consentVersion: LEGAL.version,
    };
    const enrollment = existing
      ? await tx.trainingEnrollment.update({ where: { id: existing.id }, data, select: { id: true } })
      : await tx.trainingEnrollment.create({ data: { ...data, userId: user.id, batchId: batch.id }, select: { id: true } });

    return {
      enrollmentId: enrollment.id,
      listPricePaise: batch.program.feePaise,
      discountPaise: data.discountPaise,
      referralCode: data.referralCode,
      amountPaise: batch.program.feePaise - data.discountPaise,
      programTitle: batch.program.title,
      batchName: batch.name,
    };
  });

  // The order is created after the seat is held; a failure leaves the hold to expire.
  const order = await createOrder({
    amountPaise: reserved.amountPaise,
    receipt: reserved.enrollmentId,
    notes: { enrollmentId: reserved.enrollmentId, purpose: "TRAINING_ENROLLMENT" },
  });
  if (order.amount !== reserved.amountPaise || order.currency !== "INR") {
    throw new PaymentsUnavailableError("The payment order did not match the fee. Please try again.");
  }
  await prisma.trainingPayment.create({
    data: { enrollmentId: reserved.enrollmentId, razorpayOrderId: order.id, amountPaise: reserved.amountPaise },
  });

  // A referred student is also counted as the ambassador's sign-up (if not attributed yet).
  if (reserved.referralCode) await attachReferralSignup(user.id, reserved.referralCode, now).catch(() => undefined);

  return {
    keyId: config.keyId,
    orderId: order.id,
    amountPaise: reserved.amountPaise,
    listPricePaise: reserved.listPricePaise,
    discountPaise: reserved.discountPaise,
    enrollmentId: reserved.enrollmentId,
    programTitle: reserved.programTitle,
    batchName: reserved.batchName,
    prefill: { name: account.name, email: account.email },
  };
}

export interface CapturedPaymentResult {
  enrollmentId: string;
  /** False when this payment had already been recorded (browser and webhook both report it). */
  newlyRecorded: boolean;
  /** True when the enrollment was already paid by another payment (needs a refund by staff). */
  duplicate: boolean;
}

/**
 * Records a captured payment: idempotent, called from the browser confirmation and from the
 * webhook. Activates the enrollment and assigns its receipt number. The amount must match the
 * order created on the server.
 */
export async function recordCapturedPayment(input: { orderId: string; paymentId: string; amountPaise: number; source: "checkout" | "webhook" }): Promise<CapturedPaymentResult> {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "training_payments" WHERE "razorpayOrderId" = ${input.orderId} FOR UPDATE`;
    const payment = await tx.trainingPayment.findUnique({
      where: { razorpayOrderId: input.orderId },
      include: { enrollment: { select: { id: true, status: true, receiptNo: true, userId: true } } },
    });
    if (!payment) throw new NotFoundError("Unknown payment order");
    if (payment.status === TrainingPaymentStatus.CAPTURED) {
      return { enrollmentId: payment.enrollmentId, newlyRecorded: false, duplicate: false };
    }
    if (input.amountPaise !== payment.amountPaise) {
      logger.error("Captured amount differs from the order", undefined, { orderId: input.orderId });
      throw new ConflictError("The paid amount does not match the order.");
    }

    const now = new Date();
    await tx.trainingPayment.update({
      where: { id: payment.id },
      data: { status: TrainingPaymentStatus.CAPTURED, razorpayPaymentId: input.paymentId, capturedAt: now },
    });

    const enrollment = payment.enrollment;
    const duplicate = ALREADY_ENROLLED.includes(enrollment.status) || enrollment.status === TrainingEnrollmentStatus.REFUNDED;
    if (!duplicate) {
      await tx.trainingEnrollment.update({
        where: { id: enrollment.id },
        data: {
          status: TrainingEnrollmentStatus.ACTIVE,
          amountPaidPaise: payment.amountPaise,
          paidAt: now,
          seatHoldExpiresAt: null,
          receiptNo: enrollment.receiptNo ?? (await nextReceiptNumber(tx, now)),
        },
      });
      await queuePaymentReceivedEmail(tx, enrollment.id, now);
      await createCommissionForEnrollment(tx, enrollment.id);
    }

    await tx.auditLog.create({
      data: {
        actorId: enrollment.userId,
        actorRole: "CANDIDATE",
        action: duplicate ? "TRAINING_DUPLICATE_PAYMENT" : "TRAINING_PAYMENT_CAPTURED",
        resourceType: "TrainingEnrollment",
        resourceId: enrollment.id,
        diffPayload: { orderId: input.orderId, paymentId: input.paymentId, amountPaise: input.amountPaise, source: input.source },
      },
    });
    return { enrollmentId: enrollment.id, newlyRecorded: true, duplicate };
  });
}

/** Marks a still-open order as failed (webhook payment.failed); the seat hold simply expires. */
export async function recordFailedPayment(orderId: string): Promise<void> {
  await prisma.trainingPayment.updateMany({
    where: { razorpayOrderId: orderId, status: TrainingPaymentStatus.CREATED },
    data: { status: TrainingPaymentStatus.FAILED },
  });
}

/**
 * Step 2 of checkout: the browser reports success. The signature proves the response came from
 * Razorpay for this order; the payment is then fetched to confirm the amount before recording.
 */
export async function confirmCheckout(
  user: AuthenticatedUser,
  input: { orderId: string; paymentId: string; signature: string }
): Promise<CapturedPaymentResult> {
  const config = getRazorpayConfig();
  if (!config) throw new PaymentsUnavailableError();
  if (!isValidPaymentSignature(input.orderId, input.paymentId, input.signature, config.keySecret)) {
    throw new ValidationError("The payment could not be verified.");
  }

  const payment = await prisma.trainingPayment.findUnique({
    where: { razorpayOrderId: input.orderId },
    select: { amountPaise: true, enrollment: { select: { userId: true } } },
  });
  if (!payment || payment.enrollment.userId !== user.id) {
    throw new NotFoundError("Unknown payment order");
  }

  const remote = await fetchPayment(input.paymentId);
  if (remote.order_id !== input.orderId || remote.amount !== payment.amountPaise || remote.currency !== "INR") {
    throw new ValidationError("The payment does not match this order.");
  }
  if (remote.status !== "captured" && remote.status !== "authorized") {
    throw new ConflictError("The payment has not gone through yet. If money was deducted, it will be confirmed shortly.");
  }
  if (remote.status === "authorized") {
    await ensureCaptured(input.paymentId, remote.amount);
  }

  return recordCapturedPayment({ orderId: input.orderId, paymentId: input.paymentId, amountPaise: remote.amount, source: "checkout" });
}

/**
 * Captures an authorized payment (otherwise Razorpay returns it to the payer after a few
 * days). The browser and the webhook can race to capture; a refused capture of a payment that
 * is captured by then is not an error.
 */
async function ensureCaptured(paymentId: string, amountPaise: number): Promise<void> {
  try {
    await capturePayment(paymentId, amountPaise);
  } catch (error) {
    const latest = await fetchPayment(paymentId).catch(() => null);
    if (latest?.status !== "captured") throw error;
  }
}

/**
 * Webhook payment.authorized: captures a payment for an order this portal created, after
 * checking the amount, and records it. Covers a student who closes the browser before the
 * checkout confirms (when the Razorpay account does not capture automatically).
 */
export async function captureAuthorizedPayment(input: { orderId: string; paymentId: string; amountPaise: number }): Promise<CapturedPaymentResult> {
  const payment = await prisma.trainingPayment.findUnique({
    where: { razorpayOrderId: input.orderId },
    select: { amountPaise: true, status: true, enrollmentId: true },
  });
  if (!payment) throw new NotFoundError("Unknown payment order");
  if (payment.status === TrainingPaymentStatus.CAPTURED) {
    return { enrollmentId: payment.enrollmentId, newlyRecorded: false, duplicate: false };
  }
  if (input.amountPaise !== payment.amountPaise) {
    logger.error("Authorized amount differs from the order", undefined, { orderId: input.orderId });
    throw new ConflictError("The paid amount does not match the order.");
  }
  await ensureCaptured(input.paymentId, input.amountPaise);
  return recordCapturedPayment({ ...input, source: "webhook" });
}
