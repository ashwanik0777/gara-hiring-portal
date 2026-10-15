"use client";

import React, { useState } from "react";
import { EmployeeStatus } from "../types";
import {
  updateEmployeeStatusAction,
  assignEmployeeManagerAction,
  addEmployeeDocumentAction,
  processEmployeeExitAction,
} from "../actions";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import {
  Settings,
  AlertCircle,
  CheckCircle2,
  LogOut,
} from "lucide-react";

interface EmployeeLifecycleCardProps {
  employeeId: string;
  currentStatus: EmployeeStatus;
  currentManagerId?: string | null;
  allStaff: Array<{ id: string; employeeCode: string; name: string }>;
}

export function EmployeeLifecycleCard({
  employeeId,
  currentStatus,
  currentManagerId,
  allStaff,
}: EmployeeLifecycleCardProps) {
  const [status, setStatus] = useState<EmployeeStatus>(currentStatus);
  const [managerId, setManagerId] = useState(currentManagerId || "");
  const [remarks, setRemarks] = useState("");
  const [activeTab, setActiveTab] = useState<"STATUS" | "MANAGER" | "DOC" | "EXIT">("STATUS");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Document upload state
  const [docType, setDocType] = useState("GOVERNMENT_ID");
  const [docTitle, setDocTitle] = useState("");
  const [storageKey, setStorageKey] = useState("");

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
        setError(res.error);
      } else {
        setSuccess("Employee status updated successfully.");
      }
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
        setError(res.error);
      } else {
        setSuccess("Reporting manager updated successfully.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setIsSubmitting(true);

    const formData = new FormData();
    formData.append("employeeId", employeeId);
    formData.append("documentType", docType);
    formData.append("title", docTitle);
    formData.append("storageKey", storageKey || `documents/${employeeId}/${Date.now()}-${docType.toLowerCase()}`);
    formData.append("mimeType", "application/pdf");
    formData.append("fileSizeBytes", "1048576"); // 1MB mock

    try {
      const res = await addEmployeeDocumentAction(formData);
      if (!res.success) {
        setError(res.error);
      } else {
        setSuccess("Document metadata attached successfully.");
        setDocTitle("");
        setStorageKey("");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleProcessExit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!confirm("Are you sure you want to finalize offboarding and mark employee as EXITED?")) return;

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
        setError(res.error);
      } else {
        setSuccess("Employee exit processed. Status transitioned to EXITED.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card className="border-border shadow-xs">
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
          <div className="p-3 rounded-md bg-destructive/10 text-destructive border border-destructive/20 flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="p-3 rounded-md bg-success/10 text-success border border-success/20 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>{success}</span>
          </div>
        )}

        {activeTab === "STATUS" && (
          <form onSubmit={handleUpdateStatus} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block font-medium text-foreground mb-1">
                  Change Lifecycle Status
                </label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as EmployeeStatus)}
                  className="w-full px-3 py-2 rounded-md border border-input bg-background"
                >
                  <option value={EmployeeStatus.PROBATION}>Probation</option>
                  <option value={EmployeeStatus.ACTIVE}>Active</option>
                  <option value={EmployeeStatus.ON_LEAVE}>On Leave</option>
                  <option value={EmployeeStatus.EXITED}>Exited</option>
                </select>
              </div>

              <div>
                <label className="block font-medium text-foreground mb-1">
                  Status Change Remarks
                </label>
                <input
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
                <label className="block font-medium text-foreground mb-1">
                  Assign Reporting Manager
                </label>
                <select
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
                <label className="block font-medium text-foreground mb-1">
                  Assignment Remarks
                </label>
                <input
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
          <form onSubmit={handleAddDocument} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block font-medium text-foreground mb-1">
                  Document Type
                </label>
                <select
                  value={docType}
                  onChange={(e) => setDocType(e.target.value)}
                  className="w-full px-3 py-2 rounded-md border border-input bg-background"
                >
                  <option value="GOVERNMENT_ID">Government ID</option>
                  <option value="DEGREE_CERTIFICATE">Degree Certificate</option>
                  <option value="OFFER_LETTER">Signed Offer Letter</option>
                  <option value="RELIEVING_LETTER">Relieving Letter</option>
                  <option value="BACKGROUND_CHECK">Background Verification</option>
                </select>
              </div>

              <div>
                <label className="block font-medium text-foreground mb-1">
                  Title
                </label>
                <input
                  type="text"
                  required
                  value={docTitle}
                  onChange={(e) => setDocTitle(e.target.value)}
                  placeholder="e.g. Passport copy, B.Tech Degree"
                  className="w-full px-3 py-2 rounded-md border border-input bg-background"
                />
              </div>

              <div>
                <label className="block font-medium text-foreground mb-1">
                  Private Storage Key
                </label>
                <input
                  type="text"
                  value={storageKey}
                  onChange={(e) => setStorageKey(e.target.value)}
                  placeholder="Auto-generated if blank"
                  className="w-full px-3 py-2 rounded-md border border-input bg-background"
                />
              </div>
            </div>

            <Button variant="primary" size="sm" type="submit" disabled={isSubmitting}>
              Attach Document Record
            </Button>
          </form>
        )}

        {activeTab === "EXIT" && (
          <form onSubmit={handleProcessExit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block font-medium text-foreground mb-1">
                  Last Working Date <span className="text-destructive">*</span>
                </label>
                <input
                  type="date"
                  required
                  value={lastWorkingDate}
                  onChange={(e) => setLastWorkingDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-md border border-input bg-background"
                />
              </div>

              <div>
                <label className="block font-medium text-foreground mb-1">
                  Reason for Exit
                </label>
                <input
                  type="text"
                  value={exitReason}
                  onChange={(e) => setExitReason(e.target.value)}
                  placeholder="e.g. Relocation, Higher education, Resignation"
                  className="w-full px-3 py-2 rounded-md border border-input bg-background"
                />
              </div>
            </div>

            <Button variant="destructive" size="sm" type="submit" disabled={isSubmitting}>
              <LogOut className="h-3.5 w-3.5 mr-1" /> Finalize Offboarding & Transition to EXITED
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
