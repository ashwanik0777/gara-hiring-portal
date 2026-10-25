"use client";

import React, { useId } from "react";
import { EmployeeStatus } from "@/types/enums";
import { cn } from "@/lib/utils";

export type JoiningInitialStatus = typeof EmployeeStatus.ACTIVE | typeof EmployeeStatus.PROBATION;

const STATUS_CHOICES: Array<{ value: JoiningInitialStatus; label: string; hint: string }> = [
  { value: EmployeeStatus.ACTIVE, label: "Active", hint: "Starts as an active team member." },
  { value: EmployeeStatus.PROBATION, label: "Probation", hint: "Starts in probation status." },
];

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
      <legend className="mb-1.5 block text-xs font-medium text-foreground">
        Initial employment status <span className="text-destructive">*</span>
      </legend>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {STATUS_CHOICES.map((choice) => (
          <label
            key={choice.value}
            className={cn(
              "flex cursor-pointer items-start gap-2 rounded-lg border p-3 text-xs transition-colors focus-within:ring-2 focus-within:ring-ring",
              value === choice.value ? "border-primary bg-primary/5" : "border-border bg-background"
            )}
          >
            <input
              type="radio"
              name={groupName}
              value={choice.value}
              checked={value === choice.value}
              onChange={() => onChange(choice.value)}
              required
              className="mt-0.5 h-4 w-4 accent-primary"
            />
            <span>
              <span className="block font-semibold text-foreground">{choice.label}</span>
              <span className="block text-muted-foreground">{choice.hint}</span>
            </span>
          </label>
        ))}
      </div>
      <FieldError id={errorId} message={error} />
    </fieldset>
  );
}
