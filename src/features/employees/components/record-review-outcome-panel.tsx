"use client";

import React, { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, BadgeCheck, CalendarPlus, ClipboardCheck, LogOut, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { FieldLabelRow, fieldErrorBorder, fieldInputClass, fieldOkBorder, fieldTextareaClass } from "@/components/ui/form-field";
import { recordInternReviewOutcomeAction } from "../actions";
import {
  REVIEW_OUTCOME_LABELS,
  REVIEW_OUTCOMES,
  type ReviewOutcome,
  type ReviewPeriodMonths,
} from "../conversion-rules";
import { AccessibleDialog } from "./accessible-dialog";
import { FieldError, InitialStatusField, ReviewPeriodField, type JoiningInitialStatus } from "./joining-fields";

const OUTCOME_ICONS: Record<ReviewOutcome, LucideIcon> = {
  CONVERT: BadgeCheck,
  EXTEND: CalendarPlus,
  END_INTERNSHIP: LogOut,
};

export interface RecordReviewOutcomePanelProps {
  open: boolean;
  onClose: () => void;
  reviewId: string;
  internName: string;
  /** Prefills for a full-time offer (editable). */
  defaultDesignation: string;
  defaultDepartment: string;
  /** Business-calendar date (YYYY-MM-DD) used as the earliest effective date. */
  todayKey: string;
}

function formatDay(key: string): string {
  return new Date(`${key}T00:00:00.000Z`).toLocaleDateString("en-IN", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/**
 * Dialog body for recording the outcome of an intern progress review (ADMIN, or HR with
 * canEmployees; the server re-checks permissions, separation of duties, the review state and
 * every field). Loaded lazily by `RecordReviewOutcomeDialog` when the trigger is first used.
 */
export function RecordReviewOutcomePanel({
  open,
  onClose,
  reviewId,
  internName,
  defaultDesignation,
  defaultDepartment,
  todayKey,
}: RecordReviewOutcomePanelProps) {
  const router = useRouter();
  const baseId = useId();
  const id = (suffix: string) => `${baseId}-${suffix}`;

  // No defaults: every decision is an explicit HR choice.
  const [outcome, setOutcome] = useState<ReviewOutcome | null>(null);
  const [designation, setDesignation] = useState(defaultDesignation);
  const [department, setDepartment] = useState(defaultDepartment);
  const [effectiveDate, setEffectiveDate] = useState("");
  const [initialStatus, setInitialStatus] = useState<JoiningInitialStatus | "">("");
  const [nextReviewAfterMonths, setNextReviewAfterMonths] = useState<ReviewPeriodMonths | null>(null);
  const [sharedSummary, setSharedSummary] = useState("");
  const [internalNotes, setInternalNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const close = () => {
    if (isSubmitting) return;
    onClose();
    setError(null);
    setFieldErrors({});
  };

  const validate = (): Record<string, string> => {
    const missing: Record<string, string> = {};
    if (!outcome) missing.outcome = "Choose the review outcome";
    if (outcome === "CONVERT") {
      if (designation.trim().length < 2) missing.proposedDesignation = "Designation is required";
      if (department.trim().length < 2) missing.proposedDepartment = "Department is required";
      if (!effectiveDate) missing.effectiveDate = "Choose the date the full-time role starts";
      else if (effectiveDate < todayKey) missing.effectiveDate = "The effective date cannot be in the past";
      if (!initialStatus) missing.initialStatus = "Choose the initial employment status (Active or Probation)";
    }
    if (outcome === "EXTEND" && !nextReviewAfterMonths) {
      missing.nextReviewAfterMonths = "Choose when the next review takes place (after 3 or 6 months)";
    }
    return missing;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const missing = validate();
    setFieldErrors(missing);
    if (Object.keys(missing).length > 0 || !outcome) return;

    setIsSubmitting(true);
    const formData = new FormData();
    formData.append("reviewId", reviewId);
    formData.append("outcome", outcome);
    formData.append("sharedSummary", sharedSummary);
    formData.append("internalNotes", internalNotes);
    if (outcome === "CONVERT") {
      formData.append("proposedDesignation", designation);
      formData.append("proposedDepartment", department);
      formData.append("effectiveDate", effectiveDate);
      formData.append("initialStatus", initialStatus);
    }
    if (outcome === "EXTEND" && nextReviewAfterMonths) {
      formData.append("nextReviewAfterMonths", String(nextReviewAfterMonths));
    }

    try {
      const res = await recordInternReviewOutcomeAction(formData);
      if (!res.success) {
        setError(res.error);
        setFieldErrors(res.fieldErrors ?? {});
        return;
      }
      // The action refreshes the board, which moves this review to Decisions and removes this
      // dialog with its card, so the confirmation is a toast (it outlives the dialog).
      const nextReviewDate = res.data.nextReviewDate ? new Date(res.data.nextReviewDate).toISOString().slice(0, 10) : null;
      toast.success(
        outcome === "CONVERT"
          ? `Full-time offer sent to ${internName}.`
          : outcome === "EXTEND"
            ? `Internship extended. Next review on ${nextReviewDate ? formatDay(nextReviewDate) : "the scheduled date"}.`
            : `Decision recorded. Process ${internName}'s exit from the employee record.`
      );
      onClose();
      router.refresh();
    } catch {
      setError("We couldn't save the review outcome. Please check your connection and try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const describedBy = (field: string) => (fieldErrors[field] ? id(`${field}-error`) : undefined);

  return (
    <>
      <AccessibleDialog open={open} onClose={close} labelledBy={id("title")} busy={isSubmitting} className="max-w-2xl">
          <form onSubmit={handleSubmit} noValidate>
            <div className="border-b border-border/60 px-5 py-4">
              <h2 id={id("title")} className="flex items-center gap-2.5 text-base font-semibold text-foreground">
                <span aria-hidden="true" className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <ClipboardCheck className="h-4 w-4" />
                </span>
                <span className="min-w-0 wrap-break-word">Review outcome: {internName}</span>
              </h2>
            </div>

            <div className="space-y-5 px-5 py-5">
              {error && (
                <div role="alert" className="flex items-start gap-2 rounded-xl border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>{error}</span>
                </div>
              )}

              <fieldset aria-describedby={fieldErrors.outcome ? id("outcome-error") : undefined} disabled={isSubmitting}>
                <legend className="mb-2 block text-[13px] font-medium text-foreground">
                  Outcome <span className="text-destructive">*</span>
                </legend>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  {REVIEW_OUTCOMES.map((choice) => {
                    const Icon = OUTCOME_ICONS[choice];
                    return (
                      <label
                        key={choice}
                        className={cn(
                          "flex cursor-pointer items-center gap-2.5 rounded-xl border border-border bg-background px-3 py-3 text-sm font-medium text-muted-foreground shadow-xs transition-[border-color,background-color,color,box-shadow] hover:border-foreground/25 hover:text-foreground has-checked:border-primary has-checked:bg-primary/5 has-checked:text-primary has-focus-visible:ring-4 has-focus-visible:ring-primary/15",
                          choice === "END_INTERNSHIP" && "has-checked:border-destructive has-checked:bg-destructive/5 has-checked:text-destructive"
                        )}
                      >
                        <input
                          type="radio"
                          name={id("outcome")}
                          value={choice}
                          checked={outcome === choice}
                          onChange={() => setOutcome(choice)}
                          required
                          className="sr-only"
                        />
                        <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                        {REVIEW_OUTCOME_LABELS[choice]}
                      </label>
                    );
                  })}
                </div>
                <FieldError id={id("outcome-error")} message={fieldErrors.outcome} />
              </fieldset>

              {outcome === "CONVERT" && (
                <div className="space-y-5 rounded-xl border border-border/60 bg-muted/20 p-4">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <FieldLabelRow htmlFor={id("designation")} label="Full-time designation" />
                      <input
                        id={id("designation")}
                        type="text"
                        required
                        value={designation}
                        onChange={(e) => setDesignation(e.target.value)}
                        aria-invalid={Boolean(fieldErrors.proposedDesignation)}
                        aria-describedby={describedBy("proposedDesignation")}
                        disabled={isSubmitting}
                        className={cn(fieldInputClass, fieldErrors.proposedDesignation ? fieldErrorBorder : fieldOkBorder)}
                      />
                      <FieldError id={id("proposedDesignation-error")} message={fieldErrors.proposedDesignation} />
                    </div>
                    <div className="space-y-2">
                      <FieldLabelRow htmlFor={id("department")} label="Department" />
                      <input
                        id={id("department")}
                        type="text"
                        required
                        value={department}
                        onChange={(e) => setDepartment(e.target.value)}
                        aria-invalid={Boolean(fieldErrors.proposedDepartment)}
                        aria-describedby={describedBy("proposedDepartment")}
                        disabled={isSubmitting}
                        className={cn(fieldInputClass, fieldErrors.proposedDepartment ? fieldErrorBorder : fieldOkBorder)}
                      />
                      <FieldError id={id("proposedDepartment-error")} message={fieldErrors.proposedDepartment} />
                    </div>
                    <div className="space-y-2 sm:col-span-2">
                      <FieldLabelRow htmlFor={id("effectiveDate")} label="Effective date" />
                      <input
                        id={id("effectiveDate")}
                        type="date"
                        required
                        min={todayKey}
                        value={effectiveDate}
                        onChange={(e) => setEffectiveDate(e.target.value)}
                        aria-invalid={Boolean(fieldErrors.effectiveDate)}
                        aria-describedby={describedBy("effectiveDate")}
                        disabled={isSubmitting}
                        className={cn(fieldInputClass, fieldErrors.effectiveDate ? fieldErrorBorder : fieldOkBorder)}
                      />
                      <FieldError id={id("effectiveDate-error")} message={fieldErrors.effectiveDate} />
                    </div>
                  </div>
                  <InitialStatusField value={initialStatus} onChange={setInitialStatus} error={fieldErrors.initialStatus} disabled={isSubmitting} />
                </div>
              )}

              {outcome === "EXTEND" && (
                <ReviewPeriodField
                  legend="Next review after"
                  value={nextReviewAfterMonths}
                  onChange={setNextReviewAfterMonths}
                  error={fieldErrors.nextReviewAfterMonths}
                  disabled={isSubmitting}
                />
              )}

              <div className="space-y-2">
                <FieldLabelRow htmlFor={id("sharedSummary")} label="Summary shared with the intern" optional count={sharedSummary.length} max={2000} />
                <textarea
                  id={id("sharedSummary")}
                  rows={3}
                  maxLength={2000}
                  value={sharedSummary}
                  onChange={(e) => setSharedSummary(e.target.value)}
                  aria-describedby={describedBy("sharedSummary")}
                  disabled={isSubmitting}
                  className={cn(fieldTextareaClass, fieldOkBorder)}
                />
                <FieldError id={id("sharedSummary-error")} message={fieldErrors.sharedSummary} />
              </div>

              <div className="space-y-2">
                <FieldLabelRow htmlFor={id("internalNotes")} label="Internal notes (staff only)" optional count={internalNotes.length} max={5000} />
                <textarea
                  id={id("internalNotes")}
                  rows={3}
                  maxLength={5000}
                  value={internalNotes}
                  onChange={(e) => setInternalNotes(e.target.value)}
                  aria-describedby={describedBy("internalNotes")}
                  disabled={isSubmitting}
                  className={cn(fieldTextareaClass, fieldOkBorder)}
                />
                <FieldError id={id("internalNotes-error")} message={fieldErrors.internalNotes} />
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-border/60 px-5 py-4">
              <Button variant="outline" type="button" onClick={close} disabled={isSubmitting} className="h-10 rounded-xl px-4">
                Cancel
              </Button>
              <Button type="submit" isLoading={isSubmitting} className="h-10 rounded-xl px-5">
                Record outcome
              </Button>
            </div>
          </form>
      </AccessibleDialog>
    </>
  );
}
