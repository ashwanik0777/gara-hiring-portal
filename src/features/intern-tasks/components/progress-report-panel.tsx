"use client";

import React, { useId, useState } from "react";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AccessibleDialog } from "@/features/employees/components/accessible-dialog";
import { ProgressCadence } from "@/types/enums";
import { submitProgressReportAction } from "../actions";

export interface ProgressReportPanelProps {
  enrollmentId: string;
  open: boolean;
  onClose: () => void;
}

const UNEXPECTED_ERROR = "We couldn't submit the report. Please check your connection and try again.";
const fieldClass =
  "mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** Dialog body for an intern's progress report; loaded lazily by `ProgressReportDialog`. */
export function ProgressReportPanel({ enrollmentId, open, onClose }: ProgressReportPanelProps) {
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
    formData.append("enrollmentId", enrollmentId);

    try {
      const res = await submitProgressReportAction(formData);
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
          Submit Progress Report
        </h2>
        <p id={descriptionId} className="mt-0.5 text-xs text-muted-foreground">
          Share your accomplishments, learnings, and any active blockers with your supervisor.
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
            <span>Report submitted successfully!</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="progress-report-dialog-reporting-cadence" className="text-xs font-medium text-foreground">
                Reporting Cadence
              </label>
              <select
                id="progress-report-dialog-reporting-cadence"
                name="cadence"
                defaultValue={ProgressCadence.WEEKLY}
                disabled={isSubmitting}
                className={fieldClass}
              >
                <option value={ProgressCadence.WEEKLY}>Weekly Report</option>
                <option value={ProgressCadence.BIWEEKLY}>Bi-weekly Check-in</option>
                <option value={ProgressCadence.MILESTONE}>Milestone Review</option>
                <option value={ProgressCadence.CHECKPOINT}>Daily Checkpoint</option>
              </select>
            </div>

            <div>
              <label htmlFor="progress-report-dialog-period-milestone-title" className="text-xs font-medium text-foreground">
                Period / Milestone Title *
              </label>
              <Input
                id="progress-report-dialog-period-milestone-title"
                name="periodIdentifier"
                required
                disabled={isSubmitting}
                placeholder="e.g. Week 1 or Milestone A"
                className="mt-1"
              />
            </div>
          </div>

          <div>
            <label htmlFor="progress-report-dialog-executive-summary-achievements" className="text-xs font-medium text-foreground">
              Executive Summary & Achievements *
            </label>
            <textarea
              id="progress-report-dialog-executive-summary-achievements"
              name="summary"
              required
              rows={4}
              disabled={isSubmitting}
              placeholder="Summary of accomplishments, tasks completed, and progress made..."
              className={fieldClass}
            />
          </div>

          <div>
            <label htmlFor="progress-report-dialog-key-learnings-takeaways" className="text-xs font-medium text-foreground">
              Key Learnings & Takeaways
            </label>
            <textarea
              id="progress-report-dialog-key-learnings-takeaways"
              name="learnings"
              rows={2}
              disabled={isSubmitting}
              placeholder="What technical skills or domain concepts did you learn this period?"
              className={fieldClass}
            />
          </div>

          <div>
            <label htmlFor="progress-report-dialog-active-blockers-or-assistance" className="text-xs font-medium text-foreground">
              Active Blockers or Assistance Needed
            </label>
            <textarea
              id="progress-report-dialog-active-blockers-or-assistance"
              name="blockers"
              rows={2}
              disabled={isSubmitting}
              placeholder="Any roadblocks, environment issues, or guidance you need from your mentor..."
              className={fieldClass}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" size="sm" disabled={isSubmitting} onClick={close}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="sm" isLoading={isSubmitting}>
              {isSubmitting ? "Submitting..." : "Submit Report"}
            </Button>
          </div>
        </form>
      </div>
    </AccessibleDialog>
  );
}
