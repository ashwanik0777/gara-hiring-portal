"use client";

import React, { useState } from "react";
import { submitProgressReportAction } from "../actions";
import { ProgressCadence } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FileText, AlertCircle, CheckCircle2 } from "lucide-react";

interface ProgressReportDialogProps {
  enrollmentId: string;
}

export function ProgressReportDialog({ enrollmentId }: ProgressReportDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    formData.append("enrollmentId", enrollmentId);

    try {
      const res = await submitProgressReportAction(formData);
      if (!res.success) {
        setError(res.error || "Failed to submit progress report");
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
        variant="primary"
        size="sm"
        onClick={() => setIsOpen(true)}
        className="gap-1.5"
      >
        <FileText className="h-4 w-4" />
        Submit Progress Report
      </Button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-xl border border-border bg-card p-6 shadow-xl">
        <h3 className="text-lg font-semibold text-foreground">
          Submit Progress Report
        </h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Share your accomplishments, learnings, and any active blockers with your supervisor.
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
            <span>Report submitted successfully!</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-foreground">
                Reporting Cadence
              </label>
              <select
                name="cadence"
                defaultValue={ProgressCadence.WEEKLY}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value={ProgressCadence.WEEKLY}>Weekly Report</option>
                <option value={ProgressCadence.BIWEEKLY}>Bi-weekly Check-in</option>
                <option value={ProgressCadence.MILESTONE}>Milestone Review</option>
                <option value={ProgressCadence.CHECKPOINT}>Daily Checkpoint</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-medium text-foreground">
                Period / Milestone Title *
              </label>
              <Input
                name="periodIdentifier"
                required
                placeholder="e.g. Week 1 or Milestone A"
                className="mt-1"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-foreground">
              Executive Summary & Achievements *
            </label>
            <textarea
              name="summary"
              required
              rows={4}
              placeholder="Summary of accomplishments, tasks completed, and progress made..."
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-foreground">
              Key Learnings & Takeaways
            </label>
            <textarea
              name="learnings"
              rows={2}
              placeholder="What technical skills or domain concepts did you learn this period?"
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-foreground">
              Active Blockers or Assistance Needed
            </label>
            <textarea
              name="blockers"
              rows={2}
              placeholder="Any roadblocks, environment issues, or guidance you need from your mentor..."
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
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
              {isSubmitting ? "Submitting..." : "Submit Report"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
