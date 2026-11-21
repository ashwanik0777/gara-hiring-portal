import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/*
 * Shared look of staff forms (openings, training): one control style, a label row with
 * "Optional" and a character count on the right, choice tiles, and an error line. No hint or
 * description lines under fields.
 */

export const fieldControlBase =
  "w-full rounded-xl border bg-background text-sm text-foreground shadow-xs outline-none transition-[border-color,box-shadow] placeholder:text-muted-foreground/70 hover:border-foreground/25 focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-primary/15 disabled:cursor-not-allowed disabled:opacity-60";
export const fieldInputClass = cn(fieldControlBase, "h-11 px-3.5");
export const fieldTextareaClass = cn(fieldControlBase, "px-3.5 py-3 leading-relaxed resize-y");
export const fieldOkBorder = "border-border";
export const fieldErrorBorder =
  "border-destructive hover:border-destructive focus-visible:border-destructive focus-visible:ring-destructive/15";
/** Wrapper of an input with a prefix or suffix (e.g. "/careers/", "₹", "weeks"). */
export const fieldGroupClass =
  "flex h-11 items-stretch overflow-hidden rounded-xl border bg-background shadow-xs transition-[border-color,box-shadow] hover:border-foreground/25 focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/15";
export const fieldAddonClass = "flex items-center bg-muted/50 px-3 text-xs text-muted-foreground";
export const fieldGroupInputClass =
  "min-w-0 flex-1 bg-transparent px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground/70";

/** The row above a control: its label, and on the right "Optional" and/or a character count. */
export function FieldLabelRow({
  htmlFor,
  label,
  optional,
  count,
  max,
}: {
  htmlFor: string;
  label: string;
  optional?: boolean;
  count?: number;
  max?: number;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <label htmlFor={htmlFor} className="text-[13px] font-medium text-foreground">
        {label}
        {optional && <span className="sr-only"> (optional)</span>}
      </label>
      {(optional || max !== undefined) && (
        <span aria-hidden="true" className="shrink-0 text-xs tabular-nums text-muted-foreground">
          {optional && "Optional"}
          {optional && max !== undefined && " · "}
          {max !== undefined && `${count ?? 0}/${max}`}
        </span>
      )}
    </div>
  );
}

export function FieldErrorText({ id, message }: { id: string; message?: string }) {
  return message ? (
    <p id={id} className="text-xs font-medium text-destructive">
      {message}
    </p>
  ) : null;
}

export interface ChoiceOption<T extends string> {
  value: T;
  label: string;
  icon?: LucideIcon;
}

/**
 * Radio choices drawn as a row of selectable tiles inside a fieldset. `inputProps` gives each
 * radio its wiring: a react-hook-form registration, or `checked`/`onChange` for local state.
 */
export function ChoiceTiles<T extends string>({
  legend,
  options,
  columns,
  inputProps,
}: {
  legend: string;
  options: Array<ChoiceOption<T>>;
  /** Grid columns, e.g. "grid-cols-3". */
  columns: string;
  inputProps: (value: T) => React.InputHTMLAttributes<HTMLInputElement> & { ref?: React.Ref<HTMLInputElement> };
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="mb-2 text-[13px] font-medium text-foreground">{legend}</legend>
      <div className={cn("grid gap-2", columns)}>
        {options.map(({ value, label, icon: Icon }) => (
          <label
            key={value}
            className="relative flex h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-border bg-background px-3 text-sm font-medium text-muted-foreground shadow-xs transition-[border-color,background-color,color,box-shadow] hover:border-foreground/25 hover:text-foreground has-checked:border-primary has-checked:bg-primary/5 has-checked:text-primary has-focus-visible:ring-4 has-focus-visible:ring-primary/15"
          >
            <input type="radio" value={value} className="sr-only" {...inputProps(value)} />
            {Icon && <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />}
            {label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** A group of fields: the name is for screen readers, the eye sees a divider. */
export function FieldGroup({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <fieldset className="space-y-5 border-t border-border/60 pt-7 first:border-t-0 first:pt-0">
      <legend className="sr-only">{name}</legend>
      {children}
    </fieldset>
  );
}
