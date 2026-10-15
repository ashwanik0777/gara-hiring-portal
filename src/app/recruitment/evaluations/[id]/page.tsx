import React from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/guards";
import { evaluationService } from "@/features/internship-evaluation/services/evaluation-service";
import { EvaluationStatus } from "@prisma/client";
import { StartEvaluationDialog } from "@/features/internship-evaluation/components/start-evaluation-dialog";
import { CheckpointReviewPanel } from "@/features/internship-evaluation/components/checkpoint-review-panel";
import { FinalizeEvaluationDialog } from "@/features/internship-evaluation/components/finalize-evaluation-dialog";
import { OnboardingChecklistPanel } from "@/features/internship-evaluation/components/onboarding-checklist-panel";
import { CompletionAndCertificatePanel } from "@/features/certificates/components/completion-and-certificate-panel";
import { CreateTaskDialog } from "@/features/intern-tasks/components/create-task-dialog";
import { InternTaskList } from "@/features/intern-tasks/components/intern-task-list";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  Calendar,
  Building,
  UserCheck,
  Award,
  Clock,
} from "lucide-react";

interface EvaluationDetailPageProps {
  params: Promise<{ id: string }>;
}

function getEvaluationBadge(status: EvaluationStatus) {
  switch (status) {
    case EvaluationStatus.PENDING_TRIGGER:
      return <Badge variant="warning">Pending Start Trigger (OD-001)</Badge>;
    case EvaluationStatus.IN_PROGRESS:
      return <Badge variant="default">In Progress (7 Working Days)</Badge>;
    case EvaluationStatus.UNDER_REVIEW:
      return <Badge variant="warning">Under Review</Badge>;
    case EvaluationStatus.PASSED:
      return <Badge variant="success">Passed & Qualified</Badge>;
    case EvaluationStatus.FAILED:
      return <Badge variant="destructive">Did Not Meet Benchmark</Badge>;
    case EvaluationStatus.EXTENDED:
      return <Badge variant="secondary">Extended</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

export const instant = false;

export default async function EvaluationDetailPage({
  params,
}: EvaluationDetailPageProps) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { id } = await params;

  let enrollment;
  try {
    enrollment = await evaluationService.getEvaluationDetail(id, user);
  } catch {
    notFound();
  }

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      {/* Navigation and Top Bar */}
      <div>
        <Link
          href="/recruitment/evaluations"
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

          <Link href={`/recruitment/applications/${enrollment.applicationId}`}>
            <Button size="sm" variant="outline">
              View Recruitment Application
            </Button>
          </Link>
        </div>
      </div>

      {/* 7-Working-Day Timing Card */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-border">
          <CardContent className="pt-6">
            <p className="text-xs font-medium text-muted-foreground">Evaluation Window</p>
            <p className="text-xl font-bold text-foreground mt-1">7 Working Days</p>
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

      {/* Start Trigger Dialog (shown when PENDING_TRIGGER) */}
      <StartEvaluationDialog
        enrollmentId={enrollment.id}
        candidateName={enrollment.candidateName}
        currentStatus={enrollment.status}
      />

      {/* Checkpoints Progress Panel */}
      <CheckpointReviewPanel
        checkpoints={enrollment.checkpoints}
        enrollmentId={enrollment.id}
      />

      {/* Finalize Outcome Dialog (shown when IN_PROGRESS or UNDER_REVIEW) */}
      {(enrollment.status === EvaluationStatus.IN_PROGRESS ||
        enrollment.status === EvaluationStatus.UNDER_REVIEW ||
        enrollment.status === EvaluationStatus.PASSED ||
        enrollment.status === EvaluationStatus.FAILED) && (
        <FinalizeEvaluationDialog
          enrollmentId={enrollment.id}
          candidateName={enrollment.candidateName}
          currentStatus={enrollment.status}
        />
      )}

      {/* Onboarding Checklist & ID Card Issuance */}
      <OnboardingChecklistPanel
        enrollmentId={enrollment.id}
        evaluationStatus={enrollment.status}
        onboarding={enrollment.onboarding}
        idCard={enrollment.idCard}
      />

      {/* Internship Task Management (Prompt 6) */}
      <div className="space-y-4 pt-4 border-t border-border">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-foreground">
              Assigned Tasks & Deliverables (Prompt 6)
            </h3>
            <p className="text-xs text-muted-foreground">
              Assign project tasks, set deadlines, and review versioned submissions from the intern.
            </p>
          </div>
          <CreateTaskDialog enrollmentId={enrollment.id} />
        </div>
        <InternTaskList tasks={enrollment.tasks || []} isSupervisorView={true} />
      </div>

      {/* Completion Decision & Certificate Issuance (Prompt 6) */}
      <CompletionAndCertificatePanel
        enrollmentId={enrollment.id}
        completion={enrollment.completion}
        certificate={enrollment.certificate}
      />
    </div>
  );
}
