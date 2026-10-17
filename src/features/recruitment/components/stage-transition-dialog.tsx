"use client";

import React, { useState } from "react";
import { ApplicationStatus } from "@/types/enums";
import { VALID_APPLICATION_TRANSITIONS } from "../schemas";
import { transitionStatusAction } from "../actions";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import { ArrowRight, AlertCircle, CheckCircle2, ShieldAlert } from "lucide-react";

interface StageTransitionDialogProps {
  applicationId: string;
  currentStatus: ApplicationStatus;
  candidateName: string;
}

export function StageTransitionDialog({
  applicationId,
  currentStatus,
  candidateName,
}: StageTransitionDialogProps) {
  const allowedNextStatuses = VALID_APPLICATION_TRANSITIONS[currentStatus] ?? [];

  const [toStatus, setToStatus] = useState<ApplicationStatus | "">(
    allowedNextStatuses[0] ?? ""
  );
  const [internalNotes, setInternalNotes] = useState("");
  const [candidateMessage, setCandidateMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  if (allowedNextStatuses.length === 0) {
    return (
      <Card className="border-border bg-muted/20">
        <CardContent className="pt-6 text-center text-xs text-muted-foreground">
          This application is in terminal state <span className="font-semibold text-foreground">{currentStatus}</span>. No further stage transitions are permitted.
        </CardContent>
      </Card>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!toStatus) return;

    setError(null);
    setSuccess(null);
    setIsSubmitting(true);

    const formData = new FormData();
    formData.append("applicationId", applicationId);
    formData.append("toStatus", toStatus);
    formData.append("internalNotes", internalNotes);
    formData.append("candidateMessage", candidateMessage);

    try {
      const res = await transitionStatusAction(formData);
      if (!res.success) {
        setError(res.error);
      } else {
        setSuccess(`Application stage successfully advanced to ${toStatus.replace(/_/g, " ")}.`);
        setInternalNotes("");
        setCandidateMessage("");
      }
    } catch {
      setError("An unexpected error occurred executing stage transition.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card className="border-border shadow-xs">
      <CardHeader className="pb-3 border-b border-border/50">
        <CardTitle className="text-base flex items-center justify-between">
          <span>Stage Decision: {candidateName}</span>
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
              Target Pipeline Stage <span className="text-destructive">*</span>
            </label>
            <select
              value={toStatus}
              onChange={(e) => setToStatus(e.target.value as ApplicationStatus)}
              className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              required
            >
              {allowedNextStatuses.map((st) => (
                <option key={st} value={st}>
                  {st.replace(/_/g, " ")}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-foreground flex items-center justify-between">
              <span>Confidential Screening Notes</span>
              <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                <ShieldAlert className="h-3 w-3 text-warning" /> Staff only — never shown to candidate
              </span>
            </label>
            <textarea
              rows={3}
              value={internalNotes}
              onChange={(e) => setInternalNotes(e.target.value)}
              placeholder="e.g. Reviewed portfolio; strong technical foundation, passed initial recruiter screen."
              className="w-full rounded-lg border border-input bg-card px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-foreground">
              Candidate-Facing Notification Message (Optional)
            </label>
            <textarea
              rows={2}
              value={candidateMessage}
              onChange={(e) => setCandidateMessage(e.target.value)}
              placeholder="e.g. Congratulations! Your profile has progressed to our technical interview round."
              className="w-full rounded-lg border border-input bg-card px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
        </CardContent>
        <CardFooter className="py-3 border-t border-border/50 flex justify-end">
          <Button type="submit" size="sm" isLoading={isSubmitting}>
            Execute Transition <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
