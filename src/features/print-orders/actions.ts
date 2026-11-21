"use server";

import { z } from "zod";
import { revalidatePath, updateTag } from "next/cache";
import { requireAuth } from "@/lib/auth/guards";
import { toActionError } from "@/lib/errors";
import { defaultRateLimiter, type RateLimitPolicy } from "@/lib/security/rate-limit";
import { scheduleOutboxFlush } from "@/infrastructure/email/outbox-dispatch";
import { advancePrintOrder, confirmPrintCheckout, startPrintCheckout, type PrintCheckoutSession } from "./services/print-order-service";
import { PRINT_SETTINGS_TAG, updatePrintSettings } from "./services/print-settings-service";

type Result<T> = { success: true; data: T } | { success: false; error: string };

const PRINT_CHECKOUT_RATE_LIMIT: RateLimitPolicy = { scope: "print:checkout", maxRequests: 10, windowSeconds: 10 * 60 };

const confirmSchema = z.object({
  orderId: z.string().regex(/^order_[A-Za-z0-9]+$/),
  paymentId: z.string().regex(/^pay_[A-Za-z0-9]+$/),
  signature: z.string().regex(/^[a-f0-9]{64}$/),
});

export async function startPrintCheckoutAction(input: unknown): Promise<Result<PrintCheckoutSession>> {
  try {
    const user = await requireAuth();
    await defaultRateLimiter.enforce(user.id, PRINT_CHECKOUT_RATE_LIMIT);
    return { success: true, data: await startPrintCheckout(user, input) };
  } catch (error) {
    return { success: false, error: toActionError(error, "The order could not be started.") };
  }
}

export async function confirmPrintCheckoutAction(input: unknown): Promise<Result<null>> {
  try {
    const user = await requireAuth();
    const parsed = confirmSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: "The payment response could not be read." };
    await confirmPrintCheckout(user, parsed.data);
    scheduleOutboxFlush();
    revalidatePath("/candidate/training", "layout");
    return { success: true, data: null };
  } catch (error) {
    return { success: false, error: toActionError(error, "The payment could not be confirmed.") };
  }
}

export async function advancePrintOrderAction(input: unknown): Promise<Result<null>> {
  try {
    const user = await requireAuth();
    await advancePrintOrder(user, input, new Date());
    scheduleOutboxFlush();
    revalidatePath("/admin/print-orders");
    return { success: true, data: null };
  } catch (error) {
    return { success: false, error: toActionError(error, "The order could not be updated.") };
  }
}

export async function updatePrintSettingsAction(input: unknown): Promise<Result<null>> {
  try {
    const user = await requireAuth();
    await updatePrintSettings(user, input);
    // The Shipping & Delivery Policy reads the cached settings.
    updateTag(PRINT_SETTINGS_TAG);
    revalidatePath("/admin/print-orders", "layout");
    return { success: true, data: null };
  } catch (error) {
    return { success: false, error: toActionError(error, "The print settings could not be saved.") };
  }
}
