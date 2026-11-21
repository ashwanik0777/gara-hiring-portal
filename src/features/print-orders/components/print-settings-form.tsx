"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, PauseCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import {
  ChoiceTiles,
  FieldErrorText,
  FieldGroup,
  FieldLabelRow,
  fieldAddonClass,
  fieldErrorBorder,
  fieldGroupClass,
  fieldGroupInputClass,
  fieldInputClass,
  fieldOkBorder,
} from "@/components/ui/form-field";
import { cn } from "@/lib/utils";
import { parsePinPrefixes, PIN_PREFIX_PATTERN } from "../pricing";
import { updatePrintSettingsAction } from "../actions";

/** Saved settings as form text (prices in whole rupees). */
export interface PrintSettingsFormValues {
  orderingOpen: boolean;
  collegeBulkPrice: string;
  courierNcrPrice: string;
  courierOutsidePrice: string;
  collegeBulkDelivery: string;
  courierNcrDelivery: string;
  courierOutsideDelivery: string;
  ncrPinPrefixes: string;
  courierPartner: string;
}

const MAX_PREFIXES = 50;

function PriceField({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (value: string) => void }) {
  const invalid = value.trim() !== "" && !/^\d{1,5}$/.test(value.trim());
  return (
    <div className="space-y-2">
      <FieldLabelRow htmlFor={id} label={label} />
      <div className={cn(fieldGroupClass, invalid ? fieldErrorBorder : fieldOkBorder)}>
        <span className={fieldAddonClass} aria-hidden="true">
          ₹
        </span>
        <input
          id={id}
          inputMode="numeric"
          autoComplete="off"
          value={value}
          onChange={(event) => onChange(event.target.value.replace(/[^\d]/g, ""))}
          maxLength={5}
          aria-invalid={invalid || undefined}
          className={fieldGroupInputClass}
        />
      </div>
    </div>
  );
}

function TextField({ id, label, value, onChange, placeholder, optional, maxLength }: { id: string; label: string; value: string; onChange: (value: string) => void; placeholder?: string; optional?: boolean; maxLength: number }) {
  return (
    <div className="space-y-2">
      <FieldLabelRow htmlFor={id} label={label} optional={optional} />
      <input
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        maxLength={maxLength}
        autoComplete="off"
        className={cn(fieldInputClass, fieldOkBorder)}
      />
    </div>
  );
}

