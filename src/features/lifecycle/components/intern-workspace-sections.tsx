import React from "react";
import { Award, BadgeCheck, ClipboardCheck, FileText, Info, ListChecks } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { CertificateCard } from "@/features/certificates/components/certificate-card";
import { InternCheckpointList } from "@/features/internship-evaluation/components/intern-checkpoint-list";
import { EvaluationStatus, IdCardStatus } from "@/types/enums";
import {
  summarizeCheckpoints,
  type EvaluationWorkspace,
} from "../services/self-service-dashboard-service";
import { LocalDateTime } from "./local-date-time";
import { EmptyHint, EVALUATION_STATUS_LABELS, formatCalendarDate, ProgressBar, SectionCard } from "./self-service-ui";

/*
 * Presentational sections of the evaluation / intern workspace. They render the user's
 * own enrollment as loaded by `getOwnEvaluationWorkspace` (record-level scoping by user id).
 */

/** Factual next steps per evaluation status (product-owner decisions of 2026-10-25 only). */
const NEXT_STEPS: Record<EvaluationStatus, string> = {
  PENDING_TRIGGER:
    "Your evaluation has not started yet. When it starts, the start and end dates appear here and daily checkpoints open for your notes.",
  IN_PROGRESS:
    "Submit your notes for each daily checkpoint and complete the tasks your supervisor assigns. Your supervisor reviews them and leaves feedback.",
  UNDER_REVIEW:
    "Your checkpoints are in and your supervisor is reviewing the evaluation. The outcome will be shown here.",
  EXTENDED:
    "Your evaluation has been extended. Keep submitting checkpoints and tasks; any updated dates appear here.",
  PASSED:
    "You passed the evaluation. Once HR marks you as joined, this becomes your intern workspace with attendance, leave requests, payslips, and your ID card and certificate.",
  FAILED: "The evaluation outcome has been recorded. Your applications remain available in your dashboard.",
};

export function evaluationStatusBadge(status: EvaluationStatus) {
  const variant =
    status === EvaluationStatus.PASSED
      ? "success"
      : status === EvaluationStatus.FAILED
        ? "destructive"
        : status === EvaluationStatus.IN_PROGRESS
          ? "default"
          : "outline";
  return <Badge variant={variant}>{EVALUATION_STATUS_LABELS[status]}</Badge>;
}

export function EvaluationOverview({ workspace }: { workspace: EvaluationWorkspace }) {
  const checkpoints = summarizeCheckpoints(workspace.checkpoints);
  const completedTasks = workspace.tasks.filter((t) => t.status === "COMPLETED").length;

  return (
    <SectionCard
      id="evaluation-overview"
      title="Evaluation overview"
      icon={<Award className="h-4 w-4" />}
      description={`Supervised ${workspace.workingDaysTarget}-working-day evaluation`}
      action={evaluationStatusBadge(workspace.status)}
    >
      <dl className="grid grid-cols-1 gap-3 text-xs sm:grid-cols-3">
        <div className="rounded-xl border border-border/60 bg-muted/30 p-3">
          <dt className="text-muted-foreground">Start date</dt>
          <dd className="mt-0.5 font-semibold text-foreground">
            {workspace.startDate ? formatCalendarDate(workspace.startDate) : "Not started yet"}
          </dd>
        </div>
        <div className="rounded-xl border border-border/60 bg-muted/30 p-3">
          <dt className="text-muted-foreground">End date</dt>
          <dd className="mt-0.5 font-semibold text-foreground">
            {workspace.endDate ? formatCalendarDate(workspace.endDate) : "Set when the evaluation starts"}
          </dd>
        </div>
        <div className="rounded-xl border border-border/60 bg-muted/30 p-3">
          <dt className="text-muted-foreground">Tasks completed</dt>
          <dd className="mt-0.5 font-semibold text-foreground">
            {completedTasks} of {workspace.tasks.length}
          </dd>
        </div>
      </dl>
      <div className="mt-4 space-y-1.5">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Daily checkpoints submitted</span>
          <span className="font-semibold text-foreground">
            {checkpoints.total > 0 ? `${checkpoints.submitted} of ${checkpoints.total}` : "None set up yet"}
          </span>
        </div>
        {checkpoints.total > 0 && (
          <>
            <ProgressBar value={checkpoints.submitted} max={checkpoints.total} label="Daily checkpoints submitted" />
            <p className="text-[11px] text-muted-foreground">
              {checkpoints.reviewed} of {checkpoints.total} reviewed by your supervisor
            </p>
          </>
        )}
      </div>
    </SectionCard>
  );
}

