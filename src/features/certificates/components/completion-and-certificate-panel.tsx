"use client";

import React, { useState } from "react";
import { CertificateDetail, CompletionStatus } from "../types";
import { recordCompletionChecklistAction, issueCertificateAction, reissueCertificateAction } from "../actions";
import { CertificateCard } from "./certificate-card";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Award,
  CheckCircle2,
  AlertCircle,
  RotateCcw,
  Sparkles,
} from "lucide-react";

interface ChecklistItem {
  id: string;
  label: string;
  completed: boolean;
}

interface CompletionAndCertificatePanelProps {
  enrollmentId: string;
  completion?: {
    id: string;
    status: CompletionStatus;
    checklistResponses: ChecklistItem[] | null;
    isEligibleForCertificate: boolean;
    completionNotes?: string | null;
  } | null;
  certificate?: CertificateDetail | null;
}

const DEFAULT_CHECKLIST: ChecklistItem[] = [
  { id: "chk_tasks", label: "All assigned core project tasks reviewed and approved", completed: true },
  { id: "chk_presentation", label: "Final internship project presentation delivered", completed: true },
  { id: "chk_code_review", label: "Code artifacts merged and documentation committed", completed: true },
  { id: "chk_exit_survey", label: "Exit interview and feedback survey completed", completed: true },
];

