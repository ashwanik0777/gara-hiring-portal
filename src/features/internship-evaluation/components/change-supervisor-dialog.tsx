"use client";

import React, { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, UserCog } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AccessibleDialog } from "@/features/employees/components/accessible-dialog";
import { joiningInputClass } from "@/features/employees/components/joining-fields";
import { changeEvaluationSupervisorAction } from "../actions";
import type { SupervisorOption } from "../types";

interface ChangeSupervisorDialogProps {
  enrollmentId: string;
  internName: string;
  currentSupervisorName: string | null;
  /** Eligible staff without the intern and the current supervisor (re-checked on the server). */
  options: SupervisorOption[];
}

/**
 * Supervisor change from the evaluation cockpit (ADMIN / HR with canEvaluations, before a final
 * outcome). The intern and the new supervisor are emailed.
 */
export function ChangeSupervisorDialog({
  enrollmentId,
  internName,
  currentSupervisorName,
  options,
}: ChangeSupervisorDialogProps) {
  const router = useRouter();
  const baseId = useId();
  const ids = {
    title: `${baseId}-title`,
    description: `${baseId}-description`,
    select: `${baseId}-select`,
    error: `${baseId}-error`,
  };

  const [open, setOpen] = useState(false);
  const [supervisorId, setSupervisorId] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const close = () => {
    if (isSubmitting) return;
    setOpen(false);
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!supervisorId) {
      setError("Please choose the new supervisor.");
      return;
    }

    setIsSubmitting(true);
    const formData = new FormData();
    formData.append("enrollmentId", enrollmentId);
    formData.append("supervisorId", supervisorId);

    try {
      const res = await changeEvaluationSupervisorAction(formData);
      if (!res.success) {
        setError(res.error);
        return;
      }
      const chosen = options.find((o) => o.id === supervisorId);
      setNotice(`${chosen?.name ?? "The new supervisor"} now supervises ${internName}. Both have been emailed.`);
      setSupervisorId("");
      setOpen(false);
      router.refresh();
    } catch {
      setError("We couldn't change the supervisor. Please check your connection and try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5"
          onClick={() => {
            setNotice(null);
            setOpen(true);
          }}
          disabled={options.length === 0}
        >
          <UserCog className="h-3.5 w-3.5" aria-hidden="true" /> Change supervisor
        </Button>
        {options.length === 0 && (
          <span className="text-[11px] text-muted-foreground">No other eligible staff member is available.</span>
        )}
        {notice && (
          <span role="status" className="flex items-center gap-1 text-[11px] text-success">
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> {notice}
          </span>
        )}
      </div>

      <AccessibleDialog
        open={open}
        onClose={close}
        labelledBy={ids.title}
        describedBy={ids.description}
        busy={isSubmitting}
      >
        <form onSubmit={handleSubmit}>
          <div className="border-b border-border/50 px-5 py-4">
            <h2 id={ids.title} className="flex items-center gap-2 text-base font-semibold text-foreground">
              <UserCog className="h-4 w-4 text-primary" aria-hidden="true" /> Change supervisor: {internName}
            </h2>
          </div>

          <div className="space-y-4 px-5 py-4 text-xs">
            <p id={ids.description} className="text-muted-foreground">
              Current supervisor: <span className="font-medium text-foreground">{currentSupervisorName ?? "None"}</span>.
              The new supervisor reviews the remaining checkpoints and tasks. {internName} and the new supervisor are
              notified by email.
            </p>

            {error && (
              <div
                role="alert"
                id={ids.error}
                className="flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-destructive"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{error}</span>
              </div>
            )}

            <div>
              <label htmlFor={ids.select} className="mb-1 block font-medium text-foreground">
                New supervisor <span className="text-destructive">*</span>
              </label>
              <select
                id={ids.select}
                required
                value={supervisorId}
                onChange={(e) => setSupervisorId(e.target.value)}
                aria-invalid={Boolean(error)}
                aria-describedby={error ? ids.error : undefined}
                disabled={isSubmitting}
                className={joiningInputClass}
              >
                <option value="">Choose a staff member</option>
                {options.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name} ({option.roles.join(", ")})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex justify-end gap-2 border-t border-border/50 px-5 py-3">
            <Button variant="outline" size="sm" type="button" onClick={close} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button size="sm" type="submit" isLoading={isSubmitting}>
              {isSubmitting ? "Saving…" : "Change supervisor"}
            </Button>
          </div>
        </form>
      </AccessibleDialog>
    </>
  );
}
