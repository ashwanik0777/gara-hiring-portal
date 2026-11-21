"use client";

import React, { useState } from "react";
import { EmployeeStatus } from "../types";
import {
  updateEmployeeStatusAction,
  assignEmployeeManagerAction,
  processEmployeeExitAction,
  type EmployeeActionResult,
} from "../actions";
import { Button } from "@/components/ui/button";
import {
  ReportingManagerCombobox,
  formatReportingManagerLabel,
  type ReportingManagerChoice,
} from "./reporting-manager-combobox";
import { Settings, AlertCircle, LogOut, ShieldAlert } from "lucide-react";
import { toast } from "@/components/ui/toast";
import { ChoiceTiles, FieldLabelRow, fieldInputClass, fieldOkBorder, type ChoiceOption } from "@/components/ui/form-field";
import { cn } from "@/lib/utils";
import { EmployeeSectionCard } from "./employee-section-card";

type Tab = "STATUS" | "MANAGER" | "DOC" | "EXIT";

/** Exited is not offered: an exit is recorded from the Offboarding tab. */
const STATUS_CHOICES: Array<ChoiceOption<EmployeeStatus>> = [
  { value: EmployeeStatus.PROBATION, label: "Probation" },
  { value: EmployeeStatus.ACTIVE, label: "Active" },
  { value: EmployeeStatus.ON_LEAVE, label: "On Leave" },
];

interface EmployeeLifecycleCardProps {
  employeeId: string;
  currentStatus: EmployeeStatus;
  currentManagerId?: string | null;
  /** Display label of the current manager ("Name (CODE)"); looked up in `allStaff` when omitted. */
  currentManagerLabel?: string | null;
  /** First reporting-manager options loaded by the page (shown on focus; search finds the rest). */
  allStaff: Array<{ id: string; employeeCode: string; name: string }>;
  /** Opens a tab directly (the exit guidance link opens Offboarding). */
  initialTab?: Tab;
}

function formatError(res: Extract<EmployeeActionResult, { success: false }>): string {
  const details = Object.values(res.fieldErrors ?? {});
  return details.length > 0 ? `${res.error} ${details.join(" ")}` : res.error;
}

/** Anchor used by guidance links (e.g. "Process exit" after an END_INTERNSHIP review). */
export const EMPLOYEE_ADMINISTRATION_ANCHOR = "employee-administration";

const UNEXPECTED_ERROR = "Something went wrong. Please check your connection and try again.";

