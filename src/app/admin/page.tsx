import React, { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/guards";
import { UnauthorizedState } from "@/components/feedback/unauthorized-state";
import { ApplicationStatus, Role } from "@prisma/client";
import {
  FileText,
  Briefcase,
  Calendar,
  Award,
  Users,
  Clock,
  CalendarDays,
  ShieldCheck,
  CreditCard,
  BarChart3,
  ArrowRight,
  Plus,
  AlertCircle,
  Building,
  TrendingUp,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ChartGridSkeleton, ListCardSkeleton } from "@/components/feedback/page-skeletons";
import {
  ActionCenterPanel,
  ActionCenterSkeleton,
} from "@/features/automation/components/action-center-panel";
import {
  getOperationsOverview,
  getRecentActivityOverview,
  getRecruitmentOverview,
  getWorkforceOverview,
  UNAVAILABLE,
  type OverviewMetric,
} from "@/features/analytics/services/admin-overview-service";

export const instant = false;

function formatRelativeTime(date: Date) {
  const diffMs = Date.now() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

function getInitials(name?: string | null) {
  if (!name) return "CA";
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function getApplicationStatusBadge(status: ApplicationStatus) {
  switch (status) {
    case ApplicationStatus.HIRED:
    case ApplicationStatus.OFFER_ACCEPTED:
      return "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20";
    case ApplicationStatus.OFFERED:
      return "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/20";
    case ApplicationStatus.INTERVIEW_SCHEDULED:
    case ApplicationStatus.INTERVIEWED:
      return "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20";
    case ApplicationStatus.EVALUATION_SELECTED:
      return "bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/20";
    case ApplicationStatus.REJECTED:
      return "bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/20";
    default:
      return "bg-slate-500/10 text-slate-700 dark:text-slate-300 border-slate-500/20";
  }
}

// ─── Honest figures: a failed query reads "Unavailable", never 0 ───────────────

const UNAVAILABLE_LABEL = "Unavailable";

function metricText(value: OverviewMetric): string {
  return value === UNAVAILABLE ? UNAVAILABLE_LABEL : String(value);
}

/** Whole-number share of `part` in `whole` (0 when `whole` is 0); null when either failed. */
function shareOf(part: OverviewMetric, whole: OverviewMetric): number | null {
  if (part === UNAVAILABLE || whole === UNAVAILABLE) return null;
  return whole > 0 ? Math.round((part / whole) * 100) : 0;
}

function shareText(part: OverviewMetric, whole: OverviewMetric): string {
  const share = shareOf(part, whole);
  return share === null ? "—" : `${share}%`;
}

/** Share of today's attendance in the workforce, capped at 100 (headcount floor of 1). */
function turnoutRate(present: OverviewMetric, headcount: OverviewMetric): number | null {
  if (present === UNAVAILABLE || headcount === UNAVAILABLE) return null;
  return Math.min(100, Math.round((present / Math.max(headcount, 1)) * 100));
}

function UnavailableNotice({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="flex items-start gap-2 py-6 text-xs text-muted-foreground">
      <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
      {children}
    </p>
  );
}

// ─── Streaming fallbacks (mirror each row's layout) ────────────────────────────

function StreamingFallback({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}

function MetricCardsSkeleton() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5 sm:gap-4">
      {Array.from({ length: 5 }, (_, i) => (
        <div
          key={i}
          className={`space-y-4 rounded-2xl border border-border/80 bg-card p-4 sm:p-5 ${i === 4 ? "col-span-2 sm:col-span-1" : ""}`}
        >
          <div className="flex items-center justify-between">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-8 w-8 rounded-xl" />
          </div>
          <Skeleton className="h-8 w-16" />
          <Skeleton className="h-3 w-28" />
        </div>
      ))}
    </div>
  );
}

function ModuleTilesSkeleton() {
  return (
    <div className="rounded-2xl border border-border/80 bg-card p-5">
      <div className="mb-4 flex items-center justify-between border-b border-border/60 pb-3">
        <Skeleton className="h-3 w-56" />
        <Skeleton className="h-3 w-28" />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {Array.from({ length: 10 }, (_, i) => (
          <div key={i} className="flex items-center justify-between rounded-xl border border-border/70 bg-muted/20 p-3.5">
            <div className="flex items-center gap-2.5">
              <Skeleton className="h-8 w-8 rounded-lg" />
              <Skeleton className="h-3 w-20" />
            </div>
            <Skeleton className="h-5 w-10 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Row 1: executive metric cards ─────────────────────────────────────────────

async function ExecutiveMetrics() {
  const [recruitment, workforce, operations] = await Promise.all([
    getRecruitmentOverview(),
    getWorkforceOverview(),
    getOperationsOverview(),
  ]);
  const totalApplications: OverviewMetric = recruitment === UNAVAILABLE ? UNAVAILABLE : recruitment.total;
  const hiredCount: OverviewMetric = recruitment === UNAVAILABLE ? UNAVAILABLE : recruitment.hired;
  const activeDepartments =
    workforce.topDepartments === UNAVAILABLE ? UNAVAILABLE_LABEL : String(workforce.topDepartments.length);
  const turnout = turnoutRate(operations.todayAttendance, workforce.totalEmployees);

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5 sm:gap-4">
      {/* 1. Applications Pipeline */}
      <Link
        href="/admin/applications"
        className="bg-card border border-border/80 border-l-4 border-l-blue-500 rounded-2xl p-4 sm:p-5 shadow-2xs hover:shadow-xs transition-all flex flex-col justify-between group"
      >
        <div className="flex items-center justify-between gap-2 mb-2">
          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider font-mono">
            Applications
          </span>
          <div className="h-8 w-8 rounded-xl bg-blue-500/15 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
            <FileText className="h-4 w-4" />
          </div>
        </div>
        <div className="text-2xl sm:text-3xl font-extrabold font-mono text-foreground tracking-tight">
          {metricText(totalApplications)}
        </div>
        <div className="mt-2 flex items-center gap-1.5 text-[11px] font-mono">
          <Badge variant="outline" className="text-[10px] bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/20">
            {metricText(hiredCount)} Hired
          </Badge>
          <span className="text-muted-foreground">• {shareText(hiredCount, totalApplications)} Conv</span>
        </div>
      </Link>

      {/* 2. Total Workforce */}
      <Link
        href="/admin/employees"
        className="bg-card border border-border/80 border-l-4 border-l-purple-500 rounded-2xl p-4 sm:p-5 shadow-2xs hover:shadow-xs transition-all flex flex-col justify-between group"
      >
        <div className="flex items-center justify-between gap-2 mb-2">
          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider font-mono">
            Workforce
          </span>
          <div className="h-8 w-8 rounded-xl bg-purple-500/15 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
            <Users className="h-4 w-4" />
          </div>
        </div>
        <div className="text-2xl sm:text-3xl font-extrabold font-mono text-foreground tracking-tight">
          {metricText(workforce.totalEmployees)}
        </div>
        <div className="mt-2 flex items-center gap-1.5 text-[11px] font-mono">
          <span className="font-semibold text-purple-700 dark:text-purple-300">
            {metricText(workforce.fullTime)} FT
          </span>
          <span className="text-muted-foreground">•</span>
          <span className="text-muted-foreground">{metricText(workforce.interns)} Interns</span>
        </div>
      </Link>

      {/* 3. Published Job Openings */}
      <Link
        href="/admin/openings"
        className="bg-card border border-border/80 border-l-4 border-l-emerald-500 rounded-2xl p-4 sm:p-5 shadow-2xs hover:shadow-xs transition-all flex flex-col justify-between group"
      >
        <div className="flex items-center justify-between gap-2 mb-2">
          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider font-mono">
            Job Openings
          </span>
          <div className="h-8 w-8 rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
            <Briefcase className="h-4 w-4" />
          </div>
        </div>
        <div className="text-2xl sm:text-3xl font-extrabold font-mono text-foreground tracking-tight">
          {metricText(operations.activeOpenings)}
        </div>
        <div className="mt-2 flex items-center gap-1.5 text-[11px] font-mono">
          <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20">
            {activeDepartments} Active Depts
          </Badge>
        </div>
      </Link>

      {/* 4. Attendance Today */}
      <Link
        href="/admin/attendance"
        className="bg-card border border-border/80 border-l-4 border-l-amber-500 rounded-2xl p-4 sm:p-5 shadow-2xs hover:shadow-xs transition-all flex flex-col justify-between group"
      >
        <div className="flex items-center justify-between gap-2 mb-2">
          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider font-mono">
            Attendance Today
          </span>
          <div className="h-8 w-8 rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
            <Clock className="h-4 w-4" />
          </div>
        </div>
        <div className="text-2xl sm:text-3xl font-extrabold font-mono text-foreground tracking-tight">
          {metricText(operations.todayAttendance)}
        </div>
        <div className="mt-2 flex items-center gap-1.5 text-[11px] font-mono">
          <span className="font-semibold text-emerald-600 dark:text-emerald-400">
            {turnout === null ? "—" : `${turnout}%`} Turnout
          </span>
          <span className="text-muted-foreground">•</span>
          <span className="text-amber-600 dark:text-amber-400">{metricText(operations.todayOnLeave)} on Leave</span>
        </div>
      </Link>

      {/* 5. Evaluations & Interviews */}
      <Link
        href="/admin/evaluations"
        className="col-span-2 sm:col-span-1 bg-card border border-border/80 border-l-4 border-l-cyan-500 rounded-2xl p-4 sm:p-5 shadow-2xs hover:shadow-xs transition-all flex flex-col justify-between group"
      >
        <div className="flex items-center justify-between gap-2 mb-2">
          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider font-mono">
            7-Working-Day Evaluations
          </span>
          <div className="h-8 w-8 rounded-xl bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
            <Award className="h-4 w-4" />
          </div>
        </div>
        <div className="text-2xl sm:text-3xl font-extrabold font-mono text-foreground tracking-tight">
          {metricText(operations.activeEvaluations)}
        </div>
        <div className="mt-2 flex items-center gap-1.5 text-[11px] font-mono">
          <Badge variant="outline" className="text-[10px] bg-cyan-500/10 text-cyan-700 dark:text-cyan-300 border-cyan-500/20">
            {metricText(operations.scheduledInterviews)} Scheduled Panels
          </Badge>
        </div>
      </Link>
    </div>
  );
}

// ─── Row 2: hiring funnel breakdown & workforce turnout ────────────────────────

function FunnelBar({
  label,
  dotClass,
  barClass,
  valueClass,
  count,
  total,
}: {
  label: string;
  dotClass: string;
  barClass: string;
  valueClass: string;
  count: number;
  total: number;
}) {
  const share = total ? (count / total) * 100 : 0;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-foreground flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${dotClass}`} />
          {label}
        </span>
        <span className={`font-mono ${valueClass}`}>
          {count} ({Math.round(share)}%)
        </span>
      </div>
      <div className="w-full h-2 rounded-full bg-muted/60 overflow-hidden">
        <div
          className={`h-full ${barClass} rounded-full transition-all duration-300`}
          style={{ width: `${total ? Math.max(share, 3) : 0}%` }}
        />
      </div>
    </div>
  );
}

async function PipelineAndWorkforce() {
  const [recruitment, workforce, operations] = await Promise.all([
    getRecruitmentOverview(),
    getWorkforceOverview(),
    getOperationsOverview(),
  ]);
  const totalApplications: OverviewMetric = recruitment === UNAVAILABLE ? UNAVAILABLE : recruitment.total;
  const turnout = turnoutRate(operations.todayAttendance, workforce.totalEmployees);
  const turnoutText = turnout === null ? "—" : `${turnout}%`;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* Left 7 Cols: Recruitment Funnel Progression */}
      <div className="lg:col-span-7 bg-card border border-border/80 rounded-2xl p-5 shadow-2xs flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between pb-3 border-b border-border/60 mb-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-bold text-foreground">
                Recruitment Pipeline Funnel
              </h2>
            </div>
            <span className="font-mono text-xs text-muted-foreground">
              Total: {metricText(totalApplications)} Applicants
            </span>
          </div>

          {recruitment === UNAVAILABLE ? (
            <UnavailableNotice>
              The pipeline counts could not be loaded right now. Refresh the page to try again.
            </UnavailableNotice>
          ) : recruitment.total === 0 ? (
            <div className="py-12 text-center rounded-xl border border-dashed border-border/70 bg-muted/20 my-2">
              <FileText className="h-8 w-8 text-muted-foreground/60 mx-auto mb-2" />
              <span className="text-xs font-semibold text-foreground block">
                No Applications in Pipeline
              </span>
              <Link
                href="/admin/openings/new"
                className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white transition-all shadow-2xs"
              >
                <Plus className="h-3.5 w-3.5" />
                Create First Opening
              </Link>
            </div>
          ) : (
            <div className="space-y-3.5 my-2">
              <FunnelBar
                label="Submitted & Screening"
                dotClass="bg-slate-400"
                barClass="bg-slate-500"
                valueClass="text-muted-foreground font-semibold"
                count={recruitment.submitted + recruitment.screening}
                total={recruitment.total}
              />
              <FunnelBar
                label="Shortlisted & Interviews"
                dotClass="bg-amber-500"
                barClass="bg-amber-500"
                valueClass="text-muted-foreground font-semibold"
                count={recruitment.shortlisted + recruitment.interviewing}
                total={recruitment.total}
              />
              <FunnelBar
                label="7-Working-Day Supervised Evaluation"
                dotClass="bg-purple-500"
                barClass="bg-purple-500"
                valueClass="text-muted-foreground font-semibold"
                count={recruitment.inEvaluation}
                total={recruitment.total}
              />
              <FunnelBar
                label="Offered & Hired"
                dotClass="bg-emerald-500"
                barClass="bg-emerald-500"
                valueClass="text-emerald-600 dark:text-emerald-400 font-bold"
                count={recruitment.hired}
                total={recruitment.total}
              />
            </div>
          )}
        </div>

        <div className="pt-3 border-t border-border/60 mt-4 flex items-center justify-between text-xs text-muted-foreground">
          <span className="font-mono">7-Working-Day Evaluation Policy Active</span>
          <Link
            href="/admin/applications"
            className="font-semibold text-primary hover:underline flex items-center gap-1 cursor-pointer"
          >
            <span>Manage Candidates</span>
            <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      </div>

      {/* Right 5 Cols: Workforce Departments & Today's Attendance Gauge */}
      <div className="lg:col-span-5 bg-card border border-border/80 rounded-2xl p-5 shadow-2xs flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between pb-3 border-b border-border/60 mb-3">
            <div className="flex items-center gap-2">
              <Building className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-bold text-foreground">
                Workforce & Turnout
              </h2>
            </div>
            <Badge variant="outline" className="font-mono text-xs">
              {metricText(workforce.totalEmployees)} Staff
            </Badge>
          </div>

          {/* Department Breakdown */}
          <div className="space-y-2.5 my-2">
            {workforce.topDepartments === UNAVAILABLE || workforce.totalEmployees === UNAVAILABLE ? (
              <UnavailableNotice>
                The department headcount could not be loaded right now. Refresh the page to try again.
              </UnavailableNotice>
            ) : workforce.topDepartments.length === 0 ? (
              <div className="py-8 text-center text-xs text-muted-foreground">
                No department records found.
              </div>
            ) : (
              workforce.topDepartments.map(({ department, count }) => {
                const pct = shareOf(count, workforce.totalEmployees) ?? 0;
                return (
                  <div key={department} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="font-medium text-foreground truncate pr-2">{department}</span>
                      <span className="font-mono font-bold text-muted-foreground">
                        {count} ({pct}%)
                      </span>
                    </div>
                    <div className="h-1.5 w-full bg-muted/60 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="pt-3 border-t border-border/60 mt-4 flex items-center justify-between text-xs text-muted-foreground">
          <span className="font-mono">Turnout: {turnoutText} Present Today</span>
          <Link
            href="/admin/reports"
            className="font-semibold text-primary hover:underline flex items-center gap-1 cursor-pointer"
          >
            <span>Analytics & Reports</span>
            <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      </div>
    </div>
  );
}

// ─── Row 3: recent applications & openings ─────────────────────────────────────

async function RecentActivity() {
  const [recent, operations] = await Promise.all([getRecentActivityOverview(), getOperationsOverview()]);
  const { recentApplications, recentOpenings, totalVisitors } = recent;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* Left 7 Cols: Recent Candidate Applications Feed */}
      <div className="lg:col-span-7 bg-card border border-border/80 rounded-2xl p-5 shadow-2xs flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between pb-3 border-b border-border/60 mb-3">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-bold text-foreground">
                Recent Applications
              </h3>
            </div>
            <Link
              href="/admin/applications"
              className="text-xs font-semibold text-primary hover:underline"
            >
              View All →
            </Link>
          </div>

          {recentApplications === UNAVAILABLE ? (
            <UnavailableNotice>
              Recent applications could not be loaded right now. Refresh the page to try again.
            </UnavailableNotice>
          ) : recentApplications.length === 0 ? (
            <div className="py-8 text-center text-xs text-muted-foreground">
              No recent submissions recorded yet.
            </div>
          ) : (
            <div className="divide-y divide-border/60">
              {recentApplications.map((app) => (
                <div
                  key={app.id}
                  className="py-3 flex items-center justify-between gap-3 hover:bg-muted/20 px-2 rounded-xl transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-9 w-9 rounded-xl bg-primary/10 text-primary font-bold text-xs flex items-center justify-center shrink-0 border border-primary/20">
                      {getInitials(app.candidateName)}
                    </div>
                    <div className="min-w-0">
                      <span className="text-xs font-bold text-foreground block truncate">
                        {app.candidateName || "Candidate"}
                      </span>
                      <span className="text-[11px] text-muted-foreground block truncate">
                        {app.openingTitle || "Role"} • {formatRelativeTime(app.createdAt)}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <Badge
                      variant="outline"
                      className={`text-[10px] font-mono font-semibold ${getApplicationStatusBadge(
                        app.status
                      )}`}
                    >
                      {app.status.replace(/_/g, " ")}
                    </Badge>
                    <Link
                      href={`/admin/applications/${app.id}`}
                      className="text-xs font-semibold text-primary hover:underline px-1.5 py-0.5"
                    >
                      View
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="pt-3 border-t border-border/60 mt-4 flex items-center justify-between text-xs text-muted-foreground">
          <span>
            Platform Visitors:{" "}
            {totalVisitors === null ? UNAVAILABLE_LABEL : `${totalVisitors} unique`}
          </span>
          <Link
            href="/admin/applications"
            className="text-primary font-semibold hover:underline"
          >
            Candidate Pipeline →
          </Link>
        </div>
      </div>

      {/* Right 5 Cols: Active Vacancies & Sub-Admins */}
      <div className="lg:col-span-5 bg-card border border-border/80 rounded-2xl p-5 shadow-2xs flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between pb-3 border-b border-border/60 mb-3">
            <div className="flex items-center gap-2">
              <Briefcase className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-bold text-foreground">
                Active Vacancies
              </h3>
            </div>
            <Link
              href="/admin/openings"
              className="text-xs font-semibold text-primary hover:underline"
            >
              Manage →
            </Link>
          </div>

          {recentOpenings === UNAVAILABLE ? (
            <UnavailableNotice>
              Openings could not be loaded right now. Refresh the page to try again.
            </UnavailableNotice>
          ) : recentOpenings.length === 0 ? (
            <div className="py-8 text-center text-xs text-muted-foreground">
              No active openings published yet.
            </div>
          ) : (
            <div className="space-y-2">
              {recentOpenings.map((opening) => (
                <div
                  key={opening.id}
                  className="p-3 rounded-xl border border-border/60 bg-muted/20 hover:bg-muted/40 transition-colors flex items-center justify-between text-xs"
                >
                  <div className="min-w-0 flex-1 pr-2">
                    <span className="font-bold text-foreground block truncate">
                      {opening.title}
                    </span>
                    <span className="text-[11px] text-muted-foreground block truncate">
                      {opening.department} • {opening.type}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant="outline" className="font-mono text-[10px]">
                      {opening.applicationCount} applied
                    </Badge>
                    <Link
                      href={`/admin/openings/${opening.id}/edit`}
                      className="text-primary hover:underline text-xs font-semibold"
                    >
                      Edit
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="pt-3 border-t border-border/60 mt-4 flex items-center justify-between text-xs text-muted-foreground">
          <span>Sub-Admin Staff: {metricText(operations.subAdminCount)} provisioned</span>
          <Link
            href="/admin/subadmins"
            className="text-primary font-semibold hover:underline inline-flex items-center gap-1"
          >
            Manage Staff <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      </div>
    </div>
  );
}

// ─── Row 4: module launcher ────────────────────────────────────────────────────

interface ModuleTile {
  href: string;
  label: string;
  icon: React.ReactNode;
  hoverBorder: string;
  iconClass: string;
  badge: React.ReactNode;
}

function ModuleTileLink({ tile }: { tile: ModuleTile }) {
  return (
    <Link
      href={tile.href}
      className={`p-3.5 rounded-xl border border-border/70 bg-muted/20 hover:bg-muted/50 ${tile.hoverBorder} transition-all flex items-center justify-between group`}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <div
          className={`h-8 w-8 rounded-lg ${tile.iconClass} flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform`}
        >
          {tile.icon}
        </div>
        <span className="text-xs font-bold text-foreground truncate">{tile.label}</span>
      </div>
      {tile.badge}
    </Link>
  );
}

async function ModuleLauncher() {
  const [recruitment, workforce, operations] = await Promise.all([
    getRecruitmentOverview(),
    getWorkforceOverview(),
    getOperationsOverview(),
  ]);
  const totalApplications: OverviewMetric = recruitment === UNAVAILABLE ? UNAVAILABLE : recruitment.total;
  const pendingLeaves = operations.pendingLeaves;
  const payrollBadge =
    operations.latestPayrollCode === UNAVAILABLE
      ? UNAVAILABLE_LABEL
      : operations.latestPayrollCode || "None";

  const countBadge = (value: OverviewMetric, suffix = "") => (
    <Badge variant="outline" className="font-mono text-[10px] shrink-0">
      {metricText(value)}
      {suffix}
    </Badge>
  );

  const tiles: ModuleTile[] = [
    {
      href: "/admin/applications",
      label: "Applications",
      icon: <FileText className="h-4 w-4" />,
      hoverBorder: "hover:border-blue-500/40",
      iconClass: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
      badge: countBadge(totalApplications),
    },
    {
      href: "/admin/openings",
      label: "Job Openings",
      icon: <Briefcase className="h-4 w-4" />,
      hoverBorder: "hover:border-emerald-500/40",
      iconClass: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
      badge: countBadge(operations.activeOpenings),
    },
    {
      href: "/admin/interviews",
      label: "Interviews",
      icon: <Calendar className="h-4 w-4" />,
      hoverBorder: "hover:border-amber-500/40",
      iconClass: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
      badge: countBadge(operations.scheduledInterviews),
    },
    {
      href: "/admin/evaluations",
      label: "Evaluations",
      icon: <Award className="h-4 w-4" />,
      hoverBorder: "hover:border-purple-500/40",
      iconClass: "bg-purple-500/15 text-purple-600 dark:text-purple-400",
      badge: countBadge(operations.activeEvaluations),
    },
    {
      href: "/admin/employees",
      label: "Employees",
      icon: <Users className="h-4 w-4" />,
      hoverBorder: "hover:border-blue-500/40",
      iconClass: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
      badge: countBadge(workforce.totalEmployees),
    },
    {
      href: "/admin/attendance",
      label: "Attendance",
      icon: <Clock className="h-4 w-4" />,
      hoverBorder: "hover:border-cyan-500/40",
      iconClass: "bg-cyan-500/15 text-cyan-600 dark:text-cyan-400",
      badge: countBadge(operations.todayAttendance, " Present"),
    },
    {
      href: "/admin/leave",
      label: "Leaves",
      icon: <CalendarDays className="h-4 w-4" />,
      hoverBorder: "hover:border-amber-500/40",
      iconClass: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
      badge: (
        <Badge
          variant="outline"
          className={`font-mono text-[10px] shrink-0 ${
            pendingLeaves !== UNAVAILABLE && pendingLeaves > 0
              ? "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30"
              : ""
          }`}
        >
          {pendingLeaves === UNAVAILABLE
            ? UNAVAILABLE_LABEL
            : pendingLeaves > 0
              ? `${pendingLeaves} Pending`
              : "Normal"}
        </Badge>
      ),
    },
    {
      href: "/admin/payroll",
      label: "Payroll",
      icon: <CreditCard className="h-4 w-4" />,
      hoverBorder: "hover:border-emerald-500/40",
      iconClass: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
      badge: (
        <Badge variant="outline" className="font-mono text-[10px] shrink-0">
          {payrollBadge}
        </Badge>
      ),
    },
    {
      href: "/admin/reports",
      label: "Analytics",
      icon: <BarChart3 className="h-4 w-4" />,
      hoverBorder: "hover:border-primary/40",
      iconClass: "bg-primary/15 text-primary",
      badge: (
        <Badge variant="outline" className="font-mono text-[10px] text-emerald-600 dark:text-emerald-400 shrink-0">
          Live DB
        </Badge>
      ),
    },
    {
      href: "/admin/subadmins",
      label: "Sub-Admins",
      icon: <ShieldCheck className="h-4 w-4" />,
      hoverBorder: "hover:border-rose-500/40",
      iconClass: "bg-rose-500/15 text-rose-600 dark:text-rose-400",
      badge: countBadge(operations.subAdminCount, " Staff"),
    },
  ];

  return (
    <div className="border border-border/80 rounded-2xl p-5 bg-card shadow-2xs">
      <div className="flex items-center justify-between pb-3 border-b border-border/60 mb-4">
        <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground font-mono">
          Platform Management Modules
        </h3>
        <span className="text-xs font-mono text-muted-foreground">
          {tiles.length} Operations Portals
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {tiles.map((tile) => (
          <ModuleTileLink key={tile.href} tile={tile} />
        ))}
      </div>
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default async function AdminOverviewPage() {
  await connection();

  const user = await getCurrentUser();
  if (!user) {
    redirect("/login?callbackUrl=/admin");
  }
  if (user.mustChangePassword) {
    redirect("/set-password");
  }

  // Page-level guard: the /admin portal is restricted to Super Administrators.
  if (!user.roles.includes(Role.ADMIN)) {
    return <UnauthorizedState message="The administrator portal is restricted to Super Administrators." />;
  }

  // Each row streams independently; the loaders are memoised per request, so the rows
  // that share a figure share its query.
  return (
    <div className="w-full space-y-6">
      {/* ─── Action Center: permission-scoped work waiting for this administrator ─── */}
      <Suspense fallback={<ActionCenterSkeleton />}>
        <ActionCenterPanel user={user} portalBase="/admin" />
      </Suspense>

      {/* ─── 5 TOP EXECUTIVE METRIC CARDS ─── */}
      <Suspense
        fallback={
          <StreamingFallback label="Loading key metrics">
            <MetricCardsSkeleton />
          </StreamingFallback>
        }
      >
        <ExecutiveMetrics />
      </Suspense>

      {/* ─── ROW 2: HIRING FUNNEL BREAKDOWN & WORKFORCE TURNOUT ─── */}
      <Suspense
        fallback={
          <StreamingFallback label="Loading pipeline and workforce">
            <ChartGridSkeleton count={2} />
          </StreamingFallback>
        }
      >
        <PipelineAndWorkforce />
      </Suspense>

      {/* ─── ROW 3: RECENT CANDIDATE APPLICATIONS & JOB OPENINGS ─── */}
      <Suspense
        fallback={
          <StreamingFallback label="Loading recent activity">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-7">
                <ListCardSkeleton rows={5} />
              </div>
              <div className="lg:col-span-5">
                <ListCardSkeleton rows={4} />
              </div>
            </div>
          </StreamingFallback>
        }
      >
        <RecentActivity />
      </Suspense>

      {/* ─── ROW 4: DIRECT PLATFORM MODULE LAUNCHER (ZERO SUBTITLES) ─── */}
      <Suspense
        fallback={
          <StreamingFallback label="Loading modules">
            <ModuleTilesSkeleton />
          </StreamingFallback>
        }
      >
        <ModuleLauncher />
      </Suspense>
    </div>
  );
}
