import { TRAINING_POLICY } from "@/config/site";

/*
 * Industrial Training rules from the product owner, shared by pages and server: a refund before
 * the batch starts or within 24 hours after the first live class (2026-11-19), of the amount
 * paid minus the payment gateway charges, Razorpay's fee and the GST on it (2026-11-20); after
 * the window no refund but one free transfer to a later batch.
 */

const HOUR_MS = 60 * 60 * 1000;

export interface RefundWindowBatch {
  startDate: Date;
  firstClassAt: Date | null;
}

/** The instant the refund window closes for a batch. */
export function refundWindowClosesAt(batch: RefundWindowBatch): Date {
  const afterFirstClass = batch.firstClassAt
    ? new Date(batch.firstClassAt.getTime() + TRAINING_POLICY.refundHoursAfterFirstClass * HOUR_MS)
    : null;
  // Before the start date the window is always open; the first class can only extend it.
  return afterFirstClass && afterFirstClass > batch.startDate ? afterFirstClass : batch.startDate;
}

/** Whether a refund request is in time (the time of the request decides). */
export function isRefundWindowOpen(batch: RefundWindowBatch, now: Date): boolean {
  return now.getTime() < refundWindowClosesAt(batch).getTime();
}

/** Whether an active enrollment may still move to a later batch free of charge. */
export function canTransfer(enrollment: { transferCount: number }, batch: RefundWindowBatch, now: Date): boolean {
  return !isRefundWindowOpen(batch, now) && enrollment.transferCount < TRAINING_POLICY.freeTransfers;
}

/**
 * Refund amount for a payment: the amount paid minus the gateway charges (the fee Razorpay
 * reports for the payment, which includes GST) while the policy setting is on.
 */
export function refundAmountPaise(amountPaidPaise: number, gatewayFeePaise = 0): number {
  if (!TRAINING_POLICY.deductGatewayChargesFromRefunds) return amountPaidPaise;
  return Math.max(0, amountPaidPaise - Math.max(0, gatewayFeePaise));
}

/** Statuses whose enrollment occupies a seat (pending ones only while their hold lasts). */
export const SEAT_TAKING_STATUSES = ["ACTIVE", "REFUND_REQUESTED", "COMPLETED", "FAILED"] as const;

/** How long a pending checkout keeps its seat. */
export const SEAT_HOLD_MINUTES = 15;