export function EmployeeLifecycleCard({
  employeeId,
  currentStatus,
  currentManagerId,
  currentManagerLabel,
  allStaff,
  initialTab = "STATUS",
}: EmployeeLifecycleCardProps) {
  const [status, setStatus] = useState<EmployeeStatus>(currentStatus);
  const [manager, setManager] = useState<ReportingManagerChoice | null>(() => {
    if (!currentManagerId) return null;
    const known = allStaff.find((s) => s.id === currentManagerId);
    return {
      id: currentManagerId,
      label: currentManagerLabel || (known ? formatReportingManagerLabel(known) : "Current manager"),
    };
  });
  const [remarks, setRemarks] = useState("");
  const tabIdPrefix = React.useId();
  const [activeTab, setActiveTab] = useState<Tab>(
    initialTab === "EXIT" && currentStatus === EmployeeStatus.EXITED ? "STATUS" : initialTab
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Exit process state
  const [lastWorkingDate, setLastWorkingDate] = useState("");
  const [exitReason, setExitReason] = useState("");

  const handleUpdateStatus = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const formData = new FormData();
    formData.append("employeeId", employeeId);
    formData.append("toStatus", status);
    formData.append("remarks", remarks);

    try {
      const res = await updateEmployeeStatusAction(formData);
      if (!res.success) {
        setError(formatError(res));
      } else {
        toast.success("Employee status updated successfully.");
      }
    } catch {
      setError(UNEXPECTED_ERROR);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAssignManager = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const formData = new FormData();
    formData.append("employeeId", employeeId);
    if (manager) {
      formData.append("managerId", manager.id);
    }
    formData.append("remarks", remarks);

    try {
      const res = await assignEmployeeManagerAction(formData);
      if (!res.success) {
        setError(formatError(res));
      } else {
        toast.success("Reporting manager updated successfully.");
      }
    } catch {
      setError(UNEXPECTED_ERROR);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleProcessExit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (
      !confirm(
        "Record this exit and mark the employee as EXITED? The current employment period ends on the last working date."
      )
    )
      return;

    setError(null);
    setIsSubmitting(true);

    const formData = new FormData();
    formData.append("employeeId", employeeId);
    formData.append("lastWorkingDate", lastWorkingDate);
    formData.append("reason", exitReason);

    try {
      const res = await processEmployeeExitAction(formData);
      if (!res.success) {
        setError(formatError(res));
      } else {
        toast.success("Exit recorded and status set to EXITED. Clearance remains pending.");
      }
    } catch {
      setError(UNEXPECTED_ERROR);
    } finally {
      setIsSubmitting(false);
    }
  };

  const tabs: Array<{ key: Tab; label: string }> = [
    { key: "STATUS", label: "Status" },
    { key: "MANAGER", label: "Manager" },
    { key: "DOC", label: "Documents" },
    ...(currentStatus !== EmployeeStatus.EXITED ? [{ key: "EXIT" as const, label: "Offboarding" }] : []),
  ];

  return (
    <EmployeeSectionCard
      id={EMPLOYEE_ADMINISTRATION_ANCHOR}
      className="scroll-mt-6"
      title="Manage Employee"
      icon={Settings}
      action={
        <div role="tablist" aria-label="Manage employee" className="grid w-full grid-cols-2 gap-1 rounded-xl border border-border bg-muted/40 p-1 sm:flex sm:w-auto">
          {tabs.map((tab) => {
            const selected = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                role="tab"
                id={`${tabIdPrefix}-${tab.key}`}
                aria-selected={selected}
                aria-controls={`${tabIdPrefix}-panel`}
                onClick={() => {
                  setActiveTab(tab.key);
                  setError(null);
                }}
                className={cn(
                  "whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                  selected ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      }
    >
      <div role="tabpanel" id={`${tabIdPrefix}-panel`} aria-labelledby={`${tabIdPrefix}-${activeTab}`} className="space-y-4">
        {error && (
          <div role="alert" className="flex items-center gap-2 rounded-xl border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </div>
        )}

        {activeTab === "STATUS" && currentStatus === EmployeeStatus.EXITED && (
          <p className="text-sm text-muted-foreground">
            This employee has exited. The status changes again only if they are hired and marked as joined again, which starts a new
            employment period on this record.
          </p>
        )}

        {activeTab === "STATUS" && currentStatus !== EmployeeStatus.EXITED && (
          <form onSubmit={handleUpdateStatus} className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1.5fr)_auto] lg:items-end">
            <ChoiceTiles
              legend="Status"
              columns="grid-cols-3"
              options={STATUS_CHOICES}
              inputProps={(value) => ({
                name: "toStatus",
                checked: status === value,
                onChange: () => setStatus(value),
              })}
            />
            <div className="space-y-2">
              <FieldLabelRow htmlFor="employee-lifecycle-card-status-change-remarks" label="Remarks" optional />
              <input
                id="employee-lifecycle-card-status-change-remarks"
                type="text"
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                placeholder="Probation review passed"
                maxLength={500}
                className={cn(fieldInputClass, fieldOkBorder)}
              />
            </div>
            <Button type="submit" isLoading={isSubmitting} disabled={status === currentStatus} className="h-11 rounded-xl px-5">
              Update status
            </Button>
          </form>
        )}

        {activeTab === "MANAGER" && (
          <form onSubmit={handleAssignManager} className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1.5fr)_auto] lg:items-end">
            <div className="space-y-2">
              <FieldLabelRow htmlFor="employee-lifecycle-card-assign-reporting-manager" label="Reporting manager" />
              <ReportingManagerCombobox
                inputId="employee-lifecycle-card-assign-reporting-manager"
                excludeEmployeeId={employeeId}
                value={manager}
                onChange={setManager}
                initialOptions={allStaff}
                disabled={isSubmitting}
              />
            </div>
            <div className="space-y-2">
              <FieldLabelRow htmlFor="employee-lifecycle-card-assignment-remarks" label="Remarks" optional />
              <input
                id="employee-lifecycle-card-assignment-remarks"
                type="text"
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                placeholder="Team reorganisation"
                maxLength={500}
                className={cn(fieldInputClass, fieldOkBorder)}
              />
            </div>
            <Button type="submit" isLoading={isSubmitting} className="h-11 rounded-xl px-5">
              Update manager
            </Button>
          </form>
        )}

        {activeTab === "DOC" && (
          <div role="status" className="flex items-start gap-2 rounded-xl border border-border/60 bg-muted/40 p-4 text-sm text-muted-foreground">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
            <span>Document upload is not available yet: no secure file storage has been approved (OD-013).</span>
          </div>
        )}

        {activeTab === "EXIT" && (
          <form onSubmit={handleProcessExit} className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.8fr)_auto] lg:items-end">
            <div className="space-y-2">
              <FieldLabelRow htmlFor="employee-lifecycle-card-last-working-date" label="Last working day" />
              <input
                id="employee-lifecycle-card-last-working-date"
                type="date"
                required
                value={lastWorkingDate}
                onChange={(e) => setLastWorkingDate(e.target.value)}
                className={cn(fieldInputClass, fieldOkBorder)}
              />
            </div>
            <div className="space-y-2">
              <FieldLabelRow htmlFor="employee-lifecycle-card-reason-for-exit" label="Reason" optional />
              <input
                id="employee-lifecycle-card-reason-for-exit"
                type="text"
                value={exitReason}
                onChange={(e) => setExitReason(e.target.value)}
                placeholder="Resignation, higher studies, relocation"
                maxLength={500}
                className={cn(fieldInputClass, fieldOkBorder)}
              />
            </div>
            <Button variant="destructive" type="submit" isLoading={isSubmitting} className="h-11 gap-1.5 rounded-xl px-5">
              <LogOut className="h-4 w-4" aria-hidden="true" /> Record exit
            </Button>
          </form>
        )}
      </div>
    </EmployeeSectionCard>
  );
}
