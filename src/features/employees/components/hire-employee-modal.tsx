"use client";

import React, { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { hireEmployeeFromApplicationAction } from "../actions";
import { todayDateInputValue } from "../joining";
import { Button } from "@/components/ui/button";
import { UserPlus, AlertCircle, ShieldCheck } from "lucide-react";
import { AccessibleDialog } from "./accessible-dialog";
import {
  FieldError,
  InitialStatusField,
  joiningInputClass,
  type JoiningInitialStatus,
} from "./joining-fields";

interface HireEmployeeModalProps {
  applicationId: string;
  candidateName: string;
  defaultDepartment: string;
  defaultDesignation: string;
  /** Agreed joining date when it has already been reached, otherwise "" (see `joiningDatePrefill`). */
  defaultJoiningDate: string;
  /**
   * Re-joining: the person's exited employee record is reused, so its employee code is
   * prefilled and read-only and earlier confidential details are kept (decision 2026-10-25).
   */
  existingEmployeeCode?: string | null;
  onClose: () => void;
}

/**
 * Full-time "Mark as joined": records that a candidate with an accepted offer has joined.
 * The server re-checks the accepted offer, separation of duties, permissions and that the
 * joining date is not in the future before granting the EMPLOYEE role.
 */
export function HireEmployeeModal({
  applicationId,
  candidateName,
  defaultDepartment,
  defaultDesignation,
  defaultJoiningDate,
  existingEmployeeCode = null,
  onClose,
}: HireEmployeeModalProps) {
  const isRejoin = Boolean(existingEmployeeCode);
  const router = useRouter();
  const baseId = useId();
  const id = (suffix: string) => `${baseId}-${suffix}`;

  // No pre-filled code for a new record (the numbering series is not defined); a returning
  // person keeps their existing code.
  const [employeeCode, setEmployeeCode] = useState(existingEmployeeCode ?? "");
  const [department, setDepartment] = useState(defaultDepartment);
  const [designation, setDesignation] = useState(defaultDesignation);
  const [joiningDate, setJoiningDate] = useState(defaultJoiningDate);
  const [initialStatus, setInitialStatus] = useState<JoiningInitialStatus | "">("");
  const [personalPhone, setPersonalPhone] = useState("");
  const [ecName, setEcName] = useState("");
  const [ecRel, setEcRel] = useState("");
  const [ecPhone, setEcPhone] = useState("");
  const [internalNotes, setInternalNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const close = () => {
    if (!isSubmitting) onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setFieldErrors({});

    if (!initialStatus) {
      setFieldErrors({ initialStatus: "Choose the initial employment status (Active or Probation)" });
      return;
    }

    setIsSubmitting(true);

    const formData = new FormData();
    formData.append("applicationId", applicationId);
    formData.append("employeeCode", employeeCode);
    formData.append("department", department);
    formData.append("designation", designation);
    formData.append("joiningDate", joiningDate);
    formData.append("initialStatus", initialStatus);
    if (!isRejoin) {
      // A re-join keeps the confidential details recorded during the earlier employment.
      formData.append("personalPhone", personalPhone);
      formData.append("emergencyContactName", ecName);
      formData.append("emergencyContactRelation", ecRel);
      formData.append("emergencyContactPhone", ecPhone);
      formData.append("internalNotes", internalNotes);
    }

    try {
      const res = await hireEmployeeFromApplicationAction(formData);
      if (!res.success) {
        setError(res.error);
        setFieldErrors(res.fieldErrors ?? {});
      } else {
        onClose();
        // Stay on the current portal page; it re-renders with the HIRED status.
        router.refresh();
      }
    } catch {
      setError("We couldn't mark the employee as joined. Please check your connection and try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const describedBy = (field: string, extra?: string) =>
    [extra, fieldErrors[field] ? id(`${field}-error`) : null].filter(Boolean).join(" ") || undefined;

  return (
    <AccessibleDialog
      open
      onClose={close}
      labelledBy={id("title")}
      describedBy={id("description")}
      busy={isSubmitting}
    >
      <form onSubmit={handleSubmit}>
        <div className="border-b border-border/50 px-5 py-4">
          <h2 id={id("title")} className="flex items-center gap-2 text-base font-semibold text-foreground">
            <UserPlus className="h-4 w-4 text-primary" aria-hidden="true" />{" "}
            {isRejoin ? "Mark as re-joined" : "Mark as joined"}: {candidateName}
          </h2>
        </div>

        <div className="space-y-4 px-5 py-4 text-xs">
          <div
            id={id("description")}
            className="flex items-start gap-2 rounded-lg border border-border/40 bg-muted/40 p-3 text-muted-foreground"
          >
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden="true" />
            <span>
              {isRejoin ? (
                <>
                  Requires an offer the candidate has accepted (OFFER_ACCEPTED). {candidateName} worked here
                  before: their existing employee record and code are reused and a new employment period
                  starts, while earlier periods stay as history. Marking them as re-joined grants the
                  EMPLOYEE role (employee home, attendance, leave, payslips), moves the application to HIRED
                  and emails a welcome-back message.
                </>
              ) : (
                <>
                  Requires an offer the candidate has accepted (OFFER_ACCEPTED). Marking {candidateName} as
                  joined creates the full-time employee record, grants the EMPLOYEE role (employee home,
                  attendance, leave, payslips), starts the onboarding checklist, moves the application to
                  HIRED and emails a welcome message.
                </>
              )}
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

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label htmlFor={id("employeeCode")} className="mb-1 block font-medium text-foreground">
                Employee code <span className="text-destructive">*</span>
              </label>
              <input
                id={id("employeeCode")}
                type="text"
                required
                autoComplete="off"
                value={employeeCode}
                readOnly={isRejoin}
                onChange={(e) => setEmployeeCode(e.target.value.toUpperCase())}
                placeholder="Uppercase letters, digits, - or _"
                aria-invalid={Boolean(fieldErrors.employeeCode)}
                aria-describedby={describedBy("employeeCode", isRejoin ? id("employeeCode-hint") : undefined)}
                disabled={isSubmitting}
                className={`${joiningInputClass} font-mono ${isRejoin ? "bg-muted" : ""}`}
              />
              {isRejoin && (
                <p id={id("employeeCode-hint")} className="mt-1 text-[11px] text-muted-foreground">
                  Existing employee code, kept for a returning person.
                </p>
              )}
              <FieldError id={id("employeeCode-error")} message={fieldErrors.employeeCode} />
            </div>

            <div>
              <label htmlFor={id("joiningDate")} className="mb-1 block font-medium text-foreground">
                Joining date <span className="text-destructive">*</span>
              </label>
              <input
                id={id("joiningDate")}
                type="date"
                required
                max={todayDateInputValue()}
                value={joiningDate}
                onChange={(e) => setJoiningDate(e.target.value)}
                aria-invalid={Boolean(fieldErrors.joiningDate)}
                aria-describedby={describedBy("joiningDate", id("joiningDate-hint"))}
                disabled={isSubmitting}
                className={joiningInputClass}
              />
              <p id={id("joiningDate-hint")} className="mt-1 text-[11px] text-muted-foreground">
                The employee&apos;s first day. It cannot be in the future.
              </p>
              <FieldError id={id("joiningDate-error")} message={fieldErrors.joiningDate} />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
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
                aria-invalid={Boolean(fieldErrors.department)}
                aria-describedby={describedBy("department")}
                disabled={isSubmitting}
                className={joiningInputClass}
              />
              <FieldError id={id("department-error")} message={fieldErrors.department} />
            </div>

            <div>
              <label htmlFor={id("designation")} className="mb-1 block font-medium text-foreground">
                Designation <span className="text-destructive">*</span>
              </label>
              <input
                id={id("designation")}
                type="text"
                required
                value={designation}
                onChange={(e) => setDesignation(e.target.value)}
                aria-invalid={Boolean(fieldErrors.designation)}
                aria-describedby={describedBy("designation")}
                disabled={isSubmitting}
                className={joiningInputClass}
              />
              <FieldError id={id("designation-error")} message={fieldErrors.designation} />
            </div>
          </div>

          <InitialStatusField
            value={initialStatus}
            onChange={setInitialStatus}
            error={fieldErrors.initialStatus}
            disabled={isSubmitting}
          />

          {isRejoin ? (
            <p className="rounded-lg border border-border/40 bg-muted/30 p-3 text-muted-foreground">
              Confidential details (personal phone, emergency contact, HR notes) recorded during the earlier
              employment are kept on the record.
            </p>
          ) : (
            <>
              <fieldset className="border-t border-border/40 pt-3" disabled={isSubmitting}>
                <legend className="mb-2 font-semibold text-foreground">
                  Confidential employee details (HR, Admin and the employee only)
                </legend>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div>
                    <label htmlFor={id("personalPhone")} className="mb-1 block font-medium text-foreground">
                      Personal phone
                    </label>
                    <input
                      id={id("personalPhone")}
                      type="tel"
                      value={personalPhone}
                      onChange={(e) => setPersonalPhone(e.target.value)}
                      className={joiningInputClass}
                    />
                  </div>

                  <div>
                    <label htmlFor={id("ecName")} className="mb-1 block font-medium text-foreground">
                      Emergency contact name
                    </label>
                    <input
                      id={id("ecName")}
                      type="text"
                      value={ecName}
                      onChange={(e) => setEcName(e.target.value)}
                      className={joiningInputClass}
                    />
                  </div>

                  <div>
                    <label htmlFor={id("ecRel")} className="mb-1 block font-medium text-foreground">
                      Relationship
                    </label>
                    <input
                      id={id("ecRel")}
                      type="text"
                      value={ecRel}
                      onChange={(e) => setEcRel(e.target.value)}
                      className={joiningInputClass}
                    />
                  </div>

                  <div>
                    <label htmlFor={id("ecPhone")} className="mb-1 block font-medium text-foreground">
                      Emergency phone
                    </label>
                    <input
                      id={id("ecPhone")}
                      type="tel"
                      value={ecPhone}
                      onChange={(e) => setEcPhone(e.target.value)}
                      className={joiningInputClass}
                    />
                  </div>
                </div>
                {fieldErrors.emergencyContact && (
                  <p className="mt-1 text-xs text-destructive">{fieldErrors.emergencyContact}</p>
                )}
              </fieldset>

              <div>
                <label htmlFor={id("internalNotes")} className="mb-1 block font-medium text-foreground">
                  Internal HR / onboarding notes
                </label>
                <textarea
                  id={id("internalNotes")}
                  rows={2}
                  value={internalNotes}
                  onChange={(e) => setInternalNotes(e.target.value)}
                  disabled={isSubmitting}
                  className={`${joiningInputClass} resize-y`}
                />
              </div>
            </>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-border/50 px-5 py-3">
          <Button variant="outline" size="sm" type="button" onClick={close} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" type="submit" isLoading={isSubmitting}>
            {isSubmitting ? "Saving…" : isRejoin ? "Confirm: mark as re-joined" : "Confirm: mark as joined"}
          </Button>
        </div>
      </form>
    </AccessibleDialog>
  );
}
