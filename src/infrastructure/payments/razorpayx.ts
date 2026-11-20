import { env } from "@/lib/env";
import { getRazorpayConfig, PaymentsUnavailableError, razorpayRequest } from "./razorpay";

/*
 * RazorpayX payouts for Campus Ambassador commissions (Phase 4): a contact per ambassador, a
 * UPI fund account, then a payout from the company's RazorpayX account. Uses the same API keys
 * as Razorpay; switched off until RAZORPAYX_ACCOUNT_NUMBER is set.
 */

export function getRazorpayXAccountNumber(): string | null {
  return getRazorpayConfig() && env.RAZORPAYX_ACCOUNT_NUMBER ? env.RAZORPAYX_ACCOUNT_NUMBER : null;
}

export interface RazorpayXPayout {
  id: string;
  status: "queued" | "pending" | "processing" | "processed" | "reversed" | "cancelled" | "rejected" | "failed";
  utr: string | null;
  amount: number;
}

export async function createContact(input: { name: string; email: string; referenceId: string }): Promise<{ id: string }> {
  return razorpayRequest<{ id: string }>("POST", "/contacts", {
    name: input.name.slice(0, 50),
    email: input.email,
    type: "vendor",
    reference_id: input.referenceId.slice(0, 40),
  });
}

export async function createUpiFundAccount(input: { contactId: string; upiId: string }): Promise<{ id: string }> {
  return razorpayRequest<{ id: string }>("POST", "/fund_accounts", {
    contact_id: input.contactId,
    account_type: "vpa",
    vpa: { address: input.upiId },
  });
}

/** Creates a UPI payout; the idempotency key makes a retried request create it once. */
export async function createUpiPayout(input: {
  fundAccountId: string;
  amountPaise: number;
  referenceId: string;
  idempotencyKey: string;
}): Promise<RazorpayXPayout> {
  const accountNumber = getRazorpayXAccountNumber();
  if (!accountNumber) throw new PaymentsUnavailableError("RazorpayX payouts are not configured.");
  return razorpayRequest<RazorpayXPayout>(
    "POST",
    "/payouts",
    {
      account_number: accountNumber,
      fund_account_id: input.fundAccountId,
      amount: input.amountPaise,
      currency: "INR",
      mode: "UPI",
      purpose: "payout",
      queue_if_low_balance: true,
      reference_id: input.referenceId.slice(0, 40),
      narration: "GARA Ambassador",
    },
    { "X-Payout-Idempotency": input.idempotencyKey }
  );
}
