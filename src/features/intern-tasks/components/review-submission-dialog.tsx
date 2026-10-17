"use client";

import React, { useState } from "react";
import { reviewSubmissionAction } from "../actions";
import { SubmissionReviewStatus } from "@/types/enums";
import { Button } from "@/components/ui/button";
import { CheckCircle2, RotateCcw, AlertCircle } from "lucide-react";

interface ReviewSubmissionDialogProps {
  taskId: string;
  submissionId: string;
  versionNumber: number;
  submissionNotes: string;
  deliverableUrls?: string[] | null;
}

export function ReviewSubmissionDialog({
  taskId,
  submissionId,
  versionNumber,
  submissionNotes,
  deliverableUrls,
}: ReviewSubmissionDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleReview = async (status: SubmissionReviewStatus, e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    formData.append("taskId", taskId);
    formData.append("submissionId", submissionId);
    formData.append("status", status);

    try {
      const res = await reviewSubmissionAction(formData);
      if (!res.success) {
        setError(res.error || "Failed to submit review");
      } else {
        setSuccess(true);
        setTimeout(() => {
          setIsOpen(false);
          setSuccess(false);
        }, 1200);
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
        variant="outline"
        size="sm"
        onClick={() => setIsOpen(true)}
        className="gap-1.5"
      >
        Review v{versionNumber}
      </Button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-xl border border-border bg-card p-6 shadow-xl">
        <h3 className="text-lg font-semibold text-foreground">
          Review Submission (v{versionNumber})
        </h3>

        {error && (
          <div className="mt-4 flex items-center gap-2 rounded-lg bg-destructive/10 p-3 text-xs text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="mt-4 flex items-center gap-2 rounded-lg bg-emerald-500/10 p-3 text-xs text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>Review submitted successfully!</span>
          </div>
        )}

        {/* Intern Submission Content */}
        <div className="mt-4 rounded-lg border border-border/70 bg-muted/30 p-3.5 space-y-2">
          <div>
            <p className="text-[11px] font-medium text-muted-foreground uppercase">
              Intern Submission Notes
            </p>
            <p className="text-xs text-foreground mt-0.5 whitespace-pre-wrap">
              {submissionNotes}
            </p>
          </div>

          {deliverableUrls && deliverableUrls.length > 0 && (
            <div>
              <p className="text-[11px] font-medium text-muted-foreground uppercase">
                Deliverable Links
              </p>
              <div className="mt-1 space-y-1">
                {deliverableUrls.map((url, i) => (
                  <a
                    key={i}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block text-xs text-primary hover:underline truncate"
                  >
                    {url}
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Supervisor Feedback Form */}
        <form
          onSubmit={(e) => {
            const submitter = (e.nativeEvent as unknown as { submitter?: HTMLElement }).submitter;
            const action = submitter?.getAttribute("data-action");
            const status = action === "approve" ? SubmissionReviewStatus.APPROVED : SubmissionReviewStatus.REVISION_REQUESTED;
            handleReview(status, e);
          }}
          className="mt-4 space-y-4"
        >
          <div>
            <label className="text-xs font-medium text-foreground">
              Supervisor Feedback & Review Notes *
            </label>
            <textarea
              name="supervisorFeedback"
              required
              rows={3}
              placeholder="Provide constructive feedback, praise, or required change details..."
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-foreground">
              Change Request Notes (Optional, if requesting revisions)
            </label>
            <textarea
              name="changeRequestNotes"
              rows={2}
              placeholder="Specific changes required before re-submission..."
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>

          <div className="flex justify-between items-center pt-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={isSubmitting}
              onClick={() => setIsOpen(false)}
            >
              Cancel
            </Button>
            <div className="flex gap-2">
              <Button
                type="submit"
                data-action="revision"
                variant="outline"
                size="sm"
                disabled={isSubmitting}
                className="gap-1.5 text-amber-600 dark:text-amber-400 border-amber-500/30 hover:bg-amber-500/10"
              >
                <RotateCcw className="h-4 w-4" />
                Request Revision
              </Button>
              <Button
                type="submit"
                data-action="approve"
                variant="primary"
                size="sm"
                disabled={isSubmitting}
                className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                <CheckCircle2 className="h-4 w-4" />
                Approve Deliverable
              </Button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
