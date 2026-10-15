"use client";

import React, { useState } from "react";
import { createTaskAction } from "../actions";
import { TaskPriority } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PlusCircle, AlertCircle, CheckCircle2 } from "lucide-react";

interface CreateTaskDialogProps {
  enrollmentId: string;
}

export function CreateTaskDialog({ enrollmentId }: CreateTaskDialogProps) {
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
      const res = await createTaskAction(formData);
      if (!res.success) {
        setError(res.error || "Failed to assign task");
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
        <PlusCircle className="h-4 w-4" />
        Assign New Task
      </Button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-xl border border-border bg-card p-6 shadow-xl">
        <h3 className="text-lg font-semibold text-foreground">
          Assign Internship Task
        </h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Specify deliverable requirements, priority, and deadline.
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
            <span>Task assigned successfully!</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label className="text-xs font-medium text-foreground">
              Task Title *
            </label>
            <Input
              name="title"
              required
              placeholder="e.g. Implement authentication middleware or Build API client"
              className="mt-1"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-foreground">
              Description & Requirements *
            </label>
            <textarea
              name="description"
              required
              rows={4}
              placeholder="Outline acceptance criteria, instructions, and expected outcomes..."
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-foreground">
                Priority
              </label>
              <select
                name="priority"
                defaultValue={TaskPriority.MEDIUM}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value={TaskPriority.LOW}>Low</option>
                <option value={TaskPriority.MEDIUM}>Medium</option>
                <option value={TaskPriority.HIGH}>High</option>
                <option value={TaskPriority.URGENT}>Urgent</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-medium text-foreground">
                Due Date
              </label>
              <Input
                name="dueDate"
                type="date"
                className="mt-1"
              />
            </div>
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
              {isSubmitting ? "Assigning..." : "Assign Task"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
