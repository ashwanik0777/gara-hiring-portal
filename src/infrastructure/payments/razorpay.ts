import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";

/*
 * Razorpay REST adapter (orders, payments, refunds) and signature checks. Amounts are paise.
 * Secrets come from validated server env vars and never reach the browser; only the key id does.
 */

const API_BASE = "https://api.razorpay.com/v1";
const TIMEOUT_MS = 10_000;

export interface RazorpayConfig {
  keyId: string;
  keySecret: string;
  webhookSecret: string;
}

/** The configured keys, or null while payments are not set up (checkout is then switched off). */
export function getRazorpayConfig(): RazorpayConfig | null {
  const keyId = env.RAZORPAY_KEY_ID?.trim();
  const keySecret = env.RAZORPAY_KEY_SECRET?.trim();
  const webhookSecret = env.RAZORPAY_WEBHOOK_SECRET?.trim();
  if (!keyId || !keySecret || !webhookSecret) return null;
  return { keyId, keySecret, webhookSecret };
}

export class PaymentsUnavailableError extends AppError {
  /** Razorpay's own short error description (printable text only), for staff-facing messages. */
  public readonly providerDescription: string | null;

  constructor(message = "Online payments are not available right now. Please try again later.", providerDescription: string | null = null) {
    super(message, "PAYMENTS_UNAVAILABLE", 503);
    this.providerDescription = providerDescription;
  }
}

/** Razorpay's error description, reduced to short printable text (never request data). */
function providerDescription(body: unknown): string | null {
  const description = (body as { error?: { description?: unknown } } | null)?.error?.description;
  if (typeof description !== "string") return null;
  const clean = description.replace(/[^\x20-\x7E]/g, "").trim().slice(0, 160);
  return clean || null;
}

function requireConfig(): RazorpayConfig {
  const config = getRazorpayConfig();
  if (!config) throw new PaymentsUnavailableError();
  return config;
}

/** Authenticated Razorpay API call (also used by the RazorpayX payout adapter). */
export async function razorpayRequest<T>(
  method: "GET" | "POST",
  path: string,
  body?: Record<string, unknown>,
  extraHeaders: Record<string, string> = {}
): Promise<T> {
  const { keyId, keySecret } = requireConfig();
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method,
      headers: {
        Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...extraHeaders,
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
  } catch {
    throw new PaymentsUnavailableError("The payment service could not be reached. Please try again.");
  }
  if (!response.ok) {
    // Razorpay error bodies can echo request data: only its short description is kept, for
    // staff messages; nothing from the body is logged.
    const description = providerDescription(await response.json().catch(() => null));
    throw new PaymentsUnavailableError(`The payment service refused the request (HTTP ${response.status}).`, description);
  }
  return (await response.json()) as T;
}

export interface RazorpayOrder {
  id: string;
  amount: number;
  currency: string;
  status: string;
}

/** Creates an order for the exact amount computed on the server. */
export function createOrder(input: { amountPaise: number; receipt: string; notes: Record<string, string> }): Promise<RazorpayOrder> {
  return razorpayRequest<RazorpayOrder>("POST", "/orders", {
    amount: input.amountPaise,
    currency: "INR",
    receipt: input.receipt.slice(0, 40),
    notes: input.notes,
  });
}

export interface RazorpayPayment {
  id: string;
  order_id: string;
  amount: number;
  currency: string;
  status: "created" | "authorized" | "captured" | "refunded" | "failed";
  fee?: number | null;
}

export function fetchPayment(paymentId: string): Promise<RazorpayPayment> {
  return razorpayRequest<RazorpayPayment>("GET", `/payments/${encodeURIComponent(paymentId)}`);
}

/** Captures an authorized payment (needed only when the account captures manually). */
export function capturePayment(paymentId: string, amountPaise: number): Promise<RazorpayPayment> {
  return razorpayRequest<RazorpayPayment>("POST", `/payments/${encodeURIComponent(paymentId)}/capture`, {
    amount: amountPaise,
    currency: "INR",
  });
}

export interface RazorpayRefund {
  id: string;
  payment_id: string;
  amount: number;
  status: "pending" | "processed" | "failed";
}

/** Refunds part or all of a captured payment (normal speed). */
export function createRefund(paymentId: string, amountPaise: number, notes: Record<string, string>): Promise<RazorpayRefund> {
  return razorpayRequest<RazorpayRefund>("POST", `/payments/${encodeURIComponent(paymentId)}/refund`, { amount: amountPaise, notes });
}

function safeEqualHex(expected: string, received: string): boolean {
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(received, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Checkout success signature: HMAC-SHA256(order_id + "|" + payment_id, key secret). */
export function isValidPaymentSignature(orderId: string, paymentId: string, signature: string, keySecret: string): boolean {
  const expected = createHmac("sha256", keySecret).update(`${orderId}|${paymentId}`).digest("hex");
  return safeEqualHex(expected, signature);
}

/** Webhook signature: HMAC-SHA256(raw request body, webhook secret). */
export function isValidWebhookSignature(rawBody: string, signature: string, webhookSecret: string): boolean {
  const expected = createHmac("sha256", webhookSecret).update(rawBody).digest("hex");
  return safeEqualHex(expected, signature);
}
