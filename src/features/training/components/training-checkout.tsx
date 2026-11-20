"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CAMPUS_AMBASSADOR_POLICY, COMPANY } from "@/config/site";
import { normalizeReferralCode, referralDiscountPaise } from "@/features/ambassadors/policy";
import { formatInr } from "../money";
import { confirmCheckoutAction, startCheckoutAction } from "../checkout-actions";

interface RazorpaySuccess {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

interface RazorpayInstance {
  open: () => void;
  on: (event: "payment.failed", handler: (response: { error?: { description?: string } }) => void) => void;
}

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => RazorpayInstance;
  }
}

const CHECKOUT_SCRIPT = "https://checkout.razorpay.com/v1/checkout.js";

/** Loads Razorpay Checkout once, only when the student starts paying. */
export function loadCheckoutScript(): Promise<void> {
  if (window.Razorpay) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${CHECKOUT_SCRIPT}"]`);
    const script = existing ?? document.createElement("script");
    script.addEventListener("load", () => resolve(), { once: true });
    script.addEventListener("error", () => reject(new Error("checkout script")), { once: true });
    if (!existing) {
      script.src = CHECKOUT_SCRIPT;
      script.async = true;
      document.body.appendChild(script);
    }
  });
}

/**
 * Pay for a training batch. The server holds the seat and creates the order for the stored fee;
 * Razorpay collects the payment; the server verifies it before the enrollment becomes active.
 */
export function TrainingCheckout({
  batchId,
  feePaise,
  defaultReferralCode,
}: {
  batchId: string;
  feePaise: number;
  defaultReferralCode: string | null;
}) {
  const router = useRouter();
  const [consent, setConsent] = React.useState(false);
  const [referralCode, setReferralCode] = React.useState(defaultReferralCode ?? "");
  const code = normalizeReferralCode(referralCode);
  // Preview only: the server checks the code and computes the amount Razorpay charges.
  const discount = code ? referralDiscountPaise(feePaise) : 0;
  const amountLabel = formatInr(feePaise - discount);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const pay = async () => {
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      const started = await startCheckoutAction({ batchId, consent, referralCode: referralCode.trim() || null });
      if (!started.success) {
        setError(started.error);
        setBusy(false);
        return;
      }
      await loadCheckoutScript();
      if (!window.Razorpay) throw new Error("checkout unavailable");
      const session = started.data;
      const checkout = new window.Razorpay({
        key: session.keyId,
        order_id: session.orderId,
        amount: session.amountPaise,
        currency: "INR",
        name: COMPANY.brandName,
        description: `${session.programTitle} · ${session.batchName}`,
        prefill: { name: session.prefill.name, email: session.prefill.email },
        theme: { color: "#1d4ed8" },
        handler: async (response: RazorpaySuccess) => {
          setNotice("Payment received. Confirming…");
          const confirmed = await confirmCheckoutAction({
            orderId: response.razorpay_order_id,
            paymentId: response.razorpay_payment_id,
            signature: response.razorpay_signature,
          });
          if (confirmed.success) {
            router.push("/candidate/training?paid=1");
          } else {
            setNotice(null);
            setError(`${confirmed.error} Your payment is safe; if it does not show up within a few minutes, contact ${COMPANY.contactEmail}.`);
            setBusy(false);
          }
        },
        modal: {
          ondismiss: () => {
            setBusy(false);
            setNotice("Payment window closed. Your seat stays reserved for 15 minutes.");
          },
        },
      });
      checkout.on("payment.failed", (response) => {
        setError(response.error?.description ?? "The payment failed. You can try again.");
      });
      checkout.open();
    } catch {
      setError("The payment window could not be opened. Please check your connection and try again.");
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Input
          label="Referral code (optional)"
          value={referralCode}
          maxLength={20}
          placeholder="GARA-XXXXXXX"
          autoComplete="off"
          onChange={(event) => setReferralCode(event.target.value.toUpperCase())}
          error={referralCode.trim() && !code ? "A referral code looks like GARA-ABCD123" : undefined}
        />
        <dl className="space-y-1 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Programme fee</dt>
            <dd>{formatInr(feePaise)}</dd>
          </div>
          {discount > 0 && (
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Referral discount ({CAMPUS_AMBASSADOR_POLICY.studentDiscountPercent}%)</dt>
              <dd>− {formatInr(discount)}</dd>
            </div>
          )}
          <div className="flex justify-between border-t border-border/60 pt-1 font-semibold">
            <dt>You pay</dt>
            <dd>{amountLabel}</dd>
          </div>
        </dl>
      </div>
      <label className="flex items-start gap-3 text-sm text-foreground">
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 rounded border-input"
        />
        <span>
          I have read and agree to the{" "}
          <Link href="/refund-policy" target="_blank" className="font-medium text-primary underline underline-offset-4">
            Refund Policy
          </Link>{" "}
          and the{" "}
          <Link href="/terms" target="_blank" className="font-medium text-primary underline underline-offset-4">
            Terms of Service
          </Link>
          .
        </span>
      </label>
      {error && (
        <p role="alert" className="rounded-md border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="rounded-md border border-border bg-muted/40 p-3 text-sm text-foreground">
          {notice}
        </p>
      )}
      <Button className="w-full gap-2" size="lg" disabled={!consent || busy} onClick={pay}>
        <Lock className="h-4 w-4" aria-hidden="true" />
        {busy ? "Opening secure payment…" : `Pay ${amountLabel}`}
      </Button>
      <p className="text-xs text-muted-foreground">Payments are processed securely by Razorpay. We never see or store card details.</p>
    </div>
  );
}
