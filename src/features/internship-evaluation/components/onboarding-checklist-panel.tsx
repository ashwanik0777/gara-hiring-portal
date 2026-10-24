"use client";

import React, { useState } from "react";
import type { OnboardingChecklistItem } from "../types";
import { OnboardingStatus, IdCardStatus, EvaluationStatus } from "@/types/enums";
import { updateOnboardingItemAction, issueIdCardAction } from "../actions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import {
  CheckCircle2,
  AlertCircle,
  CreditCard,
  Lock,
  Sparkles,
  ShieldCheck,
} from "lucide-react";

interface OnboardingChecklistPanelProps {
  enrollmentId: string;
  evaluationStatus: EvaluationStatus;
  onboarding?: {
    id: string;
    status: OnboardingStatus;
    checklistItems: OnboardingChecklistItem[];
    completedAt?: Date | null;
  } | null;
  idCard?: {
    id: string;
    cardNumber?: string | null;
    status: IdCardStatus;
    approvedAt?: Date | null;
    issuedAt?: Date | null;
  } | null;
  /** ADMIN / HR decision authority; supervisors can verify items but not issue cards. */
  canIssueIdCard: boolean;
}

export function OnboardingChecklistPanel({
  enrollmentId,
  evaluationStatus,
  onboarding,
  idCard,
  canIssueIdCard: hasIssueAuthority,
}: OnboardingChecklistPanelProps) {
  const [isUpdating, setIsUpdating] = useState(false);
  const [isIssuing, setIsIssuing] = useState(false);
  const [showReissue, setShowReissue] = useState(false);
  const [reissueReason, setReissueReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const isEvaluationPassed = evaluationStatus === EvaluationStatus.PASSED;
  const isOnboardingComplete = onboarding?.status === OnboardingStatus.COMPLETED;
  const canIssueIdCard =
    hasIssueAuthority && isEvaluationPassed && isOnboardingComplete && !idCard?.cardNumber;
  const canReissueIdCard = hasIssueAuthority && isEvaluationPassed && isOnboardingComplete && Boolean(idCard?.cardNumber);

  const handleToggleItem = async (itemId: string, currentStatus: boolean) => {
    setError(null);
    setIsUpdating(true);

    const formData = new FormData();
    formData.append("enrollmentId", enrollmentId);
    formData.append("itemId", itemId);
    formData.append("completed", String(!currentStatus));

    try {
      const res = await updateOnboardingItemAction(formData);
      if (!res.success) {
        setError(res.error);
      }
    } catch {
      setError("Failed to update onboarding item.");
    } finally {
      setIsUpdating(false);
    }
  };

  const handleIssueIdCard = async (reason?: string) => {
    setError(null);
    setSuccess(null);
    setIsIssuing(true);

    const formData = new FormData();
    formData.append("enrollmentId", enrollmentId);
    if (reason) {
      formData.append("reissueReason", reason);
    }

    try {
      const res = await issueIdCardAction(formData);
      if (!res.success) {
        setError(res.error);
      } else if (res.data.alreadyIssued) {
        setSuccess(`This intern already has an issued ID card: ${res.data.cardNumber}`);
      } else {
        setSuccess(
          res.data.reissued
            ? `Intern ID card reissued: ${res.data.cardNumber}`
            : `Intern ID card issued: ${res.data.cardNumber}`
        );
        setShowReissue(false);
        setReissueReason("");
      }
    } catch {
      setError("Failed to issue Intern ID Card.");
    } finally {
      setIsIssuing(false);
    }
  };

  if (!isEvaluationPassed && !onboarding) {
    return (
      <Card className="border-border bg-muted/20">
        <CardContent className="pt-6 text-center text-xs text-muted-foreground flex flex-col items-center gap-2">
          <Lock className="h-5 w-5 text-muted-foreground/60" />
          <p className="font-semibold text-foreground">Onboarding & ID Card Gated</p>
          <p className="max-w-md">
            Intern onboarding checklist and official ID card issuance are unlocked strictly after the 7-working-day evaluation is officially marked as <span className="font-semibold text-foreground">PASSED</span>.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-xs flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="p-3 rounded-lg bg-success/10 border border-success/20 text-success text-xs flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>{success}</span>
        </div>
      )}

      {/* Onboarding Checklist Card */}
      <Card className="border-border shadow-xs">
        <CardHeader className="pb-3 border-b border-border/50">
          <CardTitle className="text-base flex items-center justify-between">
            <span className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-primary" /> Intern Onboarding Checklist
            </span>
            <Badge variant={isOnboardingComplete ? "success" : "warning"}>
              {onboarding?.status ?? "IN_PROGRESS"}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4 space-y-3">
          {onboarding?.checklistItems.map((item) => (
            <div
              key={item.id}
              className="flex items-center justify-between p-3 rounded-lg border border-border/60 bg-card hover:bg-muted/30 transition-colors"
            >
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id={`item-${item.id}`}
                  checked={item.completed}
                  disabled={isUpdating}
                  onChange={() => handleToggleItem(item.id, item.completed)}
                  className="h-4 w-4 rounded border-input text-primary focus:ring-ring cursor-pointer"
                />
                <label
                  htmlFor={`item-${item.id}`}
                  className="text-xs font-medium text-foreground cursor-pointer"
                >
                  {item.label}
                  {item.required && <span className="text-destructive ml-1">*</span>}
                </label>
              </div>

              {item.completed && item.verifiedBy && (
                <span className="text-[11px] text-muted-foreground">
                  Verified by {item.verifiedBy}
                </span>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Intern ID Card Issuance Card */}
      <Card className="border-border shadow-xs">
        <CardHeader className="pb-3 border-b border-border/50">
          <CardTitle className="text-base flex items-center justify-between">
            <span className="flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-primary" /> Intern ID Card (OD-014)
            </span>
            {idCard?.cardNumber ? (
              <Badge variant="success">ISSUED</Badge>
            ) : (
              <Badge variant="outline">GATED</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4 space-y-4">
          {idCard?.cardNumber ? (
            <div className="space-y-3">
              <div className="p-4 bg-muted/40 border border-primary/30 rounded-xl flex items-center justify-between">
                <div>
                  <span className="text-[10px] uppercase font-mono text-muted-foreground tracking-wider block">
                    Intern ID Card — provisional number format (OD-014)
                  </span>
                  <span className="text-lg font-mono font-bold text-primary block mt-0.5">
                    {idCard.cardNumber}
                  </span>
                  <span className="text-[11px] text-muted-foreground block mt-1">
                    Issued on {idCard.issuedAt ? new Date(idCard.issuedAt).toLocaleDateString() : "Active"}
                  </span>
                </div>
                <Sparkles className="h-8 w-8 text-primary/40" />
              </div>

              {canReissueIdCard && !showReissue && (
                <Button size="sm" variant="outline" onClick={() => setShowReissue(true)}>
                  Reissue ID Card
                </Button>
              )}

              {canReissueIdCard && showReissue && (
                <div className="space-y-2">
                  <label htmlFor="id-card-reissue-reason" className="block text-xs font-medium text-foreground">
                    Reason for reissue (recorded in the audit log) <span className="text-destructive">*</span>
                  </label>
                  <textarea
                    id="id-card-reissue-reason"
                    rows={2}
                    value={reissueReason}
                    onChange={(e) => setReissueReason(e.target.value)}
                    className="w-full rounded-lg border border-input bg-card px-3 py-2 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                  <div className="flex gap-2">
                    <Button size="sm" variant="ghost" disabled={isIssuing} onClick={() => setShowReissue(false)}>
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      isLoading={isIssuing}
                      disabled={isIssuing || reissueReason.trim().length < 10}
                      onClick={() => handleIssueIdCard(reissueReason.trim())}
                    >
                      Confirm Reissue
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="p-3 bg-muted/30 border border-border/50 rounded-lg text-xs text-muted-foreground space-y-1">
                <span className="font-semibold text-foreground flex items-center gap-1.5">
                  <Lock className="h-3.5 w-3.5 text-warning" /> Policy Gating Checklist:
                </span>
                <ul className="list-disc pl-5 space-y-0.5 mt-1">
                  <li className={isEvaluationPassed ? "text-success font-medium" : "text-muted-foreground"}>
                    Supervised evaluation marked as PASSED: {isEvaluationPassed ? "✓ Passed" : "Pending"}
                  </li>
                  <li className={isOnboardingComplete ? "text-success font-medium" : "text-muted-foreground"}>
                    All required onboarding items verified: {isOnboardingComplete ? "✓ Completed" : "Pending"}
                  </li>
                </ul>
              </div>

              {hasIssueAuthority ? (
                <Button
                  size="sm"
                  disabled={!canIssueIdCard || isIssuing}
                  isLoading={isIssuing}
                  onClick={() => handleIssueIdCard()}
                >
                  <CreditCard className="h-4 w-4 mr-1.5" /> Approve & Issue Intern ID Card
                </Button>
              ) : (
                <p className="text-[11px] text-muted-foreground">
                  ID cards are issued by HR or an administrator.
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
