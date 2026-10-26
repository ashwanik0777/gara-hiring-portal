"use client";

import React, { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, ShieldCheck, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { markInternJoinedAction } from "../actions";
import { todayDateInputValue } from "../joining";
import { firstReviewDate, type ReviewPeriodMonths } from "../conversion-rules";
import type { ReportingManagerOption } from "../types";
import { AccessibleDialog } from "./accessible-dialog";
import {
  FieldError,
  InitialStatusField,
  joiningInputClass,
  ReviewPeriodField,
  type JoiningInitialStatus,
} from "./joining-fields";

function formatReviewDay(date: Date): string {
  return date.toLocaleDateString("en-GB", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
}

export interface MarkInternJoinedPanelProps {
  open: boolean;
  onClose: () => void;
  /** Called once the joining was recorded (the trigger then shows the confirmation). */
  onJoined: () => void;
  enrollmentId: string;
  candidateName: string;
  /** Prefill from the internship opening's own department (editable). */
  defaultDepartment: string;
  /** Prefill from the internship opening's title (editable). */
  defaultDesignation: string;
  managerOptions: ReportingManagerOption[];
  /**
   * Re-joining: the person's exited employee record is reused, so its employee code is
   * prefilled and read-only (product-owner decision 2026-10-25).
   */
  existingEmployeeCode?: string | null;
}

/**
 * Dialog body for internship step 2: HR records that an intern whose evaluation PASSED has
 * joined and chooses when the first progress review takes place (3 or 6 months, no default).
 * The server re-checks every rule (role, permission, PASSED, no current record, joining date
 * not in the future) before creating or reusing the record and granting the INTERN role.
 * Loaded lazily by `MarkInternJoinedDialog` when the trigger is first used.
 */
export function MarkInternJoinedPanel({
  open,
  onClose,
  onJoined,
  enrollmentId,
  candidateName,
  defaultDepartment,
  defaultDesignation,
  managerOptions,
  existingEmployeeCode = null,
}: MarkInternJoinedPanelProps) {
  const isRejoin = Boolean(existingEmployeeCode);
  const router = useRouter();
  const baseId = useId();
  const ids = {
    title: `${baseId}-title`,
    description: `${baseId}-description`,
    code: `${baseId}-code`,
    date: `${baseId}-date`,
    department: `${baseId}-department`,
    designation: `${baseId}-designation`,
    manager: `${baseId}-manager`,
  };

  // No invented defaults: the employee numbering series and the joining day are entered by HR.
  // A returning person keeps their existing code.
  const [employeeCode, setEmployeeCode] = useState(existingEmployeeCode ?? "");
  const [joiningDate, setJoiningDate] = useState("");
  const [department, setDepartment] = useState(defaultDepartment);
  const [designation, setDesignation] = useState(defaultDesignation);
  const [initialStatus, setInitialStatus] = useState<JoiningInitialStatus | "">("");
  const [managerId, setManagerId] = useState("");
  const [reviewAfterMonths, setReviewAfterMonths] = useState<ReviewPeriodMonths | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const close = () => {
    if (isSubmitting) return;
    onClose();
    setError(null);
    setFieldErrors({});
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setFieldErrors({});

    const missing: Record<string, string> = {};
    if (!initialStatus) {
      missing.initialStatus = "Choose the initial employment status (Active or Probation)";
    }
    if (!reviewAfterMonths) {
      missing.reviewAfterMonths = "Choose when the progress review takes place (after 3 or 6 months)";
    }
    if (!initialStatus || !reviewAfterMonths) {
      setFieldErrors(missing);
      return;
    }

    setIsSubmitting(true);
    const formData = new FormData();
    formData.append("enrollmentId", enrollmentId);
    formData.append("employeeCode", employeeCode);
    formData.append("joiningDate", joiningDate);
    formData.append("department", department);
    formData.append("designation", designation);
    formData.append("initialStatus", initialStatus);
    formData.append("managerId", managerId);
    formData.append("reviewAfterMonths", String(reviewAfterMonths));

    try {
      const res = await markInternJoinedAction(formData);
      if (!res.success) {
        setError(res.error);
        setFieldErrors(res.fieldErrors ?? {});
        return;
      }
      onJoined();
      router.refresh();
    } catch {
      setError("We couldn't mark the intern as joined. Please check your connection and try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <AccessibleDialog
        open={open}
        onClose={close}
        labelledBy={ids.title}
        describedBy={ids.description}
        busy={isSubmitting}
      >
        <form onSubmit={handleSubmit}>
          <div className="border-b border-border/50 px-5 py-4">
            <h2 id={ids.title} className="flex items-center gap-2 text-base font-semibold text-foreground">
              <UserPlus className="h-4 w-4 text-primary" aria-hidden="true" />{" "}
              {isRejoin ? "Mark as re-joined" : "Mark as joined"}: {candidateName}
            </h2>
          </div>

          <div className="space-y-4 px-5 py-4 text-xs">
            <div
              id={ids.description}
              className="flex items-start gap-2 rounded-lg border border-border/40 bg-muted/40 p-3 text-muted-foreground"
            >
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden="true" />
              <span>
                {isRejoin ? (
                  <>
                    {candidateName} worked here before. Their existing employee record and code are reused
                    and a new employment period starts; earlier periods stay as history.{" "}
                  </>
                ) : (
                  <>This creates the intern employee record. </>
                )}
                Records that {candidateName} has joined as an intern after passing the supervised
                evaluation, moves the application to HIRED, grants the INTERN role (intern workspace,
                attendance, leave, payslips, ID card &amp; certificate), schedules the first progress
                review and emails a welcome message. It cannot be undone from this screen.
              </span>
            </div>

            {error && (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-destructive"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{error}</span>
              </div>
            )}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor={ids.code} className="mb-1 block font-medium text-foreground">
                  Employee code <span className="text-destructive">*</span>
                </label>
                <input
                  id={ids.code}
                  type="text"
                  required
                  autoComplete="off"
                  value={employeeCode}
                  readOnly={isRejoin}
                  onChange={(e) => setEmployeeCode(e.target.value.toUpperCase())}
                  placeholder="Uppercase letters, digits, - or _"
                  aria-invalid={Boolean(fieldErrors.employeeCode)}
                  aria-describedby={
                    [isRejoin ? `${ids.code}-hint` : null, fieldErrors.employeeCode ? `${ids.code}-error` : null]
                      .filter(Boolean)
                      .join(" ") || undefined
                  }
                  disabled={isSubmitting}
                  className={`${joiningInputClass} font-mono ${isRejoin ? "bg-muted" : ""}`}
                />
                {isRejoin && (
                  <p id={`${ids.code}-hint`} className="mt-1 text-[11px] text-muted-foreground">
                    Existing employee code, kept for a returning person.
                  </p>
                )}
                <FieldError id={`${ids.code}-error`} message={fieldErrors.employeeCode} />
              </div>

              <div>
                <label htmlFor={ids.date} className="mb-1 block font-medium text-foreground">
                  Joining date <span className="text-destructive">*</span>
                </label>
                <input
                  id={ids.date}
                  type="date"
                  required
                  max={todayDateInputValue()}
                  value={joiningDate}
                  onChange={(e) => setJoiningDate(e.target.value)}
                  aria-invalid={Boolean(fieldErrors.joiningDate)}
                  aria-describedby={`${ids.date}-hint${fieldErrors.joiningDate ? ` ${ids.date}-error` : ""}`}
                  disabled={isSubmitting}
                  className={joiningInputClass}
                />
                <p id={`${ids.date}-hint`} className="mt-1 text-[11px] text-muted-foreground">
                  The intern&apos;s first day. It cannot be in the future.
                </p>
                <FieldError id={`${ids.date}-error`} message={fieldErrors.joiningDate} />
              </div>

              <div>
                <label htmlFor={ids.department} className="mb-1 block font-medium text-foreground">
                  Department <span className="text-destructive">*</span>
                </label>
                <input
                  id={ids.department}
                  type="text"
                  required
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  aria-invalid={Boolean(fieldErrors.department)}
                  aria-describedby={fieldErrors.department ? `${ids.department}-error` : undefined}
                  disabled={isSubmitting}
                  className={joiningInputClass}
                />
                <FieldError id={`${ids.department}-error`} message={fieldErrors.department} />
              </div>

              <div>
                <label htmlFor={ids.designation} className="mb-1 block font-medium text-foreground">
                  Designation <span className="text-destructive">*</span>
                </label>
                <input
                  id={ids.designation}
                  type="text"
                  required
                  value={designation}
                  onChange={(e) => setDesignation(e.target.value)}
                  aria-invalid={Boolean(fieldErrors.designation)}
                  aria-describedby={fieldErrors.designation ? `${ids.designation}-error` : undefined}
                  disabled={isSubmitting}
                  className={joiningInputClass}
                />
                <FieldError id={`${ids.designation}-error`} message={fieldErrors.designation} />
              </div>
            </div>

            <InitialStatusField
              value={initialStatus}
              onChange={setInitialStatus}
              error={fieldErrors.initialStatus}
              disabled={isSubmitting}
            />

            <ReviewPeriodField
              legend="Progress review after"
              hint={
                reviewAfterMonths && joiningDate
                  ? `The review is scheduled for ${formatReviewDay(firstReviewDate(new Date(joiningDate), reviewAfterMonths))}. Its outcome decides on a full-time offer, an extension or the end of the internship.`
                  : "The review decides on a full-time offer, an extension or the end of the internship."
              }
              value={reviewAfterMonths}
              onChange={setReviewAfterMonths}
              error={fieldErrors.reviewAfterMonths}
              disabled={isSubmitting}
            />

            <div>
              <label htmlFor={ids.manager} className="mb-1 block font-medium text-foreground">
                Reporting manager (optional)
              </label>
              <select
                id={ids.manager}
                value={managerId}
                onChange={(e) => setManagerId(e.target.value)}
                aria-invalid={Boolean(fieldErrors.managerId)}
                aria-describedby={fieldErrors.managerId ? `${ids.manager}-error` : undefined}
                disabled={isSubmitting}
                className={joiningInputClass}
              >
                <option value="">No reporting manager yet</option>
                {managerOptions.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} — {m.designation} ({m.employeeCode})
                  </option>
                ))}
              </select>
              {managerOptions.length === 0 && (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  No active employee records exist yet, so no reporting manager can be chosen.
                </p>
              )}
              <FieldError id={`${ids.manager}-error`} message={fieldErrors.managerId} />
            </div>
          </div>

          <div className="flex justify-end gap-2 border-t border-border/50 px-5 py-3">
            <Button variant="outline" size="sm" type="button" onClick={close} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button size="sm" type="submit" isLoading={isSubmitting}>
              {isSubmitting
                ? "Saving…"
                : isRejoin
                  ? "Confirm: mark as re-joined"
                  : "Confirm: mark as joined"}
            </Button>
          </div>
        </form>
      </AccessibleDialog>
    </>
  );
}
