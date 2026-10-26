"use client";

import React, { useId, useState } from "react";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AccessibleDialog } from "@/features/employees/components/accessible-dialog";
import { TaskPriority } from "@/types/enums";
import { createTaskAction } from "../actions";

export interface CreateTaskPanelProps {
  enrollmentId: string;
  open: boolean;
  onClose: () => void;
}

const UNEXPECTED_ERROR = "We couldn't assign the task. Please check your connection and try again.";
const fieldClass =
  "mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** Dialog body for assigning a task; loaded lazily by `CreateTaskDialog` on first use. */
export function CreateTaskPanel({ enrollmentId, open, onClose }: CreateTaskPanelProps) {
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
      const res = await createTaskAction(formData);
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
          Assign Internship Task
        </h2>
        <p id={descriptionId} className="mt-0.5 text-xs text-muted-foreground">
          Specify deliverable requirements, priority, and deadline.
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
            <span>Task assigned successfully!</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label htmlFor="create-task-dialog-task-title" className="text-xs font-medium text-foreground">
              Task Title *
            </label>
            <Input
              id="create-task-dialog-task-title"
              name="title"
              required
              disabled={isSubmitting}
              placeholder="e.g. Implement authentication middleware or Build API client"
              className="mt-1"
            />
          </div>

          <div>
            <label htmlFor="create-task-dialog-description-requirements" className="text-xs font-medium text-foreground">
              Description & Requirements *
            </label>
            <textarea
              id="create-task-dialog-description-requirements"
              name="description"
              required
              rows={4}
              disabled={isSubmitting}
              placeholder="Outline acceptance criteria, instructions, and expected outcomes..."
              className={fieldClass}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="create-task-dialog-priority" className="text-xs font-medium text-foreground">
                Priority
              </label>
              <select
                id="create-task-dialog-priority"
                name="priority"
                defaultValue={TaskPriority.MEDIUM}
                disabled={isSubmitting}
                className={fieldClass}
              >
                <option value={TaskPriority.LOW}>Low</option>
                <option value={TaskPriority.MEDIUM}>Medium</option>
                <option value={TaskPriority.HIGH}>High</option>
                <option value={TaskPriority.URGENT}>Urgent</option>
              </select>
            </div>

            <div>
              <label htmlFor="create-task-dialog-due-date" className="text-xs font-medium text-foreground">
                Due Date
              </label>
              <Input id="create-task-dialog-due-date" name="dueDate" type="date" disabled={isSubmitting} className="mt-1" />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" size="sm" disabled={isSubmitting} onClick={close}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="sm" isLoading={isSubmitting}>
              {isSubmitting ? "Assigning..." : "Assign Task"}
            </Button>
          </div>
        </form>
      </div>
    </AccessibleDialog>
  );
}
