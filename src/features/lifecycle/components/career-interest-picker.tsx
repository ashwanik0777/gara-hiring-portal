"use client";

import React from "react";
import { Briefcase, GraduationCap, Layers } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CareerInterest } from "@/types/enums";

const OPTIONS: Array<{ value: CareerInterest; label: string; hint: string; icon: typeof Briefcase }> = [
  { value: "JOB", label: "Full-time job", hint: "Permanent roles", icon: Briefcase },
  { value: "INTERNSHIP", label: "Internship", hint: "Supervised programme", icon: GraduationCap },
  { value: "BOTH", label: "Both", hint: "Show me everything", icon: Layers },
];

interface CareerInterestPickerProps {
  value: CareerInterest | null;
  onChange: (value: CareerInterest) => void;
  /** Group name for the radio inputs (unique per form on the page). */
  name: string;
  error?: string | null;
  compact?: boolean;
  legend?: string;
}

/** Accessible radio-card group for choosing what the candidate is looking for. */
export function CareerInterestPicker({
  value,
  onChange,
  name,
  error,
  compact = false,
  legend = "I am looking for",
}: CareerInterestPickerProps) {
  const errorId = `${name}-error`;
  return (
    <fieldset aria-describedby={error ? errorId : undefined} className="space-y-1.5">
      <legend className="mb-1.5 text-xs font-medium text-foreground">
        {legend} <span className="text-destructive" aria-hidden="true">*</span>
      </legend>
      <div className={cn("grid gap-2", compact ? "grid-cols-3" : "grid-cols-1 sm:grid-cols-3")}>
        {OPTIONS.map((option) => {
          const Icon = option.icon;
          const selected = value === option.value;
          return (
            <label
              key={option.value}
              className={cn(
                "flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2.5 text-left transition-colors focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-primary",
                selected
                  ? "border-blue-600 bg-blue-50 text-blue-700 dark:border-blue-500 dark:bg-blue-950/50 dark:text-blue-300"
                  : "border-border/80 bg-background hover:border-blue-400",
                compact && "flex-col justify-center gap-1 px-2 text-center"
              )}
            >
              <input
                type="radio"
                name={name}
                value={option.value}
                checked={selected}
                onChange={() => onChange(option.value)}
                className="sr-only"
              />
              <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="min-w-0">
                <span className="block text-xs font-semibold">{option.label}</span>
                {!compact && <span className="block text-[11px] text-muted-foreground">{option.hint}</span>}
              </span>
            </label>
          );
        })}
      </div>
      {error && (
        <p id={errorId} role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </fieldset>
  );
}
