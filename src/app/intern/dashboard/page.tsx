import React, { Suspense } from "react";
import Link from "next/link";
import { Building, Calendar, CalendarDays, CheckSquare, Clock, CreditCard, UserCheck } from "lucide-react";
import { requirePortalCapability } from "@/features/lifecycle/services/lifecycle-service";
import {
  getOwnEvaluationWorkspace,
  type EvaluationWorkspace,
} from "@/features/lifecycle/services/self-service-dashboard-service";
import type { LifecycleState } from "@/features/lifecycle/types";
import { InternTaskList } from "@/features/intern-tasks/components/intern-task-list";
import { ProgressReportDialog } from "@/features/intern-tasks/components/progress-report-dialog";
import {
  CertificateSection,
  CheckpointsSection,
  EvaluationOverview,
  EvaluationRecordSection,
  evaluationStatusBadge,
  IdCardSection,
  ProgressReportsSection,
  WhatHappensNext,
} from "@/features/lifecycle/components/intern-workspace-sections";
import {
  QuickLinksSection,
  TodayAttendanceSection,
  type QuickLink,
} from "@/features/lifecycle/components/hr-self-service-sections";
import { InternConversionSection } from "@/features/lifecycle/components/intern-conversion-section";
import { EmploymentPeriodsSection } from "@/features/lifecycle/components/employment-periods-section";
import {
  formatCalendarDate,
  linkButtonClass,
  SectionCard,
  SectionSkeleton,
} from "@/features/lifecycle/components/self-service-ui";
import { ListCardSkeleton } from "@/components/feedback/page-skeletons";
import { EmptyState } from "@/components/feedback/empty-state";
import { Badge } from "@/components/ui/badge";
import { EmployeeStatus, EvaluationStatus } from "@/types/enums";

export const instant = false;

export const metadata = {
  title: "Workspace — GARA Innovation",
  description: "Your supervised evaluation or intern workspace.",
};

const INTERN_QUICK_LINKS: QuickLink[] = [
  { href: "/hrms/attendance", label: "Attendance", description: "Check in and review your history", icon: Clock },
  { href: "/hrms/leave", label: "Leave", description: "Request leave and track requests", icon: CalendarDays },
  { href: "/hrms/payroll", label: "Payslips", description: "Your payroll records", icon: CreditCard },
];

function TasksSection({ workspace }: { workspace: EvaluationWorkspace }) {
  return (
    <SectionCard
      id="tasks"
      title="Assigned tasks & deliverables"
      icon={<CheckSquare className="h-4 w-4" />}
      description="Review requirements, submit deliverables, and track feedback from your supervisor."
    >
      <InternTaskList tasks={workspace.tasks} />
    </SectionCard>
  );
}

function WorkspaceHeader({
  workspace,
  badge,
  subtitle,
}: {
  workspace: EvaluationWorkspace;
  badge: string;
  subtitle?: React.ReactNode;
}) {
  return (
    <header className="rounded-2xl border border-border/70 bg-card p-4 shadow-2xs sm:p-6">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="default" className="text-xs">
              {badge}
            </Badge>
            <span className="font-mono text-xs text-muted-foreground">{workspace.referenceCode}</span>
            {evaluationStatusBadge(workspace.status)}
          </div>
          <h2 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">{workspace.opening.title}</h2>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-1 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Building className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
              {workspace.opening.department}
            </span>
            <span className="flex items-center gap-1.5">
              <UserCheck className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
              Supervisor: {workspace.supervisorName || "Not assigned yet"}
            </span>
            {subtitle}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <ProgressReportDialog enrollmentId={workspace.id} />
        </div>
      </div>
    </header>
  );
}

