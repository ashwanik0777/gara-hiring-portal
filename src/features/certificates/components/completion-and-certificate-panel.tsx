"use client";

import React, { useState } from "react";
import type { CertificateDetail } from "../types";
import { CertificateStatus, CompletionStatus } from "@/types/enums";
import { COMPLETION_CHECKLIST_TEMPLATE, SIGNATORY_FIELD_MAX_LENGTH } from "../constants";
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
  Lock,
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
  /** Completion decisions are only accepted once the evaluation is recorded as PASSED. */
  evaluationPassed: boolean;
  completion?: {
    id: string;
    status: CompletionStatus;
    checklistResponses: ChecklistItem[] | null;
    isEligibleForCertificate: boolean;
    completionNotes?: string | null;
  } | null;
  certificate?: CertificateDetail | null;
  /** ADMIN / HR decision authority for issuing and reissuing certificates. */
  canIssueCertificate: boolean;
}

/** Server template merged with stored answers; unanswered items start unticked. */
function initialChecklist(stored: ChecklistItem[] | null | undefined): ChecklistItem[] {
  return COMPLETION_CHECKLIST_TEMPLATE.map((item) => ({
    id: item.id,
    label: item.label,
    completed: Array.isArray(stored)
      ? stored.some((entry) => entry.id === item.id && entry.completed === true)
      : false,
  }));
}

