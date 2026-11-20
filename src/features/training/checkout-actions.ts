"use server";

import { z } from "zod";
import { revalidatePath, updateTag } from "next/cache";
import { requireAuth } from "@/lib/auth/guards";
import { toActionError } from "@/lib/errors";
import { defaultRateLimiter, type RateLimitPolicy } from "@/lib/security/rate-limit";
import { confirmCheckout, startCheckout, type CheckoutSession } from "./services/checkout-service";
import { decideRefund, requestRefund, transferEnrollment } from "./services/refund-service";
import { PUBLIC_TRAINING_TAG } from "./services/program-service";
import { scheduleOutboxFlush } from "@/infrastructure/email/outbox-dispatch";

type Result<T> = { success: true; data: T } | { success: false; error: string };

/** Checkout attempts per user: generous for retries, tight enough to stop order flooding. */
const CHECKOUT_RATE_LIMIT: RateLimitPolicy = { scope: "training:checkout", maxRequests: 10, windowSeconds: 10 * 60 };

const startSchema = z.object({
  batchId: z.uuid(),
  consent: z.literal(true, "Please accept the Refund Policy and the Terms of Service to continue."),
  referralCode: z.preprocess((value) => (typeof value === "string" && value.trim() === "" ? null : value), z.string().trim().max(20).nullable().optional()),
});
const confirmSchema = z.object({
  orderId: z.string().regex(/^order_[A-Za-z0-9]+$/),
  paymentId: z.string().regex(/^pay_[A-Za-z0-9]+$/),
  signature: z.string().regex(/^[a-f0-9]{64}$/),
});

function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Invalid request.";
}

export async function startCheckoutAction(input: { batchId: string; consent: boolean; referralCode?: string | null }): Promise<Result<CheckoutSession>> {
  try {
    const user = await requireAuth();
    await defaultRateLimiter.enforce(user.id, CHECKOUT_RATE_LIMIT);
    const parsed = startSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: firstIssue(parsed.error) };
    const session = await startCheckout(user, parsed.data);
    updateTag(PUBLIC_TRAINING_TAG);
    return { success: true, data: session };
  } catch (error) {
    return { success: false, error: toActionError(error, "Checkout could not be started.") };
  }
}

export async function confirmCheckoutAction(input: { orderId: string; paymentId: string; signature: string }): Promise<Result<{ enrollmentId: string }>> {
  try {
    const user = await requireAuth();
    const parsed = confirmSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: "The payment response could not be read." };
    const result = await confirmCheckout(user, parsed.data);
    scheduleOutboxFlush();
    revalidatePath("/candidate/training");
    return { success: true, data: { enrollmentId: result.enrollmentId } };
  } catch (error) {
    return { success: false, error: toActionError(error, "The payment could not be confirmed.") };
  }
}

export async function requestRefundAction(input: { enrollmentId: string; reason: string }): Promise<Result<null>> {
  try {
    const user = await requireAuth();
    const enrollmentId = z.uuid().parse(input.enrollmentId);
    await requestRefund(user, { enrollmentId, reason: String(input.reason ?? "") });
    revalidatePath("/candidate/training");
    revalidatePath("/admin/training/refunds");
    return { success: true, data: null };
  } catch (error) {
    return { success: false, error: toActionError(error, "The refund request could not be sent.") };
  }
}

export async function transferEnrollmentAction(input: { enrollmentId: string; targetBatchId: string }): Promise<Result<null>> {
  try {
    const user = await requireAuth();
    await transferEnrollment(user, { enrollmentId: z.uuid().parse(input.enrollmentId), targetBatchId: z.uuid().parse(input.targetBatchId) });
    updateTag(PUBLIC_TRAINING_TAG);
    revalidatePath("/candidate/training");
    return { success: true, data: null };
  } catch (error) {
    return { success: false, error: toActionError(error, "The transfer could not be made.") };
  }
}

export async function decideRefundAction(input: { refundId: string; approve: boolean; note?: string }): Promise<Result<{ status: string }>> {
  try {
    const user = await requireAuth();
    const result = await decideRefund(user, { refundId: z.uuid().parse(input.refundId), approve: input.approve === true, note: input.note });
    scheduleOutboxFlush();
    updateTag(PUBLIC_TRAINING_TAG);
    revalidatePath("/admin/training/refunds");
    return { success: true, data: { status: result.status } };
  } catch (error) {
    return { success: false, error: toActionError(error, "The refund decision could not be saved.") };
  }
}
