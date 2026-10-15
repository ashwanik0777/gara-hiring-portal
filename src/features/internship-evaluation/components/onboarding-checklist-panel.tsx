"use client";

import React, { useState } from "react";
import { OnboardingChecklistItem, OnboardingStatus, IdCardStatus, EvaluationStatus } from "../types";
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
}

export function OnboardingChecklistPanel({
  enrollmentId,
  evaluationStatus,
  onboarding,
  idCard,
}: OnboardingChecklistPanelProps) {
  const [isUpdating, setIsUpdating] = useState(false);
  const [isIssuing, setIsIssuing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const isEvaluationPassed = evaluationStatus === EvaluationStatus.PASSED;
  const isOnboardingComplete = onboarding?.status === OnboardingStatus.COMPLETED;
  const canIssueIdCard = isEvaluationPassed && isOnboardingComplete && idCard?.status !== IdCardStatus.ISSUED;

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

  const handleIssueIdCard = async () => {
    setError(null);
    setIsIssuing(true);

    const formData = new FormData();
    formData.append("enrollmentId", enrollmentId);

    try {
      const res = await issueIdCardAction(formData);
      if (!res.success) {
        setError(res.error);
      } else {
        setSuccess(`Intern ID Card successfully issued: ${res.data.cardNumber}`);
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
              <CreditCard className="h-4 w-4 text-primary" /> Intern ID Card Provisioning (OD-014)
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
            <div className="p-4 bg-muted/40 border border-primary/30 rounded-xl flex items-center justify-between">
              <div>
                <span className="text-[10px] uppercase font-mono text-muted-foreground tracking-wider block">
                  Official Intern ID Card
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

              <Button
                size="sm"
                disabled={!canIssueIdCard || isIssuing}
                isLoading={isIssuing}
                onClick={handleIssueIdCard}
              >
                <CreditCard className="h-4 w-4 mr-1.5" /> Approve & Issue Intern ID Card
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
