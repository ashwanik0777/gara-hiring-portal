import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logging/logger";
import { NotFoundError } from "@/lib/errors";
import { getRazorpayConfig, isValidWebhookSignature } from "@/infrastructure/payments/razorpay";
import { captureAuthorizedPayment, recordCapturedPayment, recordFailedPayment } from "@/features/training/services/checkout-service";
import { scheduleOutboxFlush } from "@/infrastructure/email/outbox-dispatch";
import { recordRefundUpdate } from "@/features/training/services/refund-service";
import { recordPayoutUpdate } from "@/features/ambassadors/services/commission-service";
import { capturePrintPayment, isPrintOrder, recordPrintPaymentCaptured } from "@/features/print-orders/services/print-order-service";

export const instant = false;

const MAX_BODY_BYTES = 512 * 1024;

interface WebhookPayload {
  event?: string;
  payload?: {
    payment?: { entity?: { id?: string; order_id?: string; amount?: number; status?: string } };
    refund?: { entity?: { id?: string; payment_id?: string; amount?: number; status?: string } };
    payout?: { entity?: { id?: string; status?: string; utr?: string | null; failure_reason?: string | null } };
  };
}

function ok(body: Record<string, unknown> = { received: true }) {
  return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
}

/**
 * POST /api/webhooks/razorpay — payment and refund events from Razorpay.
 * The signature over the raw body proves the sender; each event id is applied once. Handlers
 * are idempotent too, so a retry after a partial failure is safe.
 */
export async function POST(request: NextRequest) {
  const config = getRazorpayConfig();
  if (!config) return NextResponse.json({ error: "Payments are not configured." }, { status: 503 });

  const signature = request.headers.get("x-razorpay-signature") ?? "";
  const eventId = (request.headers.get("x-razorpay-event-id") ?? "").slice(0, 100);
  const rawBody = await request.text();
  if (rawBody.length > MAX_BODY_BYTES || !signature || !isValidWebhookSignature(rawBody, signature, config.webhookSecret)) {
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
  }

  let payload: WebhookPayload;
  try {
    payload = JSON.parse(rawBody) as WebhookPayload;
  } catch {
    return NextResponse.json({ error: "Invalid body." }, { status: 400 });
  }
  const event = payload.event ?? "";

  if (eventId && (await prisma.paymentWebhookEvent.findUnique({ where: { id: eventId }, select: { id: true } }))) {
    return ok({ received: true, duplicate: true });
  }

  try {
    const payment = payload.payload?.payment?.entity;
    const refund = payload.payload?.refund?.entity;
    const printOrder = payment?.order_id && event.startsWith("payment.") ? await isPrintOrder(payment.order_id) : false;
    if (printOrder && payment?.id && payment.order_id && typeof payment.amount === "number") {
      // Printed certificate orders (Phase 3C); a failed attempt simply leaves the order unpaid.
      if (event === "payment.captured") {
        await recordPrintPaymentCaptured({ orderId: payment.order_id, paymentId: payment.id, amountPaise: payment.amount });
      } else if (event === "payment.authorized") {
        await capturePrintPayment({ orderId: payment.order_id, paymentId: payment.id, amountPaise: payment.amount });
      }
    } else if (event === "payment.captured" && payment?.id && payment.order_id && typeof payment.amount === "number") {
      await recordCapturedPayment({ orderId: payment.order_id, paymentId: payment.id, amountPaise: payment.amount, source: "webhook" });
    } else if (event === "payment.authorized" && payment?.id && payment.order_id && typeof payment.amount === "number") {
      await captureAuthorizedPayment({ orderId: payment.order_id, paymentId: payment.id, amountPaise: payment.amount });
    } else if (event === "payment.failed" && payment?.order_id) {
      await recordFailedPayment(payment.order_id);
    } else if ((event === "refund.processed" || event === "refund.failed") && refund?.id) {
      await recordRefundUpdate(refund.id, event === "refund.processed" ? "processed" : "failed");
    } else if (event.startsWith("payout.") && payload.payload?.payout?.entity?.id) {
      // RazorpayX ambassador payouts (Phase 4).
      const payout = payload.payload.payout.entity;
      const payoutId = payout.id as string;
      if (event === "payout.processed") {
        await recordPayoutUpdate(payoutId, "processed", payout.utr ?? null, null);
      } else if (["payout.failed", "payout.reversed", "payout.rejected", "payout.cancelled"].includes(event)) {
        await recordPayoutUpdate(payoutId, "failed", null, payout.failure_reason ?? event);
      }
    }
  } catch (error) {
    if (error instanceof NotFoundError) {
      // Orders this portal did not create (other products on the same account): acknowledged.
      logger.warn("Razorpay webhook for an unknown order or refund", { event });
    } else {
      // Anything else is answered with an error so Razorpay retries the delivery.
      logger.error("Razorpay webhook handling failed", error, { event });
      return NextResponse.json({ error: "Could not process the event." }, { status: 500 });
    }
  }

  if (eventId) {
    await prisma.paymentWebhookEvent.create({ data: { id: eventId, event: event.slice(0, 60) } }).catch(() => {
      // A concurrent delivery recorded it first.
    });
  }
  // Payment and refund emails queued by the handlers go out after the response.
  scheduleOutboxFlush();
  return ok();
}