export function CompletionAndCertificatePanel({
  enrollmentId,
  evaluationPassed,
  completion,
  certificate,
  canIssueCertificate,
}: CompletionAndCertificatePanelProps) {
  const [checklist, setChecklist] = useState<ChecklistItem[]>(() =>
    initialChecklist(completion?.checklistResponses)
  );
  // Eligibility is never assumed: it defaults to false until a reviewer confirms it.
  const [isEligible, setIsEligible] = useState<boolean>(
    completion?.isEligibleForCertificate ?? false
  );
  const [completionNotes, setCompletionNotes] = useState<string>(
    completion?.completionNotes || ""
  );
  const [signatoryName, setSignatoryName] = useState("");
  const [signatoryTitle, setSignatoryTitle] = useState("");

  const [isUpdatingChecklist, setIsUpdatingChecklist] = useState(false);
  const [isIssuingCert, setIsIssuingCert] = useState(false);
  const [isReissuing, setIsReissuing] = useState(false);
  const [reissueReason, setReissueReason] = useState("");
  const [showReissueDialog, setShowReissueDialog] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const isCertificateActive = certificate?.status === CertificateStatus.ACTIVE;
  const isCompletionApproved = completion?.status === CompletionStatus.APPROVED;
  const checklistLocked = Boolean(isCertificateActive);
  const hasSignatory = signatoryName.trim().length >= 2 && signatoryTitle.trim().length >= 2;
  const canIssue =
    canIssueCertificate &&
    evaluationPassed &&
    isCompletionApproved &&
    Boolean(completion?.isEligibleForCertificate) &&
    !certificate &&
    hasSignatory;

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
    formData.append(
      "checklistResponses",
      JSON.stringify(checklist.map((item) => ({ id: item.id, completed: item.completed })))
    );

    try {
      const res = await recordCompletionChecklistAction(formData);
      if (!res.success) {
        setError(res.error || "Failed to update completion checklist");
      } else {
        setSuccess(
          res.data.status === CompletionStatus.APPROVED
            ? "Completion checklist recorded and approved."
            : "Completion checklist saved. Every required item must be completed before approval."
        );
      }
    } catch {
      setError("An unexpected error occurred");
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
    formData.append("signatoryName", signatoryName);
    formData.append("signatoryTitle", signatoryTitle);

    try {
      const res = await issueCertificateAction(formData);
      if (!res.success) {
        setError(res.error || "Failed to issue certificate");
      } else {
        setSuccess("Certificate of Completion issued.");
      }
    } catch {
      setError("An unexpected error occurred");
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
        setSuccess("Certificate reissued. The previous verification code now reports as superseded.");
        setShowReissueDialog(false);
        setReissueReason("");
      }
    } catch {
      setError("An unexpected error occurred");
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
          {isCertificateActive ? (
            <Badge variant="success">Certificate Active</Badge>
          ) : certificate ? (
            <Badge variant="destructive">Certificate {certificate.status}</Badge>
          ) : isCompletionApproved ? (
            <Badge variant="default">Completion Approved</Badge>
          ) : (
            <Badge variant="warning">Checklist Pending</Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-5 pt-0">
        {error && (
          <div role="alert" className="flex items-center gap-2 rounded-lg bg-destructive/10 p-3 text-xs text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div role="status" className="flex items-center gap-2 rounded-lg bg-emerald-500/10 p-3 text-xs text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>{success}</span>
          </div>
        )}

        {certificate && (
          <div className="space-y-3">
            <CertificateCard certificate={certificate} />
            {canIssueCertificate && isCertificateActive && (
              <div className="flex justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowReissueDialog(true)}
                  className="gap-1.5 text-xs"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Reissue Certificate (OD-009)
                </Button>
              </div>
            )}
          </div>
        )}

        {showReissueDialog && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="reissue-certificate-title"
              className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-xl space-y-4"
            >
              <h4 id="reissue-certificate-title" className="text-base font-semibold text-foreground">
                Reissue Completion Certificate
              </h4>
              <p className="text-xs text-muted-foreground">
                Reissuing generates a new verification code. The previous code will be reported as superseded on the public verification page. A justification is required for the audit log.
              </p>
              <div>
                <label htmlFor="certificate-reissue-reason" className="text-xs font-medium text-foreground">
                  Reason for Reissue *
                </label>
                <textarea
                  id="certificate-reissue-reason"
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
                  disabled={isReissuing || reissueReason.trim().length < 10}
                  onClick={handleReissueCertificate}
                >
                  {isReissuing ? "Reissuing..." : "Confirm Reissue"}
                </Button>
              </div>
            </div>
          </div>
        )}

        {!evaluationPassed ? (
          <div className="rounded-lg border border-border bg-muted/20 p-4 text-xs text-muted-foreground flex items-start gap-2">
            <Lock className="h-4 w-4 shrink-0 mt-0.5" />
            <span>
              Completion decisions and certificates are available only after the supervised evaluation is recorded as PASSED.
            </span>
          </div>
        ) : (
          <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-3">
            <p className="text-xs font-semibold text-foreground uppercase tracking-wider">
              Completion Milestone Verification
            </p>
            <fieldset className="space-y-2" disabled={checklistLocked}>
              <legend className="sr-only">Completion checklist</legend>
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
            </fieldset>

            <div className="pt-2 border-t border-border/60">
              <label className="flex items-center gap-2 text-xs font-medium text-foreground cursor-pointer">
                <input
                  type="checkbox"
                  checked={isEligible}
                  disabled={checklistLocked}
                  onChange={(e) => setIsEligible(e.target.checked)}
                  className="rounded border-border text-primary focus:ring-primary"
                />
                <span>Intern is eligible for the completion certificate</span>
              </label>
            </div>

            <div className="pt-2">
              <label htmlFor="completion-notes" className="text-xs font-medium text-foreground">
                Completion Notes & Supervisor Evaluation Rationale
              </label>
              <Input
                id="completion-notes"
                value={completionNotes}
                disabled={checklistLocked}
                onChange={(e) => setCompletionNotes(e.target.value)}
                placeholder="e.g. Completed all objectives with distinction..."
                className="mt-1"
              />
            </div>

            {canIssueCertificate && !certificate && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-border/60">
                <div>
                  <label htmlFor="signatory-name" className="text-xs font-medium text-foreground">
                    Signatory Name *
                  </label>
                  <Input
                    id="signatory-name"
                    value={signatoryName}
                    maxLength={SIGNATORY_FIELD_MAX_LENGTH}
                    onChange={(e) => setSignatoryName(e.target.value)}
                    className="mt-1"
                  />
                </div>
                <div>
                  <label htmlFor="signatory-title" className="text-xs font-medium text-foreground">
                    Signatory Title *
                  </label>
                  <Input
                    id="signatory-title"
                    value={signatoryTitle}
                    maxLength={SIGNATORY_FIELD_MAX_LENGTH}
                    onChange={(e) => setSignatoryTitle(e.target.value)}
                    className="mt-1"
                  />
                </div>
                <p className="sm:col-span-2 text-[11px] text-muted-foreground">
                  The official signatory has not been configured (OD-009); enter the authorized signatory for this certificate.
                </p>
              </div>
            )}

            <div className="flex justify-between items-center pt-2">
              <Button
                variant="outline"
                size="sm"
                disabled={isUpdatingChecklist || checklistLocked}
                onClick={handleSaveChecklist}
              >
                {isUpdatingChecklist ? "Saving..." : "Save Checklist"}
              </Button>

              {canIssueCertificate && !certificate && (
                <Button
                  variant="primary"
                  size="sm"
                  disabled={!canIssue || isIssuingCert}
                  onClick={handleIssueCertificate}
                  className="gap-1.5"
                >
                  <Sparkles className="h-4 w-4" />
                  {isIssuingCert ? "Generating PDF..." : "Issue Certificate"}
                </Button>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
