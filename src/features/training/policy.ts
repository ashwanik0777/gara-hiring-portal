import { TRAINING_POLICY } from "@/config/site";

/*
 * Industrial Training rules from the product owner (2026-11-19), shared by pages and server:
 * full refund before the batch starts or within 24 hours after the first live class; after
 * that no refund but one free transfer to a later batch.
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
 * Refund amount for a payment. Gateway charges (the fee Razorpay reports for the payment) are
 * deducted only when the policy setting is on; the product owner's default is off.
 */
export function refundAmountPaise(amountPaidPaise: number, gatewayFeePaise = 0): number {
  if (!TRAINING_POLICY.deductGatewayChargesFromRefunds) return amountPaidPaise;
  return Math.max(0, amountPaidPaise - Math.max(0, gatewayFeePaise));
}

/** Statuses whose enrollment occupies a seat (pending ones only while their hold lasts). */
export const SEAT_TAKING_STATUSES = ["ACTIVE", "REFUND_REQUESTED", "COMPLETED", "FAILED"] as const;

/** How long a pending checkout keeps its seat. */
export const SEAT_HOLD_MINUTES = 15;
