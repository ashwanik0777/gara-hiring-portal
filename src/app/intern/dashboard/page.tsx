import React from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { InternTaskList } from "@/features/intern-tasks/components/intern-task-list";
import { ProgressReportDialog } from "@/features/intern-tasks/components/progress-report-dialog";
import { CertificateCard } from "@/features/certificates/components/certificate-card";
import { InternCheckpointList } from "@/features/internship-evaluation/components/intern-checkpoint-list";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/feedback/empty-state";
import { EvaluationStatus } from "@prisma/client";
import {
  Award,
  CheckSquare,
  ClipboardCheck,
  FileText,
  Calendar,
  Building,
  UserCheck,
} from "lucide-react";

export const instant = false;

export default async function InternDashboardPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login?callbackUrl=/intern/dashboard");
  }
  if (user.mustChangePassword) {
    redirect("/set-password");
  }

  // Only the signed-in user's own enrollment is ever loaded (record-level scoping by user.id).
  const enrollment = await prisma.internshipEnrollment.findFirst({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    include: {
      application: {
        include: {
          opening: true,
        },
      },
      supervisor: {
        select: { id: true, name: true, email: true },
      },
      checkpoints: {
        select: {
          id: true,
          dayNumber: true,
          title: true,
          description: true,
          submissionNotes: true,
          supervisorFeedback: true,
          status: true,
        },
        orderBy: { dayNumber: "asc" },
      },
      tasks: {
        include: {
          // Only the reviewer's display name reaches the intern's browser.
          assignedBy: {
            select: { name: true },
          },
          submissions: {
            include: {
              reviewedBy: {
                select: { name: true },
              },
            },
            orderBy: { versionNumber: "desc" },
          },
        },
        orderBy: { createdAt: "desc" },
      },
      progressReports: {
        orderBy: { submittedAt: "desc" },
      },
      certificate: {
        // Only the fields the certificate card renders (no revocation reason, storage key or issuer).
        select: {
          id: true,
          verificationCode: true,
          recipientName: true,
          programmeTitle: true,
          completionDate: true,
          signatoryName: true,
          signatoryTitle: true,
          status: true,
        },
      },
    },
  });

  if (!enrollment) {
    return (
      <EmptyState
        title="No Active Internship Enrollment"
        description="You are currently not enrolled in an active supervised internship programme. Once your application passes evaluation selection, your workspace will be activated here."
        action={
          <Link href="/candidate/dashboard">
            <Button variant="outline" size="sm">
              Return to Candidate Applications
            </Button>
          </Link>
        }
      />
    );
  }

  const opening = enrollment.application.opening;
  const completedTasks = enrollment.tasks.filter((t) => t.status === "COMPLETED").length;
  const totalTasks = enrollment.tasks.length;

  return (
    <div className="space-y-8">
      {/* Header Banner */}
      <div className="rounded-xl border border-border bg-card p-6 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Badge variant="default" className="text-xs">
                Intern Workspace
              </Badge>
              <span className="text-xs text-muted-foreground font-mono">
                {enrollment.application.referenceCode}
              </span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              {opening.title}
            </h1>
            <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground pt-1">
              <span className="flex items-center gap-1.5">
                <Building className="h-3.5 w-3.5 text-primary" />
                {opening.department}
              </span>
              <span className="flex items-center gap-1.5">
                <UserCheck className="h-3.5 w-3.5 text-primary" />
                Supervisor: {enrollment.supervisor?.name || "Not assigned yet"}
              </span>
              {enrollment.startDate && (
                <span className="flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5 text-primary" />
                  Started: {new Date(enrollment.startDate).toLocaleDateString()}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <ProgressReportDialog enrollmentId={enrollment.id} />
          </div>
        </div>

        {/* Quick Progress Metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 pt-6 border-t border-border">
          <div className="p-3 rounded-lg bg-muted/20 border border-border/60">
            <p className="text-[11px] font-medium text-muted-foreground">Tasks Progress</p>
            <p className="text-lg font-bold text-foreground mt-0.5">
              {completedTasks} / {totalTasks}
            </p>
          </div>

          <div className="p-3 rounded-lg bg-muted/20 border border-border/60">
            <p className="text-[11px] font-medium text-muted-foreground">Progress Reports</p>
            <p className="text-lg font-bold text-foreground mt-0.5">
              {enrollment.progressReports.length} Submitted
            </p>
          </div>

          <div className="p-3 rounded-lg bg-muted/20 border border-border/60">
            <p className="text-[11px] font-medium text-muted-foreground">Evaluation Status</p>
            <p className="text-sm font-semibold text-foreground mt-1">
              {enrollment.status}
            </p>
          </div>

          <div className="p-3 rounded-lg bg-muted/20 border border-border/60">
            <p className="text-[11px] font-medium text-muted-foreground">Certificate</p>
            <p className="text-sm font-semibold text-foreground mt-1">
              {!enrollment.certificate
                ? "Pending Completion"
                : enrollment.certificate.status === "ACTIVE"
                  ? "Issued"
                  : enrollment.certificate.status}
            </p>
          </div>
        </div>
      </div>

      {/* Official Certificate Card (if awarded) */}
      {enrollment.certificate && (
        <section className="space-y-3">
          <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
            <Award className="h-4 w-4 text-primary" />
            Official Credential
          </h2>
          <CertificateCard certificate={enrollment.certificate} />
        </section>
      )}

      {/* Daily Evaluation Checkpoints */}
      {enrollment.checkpoints.length > 0 && (
        <section className="space-y-4" aria-labelledby="intern-checkpoints-heading">
          <div>
            <h2
              id="intern-checkpoints-heading"
              className="text-lg font-semibold text-foreground flex items-center gap-2"
            >
              <ClipboardCheck className="h-5 w-5 text-primary" />
              Daily Evaluation Checkpoints
            </h2>
            <p className="text-xs text-muted-foreground">
              {enrollment.status === EvaluationStatus.IN_PROGRESS
                ? "Submit your notes for each checkpoint. Your supervisor reviews them and leaves feedback."
                : "Checkpoint notes can be submitted while your evaluation is in progress."}
            </p>
          </div>

          <InternCheckpointList
            checkpoints={enrollment.checkpoints}
            canSubmit={enrollment.status === EvaluationStatus.IN_PROGRESS}
          />
        </section>
      )}

      {/* Assigned Tasks Section */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
              <CheckSquare className="h-5 w-5 text-primary" />
              Assigned Tasks & Deliverables
            </h2>
            <p className="text-xs text-muted-foreground">
              Review requirements, submit deliverables, and track version feedback from your supervisor.
            </p>
          </div>
        </div>

        <InternTaskList
          tasks={enrollment.tasks.map((t) => ({
            id: t.id,
            enrollmentId: t.enrollmentId,
            title: t.title,
            description: t.description,
            priority: t.priority,
            dueDate: t.dueDate,
            status: t.status,
            changeRequestNotes: t.changeRequestNotes,
            assignedBy: t.assignedBy,
            createdAt: t.createdAt,
            updatedAt: t.updatedAt,
            submissions: t.submissions.map((s) => ({
              id: s.id,
              versionNumber: s.versionNumber,
              submissionNotes: s.submissionNotes,
              deliverableUrls: (s.deliverableUrls as string[]) || null,
              status: s.status,
              supervisorFeedback: s.supervisorFeedback,
              reviewedAt: s.reviewedAt,
              submittedAt: s.submittedAt,
              reviewedBy: s.reviewedBy,
            })),
          }))}
        />
      </section>

      {/* Progress Reports Section */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              Progress Check-ins & Cadence Reports
            </h2>
            <p className="text-xs text-muted-foreground">
              Configurable milestone submissions documenting achievements, learnings, and mentor feedback.
            </p>
          </div>
        </div>

        {enrollment.progressReports.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-6 text-center">
            <p className="text-sm font-medium text-foreground">No progress reports filed yet</p>
            <p className="text-xs text-muted-foreground mt-1">
              Submit your weekly or milestone summary using the button above.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {enrollment.progressReports.map((report) => (
              <Card key={report.id} className="border-border">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-semibold text-foreground">
                      {report.periodIdentifier}
                    </CardTitle>
                    <Badge variant="outline">{report.cadence}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3 pt-1 text-xs">
                  <div className="text-[11px] text-muted-foreground">
                    Filed on {new Date(report.submittedAt).toLocaleDateString()}
                  </div>
                  <div>
                    <span className="font-semibold text-muted-foreground block text-[11px] uppercase">
                      Summary
                    </span>
                    <p className="text-foreground mt-0.5 whitespace-pre-wrap">
                      {report.summary}
                    </p>
                  </div>

                  {report.learnings && (
                    <div>
                      <span className="font-semibold text-muted-foreground block text-[11px] uppercase">
                        Learnings
                      </span>
                      <p className="text-foreground mt-0.5 whitespace-pre-wrap">
                        {report.learnings}
                      </p>
                    </div>
                  )}

                  {report.blockers && (
                    <div className="rounded bg-destructive/5 border border-destructive/15 p-2 text-destructive">
                      <span className="font-semibold block text-[11px] uppercase">
                        Blockers / Impediments
                      </span>
                      <p className="mt-0.5 whitespace-pre-wrap text-[11px]">
                        {report.blockers}
                      </p>
                    </div>
                  )}

                  {report.supervisorFeedback && (
                    <div className="rounded bg-muted/40 border border-border/40 p-2.5">
                      <span className="font-semibold text-primary block text-[11px]">
                        Supervisor Feedback:
                      </span>
                      <p className="mt-0.5 text-foreground">
                        {report.supervisorFeedback}
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