/** Selected for the supervised evaluation, still a candidate. */
function EvaluationStageView({ workspace }: { workspace: EvaluationWorkspace | null }) {
  if (!workspace) {
    return (
      <EmptyState
        title="No evaluation found"
        description="We could not find an internship evaluation linked to your account. Your applications are still available on your dashboard."
        action={
          <Link href="/candidate/dashboard" className={linkButtonClass("outline")}>
            Back to dashboard
          </Link>
        }
      />
    );
  }

  return (
    <div className="w-full space-y-6">
      <WorkspaceHeader
        workspace={workspace}
        badge="Evaluation workspace"
        subtitle={
          workspace.startDate ? (
            <span className="flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
              Started {formatCalendarDate(workspace.startDate)}
            </span>
          ) : undefined
        }
      />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <EvaluationOverview workspace={workspace} />
        </div>
        <WhatHappensNext status={workspace.status} />
      </div>
      <CheckpointsSection workspace={workspace} canSubmit={workspace.status === EvaluationStatus.IN_PROGRESS} />
      <TasksSection workspace={workspace} />
      <ProgressReportsSection workspace={workspace} />
    </div>
  );
}

/** Joined as an intern (INTERN role). */
function InternStageView({
  workspace,
  lifecycle,
  userId,
  userName,
}: {
  workspace: EvaluationWorkspace | null;
  lifecycle: LifecycleState;
  userId: string;
  userName: string;
}) {
  const employment = lifecycle.employment;
  const canRecordAttendance = Boolean(employment && employment.status !== EmployeeStatus.EXITED);

  return (
    <div className="w-full space-y-6">
      {workspace ? (
        <WorkspaceHeader
          workspace={workspace}
          badge="Intern workspace"
          subtitle={
            employment ? (
              <span className="flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                Joined {formatCalendarDate(employment.joiningDate)} · {employment.employeeCode}
              </span>
            ) : undefined
          }
        />
      ) : (
        <header className="rounded-2xl border border-border/70 bg-card p-4 shadow-2xs sm:p-6">
          <Badge variant="default" className="text-xs">
            Intern workspace
          </Badge>
          <h2 className="mt-2 text-xl font-bold tracking-tight text-foreground sm:text-2xl">Welcome, {userName}</h2>
          {employment && (
            <p className="mt-1 text-xs text-muted-foreground">
              {employment.designation} · {employment.department} · Joined {formatCalendarDate(employment.joiningDate)}
            </p>
          )}
        </header>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <Suspense
            fallback={
              <SectionSkeleton label="Loading today's attendance">
                <ListCardSkeleton rows={2} />
              </SectionSkeleton>
            }
          >
            <TodayAttendanceSection
              userId={userId}
              canRecord={canRecordAttendance}
              unavailableReason="Self check-in becomes available once HR links your employee record."
            />
          </Suspense>
        </div>
        <QuickLinksSection links={INTERN_QUICK_LINKS} />
      </div>

      <Suspense
        fallback={
          <SectionSkeleton label="Loading your progress review">
            <ListCardSkeleton rows={2} />
          </SectionSkeleton>
        }
      >
        <InternConversionSection userId={userId} />
      </Suspense>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <IdCardSection idCard={workspace?.idCard ?? null} />
        <CertificateSection certificate={workspace?.certificate ?? null} />
      </div>

      {workspace && <TasksSection workspace={workspace} />}
      {workspace && <ProgressReportsSection workspace={workspace} />}

      <Suspense
        fallback={
          <SectionSkeleton label="Loading your employment history">
            <ListCardSkeleton rows={2} />
          </SectionSkeleton>
        }
      >
        <EmploymentPeriodsSection userId={userId} />
      </Suspense>

      <EvaluationRecordSection workspace={workspace} />
    </div>
  );
}

export default async function InternDashboardPage() {
  // Evaluation-stage candidates and joined interns only; everyone else goes to their home.
  const { user, lifecycle } = await requirePortalCapability("evaluationWorkspace", {
    callbackPath: "/intern/dashboard",
  });

  // Only the signed-in user's own enrollment is ever loaded (record-level scoping by user.id).
  const workspace = await getOwnEvaluationWorkspace(user.id);

  if (lifecycle.stage === "INTERN") {
    return (
      <InternStageView
        workspace={workspace}
        lifecycle={lifecycle}
        userId={user.id}
        userName={user.name?.trim().split(/\s+/)[0] || "there"}
      />
    );
  }
  return <EvaluationStageView workspace={workspace} />;
}
