"use client";

import React, { useId, useState } from "react";
import { CheckpointStatus } from "@/types/enums";
import { submitCheckpointAction } from "../actions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle, CheckCircle2, FileText } from "lucide-react";

/** Only the fields the intern's own checkpoint list renders. */
export interface InternCheckpointView {
  id: string;
  dayNumber: number;
  title: string;
  description: string | null;
  submissionNotes: string | null;
  supervisorFeedback: string | null;
  status: CheckpointStatus;
}

interface InternCheckpointListProps {
  checkpoints: InternCheckpointView[];
  /** Notes are accepted only while the evaluation is IN_PROGRESS (enforced again on the server). */
  canSubmit: boolean;
}

/** Mirrors the server-side submittable statuses; REVIEWED is final for the intern. */
const SUBMITTABLE: readonly CheckpointStatus[] = [
  CheckpointStatus.PENDING,
  CheckpointStatus.SUBMITTED,
  CheckpointStatus.BLOCKED,
];

function statusBadge(status: CheckpointStatus) {
  switch (status) {
    case CheckpointStatus.REVIEWED:
      return <Badge variant="success">Reviewed</Badge>;
    case CheckpointStatus.SUBMITTED:
      return <Badge variant="warning">Submitted</Badge>;
    case CheckpointStatus.BLOCKED:
      return <Badge variant="destructive">Needs rework</Badge>;
    default:
      return <Badge variant="outline">Pending</Badge>;
  }
}

function CheckpointSubmitForm({ checkpoint }: { checkpoint: InternCheckpointView }) {
  const fieldId = useId();
  const [notes, setNotes] = useState(checkpoint.submissionNotes ?? "");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!notes.trim()) {
      setError("Please enter your notes for this checkpoint.");
      return;
    }
    setError(null);
    setSaved(false);
    setIsSubmitting(true);

    const formData = new FormData();
    formData.append("checkpointId", checkpoint.id);
    formData.append("submissionNotes", notes);

    try {
      const res = await submitCheckpointAction(formData);
      if (!res.success) {
        setError(res.error);
      } else {
        setSaved(true);
      }
    } catch {
      setError("Failed to submit checkpoint notes.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const isFirstSubmission = checkpoint.status === CheckpointStatus.PENDING;

  return (
    <form onSubmit={handleSubmit} className="space-y-2 pt-2 border-t border-border/50">
      <label htmlFor={fieldId} className="block text-xs font-medium text-foreground">
        {isFirstSubmission ? "Your notes for this checkpoint" : "Update your notes"}
      </label>
      <textarea
        id={fieldId}
        rows={3}
        maxLength={5000}
        required
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${fieldId}-error` : undefined}
        className="w-full rounded-lg border border-input bg-card px-3 py-2 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      {error && (
        <p id={`${fieldId}-error`} role="alert" className="flex items-center gap-1.5 text-xs text-destructive">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          {error}
        </p>
      )}
      {saved && (
        <p role="status" className="flex items-center gap-1.5 text-xs text-success">
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
          Notes submitted.
        </p>
      )}
      <div className="flex justify-end">
        <Button type="submit" size="sm" isLoading={isSubmitting}>
          {isFirstSubmission ? "Submit Notes" : "Resubmit Notes"}
        </Button>
      </div>
    </form>
  );
}

export function InternCheckpointList({ checkpoints, canSubmit }: InternCheckpointListProps) {
  if (checkpoints.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border p-6 text-center">
        <p className="text-sm font-medium text-foreground">No checkpoints scheduled</p>
      </div>
    );
  }

  return (
    <ol className="space-y-3">
      {checkpoints.map((cp) => (
        <li key={cp.id}>
          <Card className="border-border">
            <CardContent className="pt-4 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-semibold text-foreground">{cp.title}</h3>
                {statusBadge(cp.status)}
              </div>
              {cp.description && <p className="text-xs text-muted-foreground">{cp.description}</p>}

              {cp.submissionNotes && (
                <div className="p-3 bg-muted/40 rounded-lg text-xs space-y-1 border border-border/40">
                  <span className="font-medium text-foreground flex items-center gap-1.5 text-[11px]">
                    <FileText className="h-3 w-3 text-primary" /> Your notes
                  </span>
                  <p className="text-muted-foreground whitespace-pre-wrap">{cp.submissionNotes}</p>
                </div>
              )}

              {cp.supervisorFeedback && (
                <div className="p-3 bg-success/5 rounded-lg text-xs space-y-1 border border-success/20">
                  <span className="font-medium text-success flex items-center gap-1.5 text-[11px]">
                    <CheckCircle2 className="h-3 w-3" /> Supervisor feedback
                  </span>
                  <p className="text-foreground whitespace-pre-wrap">{cp.supervisorFeedback}</p>
                </div>
              )}

              {canSubmit && SUBMITTABLE.includes(cp.status) && <CheckpointSubmitForm checkpoint={cp} />}
            </CardContent>
          </Card>
        </li>
      ))}
    </ol>
  );
}
