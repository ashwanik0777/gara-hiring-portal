"use client";

import React, { useId, useState } from "react";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AccessibleDialog } from "@/features/employees/components/accessible-dialog";
import { submitTaskAction } from "../actions";

export interface TaskSubmissionPanelProps {
  taskId: string;
  taskTitle: string;
  versionNumber: number;
  open: boolean;
  onClose: () => void;
}

const UNEXPECTED_ERROR = "We couldn't submit your work. Please check your connection and try again.";

/** Dialog body for submitting task deliverables; loaded lazily by `TaskSubmissionDialog`. */
export function TaskSubmissionPanel({ taskId, taskTitle, versionNumber, open, onClose }: TaskSubmissionPanelProps) {
  const baseId = useId();
  const titleId = `${baseId}-title`;
  const descriptionId = `${baseId}-description`;
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const close = () => {
    if (isSubmitting) return;
    setError(null);
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    formData.append("taskId", taskId);

    try {
      const res = await submitTaskAction(formData);
      if (!res.success) {
        setError(res.error);
        return;
      }
      setSuccess(true);
      setTimeout(() => {
        onClose();
        setSuccess(false);
      }, 1500);
    } catch {
      setError(UNEXPECTED_ERROR);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AccessibleDialog
      open={open}
      onClose={close}
      labelledBy={titleId}
      describedBy={descriptionId}
      busy={isSubmitting}
      className="max-w-lg"
    >
      <div className="p-6">
        <h2 id={titleId} className="text-lg font-semibold text-foreground">
          Submit Work for: {taskTitle}
        </h2>
        <p id={descriptionId} className="mt-0.5 text-xs text-muted-foreground">
          Version {versionNumber + 1} submission
        </p>

        {error && (
          <div role="alert" className="mt-4 flex items-center gap-2 rounded-lg bg-destructive/10 p-3 text-xs text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div
            role="status"
            className="mt-4 flex items-center gap-2 rounded-lg bg-emerald-500/10 p-3 text-xs text-emerald-600 dark:text-emerald-400"
          >
            <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
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
              disabled={isSubmitting}
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
              disabled={isSubmitting}
              placeholder="https://github.com/..., https://demo.app/..."
              className="mt-1"
              aria-describedby="task-submission-dialog-deliverable-links-hint"
            />
            <p id="task-submission-dialog-deliverable-links-hint" className="mt-1 text-[11px] text-muted-foreground">
              Provide GitHub repository links, documentation, or deployed preview URLs.
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" size="sm" disabled={isSubmitting} onClick={close}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="sm" isLoading={isSubmitting}>
              {isSubmitting ? "Submitting..." : "Submit for Review"}
            </Button>
          </div>
        </form>
      </div>
    </AccessibleDialog>
  );
}