export function WhatHappensNext({ status }: { status: EvaluationStatus }) {
  return (
    <SectionCard id="next-steps" title="What happens next" icon={<Info className="h-4 w-4" />}>
      <p className="text-sm leading-relaxed text-muted-foreground">{NEXT_STEPS[status]}</p>
    </SectionCard>
  );
}

export function CheckpointsSection({
  workspace,
  canSubmit,
  headingLevel = "h2",
}: {
  workspace: EvaluationWorkspace;
  canSubmit: boolean;
  headingLevel?: "h2" | "h3";
}) {
  return (
    <SectionCard
      id="checkpoints"
      title="Daily evaluation checkpoints"
      icon={<ClipboardCheck className="h-4 w-4" />}
      headingLevel={headingLevel}
      description={
        canSubmit
          ? "Submit your notes for each checkpoint. Your supervisor reviews them and leaves feedback."
          : "Checkpoint notes can be submitted while your evaluation is in progress."
      }
    >
      {workspace.checkpoints.length === 0 ? (
        <EmptyHint
          icon={<ClipboardCheck className="h-6 w-6" />}
          title="No checkpoints yet"
          description="Daily checkpoints appear here once your evaluation is set up."
        />
      ) : (
        <InternCheckpointList checkpoints={workspace.checkpoints} canSubmit={canSubmit} />
      )}
    </SectionCard>
  );
}

