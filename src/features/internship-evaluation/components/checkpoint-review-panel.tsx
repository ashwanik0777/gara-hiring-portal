"use client";

import React, { useId, useState } from "react";
import type { CheckpointItem } from "../types";
import { CheckpointStatus } from "@/types/enums";
import { reviewCheckpointAction } from "../actions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { CheckCircle2, Clock, AlertCircle, FileText, MessageSquare } from "lucide-react";

interface CheckpointReviewPanelProps {
  checkpoints: CheckpointItem[];
  /** Reviews are only accepted while the evaluation is IN_PROGRESS. */
  canReview: boolean;
}

type ReviewOutcome = typeof CheckpointStatus.REVIEWED | typeof CheckpointStatus.BLOCKED;

function getCheckpointBadge(status: CheckpointStatus) {
  switch (status) {
    case CheckpointStatus.REVIEWED:
      return <Badge variant="success">Reviewed</Badge>;
    case CheckpointStatus.SUBMITTED:
      return <Badge variant="warning">Submitted</Badge>;
    case CheckpointStatus.BLOCKED:
      return <Badge variant="destructive">Blocked</Badge>;
    default:
      return <Badge variant="outline">Pending</Badge>;
  }
}

export function CheckpointReviewPanel({
  checkpoints,
  canReview,
}: CheckpointReviewPanelProps) {
  const formId = useId();
  const [activeCpId, setActiveCpId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState("");
  // No outcome is preselected; the supervisor must choose one explicitly.
  const [status, setStatus] = useState<ReviewOutcome | "">("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleReview = async (checkpointId: string) => {
    if (!feedback.trim()) {
      setError("Please enter supervisor evaluation feedback.");
      return;
    }
    if (!status) {
      setError("Please choose a review outcome.");
      return;
    }

    setError(null);
    setIsSubmitting(true);

    const formData = new FormData();
    formData.append("checkpointId", checkpointId);
    formData.append("feedback", feedback);
    formData.append("status", status);

    try {
      const res = await reviewCheckpointAction(formData);
      if (!res.success) {
        setError(res.error);
      } else {
        setActiveCpId(null);
        setFeedback("");
        setStatus("");
      }
    } catch {
      setError("Failed to record checkpoint review.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card className="border-border shadow-xs">
      <CardHeader className="pb-3 border-b border-border/50">
        <CardTitle className="text-base flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-primary" /> 7-Working-Day Daily Checkpoints
          </span>
          <span className="text-xs text-muted-foreground font-mono">
            {checkpoints.filter((c) => c.status === CheckpointStatus.REVIEWED).length} / {checkpoints.length} Reviewed
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-6 space-y-4">
        {error && (
          <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-xs flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="space-y-4">
          {checkpoints.map((cp) => (
            <div
              key={cp.id}
              className="p-4 rounded-xl border border-border bg-card/60 space-y-3"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border/40 pb-2.5">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm text-foreground">
                      {cp.title}
                    </span>
                    {getCheckpointBadge(cp.status)}
                  </div>
                  {cp.description && (
                    <p className="text-xs text-muted-foreground mt-0.5">{cp.description}</p>
                  )}
                </div>

                {/* Supervisor-led review: PENDING checkpoints can be reviewed without intern notes. */}
                {canReview && activeCpId !== cp.id && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-xs self-start sm:self-auto"
                    onClick={() => {
                      setActiveCpId(cp.id);
                      setError(null);
                      setFeedback(cp.supervisorFeedback || "");
                      setStatus(
                        cp.status === CheckpointStatus.REVIEWED || cp.status === CheckpointStatus.BLOCKED
                          ? cp.status
                          : ""
                      );
                    }}
                  >
                    <MessageSquare className="h-3.5 w-3.5 mr-1" />
                    {cp.supervisorFeedback ? "Edit Feedback" : "Leave Review"}
                  </Button>
                )}
              </div>

              {/* Intern Submission Notes */}
              {cp.submissionNotes ? (
                <div className="p-3 bg-muted/40 rounded-lg text-xs space-y-1 border border-border/40">
                  <span className="font-medium text-foreground flex items-center gap-1.5 text-[11px]">
                    <FileText className="h-3 w-3 text-primary" /> Intern Submission Notes:
                  </span>
                  <p className="text-muted-foreground leading-relaxed">{cp.submissionNotes}</p>
                </div>
              ) : (
                <p className="text-[11px] text-muted-foreground italic">
                  No intern notes submitted for Day {cp.dayNumber}.
                </p>
              )}

              {/* Existing Supervisor Feedback */}
              {cp.supervisorFeedback && activeCpId !== cp.id && (
                <div className="p-3 bg-success/5 rounded-lg text-xs space-y-1 border border-success/20">
                  <span className="font-medium text-success flex items-center gap-1.5 text-[11px]">
                    <CheckCircle2 className="h-3 w-3" /> Supervisor Feedback:
                  </span>
                  <p className="text-foreground leading-relaxed">{cp.supervisorFeedback}</p>
                </div>
              )}

              {/* Active Review Form */}
              {activeCpId === cp.id && (
                <div className="pt-2 space-y-3 border-t border-border/50">
                  <div className="space-y-1">
                    <label
                      htmlFor={`${formId}-feedback`}
                      className="block text-xs font-medium text-foreground"
                    >
                      Supervisor Feedback
                    </label>
                    <textarea
                      id={`${formId}-feedback`}
                      rows={2}
                      maxLength={5000}
                      value={feedback}
                      onChange={(e) => setFeedback(e.target.value)}
                      placeholder="Enter specific feedback on code quality, task execution, and progress..."
                      className="w-full rounded-lg border border-input bg-card px-3 py-2 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <label
                        htmlFor={`${formId}-outcome`}
                        className="text-xs font-medium text-foreground"
                      >
                        Outcome:
                      </label>
                      <select
                        id={`${formId}-outcome`}
                        required
                        value={status}
                        onChange={(e) => setStatus(e.target.value as ReviewOutcome | "")}
                        className="rounded-md border border-input bg-card px-2 py-1 text-xs text-foreground"
                      >
                        <option value="" disabled>
                          Select outcome…
                        </option>
                        <option value={CheckpointStatus.REVIEWED}>Reviewed</option>
                        <option value={CheckpointStatus.BLOCKED}>Blocked / Needs Rework</option>
                      </select>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setActiveCpId(null)}
                      >
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        isLoading={isSubmitting}
                        onClick={() => handleReview(cp.id)}
                      >
                        Save Review
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
