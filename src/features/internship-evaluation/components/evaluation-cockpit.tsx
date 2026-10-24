import React from "react";
import Link from "next/link";
import { EvaluationStatus } from "@prisma/client";
import type { EvaluationEnrollmentDetail } from "../types";
import { StartEvaluationDialog } from "./start-evaluation-dialog";
import { CheckpointReviewPanel } from "./checkpoint-review-panel";
import { FinalizeEvaluationDialog } from "./finalize-evaluation-dialog";
import { OnboardingChecklistPanel } from "./onboarding-checklist-panel";
import { CompletionAndCertificatePanel } from "@/features/certificates/components/completion-and-certificate-panel";
import { CreateTaskDialog } from "@/features/intern-tasks/components/create-task-dialog";
import { InternTaskList } from "@/features/intern-tasks/components/intern-task-list";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Calendar, Building, UserCheck, Award, Clock } from "lucide-react";

/** Statuses from which a final outcome may still be recorded (mirrors the service state machine). */
const FINALIZABLE_STATUSES: EvaluationStatus[] = [
  EvaluationStatus.IN_PROGRESS,
  EvaluationStatus.UNDER_REVIEW,
  EvaluationStatus.EXTENDED,
];

export function getEvaluationBadge(status: EvaluationStatus) {
  switch (status) {
    case EvaluationStatus.PENDING_TRIGGER:
      return <Badge variant="warning">Pending Start Trigger (OD-001)</Badge>;
    case EvaluationStatus.IN_PROGRESS:
      return <Badge variant="default">In Progress (7 Working Days)</Badge>;
    case EvaluationStatus.UNDER_REVIEW:
      return <Badge variant="warning">Under Review</Badge>;
    case EvaluationStatus.PASSED:
      return <Badge variant="success">Passed</Badge>;
    case EvaluationStatus.FAILED:
      return <Badge variant="destructive">Did Not Pass</Badge>;
    case EvaluationStatus.EXTENDED:
      return <Badge variant="secondary">Extended</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

interface EvaluationCockpitProps {
  enrollment: EvaluationEnrollmentDetail;
  /** Evaluations list route for the current portal, e.g. "/admin/evaluations". */
  listHref: string;
  /** Application detail link, or null when the viewer cannot open applications. */
  applicationHref: string | null;
  /** ADMIN / HR decision authority (finalize, ID card, certificate issuance). */
  canDecide: boolean;
}

/**
 * Evaluation cockpit shared by the admin and sub-admin portals. Authorization happens in the
 * page (and again in every Server Action); this component only hides controls the viewer cannot use.
 */
export function EvaluationCockpit({
  enrollment,
  listHref,
  applicationHref,
  canDecide,
}: EvaluationCockpitProps) {
  const isRunning = enrollment.status === EvaluationStatus.IN_PROGRESS;
  const canFinalize = canDecide && FINALIZABLE_STATUSES.includes(enrollment.status);
  const isPassed = enrollment.status === EvaluationStatus.PASSED;

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      <div>
        <Link
          href={listHref}
          className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 transition-colors mb-4"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Evaluations List
        </Link>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-6">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="font-mono text-xs font-bold text-primary bg-primary/10 px-2.5 py-0.5 rounded">
                {enrollment.referenceCode}
              </span>
              {getEvaluationBadge(enrollment.status)}
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
              {enrollment.candidateName}
            </h1>
            <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground mt-2">
              <span className="flex items-center gap-1.5 font-medium text-foreground">
                <Award className="h-3.5 w-3.5 text-primary" /> {enrollment.openingTitle}
              </span>
              <span className="flex items-center gap-1.5">
                <Building className="h-3.5 w-3.5" /> {enrollment.openingDepartment}
              </span>
              {enrollment.supervisor && (
                <span className="flex items-center gap-1.5">
                  <UserCheck className="h-3.5 w-3.5" /> Supervisor: {enrollment.supervisor.name}
                </span>
              )}
            </div>
          </div>

          {applicationHref && (
            <Link href={applicationHref}>
              <Button size="sm" variant="outline">
                View Recruitment Application
              </Button>
            </Link>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-border">
          <CardContent className="pt-6">
            <p className="text-xs font-medium text-muted-foreground">Evaluation Window</p>
            <p className="text-xl font-bold text-foreground mt-1">
              {enrollment.workingDaysTarget} Working Days
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Excludes configured non-working days (OD-002)</p>
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardContent className="pt-6">
            <p className="text-xs font-medium text-muted-foreground">Start Date (Day 1)</p>
            <p className="text-base font-semibold text-foreground mt-1 flex items-center gap-1.5">
              <Calendar className="h-4 w-4 text-primary" />
              {enrollment.startDate ? new Date(enrollment.startDate).toLocaleDateString() : "Pending Trigger (OD-001)"}
            </p>
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardContent className="pt-6">
            <p className="text-xs font-medium text-muted-foreground">Computed Target End Date</p>
            <p className="text-base font-semibold text-foreground mt-1 flex items-center gap-1.5">
              <Clock className="h-4 w-4 text-primary" />
              {enrollment.endDate ? new Date(enrollment.endDate).toLocaleDateString() : "Awaiting Countdown Start"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Start trigger (only PENDING_TRIGGER → IN_PROGRESS) */}
      <StartEvaluationDialog
        enrollmentId={enrollment.id}
        candidateName={enrollment.candidateName}
        currentStatus={enrollment.status}
      />

      <CheckpointReviewPanel
        checkpoints={enrollment.checkpoints}
        canReview={isRunning}
      />

      {/* Final outcome: offered only while the evaluation can still be finalized, and only to HR/Admin */}
      {canFinalize && (
        <FinalizeEvaluationDialog
          enrollmentId={enrollment.id}
          candidateName={enrollment.candidateName}
          currentStatus={enrollment.status}
        />
      )}
      {!canFinalize && (enrollment.status === EvaluationStatus.PASSED || enrollment.status === EvaluationStatus.FAILED) && (
        <Card className="border-border bg-muted/20">
          <CardContent className="pt-6 text-xs text-muted-foreground space-y-1">
            <p className="font-semibold text-foreground">Final outcome recorded: {enrollment.status}</p>
            {enrollment.finalReviewNotes && (
              <p className="whitespace-pre-wrap">{enrollment.finalReviewNotes}</p>
            )}
          </CardContent>
        </Card>
      )}

      <OnboardingChecklistPanel
        enrollmentId={enrollment.id}
        evaluationStatus={enrollment.status}
        onboarding={enrollment.onboarding}
        idCard={enrollment.idCard}
        canIssueIdCard={canDecide}
      />

      <div className="space-y-4 pt-4 border-t border-border">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-foreground">Assigned Tasks & Deliverables</h3>
            <p className="text-xs text-muted-foreground">
              Assign project tasks, set deadlines, and review versioned submissions from the intern.
            </p>
          </div>
          <CreateTaskDialog enrollmentId={enrollment.id} />
        </div>
        <InternTaskList tasks={enrollment.tasks || []} isSupervisorView={true} />
      </div>

      <CompletionAndCertificatePanel
        enrollmentId={enrollment.id}
        evaluationPassed={isPassed}
        completion={enrollment.completion}
        certificate={enrollment.certificate}
        canIssueCertificate={canDecide}
      />
    </div>
  );
}
