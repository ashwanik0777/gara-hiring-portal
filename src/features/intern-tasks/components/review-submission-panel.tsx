"use client";

import React, { useId, useState } from "react";
import { AlertCircle, CheckCircle2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AccessibleDialog } from "@/features/employees/components/accessible-dialog";
import { SubmissionReviewStatus } from "@/types/enums";
import { reviewSubmissionAction } from "../actions";

export interface ReviewSubmissionPanelProps {
  taskId: string;
  submissionId: string;
  versionNumber: number;
  submissionNotes: string;
  deliverableUrls?: string[] | null;
  open: boolean;
  onClose: () => void;
}

type ReviewAction = "approve" | "revision";

const UNEXPECTED_ERROR = "We couldn't save the review. Please check your connection and try again.";
const fieldClass =
  "mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** Dialog body for reviewing a task submission; loaded lazily by `ReviewSubmissionDialog`. */
export function ReviewSubmissionPanel({
  taskId,
  submissionId,
  versionNumber,
  submissionNotes,
  deliverableUrls,
  open,
  onClose,
}: ReviewSubmissionPanelProps) {
  const baseId = useId();
  const titleId = `${baseId}-title`;
  const [pendingAction, setPendingAction] = useState<ReviewAction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const isSubmitting = pendingAction !== null;

  const close = () => {
    if (isSubmitting) return;
    setError(null);
    onClose();
  };

  const handleReview = async (action: ReviewAction, form: HTMLFormElement) => {
    setPendingAction(action);
    setError(null);

    const formData = new FormData(form);
    formData.append("taskId", taskId);
    formData.append("submissionId", submissionId);
    formData.append(
      "status",
      action === "approve" ? SubmissionReviewStatus.APPROVED : SubmissionReviewStatus.REVISION_REQUESTED
    );

    try {
      const res = await reviewSubmissionAction(formData);
      if (!res.success) {
        setError(res.error);
        return;
      }
      setSuccess(true);
      setTimeout(() => {
        onClose();
        setSuccess(false);
      }, 1200);
    } catch {
      setError(UNEXPECTED_ERROR);
    } finally {
      setPendingAction(null);
    }
  };

  return (
    <AccessibleDialog open={open} onClose={close} labelledBy={titleId} busy={isSubmitting} className="max-w-lg">
      <div className="p-6">
        <h2 id={titleId} className="text-lg font-semibold text-foreground">
          Review Submission (v{versionNumber})
        </h2>

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
            <span>Review submitted successfully!</span>
          </div>
        )}

        {/* Intern Submission Content */}
        <div className="mt-4 space-y-2 rounded-lg border border-border/70 bg-muted/30 p-3.5">
          <div>
            <p className="text-[11px] font-medium uppercase text-muted-foreground">Intern Submission Notes</p>
            <p className="mt-0.5 whitespace-pre-wrap text-xs text-foreground">{submissionNotes}</p>
          </div>

          {deliverableUrls && deliverableUrls.length > 0 && (
            <div>
              <p className="text-[11px] font-medium uppercase text-muted-foreground">Deliverable Links</p>
              <ul className="mt-1 space-y-1">
                {deliverableUrls.map((url, i) => (
                  <li key={i}>
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block truncate text-xs text-primary hover:underline"
                    >
                      {url}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Supervisor Feedback Form */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const submitter = (e.nativeEvent as unknown as { submitter?: HTMLElement }).submitter;
            const action: ReviewAction = submitter?.getAttribute("data-action") === "approve" ? "approve" : "revision";
            void handleReview(action, e.currentTarget);
          }}
          className="mt-4 space-y-4"
        >
          <div>
            <label htmlFor="review-submission-dialog-supervisor-feedback-review-notes" className="text-xs font-medium text-foreground">
              Supervisor Feedback & Review Notes *
            </label>
            <textarea
              id="review-submission-dialog-supervisor-feedback-review-notes"
              name="supervisorFeedback"
              required
              rows={3}
              disabled={isSubmitting}
              placeholder="Provide constructive feedback, praise, or required change details..."
              className={fieldClass}
            />
          </div>

          <div>
            <label htmlFor="review-submission-dialog-change-request-notes" className="text-xs font-medium text-foreground">
              Change Request Notes (Optional, if requesting revisions)
            </label>
            <textarea
              id="review-submission-dialog-change-request-notes"
              name="changeRequestNotes"
              rows={2}
              disabled={isSubmitting}
              placeholder="Specific changes required before re-submission..."
              className={fieldClass}
            />
          </div>

          <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:items-center sm:justify-between">
            <Button type="button" variant="ghost" size="sm" disabled={isSubmitting} onClick={close}>
              Cancel
            </Button>
            <div className="flex flex-wrap gap-2">
              <Button
                type="submit"
                data-action="revision"
                variant="outline"
                size="sm"
                disabled={isSubmitting}
                isLoading={pendingAction === "revision"}
                className="gap-1.5 border-amber-500/30 text-amber-600 hover:bg-amber-500/10 dark:text-amber-400"
              >
                <RotateCcw className="h-4 w-4" aria-hidden="true" />
                Request Revision
              </Button>
              <Button
                type="submit"
                data-action="approve"
                variant="primary"
                size="sm"
                disabled={isSubmitting}
                isLoading={pendingAction === "approve"}
                className="gap-1.5 bg-emerald-600 text-white hover:bg-emerald-700"
              >
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                Approve Deliverable
              </Button>
            </div>
          </div>
        </form>
      </div>
    </AccessibleDialog>
  );
}
