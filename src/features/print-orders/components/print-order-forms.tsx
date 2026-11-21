"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Building2, Clock, MapPin, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { FieldLabelRow, fieldInputClass, fieldOkBorder } from "@/components/ui/form-field";
import { cn } from "@/lib/utils";
import { COMPANY } from "@/config/site";
import { FormMessages } from "@/features/training/components/staff/staff-forms";
import { loadCheckoutScript } from "@/features/training/components/training-checkout";
import { formatInr } from "@/features/training/money";
import { advancePrintOrderAction, confirmPrintCheckoutAction, startPrintCheckoutAction } from "../actions";
import { courierPriceFor, courierPriceRange, PIN_CODE_PATTERN, ZONE_LABELS, type PrintOffer } from "../pricing";

type DeliveryType = "COLLEGE_BULK" | "COURIER";

const priceText = (paise: number) => formatInr(paise);

function DeliveryTile({
  value,
  checked,
  disabled,
  onSelect,
  icon: Icon,
  title,
  price,
  detail,
}: {
  value: DeliveryType;
  checked: boolean;
  disabled?: boolean;
  onSelect: () => void;
  icon: typeof Truck;
  title: string;
  price: string;
  detail: string | null;
}) {
  return (
    <label
      className={cn(
        "relative flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-background p-4 shadow-xs transition-[border-color,background-color,box-shadow] hover:border-foreground/25 has-checked:border-primary has-checked:bg-primary/5 has-focus-visible:ring-4 has-focus-visible:ring-primary/15",
        disabled && "cursor-not-allowed opacity-60 hover:border-border"
      )}
    >
      <input type="radio" name="deliveryType" value={value} className="sr-only" checked={checked} disabled={disabled} onChange={onSelect} />
      <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1 space-y-0.5">
        <span className="flex items-baseline justify-between gap-2">
          <span className="text-sm font-semibold text-foreground">{title}</span>
          <span className="shrink-0 text-sm font-bold tabular-nums text-foreground">{price}</span>
        </span>
        {detail && <span className="block text-xs text-muted-foreground">{detail}</span>}
      </span>
    </label>
  );
}

function Field({
  id,
  label,
  optional,
  className,
  ...input
}: { id: string; label: string; optional?: boolean; className?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className={cn("space-y-2", className)}>
      <FieldLabelRow htmlFor={id} label={label} optional={optional} />
      <input id={id} className={cn(fieldInputClass, fieldOkBorder)} {...input} />
    </div>
  );
}