export function CompletionAndCertificatePanel({
  enrollmentId,
  completion,
  certificate,
}: CompletionAndCertificatePanelProps) {
  const [checklist, setChecklist] = useState<ChecklistItem[]>(
    (completion?.checklistResponses as ChecklistItem[]) || DEFAULT_CHECKLIST
  );
  const [isEligible, setIsEligible] = useState<boolean>(
    completion?.isEligibleForCertificate ?? true
  );
  const [completionNotes, setCompletionNotes] = useState<string>(
    completion?.completionNotes || ""
  );

  const [isUpdatingChecklist, setIsUpdatingChecklist] = useState(false);
  const [isIssuingCert, setIsIssuingCert] = useState(false);
  const [isReissuing, setIsReissuing] = useState(false);
  const [reissueReason, setReissueReason] = useState("");
  const [showReissueDialog, setShowReissueDialog] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const isCompletionApproved = completion?.status === CompletionStatus.APPROVED;
  const canIssueCertificate = isCompletionApproved && isEligible && !certificate;

  const handleToggleChecklist = (id: string) => {
    setChecklist((prev) =>
      prev.map((item) => (item.id === id ? { ...item, completed: !item.completed } : item))
    );
  };

  const handleSaveChecklist = async () => {
    setError(null);
    setSuccess(null);
    setIsUpdatingChecklist(true);

    const formData = new FormData();
    formData.append("enrollmentId", enrollmentId);
    formData.append("isEligibleForCertificate", String(isEligible));
    formData.append("completionNotes", completionNotes);
    formData.append("checklistResponses", JSON.stringify(checklist));

    try {
      const res = await recordCompletionChecklistAction(formData);
      if (!res.success) {
        setError(res.error || "Failed to update completion checklist");
      } else {
        setSuccess("Completion checklist recorded successfully");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "An unexpected error occurred";
      setError(msg);
    } finally {
      setIsUpdatingChecklist(false);
    }
  };

  const handleIssueCertificate = async () => {
    setError(null);
    setSuccess(null);
    setIsIssuingCert(true);

    const formData = new FormData();
    formData.append("enrollmentId", enrollmentId);

    try {
      const res = await issueCertificateAction(formData);
      if (!res.success) {
        setError(res.error || "Failed to issue certificate");
      } else {
        setSuccess("Official Certificate of Completion issued successfully!");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "An unexpected error occurred";
      setError(msg);
    } finally {
      setIsIssuingCert(false);
    }
  };

  const handleReissueCertificate = async () => {
    if (!certificate || !reissueReason.trim()) return;
    setError(null);
    setSuccess(null);
    setIsReissuing(true);

    const formData = new FormData();
    formData.append("certificateId", certificate.id);
    formData.append("reason", reissueReason);

    try {
      const res = await reissueCertificateAction(formData);
      if (!res.success) {
        setError(res.error || "Failed to reissue certificate");
      } else {
        setSuccess("Certificate reissued with updated verification code!");
        setShowReissueDialog(false);
        setReissueReason("");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "An unexpected error occurred";
      setError(msg);
    } finally {
      setIsReissuing(false);
    }
  };

  return (
    <Card className="border-border">
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Award className="h-5 w-5 text-primary" />
            <CardTitle className="text-base font-semibold text-foreground">
              Internship Completion & Certificate Issuance
            </CardTitle>
          </div>
          {certificate ? (
            <Badge variant="success">Certificate Active</Badge>
          ) : isCompletionApproved ? (
            <Badge variant="default">Completion Approved</Badge>
          ) : (
            <Badge variant="warning">Checklist Pending</Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-5 pt-0">
        {error && (
          <div className="flex items-center gap-2 rounded-lg bg-destructive/10 p-3 text-xs text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="flex items-center gap-2 rounded-lg bg-emerald-500/10 p-3 text-xs text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>{success}</span>
          </div>
        )}

        {/* Existing Certificate Card if issued */}
        {certificate && (
          <div className="space-y-3">
            <CertificateCard certificate={certificate} />
            <div className="flex justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowReissueDialog(true)}
                className="gap-1.5 text-xs"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Reissue Certificate (OD-010)
              </Button>
            </div>
          </div>
        )}

        {/* Reissue Dialog Modal */}
        {showReissueDialog && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-xl space-y-4">
              <h4 className="text-base font-semibold text-foreground">
                Reissue Completion Certificate
              </h4>
              <p className="text-xs text-muted-foreground">
                Reissuing supersedes the current verification code and generates a new credential. The previous code will be marked superseded. A justification reason is required for audit logs.
              </p>
              <div>
                <label className="text-xs font-medium text-foreground">
                  Reason for Reissue *
                </label>
                <textarea
                  value={reissueReason}
                  onChange={(e) => setReissueReason(e.target.value)}
                  rows={3}
                  required
                  placeholder="e.g. Corrected spelling in candidate legal name or updated signatory..."
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={isReissuing}
                  onClick={() => setShowReissueDialog(false)}
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  disabled={isReissuing || !reissueReason.trim()}
                  onClick={handleReissueCertificate}
                >
                  {isReissuing ? "Reissuing..." : "Confirm Reissue"}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Completion Checklist (only needed if cert not yet issued or editing) */}
        <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-3">
          <p className="text-xs font-semibold text-foreground uppercase tracking-wider">
            Completion Milestone Verification
          </p>
          <div className="space-y-2">
            {checklist.map((item) => (
              <label
                key={item.id}
                className="flex items-start gap-2.5 text-xs text-foreground cursor-pointer select-none"
              >
                <input
                  type="checkbox"
                  checked={item.completed}
                  onChange={() => handleToggleChecklist(item.id)}
                  className="mt-0.5 rounded border-border text-primary focus:ring-primary"
                />
                <span className={item.completed ? "line-through text-muted-foreground" : "font-medium"}>
                  {item.label}
                </span>
              </label>
            ))}
          </div>

          <div className="pt-2 border-t border-border/60">
            <label className="flex items-center gap-2 text-xs font-medium text-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={isEligible}
                onChange={(e) => setIsEligible(e.target.checked)}
                className="rounded border-border text-primary focus:ring-primary"
              />
              <span>Intern is eligible for official GARA Completion Certificate</span>
            </label>
          </div>

          <div className="pt-2">
            <label className="text-xs font-medium text-foreground">
              Completion Notes & Supervisor Evaluation Rationale
            </label>
            <Input
              value={completionNotes}
              onChange={(e) => setCompletionNotes(e.target.value)}
              placeholder="e.g. Completed all objectives with distinction..."
              className="mt-1"
            />
          </div>

          <div className="flex justify-between items-center pt-2">
            <Button
              variant="outline"
              size="sm"
              disabled={isUpdatingChecklist}
              onClick={handleSaveChecklist}
            >
              {isUpdatingChecklist ? "Saving..." : "Save Checklist"}
            </Button>

            {!certificate && (
              <Button
                variant="primary"
                size="sm"
                disabled={!canIssueCertificate || isIssuingCert}
                onClick={handleIssueCertificate}
                className="gap-1.5"
              >
                <Sparkles className="h-4 w-4" />
                {isIssuingCert ? "Generating PDF..." : "Issue Certificate"}
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
