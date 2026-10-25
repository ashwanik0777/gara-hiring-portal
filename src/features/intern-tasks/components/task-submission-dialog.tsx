"use client";

import React, { useState } from "react";
import { submitTaskAction } from "../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { UploadCloud, CheckCircle2, AlertCircle } from "lucide-react";

interface TaskSubmissionDialogProps {
  taskId: string;
  taskTitle: string;
  versionNumber: number;
}

export function TaskSubmissionDialog({
  taskId,
  taskTitle,
  versionNumber,
}: TaskSubmissionDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    formData.append("taskId", taskId);

    try {
      const res = await submitTaskAction(formData);
      if (!res.success) {
        setError(res.error || "Failed to submit task");
      } else {
        setSuccess(true);
        setTimeout(() => {
          setIsOpen(false);
          setSuccess(false);
        }, 1500);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "An unexpected error occurred";
      setError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) {
    return (
      <Button
        variant="primary"
        size="sm"
        onClick={() => setIsOpen(true)}
        className="gap-1.5"
      >
        <UploadCloud className="h-4 w-4" />
        {versionNumber > 0 ? `Resubmit (v${versionNumber + 1})` : "Submit Deliverables"}
      </Button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-xl border border-border bg-card p-6 shadow-xl">
        <h3 className="text-lg font-semibold text-foreground">
          Submit Work for: {taskTitle}
        </h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Version {versionNumber + 1} submission
        </p>

        {error && (
          <div className="mt-4 flex items-center gap-2 rounded-lg bg-destructive/10 p-3 text-xs text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="mt-4 flex items-center gap-2 rounded-lg bg-emerald-500/10 p-3 text-xs text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>Submission received successfully!</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label htmlFor="task-submission-dialog-submission-notes-summary" className="text-xs font-medium text-foreground">
              Submission Notes / Summary *
            </label>
            <textarea
              id="task-submission-dialog-submission-notes-summary"
              name="submissionNotes"
              required
              rows={4}
              placeholder="Describe the deliverables, completed requirements, and key implementation notes..."
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>

          <div>
            <label htmlFor="task-submission-dialog-deliverable-links" className="text-xs font-medium text-foreground">
              Deliverable Links (comma-separated URLs)
            </label>
            <Input
              id="task-submission-dialog-deliverable-links"
              name="deliverableUrls"
              type="text"
              placeholder="https://github.com/..., https://demo.app/..."
              className="mt-1"
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              Provide GitHub repository links, documentation, or deployed preview URLs.
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isSubmitting}
              onClick={() => setIsOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              disabled={isSubmitting}
            >
              {isSubmitting ? "Submitting..." : "Submit for Review"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
