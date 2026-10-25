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
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import {
  Settings,
  AlertCircle,
  CheckCircle2,
  LogOut,
  ShieldAlert,
} from "lucide-react";

interface EmployeeLifecycleCardProps {
  employeeId: string;
  currentStatus: EmployeeStatus;
  currentManagerId?: string | null;
  allStaff: Array<{ id: string; employeeCode: string; name: string }>;
  /** Opens a tab directly (the exit guidance link opens Offboarding). */
  initialTab?: "STATUS" | "MANAGER" | "DOC" | "EXIT";
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
  allStaff,
  initialTab = "STATUS",
}: EmployeeLifecycleCardProps) {
  const [status, setStatus] = useState<EmployeeStatus>(currentStatus);
  const [managerId, setManagerId] = useState(currentManagerId || "");
  const [remarks, setRemarks] = useState("");
  const [activeTab, setActiveTab] = useState<"STATUS" | "MANAGER" | "DOC" | "EXIT">(
    initialTab === "EXIT" && currentStatus === EmployeeStatus.EXITED ? "STATUS" : initialTab
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Exit process state
  const [lastWorkingDate, setLastWorkingDate] = useState("");
  const [exitReason, setExitReason] = useState("");

  const handleUpdateStatus = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
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
        setSuccess("Employee status updated successfully.");
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
    setSuccess(null);
    setIsSubmitting(true);

    const formData = new FormData();
    formData.append("employeeId", employeeId);
    if (managerId) {
      formData.append("managerId", managerId);
    }
    formData.append("remarks", remarks);

    try {
      const res = await assignEmployeeManagerAction(formData);
      if (!res.success) {
        setError(formatError(res));
      } else {
        setSuccess("Reporting manager updated successfully.");
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
    setSuccess(null);
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
        setSuccess("Exit recorded and status set to EXITED. Clearance remains pending.");
      }
    } catch {
      setError(UNEXPECTED_ERROR);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card id={EMPLOYEE_ADMINISTRATION_ANCHOR} className="border-border shadow-xs scroll-mt-6">
      <CardHeader className="pb-3 border-b border-border/50">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="space-y-1">
            <CardTitle className="text-base flex items-center gap-2">
              <Settings className="h-4 w-4 text-primary" /> Employee Administration Controls
            </CardTitle>
          </div>
          <div className="flex gap-1.5 bg-muted/60 p-1 rounded-md text-xs">
            <button
              type="button"
              onClick={() => setActiveTab("STATUS")}
              className={`px-2.5 py-1 rounded transition-colors ${activeTab === "STATUS" ? "bg-card text-foreground font-medium shadow-xs" : "text-muted-foreground"}`}
            >
              Status
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("MANAGER")}
              className={`px-2.5 py-1 rounded transition-colors ${activeTab === "MANAGER" ? "bg-card text-foreground font-medium shadow-xs" : "text-muted-foreground"}`}
            >
              Manager
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("DOC")}
              className={`px-2.5 py-1 rounded transition-colors ${activeTab === "DOC" ? "bg-card text-foreground font-medium shadow-xs" : "text-muted-foreground"}`}
            >
              Documents
            </button>
            {currentStatus !== EmployeeStatus.EXITED && (
              <button
                type="button"
                onClick={() => setActiveTab("EXIT")}
                className={`px-2.5 py-1 rounded transition-colors ${activeTab === "EXIT" ? "bg-card text-foreground font-medium shadow-xs" : "text-muted-foreground"}`}
              >
                Offboarding
              </button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-6 space-y-4 text-xs">
        {error && (
          <div
            role="alert"
            className="p-3 rounded-md bg-destructive/10 text-destructive border border-destructive/20 flex items-center gap-2"
          >
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div
            role="status"
            className="p-3 rounded-md bg-success/10 text-success border border-success/20 flex items-center gap-2"
          >
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>{success}</span>
          </div>
        )}

        {activeTab === "STATUS" && currentStatus === EmployeeStatus.EXITED && (
          <p className="text-muted-foreground">
            This employee has exited. The status changes again only if they are hired and marked as
            joined again, which starts a new employment period on this record.
          </p>
        )}

        {activeTab === "STATUS" && currentStatus !== EmployeeStatus.EXITED && (
          <form onSubmit={handleUpdateStatus} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="employee-lifecycle-card-change-lifecycle-status" className="block font-medium text-foreground mb-1">
                  Change Lifecycle Status
                </label>
                <select
                  id="employee-lifecycle-card-change-lifecycle-status"
                  value={status}
                  onChange={(e) => setStatus(e.target.value as EmployeeStatus)}
                  className="w-full px-3 py-2 rounded-md border border-input bg-background"
                >
                  <option value={EmployeeStatus.PROBATION}>Probation</option>
                  <option value={EmployeeStatus.ACTIVE}>Active</option>
                  <option value={EmployeeStatus.ON_LEAVE}>On Leave</option>
                </select>
                <p className="text-[11px] text-muted-foreground mt-1">
                  To mark an employee as exited, use the Offboarding tab so the exit is recorded.
                </p>
              </div>

              <div>
                <label htmlFor="employee-lifecycle-card-status-change-remarks" className="block font-medium text-foreground mb-1">
                  Status Change Remarks
                </label>
                <input
                  id="employee-lifecycle-card-status-change-remarks"
                  type="text"
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  placeholder="e.g. Probation review passed, Medical leave..."
                  className="w-full px-3 py-2 rounded-md border border-input bg-background"
                />
              </div>
            </div>

            <Button
              variant="primary"
              size="sm"
              type="submit"
              disabled={isSubmitting || status === currentStatus}
            >
              Update Status & Record History
            </Button>
          </form>
        )}

        {activeTab === "MANAGER" && (
          <form onSubmit={handleAssignManager} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="employee-lifecycle-card-assign-reporting-manager" className="block font-medium text-foreground mb-1">
                  Assign Reporting Manager
                </label>
                <select
                  id="employee-lifecycle-card-assign-reporting-manager"
                  value={managerId}
                  onChange={(e) => setManagerId(e.target.value)}
                  className="w-full px-3 py-2 rounded-md border border-input bg-background"
                >
                  <option value="">No Manager Assigned (Direct / Root)</option>
                  {allStaff
                    .filter((s) => s.id !== employeeId)
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.employeeCode})
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label htmlFor="employee-lifecycle-card-assignment-remarks" className="block font-medium text-foreground mb-1">
                  Assignment Remarks
                </label>
                <input
                  id="employee-lifecycle-card-assignment-remarks"
                  type="text"
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  placeholder="e.g. Reassigned following team reorganization"
                  className="w-full px-3 py-2 rounded-md border border-input bg-background"
                />
              </div>
            </div>

            <Button variant="primary" size="sm" type="submit" disabled={isSubmitting}>
              Update Reporting Line
            </Button>
          </form>
        )}

        {activeTab === "DOC" && (
          <div
            role="status"
            className="p-3 rounded-md bg-muted/40 border border-border/60 text-muted-foreground flex items-start gap-2"
          >
            <ShieldAlert className="h-4 w-4 text-warning shrink-0 mt-0.5" />
            <span>
              Document upload is not available yet. No file storage provider has been approved
              (OD-013), so document records cannot be attached until secure storage is configured.
            </span>
          </div>
        )}

        {activeTab === "EXIT" && (
          <form onSubmit={handleProcessExit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="employee-lifecycle-card-last-working-date" className="block font-medium text-foreground mb-1">
                  Last Working Date <span className="text-destructive">*</span>
                </label>
                <input
                  id="employee-lifecycle-card-last-working-date"
                  type="date"
                  required
                  value={lastWorkingDate}
                  onChange={(e) => setLastWorkingDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-md border border-input bg-background"
                />
              </div>

              <div>
                <label htmlFor="employee-lifecycle-card-reason-for-exit" className="block font-medium text-foreground mb-1">
                  Reason for Exit
                </label>
                <input
                  id="employee-lifecycle-card-reason-for-exit"
                  type="text"
                  value={exitReason}
                  onChange={(e) => setExitReason(e.target.value)}
                  placeholder="e.g. Relocation, Higher education, Resignation"
                  className="w-full px-3 py-2 rounded-md border border-input bg-background"
                />
              </div>
            </div>

            <Button variant="destructive" size="sm" type="submit" disabled={isSubmitting}>
              <LogOut className="h-3.5 w-3.5 mr-1" /> Record Exit & Transition to EXITED
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