export function ProgressReportsSection({ workspace }: { workspace: EvaluationWorkspace }) {
  return (
    <SectionCard
      id="progress-reports"
      title="Progress reports"
      icon={<FileText className="h-4 w-4" />}
      description="Your milestone and periodic summaries, with feedback from your supervisor."
    >
      {workspace.progressReports.length === 0 ? (
        <EmptyHint
          icon={<FileText className="h-6 w-6" />}
          title="No progress reports filed yet"
          description="Use Submit Progress Report at the top of this page to file your first summary."
        />
      ) : (
        <ul className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {workspace.progressReports.map((report) => (
            <li key={report.id}>
              <Card className="h-full border-border">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="text-sm font-semibold text-foreground">{report.periodIdentifier}</CardTitle>
                    <Badge variant="outline">{report.cadence}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3 pt-1 text-xs">
                  <p className="text-[11px] text-muted-foreground">
                    Filed on <LocalDateTime iso={report.submittedAt} mode="date" />
                  </p>
                  <div>
                    <p className="text-[11px] font-semibold uppercase text-muted-foreground">Summary</p>
                    <p className="mt-0.5 whitespace-pre-wrap text-foreground">{report.summary}</p>
                  </div>
                  {report.learnings && (
                    <div>
                      <p className="text-[11px] font-semibold uppercase text-muted-foreground">Learnings</p>
                      <p className="mt-0.5 whitespace-pre-wrap text-foreground">{report.learnings}</p>
                    </div>
                  )}
                  {report.blockers && (
                    <div className="rounded border border-destructive/15 bg-destructive/5 p-2 text-destructive">
                      <p className="text-[11px] font-semibold uppercase">Blockers</p>
                      <p className="mt-0.5 whitespace-pre-wrap text-[11px]">{report.blockers}</p>
                    </div>
                  )}
                  {report.supervisorFeedback && (
                    <div className="rounded border border-border/40 bg-muted/40 p-2.5">
                      <p className="text-[11px] font-semibold text-primary">Supervisor feedback</p>
                      <p className="mt-0.5 text-foreground">{report.supervisorFeedback}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

const ID_CARD_LABELS: Record<IdCardStatus, string> = {
  PENDING_APPROVAL: "Awaiting approval",
  APPROVED: "Approved",
  ISSUED: "Issued",
  REVOKED: "Revoked",
};

export function IdCardSection({ idCard }: { idCard: EvaluationWorkspace["idCard"] }) {
  return (
    <SectionCard
      id="id-card"
      title="ID card"
      icon={<BadgeCheck className="h-4 w-4" />}
      action={idCard ? <Badge variant={idCard.status === IdCardStatus.ISSUED ? "success" : "outline"}>{ID_CARD_LABELS[idCard.status]}</Badge> : undefined}
    >
      {!idCard ? (
        <EmptyHint
          icon={<BadgeCheck className="h-6 w-6" />}
          title="No ID card yet"
          description="Your intern ID card will appear here once HR issues it."
        />
      ) : (
        <dl className="grid grid-cols-1 gap-3 text-xs sm:grid-cols-2">
          <div className="rounded-xl border border-border/60 bg-muted/30 p-3">
            <dt className="text-muted-foreground">Card number</dt>
            <dd className="mt-0.5 font-mono font-semibold text-foreground">
              {idCard.status !== IdCardStatus.REVOKED && idCard.cardNumber ? idCard.cardNumber : "Not assigned"}
            </dd>
          </div>
          <div className="rounded-xl border border-border/60 bg-muted/30 p-3">
            <dt className="text-muted-foreground">Issued on</dt>
            <dd className="mt-0.5 font-semibold text-foreground">
              {idCard.issuedAt ? <LocalDateTime iso={idCard.issuedAt} mode="date" /> : "Not issued yet"}
            </dd>
          </div>
        </dl>
      )}
    </SectionCard>
  );
}

export function CertificateSection({ certificate }: { certificate: EvaluationWorkspace["certificate"] }) {
  return (
    <SectionCard id="certificate" title="Certificate" icon={<Award className="h-4 w-4" />}>
      {certificate ? (
        <CertificateCard certificate={certificate} />
      ) : (
        <EmptyHint
          icon={<Award className="h-6 w-6" />}
          title="No certificate issued yet"
          description="Your internship certificate will appear here once it is issued."
        />
      )}
    </SectionCard>
  );
}

/** The intern's evaluation record, linked from the navigation as /intern/dashboard#evaluation. */
export function EvaluationRecordSection({ workspace }: { workspace: EvaluationWorkspace | null }) {
  if (!workspace) {
    return (
      <SectionCard id="evaluation" title="Evaluation record" icon={<ListChecks className="h-4 w-4" />}>
        <EmptyHint
          icon={<ListChecks className="h-6 w-6" />}
          title="No evaluation record linked"
          description="There is no internship evaluation linked to your account."
        />
      </SectionCard>
    );
  }

  const checkpoints = summarizeCheckpoints(workspace.checkpoints);
  return (
    <SectionCard
      id="evaluation"
      title="Evaluation record"
      icon={<ListChecks className="h-4 w-4" />}
      description={`${workspace.opening.title} · ${workspace.referenceCode}`}
      action={evaluationStatusBadge(workspace.status)}
    >
      <dl className="grid grid-cols-1 gap-3 text-xs sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-border/60 bg-muted/30 p-3">
          <dt className="text-muted-foreground">Start date</dt>
          <dd className="mt-0.5 font-semibold text-foreground">{formatCalendarDate(workspace.startDate)}</dd>
        </div>
        <div className="rounded-xl border border-border/60 bg-muted/30 p-3">
          <dt className="text-muted-foreground">End date</dt>
          <dd className="mt-0.5 font-semibold text-foreground">{formatCalendarDate(workspace.endDate)}</dd>
        </div>
        <div className="rounded-xl border border-border/60 bg-muted/30 p-3">
          <dt className="text-muted-foreground">Outcome recorded</dt>
          <dd className="mt-0.5 font-semibold text-foreground">
            {workspace.evaluatedAt ? <LocalDateTime iso={workspace.evaluatedAt} mode="date" /> : "Not recorded"}
          </dd>
        </div>
        <div className="rounded-xl border border-border/60 bg-muted/30 p-3">
          <dt className="text-muted-foreground">Checkpoints reviewed</dt>
          <dd className="mt-0.5 font-semibold text-foreground">
            {checkpoints.total > 0 ? `${checkpoints.reviewed} of ${checkpoints.total}` : "None recorded"}
          </dd>
        </div>
      </dl>
      {workspace.checkpoints.length > 0 && (
        <div className="mt-4">
          <InternCheckpointList checkpoints={workspace.checkpoints} canSubmit={false} />
        </div>
      )}
    </SectionCard>
  );
}