/** Order a printed copy: delivery choice, destination (courier priced by PIN code), then Razorpay Checkout. */
export function PrintOrderForm({ certificateId, offer, defaultName, collegeName }: { certificateId: string; offer: PrintOffer; defaultName: string; collegeName: string | null }) {
  const router = useRouter();
  const id = React.useId();
  const fid = (name: string) => `${id}-${name}`;
  const courierRange = courierPriceRange(offer);
  const bulkUsable = Boolean(offer.collegeBulk && collegeName);
  const [deliveryType, setDeliveryType] = React.useState<DeliveryType>(bulkUsable || !courierRange ? "COLLEGE_BULK" : "COURIER");
  const [values, setValues] = React.useState({ recipientName: defaultName, phone: "", addressLine1: "", addressLine2: "", city: "", state: "", pincode: "" });
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const set = (key: keyof typeof values) => (event: React.ChangeEvent<HTMLInputElement>) => setValues({ ...values, [key]: event.target.value });

  const courier = deliveryType === "COURIER";
  const pinComplete = PIN_CODE_PATTERN.test(values.pincode.trim());
  const quote = courier && pinComplete ? courierPriceFor(offer, values.pincode) : null;
  const amount = courier ? (quote?.price?.pricePaise ?? null) : (offer.collegeBulk?.pricePaise ?? null);
  const courierClosedHere = Boolean(quote && !quote.price);

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
          if (confirmed.success) toast.success("Payment received. Your printed certificate is ordered.");
          else setError(`${confirmed.error} Your payment is safe; if the order does not show up within a few minutes, contact ${COMPANY.contactEmail}.`);
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
    <form onSubmit={pay} className="space-y-6" aria-label="Order a printed copy">
      <fieldset className="space-y-2">
        <legend className="mb-2 text-[13px] font-medium text-foreground">Delivery</legend>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {offer.collegeBulk && (
            <DeliveryTile
              value="COLLEGE_BULK"
              checked={deliveryType === "COLLEGE_BULK"}
              disabled={!collegeName}
              onSelect={() => setDeliveryType("COLLEGE_BULK")}
              icon={Building2}
              title="Through your college"
              price={priceText(offer.collegeBulk.pricePaise)}
              detail={collegeName ? [collegeName, offer.collegeBulk.expectedDelivery].filter(Boolean).join(" · ") : "Add your college in My Profile first"}
            />
          )}
          {courierRange && (
            <DeliveryTile
              value="COURIER"
              checked={courier}
              onSelect={() => setDeliveryType("COURIER")}
              icon={Truck}
              title="Courier to your address"
              price={courierRange.min === courierRange.max ? priceText(courierRange.min) : `${priceText(courierRange.min)}–${priceText(courierRange.max)}`}
              detail={
                offer.courierNcr && offer.courierOutside
                  ? `${ZONE_LABELS.NCR} ${priceText(offer.courierNcr.pricePaise)} · ${ZONE_LABELS.OUTSIDE_NCR} ${priceText(offer.courierOutside.pricePaise)}`
                  : (offer.courierNcr ?? offer.courierOutside)?.expectedDelivery ?? null
              }
            />
          )}
        </div>
      </fieldset>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <Field id={fid("name")} label="Name on the parcel" value={values.recipientName} onChange={set("recipientName")} required maxLength={120} autoComplete="name" />
        <Field id={fid("phone")} label="Mobile number" type="tel" value={values.phone} onChange={set("phone")} required maxLength={16} autoComplete="tel" inputMode="tel" />
        {courier && (
          <>
            <Field id={fid("line1")} label="Address line 1" value={values.addressLine1} onChange={set("addressLine1")} required minLength={5} maxLength={200} autoComplete="address-line1" />
            <Field id={fid("line2")} label="Address line 2" optional value={values.addressLine2} onChange={set("addressLine2")} maxLength={200} autoComplete="address-line2" />
            <Field id={fid("city")} label="City" value={values.city} onChange={set("city")} required maxLength={80} autoComplete="address-level2" />
            <Field id={fid("state")} label="State" value={values.state} onChange={set("state")} required maxLength={80} autoComplete="address-level1" />
            <Field
              id={fid("pincode")}
              label="PIN code"
              inputMode="numeric"
              value={values.pincode}
              onChange={set("pincode")}
              required
              maxLength={6}
              pattern="[1-9][0-9]{5}"
              autoComplete="postal-code"
            />
          </>
        )}
      </div>

      {quote && (
        <div
          role="status"
          className={cn(
            "flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border px-4 py-3 text-sm",
            quote.price ? "border-primary/20 bg-primary/5 text-foreground" : "border-destructive/30 bg-destructive/5 text-destructive"
          )}
        >
          {quote.price ? (
            <>
              <span className="inline-flex items-center gap-1.5 font-semibold">
                <MapPin className="h-4 w-4 text-primary" aria-hidden="true" />
                {ZONE_LABELS[quote.zone]}
              </span>
              <span className="font-bold tabular-nums">{priceText(quote.price.pricePaise)}</span>
              {quote.price.expectedDelivery && (
                <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                  <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                  {quote.price.expectedDelivery}
                </span>
              )}
            </>
          ) : (
            "Courier delivery is not available for this PIN code yet."
          )}
        </div>
      )}

      <FormMessages error={error} />
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" isLoading={busy} disabled={courierClosedHere} className="h-11 rounded-xl px-5">
          {busy ? "Opening secure payment…" : amount !== null ? `Pay ${priceText(amount)}` : "Pay"}
        </Button>
        <Link href="/shipping-policy" className="text-xs font-medium text-muted-foreground hover:text-foreground hover:underline underline-offset-4">
          Shipping &amp; Delivery Policy
        </Link>
      </div>
    </form>
  );
}

/** Administrators: the next step of a paid order. */
export function AdvancePrintOrder({ orderId, status, deliveryType }: { orderId: string; status: string; deliveryType: string }) {
  const router = useRouter();
  const idPrefix = React.useId();
  const [trackingNo, setTrackingNo] = React.useState("");
  const [courierName, setCourierName] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  const next = status === "PAID" ? "PRINTED" : status === "PRINTED" ? "SHIPPED" : status === "SHIPPED" ? "DELIVERED" : null;
  if (!next) return null;
  const label = next === "PRINTED" ? "Mark printed" : next === "SHIPPED" ? "Mark shipped" : "Mark delivered";
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await advancePrintOrderAction({ orderId, status: next, trackingNo, courierName });
      if (!result.success) {
        setError(result.error);
        return;
      }
      toast.success(next === "PRINTED" ? "Marked as printed." : next === "SHIPPED" ? "Marked as shipped." : "Marked as delivered.");
      router.refresh();
    });
  };
  return (
    <form onSubmit={submit} className="space-y-2">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        {next === "SHIPPED" && (
          <>
            <div className="space-y-1.5 sm:w-40">
              <FieldLabelRow htmlFor={`${idPrefix}-courier`} label="Courier" optional />
              <input id={`${idPrefix}-courier`} className={cn(fieldInputClass, fieldOkBorder, "h-10")} value={courierName} onChange={(event) => setCourierName(event.target.value)} maxLength={80} />
            </div>
            <div className="space-y-1.5 sm:w-44">
              <FieldLabelRow htmlFor={`${idPrefix}-tracking`} label="Tracking number" optional={deliveryType !== "COURIER"} />
              <input
                id={`${idPrefix}-tracking`}
                className={cn(fieldInputClass, fieldOkBorder, "h-10")}
                value={trackingNo}
                onChange={(event) => setTrackingNo(event.target.value)}
                maxLength={60}
                required={deliveryType === "COURIER"}
              />
            </div>
          </>
        )}
        <Button type="submit" size="sm" className="h-10 gap-1.5" disabled={pending}>
          {pending ? "Saving…" : label}
        </Button>
      </div>
      <FormMessages error={error} />
    </form>
  );
}
