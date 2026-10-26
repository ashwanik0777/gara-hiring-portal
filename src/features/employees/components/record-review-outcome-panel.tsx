"use client";

import React, { useId, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, ArrowRight, CheckCircle2, ClipboardCheck, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { recordInternReviewOutcomeAction } from "../actions";
import {
  REVIEW_OUTCOME_LABELS,
  REVIEW_OUTCOMES,
  type ReviewOutcome,
  type ReviewPeriodMonths,
} from "../conversion-rules";
import { AccessibleDialog } from "./accessible-dialog";
import {
  FieldError,
  InitialStatusField,
  joiningInputClass,
  ReviewPeriodField,
  type JoiningInitialStatus,
} from "./joining-fields";

const OUTCOME_HINTS: Record<ReviewOutcome, string> = {
  CONVERT: "Creates a full-time offer the intern accepts or declines in their portal.",
  EXTEND: "The internship continues and the next review is scheduled.",
  END_INTERNSHIP: "Records the decision. The exit itself is processed on the employee record.",
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
  /** Employee record link where the exit is processed, or null when not available. */
  exitHref: string | null;
}

function formatDay(key: string): string {
  return new Date(`${key}T00:00:00.000Z`).toLocaleDateString("en-GB", {
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
  exitHref,
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
  const [recorded, setRecorded] = useState<{ outcome: ReviewOutcome; nextReviewDate: string | null } | null>(null);

  const close = () => {
    if (isSubmitting) return;
    onClose();
    setError(null);
    setFieldErrors({});
    if (recorded) {
      // The review has moved to "Recent decisions".
      router.refresh();
    }
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
      setRecorded({
        outcome,
        nextReviewDate: res.data.nextReviewDate ? new Date(res.data.nextReviewDate).toISOString().slice(0, 10) : null,
      });
    } catch {
      setError("We couldn't save the review outcome. Please check your connection and try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const describedBy = (field: string, hint?: string) =>
    [hint, fieldErrors[field] ? id(`${field}-error`) : null].filter(Boolean).join(" ") || undefined;

  return (
    <>
      <AccessibleDialog open={open} onClose={close} labelledBy={id("title")} describedBy={id("description")} busy={isSubmitting}>
        {recorded ? (
          <div className="space-y-4 px-5 py-5 text-xs">
            <h2 id={id("title")} className="flex items-center gap-2 text-base font-semibold text-foreground">
              <CheckCircle2 className="h-4 w-4 text-success" aria-hidden="true" /> Review outcome recorded
            </h2>
            <p id={id("description")} role="status" className="text-muted-foreground">
              {recorded.outcome === "CONVERT" &&
                `${internName} has been emailed the full-time offer and can accept or decline it in their portal.`}
              {recorded.outcome === "EXTEND" &&
                `The internship is extended. The next review is on ${recorded.nextReviewDate ? formatDay(recorded.nextReviewDate) : "the scheduled date"}.`}
              {recorded.outcome === "END_INTERNSHIP" &&
                `The decision is recorded and ${internName} has been emailed. The internship does not end automatically.`}
            </p>
            {recorded.outcome === "END_INTERNSHIP" && (
              <div className="flex flex-col gap-2 rounded-lg border border-warning/30 bg-warning/10 p-3 text-foreground sm:flex-row sm:items-center sm:justify-between">
                <span className="flex items-start gap-2">
                  <LogOut className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
                  Next step: process the exit with the last working date on the employee record.
                </span>
                {exitHref && (
                  <Link
                    href={exitHref}
                    className="inline-flex items-center gap-1 font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
                  >
                    Process exit <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </Link>
                )}
              </div>
            )}
            <div className="flex justify-end">
              <Button size="sm" onClick={close}>
                Done
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} noValidate>
            <div className="border-b border-border/50 px-5 py-4">
              <h2 id={id("title")} className="flex items-center gap-2 text-base font-semibold text-foreground">
                <ClipboardCheck className="h-4 w-4 text-primary" aria-hidden="true" /> Review outcome: {internName}
              </h2>
              <p id={id("description")} className="mt-1 text-xs text-muted-foreground">
                Record the decision taken in the progress review meeting.
              </p>
            </div>

            <div className="space-y-4 px-5 py-4 text-xs">
              {error && (
                <div
                  role="alert"
                  className="flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-destructive"
                >
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>{error}</span>
                </div>
              )}

              <fieldset aria-describedby={fieldErrors.outcome ? id("outcome-error") : undefined} disabled={isSubmitting}>
                <legend className="mb-1.5 block font-medium text-foreground">
                  Outcome <span className="text-destructive">*</span>
                </legend>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  {REVIEW_OUTCOMES.map((choice) => (
                    <label
                      key={choice}
                      className={cn(
                        "flex cursor-pointer items-start gap-2 rounded-lg border p-3 transition-colors focus-within:ring-2 focus-within:ring-ring",
                        outcome === choice ? "border-primary bg-primary/5" : "border-border bg-background"
                      )}
                    >
                      <input
                        type="radio"
                        name={id("outcome")}
                        value={choice}
                        checked={outcome === choice}
                        onChange={() => setOutcome(choice)}
                        required
                        className="mt-0.5 h-4 w-4 accent-primary"
                      />
                      <span>
                        <span className="block font-semibold text-foreground">{REVIEW_OUTCOME_LABELS[choice]}</span>
                        <span className="block text-muted-foreground">{OUTCOME_HINTS[choice]}</span>
                      </span>
                    </label>
                  ))}
                </div>
                <FieldError id={id("outcome-error")} message={fieldErrors.outcome} />
              </fieldset>

              {outcome === "CONVERT" && (
                <div className="space-y-4 rounded-lg border border-border/60 bg-muted/20 p-3">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label htmlFor={id("designation")} className="mb-1 block font-medium text-foreground">
                        Full-time designation <span className="text-destructive">*</span>
                      </label>
                      <input
                        id={id("designation")}
                        type="text"
                        required
                        value={designation}
                        onChange={(e) => setDesignation(e.target.value)}
                        aria-invalid={Boolean(fieldErrors.proposedDesignation)}
                        aria-describedby={describedBy("proposedDesignation")}
                        disabled={isSubmitting}
                        className={joiningInputClass}
                      />
                      <FieldError id={id("proposedDesignation-error")} message={fieldErrors.proposedDesignation} />
                    </div>
                    <div>
                      <label htmlFor={id("department")} className="mb-1 block font-medium text-foreground">
                        Department <span className="text-destructive">*</span>
                      </label>
                      <input
                        id={id("department")}
                        type="text"
                        required
                        value={department}
                        onChange={(e) => setDepartment(e.target.value)}
                        aria-invalid={Boolean(fieldErrors.proposedDepartment)}
                        aria-describedby={describedBy("proposedDepartment")}
                        disabled={isSubmitting}
                        className={joiningInputClass}
                      />
                      <FieldError id={id("proposedDepartment-error")} message={fieldErrors.proposedDepartment} />
                    </div>
                    <div className="sm:col-span-2">
                      <label htmlFor={id("effectiveDate")} className="mb-1 block font-medium text-foreground">
                        Effective date <span className="text-destructive">*</span>
                      </label>
                      <input
                        id={id("effectiveDate")}
                        type="date"
                        required
                        min={todayKey}
                        value={effectiveDate}
                        onChange={(e) => setEffectiveDate(e.target.value)}
                        aria-invalid={Boolean(fieldErrors.effectiveDate)}
                        aria-describedby={describedBy("effectiveDate", id("effectiveDate-hint"))}
                        disabled={isSubmitting}
                        className={joiningInputClass}
                      />
                      <p id={id("effectiveDate-hint")} className="mt-1 text-[11px] text-muted-foreground">
                        Today or later. Once the intern accepts, the change takes effect automatically on this date.
                      </p>
                      <FieldError id={id("effectiveDate-error")} message={fieldErrors.effectiveDate} />
                    </div>
                  </div>
                  <InitialStatusField
                    value={initialStatus}
                    onChange={setInitialStatus}
                    error={fieldErrors.initialStatus}
                    disabled={isSubmitting}
                  />
                </div>
              )}

              {outcome === "EXTEND" && (
                <ReviewPeriodField
                  legend="Next review after"
                  hint="Counted from today."
                  value={nextReviewAfterMonths}
                  onChange={setNextReviewAfterMonths}
                  error={fieldErrors.nextReviewAfterMonths}
                  disabled={isSubmitting}
                />
              )}

              <div>
                <label htmlFor={id("sharedSummary")} className="mb-1 block font-medium text-foreground">
                  Summary for the intern (optional)
                </label>
                <textarea
                  id={id("sharedSummary")}
                  rows={3}
                  maxLength={2000}
                  value={sharedSummary}
                  onChange={(e) => setSharedSummary(e.target.value)}
                  aria-describedby={describedBy("sharedSummary", id("sharedSummary-hint"))}
                  disabled={isSubmitting}
                  className={`${joiningInputClass} resize-y`}
                />
                <p id={id("sharedSummary-hint")} className="mt-1 text-[11px] text-muted-foreground">
                  Shown to the intern in their workspace and email.
                </p>
                <FieldError id={id("sharedSummary-error")} message={fieldErrors.sharedSummary} />
              </div>

              <div>
                <label htmlFor={id("internalNotes")} className="mb-1 block font-medium text-foreground">
                  Internal notes (optional)
                </label>
                <textarea
                  id={id("internalNotes")}
                  rows={3}
                  maxLength={5000}
                  value={internalNotes}
                  onChange={(e) => setInternalNotes(e.target.value)}
                  aria-describedby={describedBy("internalNotes", id("internalNotes-hint"))}
                  disabled={isSubmitting}
                  className={`${joiningInputClass} resize-y`}
                />
                <p id={id("internalNotes-hint")} className="mt-1 text-[11px] text-muted-foreground">
                  Staff only. Never shown to the intern.
                </p>
                <FieldError id={id("internalNotes-error")} message={fieldErrors.internalNotes} />
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-border/50 px-5 py-3">
              <Button variant="outline" size="sm" type="button" onClick={close} disabled={isSubmitting}>
                Cancel
              </Button>
              <Button size="sm" type="submit" isLoading={isSubmitting}>
                {isSubmitting ? "Saving…" : "Record outcome"}
              </Button>
            </div>
          </form>
        )}
      </AccessibleDialog>
    </>
  );
}
