"use client";

import React, { useId } from "react";
import { EmployeeStatus } from "@/types/enums";
import { REVIEW_PERIOD_MONTHS, type ReviewPeriodMonths } from "../conversion-rules";

export type JoiningInitialStatus = typeof EmployeeStatus.ACTIVE | typeof EmployeeStatus.PROBATION;

const STATUS_CHOICES: Array<{ value: JoiningInitialStatus; label: string }> = [
  { value: EmployeeStatus.ACTIVE, label: "Active" },
  { value: EmployeeStatus.PROBATION, label: "Probation" },
];

/** Selectable radio tile (same look as the shared ChoiceTiles). */
const choiceTileClass =
  "relative flex h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-border bg-background px-3 text-sm font-medium text-muted-foreground shadow-xs transition-[border-color,background-color,color,box-shadow] hover:border-foreground/25 hover:text-foreground has-checked:border-primary has-checked:bg-primary/5 has-checked:text-primary has-focus-visible:ring-4 has-focus-visible:ring-primary/15 has-disabled:cursor-not-allowed has-disabled:opacity-60";

export const joiningInputClass =
  "w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60";

/** Inline error text linked to its field through `aria-describedby`. */
export function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="mt-1 text-xs text-destructive">
      {message}
    </p>
  );
}

interface InitialStatusFieldProps {
  value: JoiningInitialStatus | "";
  onChange: (value: JoiningInitialStatus) => void;
  error?: string;
  disabled?: boolean;
}

/**
 * Required, explicit choice of the initial employment status. Nothing is preselected: no
 * probation rule is defined (OD-015), so HR records what was agreed.
 */
export function InitialStatusField({ value, onChange, error, disabled }: InitialStatusFieldProps) {
  const groupName = useId();
  const errorId = `${groupName}-error`;

  return (
    <fieldset aria-describedby={error ? errorId : undefined} disabled={disabled}>
      <legend className="mb-2 block text-[13px] font-medium text-foreground">
        Initial employment status <span className="text-destructive">*</span>
      </legend>
      <div className="grid grid-cols-2 gap-2">
        {STATUS_CHOICES.map((choice) => (
          <label key={choice.value} className={choiceTileClass}>
            <input
              type="radio"
              name={groupName}
              value={choice.value}
              checked={value === choice.value}
              onChange={() => onChange(choice.value)}
              required
              className="sr-only"
            />
            {choice.label}
          </label>
        ))}
      </div>
      <FieldError id={errorId} message={error} />
    </fieldset>
  );
}

interface ReviewPeriodFieldProps {
  legend: string;
  hint?: string;
  value: ReviewPeriodMonths | null;
  onChange: (value: ReviewPeriodMonths) => void;
  error?: string;
  disabled?: boolean;
}

/**
 * Required, explicit choice of when the intern progress review takes place (3 or 6 months).
 * Nothing is preselected (product-owner decision 2026-10-25: no default).
 */
export function ReviewPeriodField({ legend, hint, value, onChange, error, disabled }: ReviewPeriodFieldProps) {
  const groupName = useId();
  const errorId = `${groupName}-error`;
  const hintId = `${groupName}-hint`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(" ") || undefined;

  return (
    <fieldset aria-describedby={describedBy} disabled={disabled}>
      <legend className="mb-2 block text-[13px] font-medium text-foreground">
        {legend} <span className="text-destructive">*</span>
      </legend>
      <div className="grid grid-cols-2 gap-2">
        {REVIEW_PERIOD_MONTHS.map((months) => (
          <label key={months} className={choiceTileClass}>
            <input
              type="radio"
              name={groupName}
              value={months}
              checked={value === months}
              onChange={() => onChange(months)}
              required
              className="sr-only"
            />
            {months} months
          </label>
        ))}
      </div>
      {hint && (
        <p id={hintId} className="mt-1 text-[11px] text-muted-foreground">
          {hint}
        </p>
      )}
      <FieldError id={errorId} message={error} />
    </fieldset>
  );
}
