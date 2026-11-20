import type { Prisma } from "@prisma/client";
import { COMPANY, TRAINING_POLICY } from "@/config/site";
import { queueAutomationEmailsOnce } from "@/features/automation/outbox-once";
import {
  TRAINING_PAYMENT_RECEIVED_TEMPLATE,
  TRAINING_REFUND_UPDATE_TEMPLATE,
  TRAINING_RESULT_TEMPLATE,
  type TrainingPaymentReceivedPayload,
  type TrainingResultPayload,
  type TrainingRefundOutcome,
  type TrainingRefundUpdatePayload,
} from "@/infrastructure/email/templates/training-emails";
import { formatInr } from "./money";
import { refundWindowClosesAt } from "./policy";

/*
 * Training emails are queued inside the transaction that changes the state, once per
 * occurrence (the browser confirmation and the webhook can both report one payment).
 */

/** Queues "payment received" for an enrollment that has just become active. */
export async function queuePaymentReceivedEmail(tx: Prisma.TransactionClient, enrollmentId: string, now: Date): Promise<void> {
  const enrollment = await tx.trainingEnrollment.findUnique({
    where: { id: enrollmentId },
    select: {
      receiptNo: true,
      amountPaidPaise: true,
      paidAt: true,
      user: { select: { name: true, email: true } },
      batch: { select: { name: true, startDate: true, firstClassAt: true, program: { select: { title: true } } } },
    },
  });
  if (!enrollment?.receiptNo) return;
  const payload: TrainingPaymentReceivedPayload = {
    recipientName: enrollment.user.name,
    programTitle: enrollment.batch.program.title,
    batchName: enrollment.batch.name,
    amount: formatInr(enrollment.amountPaidPaise),
    receiptNo: enrollment.receiptNo,
    paidAt: (enrollment.paidAt ?? now).toISOString(),
    refundWindowClosesAt: refundWindowClosesAt(enrollment.batch).toISOString(),
  };
  await queueAutomationEmailsOnce(
    [
      {
        recipientEmail: enrollment.user.email,
        templateName: TRAINING_PAYMENT_RECEIVED_TEMPLATE,
        payload: { ...payload },
        dedupeKey: `${TRAINING_PAYMENT_RECEIVED_TEMPLATE}:${enrollmentId}:${enrollment.receiptNo}`,
      },
    ],
    { prefix: TRAINING_PAYMENT_RECEIVED_TEMPLATE, now, db: tx }
  );
}

/** Queues the refund outcome email (processed, rejected or failed) once per refund and outcome. */
export async function queueRefundUpdateEmail(
  tx: Prisma.TransactionClient,
  refundId: string,
  outcome: TrainingRefundOutcome,
  now: Date
): Promise<void> {
  const refund = await tx.trainingRefund.findUnique({
    where: { id: refundId },
    select: {
      amountPaise: true,
      decisionNote: true,
      enrollment: {
        select: {
          user: { select: { name: true, email: true } },
          batch: { select: { name: true, program: { select: { title: true } } } },
        },
      },
    },
  });
  if (!refund) return;
  const payload: TrainingRefundUpdatePayload = {
    recipientName: refund.enrollment.user.name,
    programTitle: refund.enrollment.batch.program.title,
    batchName: refund.enrollment.batch.name,
    amount: formatInr(refund.amountPaise),
    outcome,
    note: outcome === "REJECTED" ? refund.decisionNote : null,
    contactEmail: COMPANY.contactEmail,
  };
  await queueAutomationEmailsOnce(
    [
      {
        recipientEmail: refund.enrollment.user.email,
        templateName: TRAINING_REFUND_UPDATE_TEMPLATE,
        payload: { ...payload },
        dedupeKey: `${TRAINING_REFUND_UPDATE_TEMPLATE}:${refundId}:${outcome}`,
      },
    ],
    { prefix: TRAINING_REFUND_UPDATE_TEMPLATE, now, db: tx }
  );
}

/** Queues the pass (certificate) or fail (re-attempt) email for a decided enrollment. */
export async function queueTrainingResultEmail(tx: Prisma.TransactionClient, enrollmentId: string, now: Date): Promise<void> {
  const enrollment = await tx.trainingEnrollment.findUnique({
    where: { id: enrollmentId },
    select: {
      status: true,
      resultNote: true,
      reattemptOfId: true,
      user: { select: { name: true, email: true } },
      batch: { select: { name: true, program: { select: { title: true } } } },
      certificate: { select: { verificationCode: true } },
    },
  });
  if (!enrollment || (enrollment.status !== "COMPLETED" && enrollment.status !== "FAILED")) return;
  const outcome = enrollment.status === "COMPLETED" ? "PASSED" : "FAILED";
  const payload: TrainingResultPayload = {
    recipientName: enrollment.user.name,
    programTitle: enrollment.batch.program.title,
    batchName: enrollment.batch.name,
    outcome,
    verificationCode: enrollment.certificate?.verificationCode ?? null,
    note: outcome === "FAILED" ? enrollment.resultNote : null,
    // One free re-attempt per purchase: a failed re-attempt has none left.
    canReattempt: outcome === "FAILED" && !enrollment.reattemptOfId && TRAINING_POLICY.freeReattempts > 0,
  };
  await queueAutomationEmailsOnce(
    [
      {
        recipientEmail: enrollment.user.email,
        templateName: TRAINING_RESULT_TEMPLATE,
        payload: { ...payload },
        dedupeKey: `${TRAINING_RESULT_TEMPLATE}:${enrollmentId}:${outcome}`,
      },
    ],
    { prefix: TRAINING_RESULT_TEMPLATE, now, db: tx }
  );
}
