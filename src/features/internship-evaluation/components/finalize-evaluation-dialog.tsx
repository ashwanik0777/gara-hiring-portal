"use client";

import React, { useState } from "react";
import { EvaluationStatus } from "@prisma/client";
import { finalizeEvaluationAction } from "../actions";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import { Award, AlertCircle, CheckCircle2, ShieldAlert } from "lucide-react";

interface FinalizeEvaluationDialogProps {
  enrollmentId: string;
  candidateName: string;
  currentStatus: EvaluationStatus;
}

export function FinalizeEvaluationDialog({
  enrollmentId,
  candidateName,
  currentStatus,
}: FinalizeEvaluationDialogProps) {
  const [status, setStatus] = useState<EvaluationStatus>(
    currentStatus === EvaluationStatus.IN_PROGRESS || currentStatus === EvaluationStatus.UNDER_REVIEW
      ? EvaluationStatus.PASSED
      : currentStatus
  );
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (notes.trim().length < 5) {
      setError("Please provide comprehensive final evaluation notes.");
      return;
    }

    setIsSubmitting(true);

    const formData = new FormData();
    formData.append("enrollmentId", enrollmentId);
    formData.append("status", status);
    formData.append("finalReviewNotes", notes);

    try {
      const res = await finalizeEvaluationAction(formData);
      if (!res.success) {
        setError(res.error);
      } else {
        setSuccess(`Evaluation successfully marked as ${status}. Onboarding workflow initialized.`);
      }
    } catch {
      setError("Failed to finalize evaluation outcome.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card className="border-border shadow-xs border-primary/30">
      <CardHeader className="pb-3 border-b border-border/50">
        <CardTitle className="text-base flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Award className="h-4 w-4 text-primary" /> Final Evaluation: {candidateName}
          </span>
          <span className="text-xs font-mono font-normal bg-muted px-2 py-0.5 rounded text-muted-foreground">
            Current: {currentStatus}
          </span>
        </CardTitle>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="pt-4 space-y-4">
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

          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-foreground">
              Final Outcome Status <span className="text-destructive">*</span>
            </label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as EvaluationStatus)}
              className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              required
            >
              <option value={EvaluationStatus.PASSED}>PASSED — Meets Criteria & Qualifies for Internship</option>
              <option value={EvaluationStatus.FAILED}>FAILED — Did Not Meet Benchmark</option>
              <option value={EvaluationStatus.EXTENDED}>EXTENDED — Requires Additional Supervised Days</option>
            </select>
            <p className="text-[11px] text-muted-foreground">
              Approving &quot;PASSED&quot; automatically provisions an intern record and onboarding checklist.
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-foreground flex items-center justify-between">
              <span>Final Review Summary & Justification <span className="text-destructive">*</span></span>
              <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                <ShieldAlert className="h-3 w-3 text-warning" /> Official Assessment Record
              </span>
            </label>
            <textarea
              rows={4}
              required
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Detail candidate performance across all 7 checkpoints, technical delivery, and final recommendation..."
              className="w-full rounded-lg border border-input bg-card px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
        </CardContent>
        <CardFooter className="py-3 border-t border-border/50 flex justify-end">
          <Button type="submit" size="sm" isLoading={isSubmitting}>
            Record Final Decision
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