/** Administrators: printed certificate prices, delivery times, NCR PIN codes and ordering on/off. */
export function PrintSettingsForm({ initial, cancelHref }: { initial: PrintSettingsFormValues; cancelHref: string }) {
  const router = useRouter();
  const id = React.useId();
  const fid = (name: string) => `${id}-${name}`;
  const [values, setValues] = React.useState(initial);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  const set = <K extends keyof PrintSettingsFormValues>(key: K) => (value: PrintSettingsFormValues[K]) => setValues((current) => ({ ...current, [key]: value }));

  const prefixes = parsePinPrefixes(values.ncrPinPrefixes);
  const badPrefixes = prefixes.filter((prefix) => !PIN_PREFIX_PATTERN.test(prefix));
  const prefixError =
    badPrefixes.length > 0
      ? "NCR PIN codes are 2 to 6 digits and do not start with 0"
      : prefixes.length > MAX_PREFIXES
        ? `Add at most ${MAX_PREFIXES} NCR PIN codes`
        : undefined;

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (prefixError) {
      setError(prefixError);
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await updatePrintSettingsAction({
        orderingOpen: values.orderingOpen,
        collegeBulkPrice: values.collegeBulkPrice,
        courierNcrPrice: values.courierNcrPrice,
        courierOutsidePrice: values.courierOutsidePrice,
        collegeBulkDelivery: values.collegeBulkDelivery,
        courierNcrDelivery: values.courierNcrDelivery,
        courierOutsideDelivery: values.courierOutsideDelivery,
        ncrPinPrefixes: prefixes,
        courierPartner: values.courierPartner,
      });
      if (!result.success) {
        setError(result.error);
        return;
      }
      toast.success("Print settings saved.");
      router.refresh();
    });
  };

  return (
    <form onSubmit={submit} className="w-full" aria-label="Print settings">
      <div className="space-y-7">
        <FieldGroup name="Ordering">
          <ChoiceTiles
            legend="Ordering"
            columns="grid-cols-2 sm:max-w-md"
            options={[
              { value: "open", label: "Open", icon: CheckCircle2 },
              { value: "paused", label: "Paused", icon: PauseCircle },
            ]}
            inputProps={(value) => ({
              name: "orderingOpen",
              checked: values.orderingOpen === (value === "open"),
              onChange: () => set("orderingOpen")(value === "open"),
            })}
          />
        </FieldGroup>

        <FieldGroup name="College bulk">
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <PriceField id={fid("bulk-price")} label="College bulk price" value={values.collegeBulkPrice} onChange={set("collegeBulkPrice")} />
            <TextField id={fid("bulk-delivery")} label="College bulk delivery time" value={values.collegeBulkDelivery} onChange={set("collegeBulkDelivery")} placeholder="7–12 working days" maxLength={60} />
          </div>
        </FieldGroup>

        <FieldGroup name="Courier within NCR">
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <PriceField id={fid("ncr-price")} label="Courier price within NCR" value={values.courierNcrPrice} onChange={set("courierNcrPrice")} />
            <TextField id={fid("ncr-delivery")} label="Delivery time within NCR" value={values.courierNcrDelivery} onChange={set("courierNcrDelivery")} placeholder="5–8 working days" maxLength={60} />
          </div>
          <div className="space-y-2">
            <FieldLabelRow htmlFor={fid("ncr-pins")} label="NCR PIN codes" count={prefixes.length} max={MAX_PREFIXES} />
            <input
              id={fid("ncr-pins")}
              value={values.ncrPinPrefixes}
              onChange={(event) => set("ncrPinPrefixes")(event.target.value)}
              placeholder="110, 201, 122, 121"
              autoComplete="off"
              inputMode="numeric"
              aria-invalid={prefixError ? true : undefined}
              aria-describedby={prefixError ? fid("ncr-pins-error") : undefined}
              className={cn(fieldInputClass, prefixError ? fieldErrorBorder : fieldOkBorder)}
            />
            {prefixes.length > 0 && (
              <ul className="flex flex-wrap gap-1.5" aria-label="NCR PIN codes added">
                {prefixes.map((prefix) => {
                  const bad = !PIN_PREFIX_PATTERN.test(prefix);
                  return (
                    <li
                      key={prefix}
                      className={cn(
                        "rounded-full border px-2.5 py-1 font-mono text-xs font-medium",
                        bad ? "border-destructive/30 bg-destructive/5 text-destructive" : "border-primary/20 bg-primary/5 text-primary"
                      )}
                    >
                      {prefix}
                      {bad && <span className="sr-only"> (not valid)</span>}
                    </li>
                  );
                })}
              </ul>
            )}
            <FieldErrorText id={fid("ncr-pins-error")} message={prefixError} />
          </div>
        </FieldGroup>

        <FieldGroup name="Courier outside NCR">
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <PriceField id={fid("outside-price")} label="Courier price outside NCR" value={values.courierOutsidePrice} onChange={set("courierOutsidePrice")} />
            <TextField id={fid("outside-delivery")} label="Delivery time outside NCR" value={values.courierOutsideDelivery} onChange={set("courierOutsideDelivery")} placeholder="7–12 working days" maxLength={60} />
          </div>
        </FieldGroup>

        <FieldGroup name="Courier partner">
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <TextField id={fid("partner")} label="Courier partner" value={values.courierPartner} onChange={set("courierPartner")} placeholder="India Post Speed Post" optional maxLength={80} />
          </div>
        </FieldGroup>

        {error && (
          <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm font-medium text-destructive">
            {error}
          </p>
        )}
      </div>

      <div className="sticky -bottom-4 z-10 -mx-4 -mb-4 mt-10 border-t border-border/70 bg-card/95 px-4 py-4 backdrop-blur-sm sm:-bottom-6 sm:-mx-6 sm:-mb-6 sm:px-6 lg:-bottom-8 lg:-mx-8 lg:-mb-8 lg:px-8">
        {/* pr-14 keeps the buttons clear of the site-wide floating help buttons (bottom-right). */}
        <div className="flex flex-col-reverse gap-3 pr-14 sm:flex-row sm:items-center sm:justify-end">
          <Link
            href={cancelHref}
            className="inline-flex h-11 items-center justify-center rounded-xl border border-border bg-background px-5 text-sm font-medium text-foreground shadow-xs transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/15"
          >
            Cancel
          </Link>
          <Button type="submit" isLoading={pending} className="h-11 rounded-xl px-5">
            Save settings
          </Button>
        </div>
      </div>
    </form>
  );
}
