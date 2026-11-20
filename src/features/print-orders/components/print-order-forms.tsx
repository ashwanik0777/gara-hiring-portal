"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { COMPANY } from "@/config/site";
import { FormMessages } from "@/features/training/components/staff/staff-forms";
import { loadCheckoutScript } from "@/features/training/components/training-checkout";
import { formatInr } from "@/features/training/money";
import { advancePrintOrderAction, confirmPrintCheckoutAction, startPrintCheckoutAction } from "../actions";

interface PrintOption {
  type: "COLLEGE_BULK" | "COURIER";
  label: string;
  pricePaise: number;
  expectedDelivery: string | null;
}

/** Order a printed copy: delivery choice, destination, then Razorpay Checkout. */
export function PrintOrderForm({ certificateId, options, defaultName, collegeName }: { certificateId: string; options: PrintOption[]; defaultName: string; collegeName: string | null }) {
  const router = useRouter();
  const [deliveryType, setDeliveryType] = React.useState<PrintOption["type"]>(options[0].type);
  const [values, setValues] = React.useState({ recipientName: defaultName, phone: "", addressLine1: "", addressLine2: "", city: "", state: "", pincode: "" });
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const option = options.find((item) => item.type === deliveryType) ?? options[0];
  const set = (key: keyof typeof values) => (event: React.ChangeEvent<HTMLInputElement>) => setValues({ ...values, [key]: event.target.value });

  const pay = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const started = await startPrintCheckoutAction({ certificateId, deliveryType, ...values });
      if (!started.success) {
        setError(started.error);
        setBusy(false);
        return;
      }
      await loadCheckoutScript();
      if (!window.Razorpay) throw new Error("checkout unavailable");
      const checkout = new window.Razorpay({
        key: started.data.keyId,
        order_id: started.data.orderId,
        amount: started.data.amountPaise,
        currency: "INR",
        name: COMPANY.brandName,
        description: "Printed certificate",
        prefill: started.data.prefill,
        theme: { color: "#1d4ed8" },
        handler: async (response: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
          const confirmed = await confirmPrintCheckoutAction({
            orderId: response.razorpay_order_id,
            paymentId: response.razorpay_payment_id,
            signature: response.razorpay_signature,
          });
          if (!confirmed.success) setError(`${confirmed.error} Your payment is safe; if the order does not show up within a few minutes, contact ${COMPANY.contactEmail}.`);
          setBusy(false);
          router.refresh();
        },
        modal: { ondismiss: () => setBusy(false) },
      });
      checkout.on("payment.failed", (response) => setError(response.error?.description ?? "The payment failed. You can try again."));
      checkout.open();
    } catch {
      setError("The payment window could not be opened. Please try again.");
      setBusy(false);
    }
  };

  return (
    <form onSubmit={pay} className="space-y-4">
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Delivery</legend>
        {options.map((item) => (
          <label key={item.type} className="flex items-start gap-3 rounded-md border border-border/70 p-3 text-sm">
            <input type="radio" name="deliveryType" className="mt-0.5" checked={deliveryType === item.type} onChange={() => setDeliveryType(item.type)} />
            <span>
              <span className="font-medium">{item.label}</span> · {formatInr(item.pricePaise)}
              {item.expectedDelivery ? <span className="block text-xs text-muted-foreground">Expected: {item.expectedDelivery}</span> : null}
              {item.type === "COLLEGE_BULK" && (
                <span className="block text-xs text-muted-foreground">{collegeName ? `To ${collegeName}` : "Add your college in My Profile first."}</span>
              )}
            </span>
          </label>
        ))}
      </fieldset>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Input label="Name on the parcel *" value={values.recipientName} onChange={set("recipientName")} required maxLength={120} />
        <Input label="Mobile number *" type="tel" value={values.phone} onChange={set("phone")} required maxLength={16} />
        {deliveryType === "COURIER" && (
          <>
            <Input label="Address line 1 *" value={values.addressLine1} onChange={set("addressLine1")} required maxLength={200} />
            <Input label="Address line 2" value={values.addressLine2} onChange={set("addressLine2")} maxLength={200} />
            <Input label="City *" value={values.city} onChange={set("city")} required maxLength={80} />
            <Input label="State *" value={values.state} onChange={set("state")} required maxLength={80} />
            <Input label="PIN code *" inputMode="numeric" value={values.pincode} onChange={set("pincode")} required maxLength={6} />
          </>
        )}
      </div>
      <FormMessages error={error} />
      <Button type="submit" disabled={busy}>
        {busy ? "Opening secure payment…" : `Pay ${formatInr(option.pricePaise)}`}
      </Button>
      <p className="text-xs text-muted-foreground">Payments are processed by Razorpay. The digital certificate stays free and valid.</p>
    </form>
  );
}

/** Administrators: the next step of a paid order. */
export function AdvancePrintOrder({ orderId, status, deliveryType }: { orderId: string; status: string; deliveryType: string }) {
  const router = useRouter();
  const [trackingNo, setTrackingNo] = React.useState("");
  const [courierName, setCourierName] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  const next = status === "PAID" ? "PRINTED" : status === "PRINTED" ? "SHIPPED" : status === "SHIPPED" ? "DELIVERED" : null;
  if (!next) return null;
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await advancePrintOrderAction({ orderId, status: next, trackingNo, courierName });
      if (!result.success) setError(result.error);
      else router.refresh();
    });
  };
  return (
    <form onSubmit={submit} className="flex flex-col gap-2 sm:flex-row sm:items-end">
      {next === "SHIPPED" && (
        <>
          <Input label="Courier" value={courierName} onChange={(event) => setCourierName(event.target.value)} maxLength={80} />
          <Input label={deliveryType === "COURIER" ? "Tracking number *" : "Tracking number"} value={trackingNo} onChange={(event) => setTrackingNo(event.target.value)} maxLength={60} required={deliveryType === "COURIER"} />
        </>
      )}
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? "Saving…" : next === "PRINTED" ? "Mark printed" : next === "SHIPPED" ? "Mark shipped" : "Mark delivered"}
      </Button>
      <FormMessages error={error} />
    </form>
  );
}
