"use client";

import React, { useId, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, ArrowRight, Award, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { AccessibleDialog } from "@/features/employees/components/accessible-dialog";
import { enrollCandidateAction } from "../actions";
import type { SupervisorOption } from "../types";

interface SelectForEvaluationCardProps {
  applicationId: string;
  candidateName: string;
  openingTitle: string;
  /** Staff eligible to supervise (the candidate is already excluded by the server). */
  supervisorOptions: SupervisorOption[];
  /** Evaluation cockpit route for this portal, or null when the viewer cannot open it. */
  evaluationHrefBase: string | null;
}

/**
 * Internship step 1: HR / Admin select an internship candidate for the 7-working-day
 * supervised evaluation. The server validates permission, separation of duties, the opening
 * type, the stage transition and the supervisor before creating the enrollment.
 */
export function SelectForEvaluationCard({
  applicationId,
  candidateName,
  openingTitle,
  supervisorOptions,
  evaluationHrefBase,
}: SelectForEvaluationCardProps) {
  const router = useRouter();
  const baseId = useId();
  const selectId = `${baseId}-supervisor`;
  const titleId = `${baseId}-confirm-title`;
  const descriptionId = `${baseId}-confirm-description`;

  // No supervisor is preselected: HR chooses who supervises the evaluation.
  const [supervisorId, setSupervisorId] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enrollmentId, setEnrollmentId] = useState<string | null>(null);

  const supervisor = supervisorOptions.find((option) => option.id === supervisorId) ?? null;

  const openConfirmation = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!supervisor) {
      setError("Please choose a supervisor.");
      return;
    }
    setConfirmOpen(true);
  };

  const handleConfirm = async () => {
    setIsSubmitting(true);
    setError(null);

    const formData = new FormData();
    formData.append("applicationId", applicationId);
    formData.append("supervisorId", supervisorId);

    try {
      const res = await enrollCandidateAction(formData);
      if (!res.success) {
        setError(res.error);
        setConfirmOpen(false);
        return;
      }
      setEnrollmentId(res.data.enrollmentId);
      setConfirmOpen(false);
      router.refresh();
    } catch {
      setError("Selecting the candidate for evaluation failed. Please try again.");
      setConfirmOpen(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (enrollmentId) {
    return (
      <Card className="border-success/30 shadow-xs">
        <CardContent className="space-y-3 pt-6 text-xs">
          <div role="status" className="flex items-start gap-2 text-success">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>
              {candidateName} is selected for the 7-working-day evaluation. The candidate has been
              emailed and their evaluation workspace is unlocked.
            </span>
          </div>
          {evaluationHrefBase && (
            <Link href={`${evaluationHrefBase}/${enrollmentId}`}>
              <Button size="sm" variant="outline" className="gap-1.5">
                Open evaluation cockpit <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Button>
            </Link>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border shadow-xs">
      <CardHeader className="border-b border-border/50 pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Award className="h-4 w-4 text-primary" aria-hidden="true" /> Select for 7-day evaluation
        </CardTitle>
      </CardHeader>
      <form onSubmit={openConfirmation}>
        <CardContent className="space-y-4 pt-4 text-xs">
          <p className="text-muted-foreground">
            Selecting {candidateName} for the {openingTitle} internship starts the supervised
            7-working-day evaluation: the application moves to &quot;Selected for evaluation&quot;, an
            evaluation enrollment is created (its start is triggered later), and the candidate is
            emailed and gets their evaluation workspace.
          </p>

          {error && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-destructive"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{error}</span>
            </div>
          )}

          <div className="space-y-1.5">
            <label htmlFor={selectId} className="block font-medium text-foreground">
              Evaluation supervisor <span className="text-destructive">*</span>
            </label>
            <select
              id={selectId}
              value={supervisorId}
              onChange={(e) => setSupervisorId(e.target.value)}
              required
              disabled={isSubmitting || supervisorOptions.length === 0}
              className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
            >
              <option value="" disabled>
                Select a staff supervisor…
              </option>
              {supervisorOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name} ({option.roles.join(", ")})
                </option>
              ))}
            </select>
            {supervisorOptions.length === 0 ? (
              <p className="text-[11px] text-warning">
                No eligible staff supervisor exists yet. An administrator must create a staff account
                (Admin, HR, Manager, Mentor or Interviewer) first.
              </p>
            ) : (
              <p className="text-[11px] text-muted-foreground">
                The supervisor reviews daily checkpoints and tasks for this intern.
              </p>
            )}
          </div>
        </CardContent>
        <CardFooter className="flex justify-end border-t border-border/50 py-3">
          <Button
            type="submit"
            size="sm"
            disabled={isSubmitting || supervisorOptions.length === 0}
            className="gap-1.5"
          >
            <Award className="h-3.5 w-3.5" aria-hidden="true" /> Select for 7-day evaluation
          </Button>
        </CardFooter>
      </form>

      <AccessibleDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        labelledBy={titleId}
        describedBy={descriptionId}
        busy={isSubmitting}
        className="max-w-md"
      >
        <div className="space-y-3 px-5 py-4 text-xs">
          <h2 id={titleId} className="text-base font-semibold text-foreground">
            Select {candidateName} for the 7-day evaluation?
          </h2>
          <div id={descriptionId} className="space-y-2 text-muted-foreground">
            <p>
              Supervisor: <span className="font-semibold text-foreground">{supervisor?.name ?? "—"}</span>
            </p>
            <ul className="list-disc space-y-1 pl-4">
              <li>The application moves to &quot;Selected for evaluation&quot;.</li>
              <li>An evaluation enrollment with 7 daily checkpoints is created; its start is triggered separately.</li>
              <li>The candidate is emailed and their evaluation workspace unlocks.</li>
            </ul>
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-border/50 px-5 py-3">
          <Button
            variant="outline"
            size="sm"
            type="button"
            onClick={() => setConfirmOpen(false)}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button size="sm" type="button" onClick={handleConfirm} isLoading={isSubmitting} autoFocus>
            {isSubmitting ? "Selecting…" : "Confirm selection"}
          </Button>
        </div>
      </AccessibleDialog>
    </Card>
  );
}
