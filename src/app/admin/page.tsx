import React from "react";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { getUniqueVisitorCount } from "@/features/analytics/services/visitor-service";
import {
  OpeningStatus,
  ApplicationStatus,
  InterviewStatus,
  EvaluationStatus,
  LeaveRequestStatus,
} from "@prisma/client";
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
  CheckCircle2,
  AlertCircle,
  Building,
  TrendingUp,
  UserCheck,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";

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

export default async function AdminOverviewPage() {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

  // 1. Parallel database queries for real-time counts and operational feeds
  const [
    totalApplications,
    activeOpenings,
    scheduledInterviews,
    activeEvaluations,
    allEmployees,
    pendingLeaves,
    todayAttendance,
    todayOnLeave,
    pendingRegularizations,
    totalVisitors,
    subAdminCount,
    submittedCount,
    screeningCount,
    shortlistedCount,
    interviewingCount,
    inEvaluationCount,
    hiredCount,
    recentApplications,
    recentOpenings,
    pendingLeaveItems,
    latestPayroll,
  ] = await Promise.all([
    prisma.application.count().catch(() => 0),
    prisma.opening.count({ where: { status: OpeningStatus.PUBLISHED } }).catch(() => 0),
    prisma.interviewSchedule.count({ where: { status: InterviewStatus.SCHEDULED } }).catch(() => 0),
    prisma.internshipEnrollment.count({ where: { status: EvaluationStatus.IN_PROGRESS } }).catch(() => 0),
    prisma.employee
      .findMany({
        select: { id: true, designation: true, department: true, status: true },
      })
      .catch(() => []),
    prisma.leaveRequest.count({ where: { status: LeaveRequestStatus.PENDING } }).catch(() => 0),
    prisma.attendanceRecord
      .count({
        where: { date: { gte: todayStart, lte: todayEnd }, status: "PRESENT" },
      })
      .catch(() => 0),
    prisma.leaveRequest
      .count({
        where: {
          status: LeaveRequestStatus.APPROVED,
          startDate: { lte: todayEnd },
          endDate: { gte: todayStart },
        },
      })
      .catch(() => 0),
    prisma.attendanceRegularization.count({ where: { status: "PENDING" } }).catch(() => 0),
    getUniqueVisitorCount().catch(() => 0),
    prisma.userRole
      .count({ where: { role: { in: ["HR", "MANAGER", "INTERVIEWER", "MENTOR", "ADMIN"] } } })
      .catch(() => 0),
    prisma.application.count({ where: { status: ApplicationStatus.SUBMITTED } }).catch(() => 0),
    prisma.application.count({ where: { status: ApplicationStatus.SCREENING } }).catch(() => 0),
    prisma.application.count({ where: { status: ApplicationStatus.SHORTLISTED } }).catch(() => 0),
    prisma.application
      .count({
        where: {
          status: {
            in: [ApplicationStatus.INTERVIEW_SCHEDULED, ApplicationStatus.INTERVIEWED],
          },
        },
      })
      .catch(() => 0),
    prisma.application.count({ where: { status: ApplicationStatus.EVALUATION_SELECTED } }).catch(() => 0),
    prisma.application
      .count({
        where: {
          status: {
            in: [
              ApplicationStatus.OFFERED,
              ApplicationStatus.OFFER_ACCEPTED,
              ApplicationStatus.HIRED,
            ],
          },
        },
      })
      .catch(() => 0),
    prisma.application
      .findMany({
        take: 5,
        orderBy: { createdAt: "desc" },
        include: {
          opening: { select: { title: true, department: true, type: true } },
          candidate: { include: { user: { select: { name: true, email: true } } } },
        },
      })
      .catch(() => []),
    prisma.opening
      .findMany({
        take: 4,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          title: true,
          department: true,
          status: true,
          type: true,
          _count: { select: { applications: true } },
        },
      })
      .catch(() => []),
    prisma.leaveRequest
      .findMany({
        where: { status: LeaveRequestStatus.PENDING },
        take: 2,
        include: {
          employee: { include: { user: { select: { name: true, email: true } } } },
          leaveType: { select: { name: true } },
        },
        orderBy: { createdAt: "desc" },
      })
      .catch(() => []),
    prisma.payrollPeriod
      .findFirst({
        orderBy: { startDate: "desc" },
        select: { code: true, status: true },
      })
      .catch(() => null),
  ]);

  // Derived Workforce metrics
  const totalEmployees = allEmployees.length;
  let fullTimeCount = 0;
  let internCount = 0;
  const deptCounts: Record<string, number> = {};

  for (const emp of allEmployees) {
    const isIntern =
      emp.designation.toLowerCase().includes("intern") ||
      emp.department.toLowerCase().includes("intern");
    if (isIntern) internCount++;
    else fullTimeCount++;

    const dept = emp.department || "General";
    deptCounts[dept] = (deptCounts[dept] || 0) + 1;
  }

  const topDepartments = Object.entries(deptCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4);

  const activeStaffTotal = Math.max(totalEmployees, 1);
  const todayTurnoutRate = Math.min(100, Math.round((todayAttendance / activeStaffTotal) * 100));

  // Funnel Stage Aggregates
  const stageReview = submittedCount + screeningCount;
  const stageInterview = shortlistedCount + interviewingCount;

  return (
    <div className="w-full space-y-6">
      {/* ─── Operational Attention Notice Bar ─── */}
      {(pendingLeaves > 0 || pendingRegularizations > 0 || scheduledInterviews > 0) ? (
        <div className="p-3.5 sm:p-4 rounded-2xl bg-amber-500/10 border border-amber-500/25 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs shadow-2xs">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-xl bg-amber-500/20 text-amber-700 dark:text-amber-300 flex items-center justify-center shrink-0">
              <AlertCircle className="h-4 w-4" />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-bold text-amber-900 dark:text-amber-200">
                Action Items Awaiting Admin
              </span>
              <span className="text-muted-foreground hidden sm:inline">•</span>
              <div className="flex flex-wrap gap-1.5 font-mono">
                {pendingLeaves > 0 && (
                  <Badge variant="outline" className="bg-amber-500/15 text-amber-800 dark:text-amber-300 border-amber-500/30">
                    {pendingLeaves} Leave Requests
                  </Badge>
                )}
                {pendingRegularizations > 0 && (
                  <Badge variant="outline" className="bg-blue-500/15 text-blue-800 dark:text-blue-300 border-blue-500/30">
                    {pendingRegularizations} Attendance Regularizations
                  </Badge>
                )}
                {scheduledInterviews > 0 && (
                  <Badge variant="outline" className="bg-purple-500/15 text-purple-800 dark:text-purple-300 border-purple-500/30">
                    {scheduledInterviews} Interviews Scheduled
                  </Badge>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {pendingLeaves > 0 && (
              <Link
                href="/admin/leave"
                className="h-8 px-3 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-semibold flex items-center gap-1 transition-all shadow-2xs"
              >
                <span>Review Leaves</span>
                <ArrowRight className="h-3 w-3" />
              </Link>
            )}
            {scheduledInterviews > 0 && (
              <Link
                href="/admin/interviews"
                className="h-8 px-3 rounded-xl border border-amber-500/30 bg-background hover:bg-muted text-foreground font-semibold flex items-center gap-1 transition-all"
              >
                <span>Schedules</span>
                <ArrowRight className="h-3 w-3" />
              </Link>
            )}
          </div>
        </div>
      ) : (
        <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-between text-xs shadow-2xs">
          <div className="flex items-center gap-2.5 text-emerald-800 dark:text-emerald-300">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span className="font-semibold">All Operations Normal — Operational inboxes cleared</span>
          </div>
          <span className="font-mono text-[10px] text-emerald-700 dark:text-emerald-400">
            Real-Time Verified
          </span>
        </div>
      )}

      {/* ─── 5 TOP EXECUTIVE METRIC CARDS ─── */}
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
            {totalApplications}
          </div>
          <div className="mt-2 flex items-center gap-1.5 text-[11px] font-mono">
            <Badge variant="outline" className="text-[10px] bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/20">
              {hiredCount} Hired
            </Badge>
            <span className="text-muted-foreground">
              • {totalApplications ? Math.round((hiredCount / totalApplications) * 100) : 0}% Conv
            </span>
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
            {totalEmployees}
          </div>
          <div className="mt-2 flex items-center gap-1.5 text-[11px] font-mono">
            <span className="font-semibold text-purple-700 dark:text-purple-300">
              {fullTimeCount} FT
            </span>
            <span className="text-muted-foreground">•</span>
            <span className="text-muted-foreground">{internCount} Interns</span>
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
            {activeOpenings}
          </div>
          <div className="mt-2 flex items-center gap-1.5 text-[11px] font-mono">
            <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20">
              {topDepartments.length} Active Depts
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
            {todayAttendance}
          </div>
          <div className="mt-2 flex items-center gap-1.5 text-[11px] font-mono">
            <span className="font-semibold text-emerald-600 dark:text-emerald-400">
              {todayTurnoutRate}% Turnout
            </span>
            <span className="text-muted-foreground">•</span>
            <span className="text-amber-600 dark:text-amber-400">{todayOnLeave} on Leave</span>
          </div>
        </Link>

        {/* 5. Evaluations & Interviews */}
        <Link
          href="/admin/evaluations"
          className="col-span-2 sm:col-span-1 bg-card border border-border/80 border-l-4 border-l-cyan-500 rounded-2xl p-4 sm:p-5 shadow-2xs hover:shadow-xs transition-all flex flex-col justify-between group"
        >
          <div className="flex items-center justify-between gap-2 mb-2">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider font-mono">
              7-Day Evaluations
            </span>
            <div className="h-8 w-8 rounded-xl bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
              <Award className="h-4 w-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold font-mono text-foreground tracking-tight">
            {activeEvaluations}
          </div>
          <div className="mt-2 flex items-center gap-1.5 text-[11px] font-mono">
            <Badge variant="outline" className="text-[10px] bg-cyan-500/10 text-cyan-700 dark:text-cyan-300 border-cyan-500/20">
              {scheduledInterviews} Scheduled Panels
            </Badge>
          </div>
        </Link>
      </div>

      {/* ─── ROW 2: HIRING FUNNEL BREAKDOWN & WORKFORCE TURNOUT ─── */}
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
                Total: {totalApplications} Applicants
              </span>
            </div>

            {totalApplications === 0 ? (
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
                {/* 1. Screening */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-foreground flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-slate-400" />
                      Submitted & Screening
                    </span>
                    <span className="font-mono text-muted-foreground font-semibold">
                      {stageReview} ({totalApplications ? Math.round((stageReview / totalApplications) * 100) : 0}%)
                    </span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-muted/60 overflow-hidden">
                    <div
                      className="h-full bg-slate-500 rounded-full transition-all duration-300"
                      style={{
                        width: `${totalApplications ? Math.max((stageReview / totalApplications) * 100, 3) : 0}%`,
                      }}
                    />
                  </div>
                </div>

                {/* 2. Shortlisted & Interviewing */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-foreground flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-amber-500" />
                      Shortlisted & Interviews
                    </span>
                    <span className="font-mono text-muted-foreground font-semibold">
                      {stageInterview} ({totalApplications ? Math.round((stageInterview / totalApplications) * 100) : 0}%)
                    </span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-muted/60 overflow-hidden">
                    <div
                      className="h-full bg-amber-500 rounded-full transition-all duration-300"
                      style={{
                        width: `${totalApplications ? Math.max((stageInterview / totalApplications) * 100, 3) : 0}%`,
                      }}
                    />
                  </div>
                </div>

                {/* 3. 7-Day Supervised Evaluation */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-foreground flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-purple-500" />
                      7-Day Supervised Evaluation
                    </span>
                    <span className="font-mono text-muted-foreground font-semibold">
                      {inEvaluationCount} ({totalApplications ? Math.round((inEvaluationCount / totalApplications) * 100) : 0}%)
                    </span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-muted/60 overflow-hidden">
                    <div
                      className="h-full bg-purple-500 rounded-full transition-all duration-300"
                      style={{
                        width: `${totalApplications ? Math.max((inEvaluationCount / totalApplications) * 100, 3) : 0}%`,
                      }}
                    />
                  </div>
                </div>

                {/* 4. Offered & Hired */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-foreground flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-emerald-500" />
                      Offered & Hired
                    </span>
                    <span className="font-mono text-emerald-600 dark:text-emerald-400 font-bold">
                      {hiredCount} ({totalApplications ? Math.round((hiredCount / totalApplications) * 100) : 0}%)
                    </span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-muted/60 overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 rounded-full transition-all duration-300"
                      style={{
                        width: `${totalApplications ? Math.max((hiredCount / totalApplications) * 100, 3) : 0}%`,
                      }}
                    />
                  </div>
                </div>
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
                {totalEmployees} Staff
              </Badge>
            </div>

            {/* Department Breakdown */}
            <div className="space-y-2.5 my-2">
              {topDepartments.length === 0 ? (
                <div className="py-8 text-center text-xs text-muted-foreground">
                  No department records found.
                </div>
              ) : (
                topDepartments.map(([deptName, cnt]) => {
                  const pct = totalEmployees > 0 ? Math.round((cnt / totalEmployees) * 100) : 0;
                  return (
                    <div key={deptName} className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="font-medium text-foreground truncate pr-2">{deptName}</span>
                        <span className="font-mono font-bold text-muted-foreground">
                          {cnt} ({pct}%)
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
            <span className="font-mono">Turnout: {todayTurnoutRate}% Present Today</span>
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

      {/* ─── ROW 3: RECENT CANDIDATE APPLICATIONS & JOB OPENINGS ─── */}
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

            {recentApplications.length === 0 ? (
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
                        {getInitials(app.candidate?.user?.name)}
                      </div>
                      <div className="min-w-0">
                        <span className="text-xs font-bold text-foreground block truncate">
                          {app.candidate?.user?.name || "Candidate"}
                        </span>
                        <span className="text-[11px] text-muted-foreground block truncate">
                          {app.opening?.title || "Role"} • {formatRelativeTime(app.createdAt)}
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
            <span>Platform Visitors: {totalVisitors} unique</span>
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

            {recentOpenings.length === 0 ? (
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
                        {opening._count.applications} applied
                      </Badge>
                      <Link
                        href={`/admin/openings/${opening.id}`}
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
            <span>Sub-Admin Staff: {subAdminCount} provisioned</span>
            <Link
              href="/admin/subadmins"
              className="text-primary font-semibold hover:underline inline-flex items-center gap-1"
            >
              Manage Staff <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        </div>
      </div>

      {/* ─── ROW 4: DIRECT PLATFORM MODULE LAUNCHER (ZERO SUBTITLES) ─── */}
      <div className="border border-border/80 rounded-2xl p-5 bg-card shadow-2xs">
        <div className="flex items-center justify-between pb-3 border-b border-border/60 mb-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground font-mono">
            Platform Management Modules
          </h3>
          <span className="text-xs font-mono text-muted-foreground">
            10 Operations Portals
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {/* 1. Applications */}
          <Link
            href="/admin/applications"
            className="p-3.5 rounded-xl border border-border/70 bg-muted/20 hover:bg-muted/50 hover:border-blue-500/40 transition-all flex items-center justify-between group"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="h-8 w-8 rounded-lg bg-blue-500/15 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                <FileText className="h-4 w-4" />
              </div>
              <span className="text-xs font-bold text-foreground truncate">Applications</span>
            </div>
            <Badge variant="outline" className="font-mono text-[10px] shrink-0">
              {totalApplications}
            </Badge>
          </Link>

          {/* 2. Job Openings */}
          <Link
            href="/admin/openings"
            className="p-3.5 rounded-xl border border-border/70 bg-muted/20 hover:bg-muted/50 hover:border-emerald-500/40 transition-all flex items-center justify-between group"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="h-8 w-8 rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                <Briefcase className="h-4 w-4" />
              </div>
              <span className="text-xs font-bold text-foreground truncate">Job Openings</span>
            </div>
            <Badge variant="outline" className="font-mono text-[10px] shrink-0">
              {activeOpenings}
            </Badge>
          </Link>

          {/* 3. Interviews */}
          <Link
            href="/admin/interviews"
            className="p-3.5 rounded-xl border border-border/70 bg-muted/20 hover:bg-muted/50 hover:border-amber-500/40 transition-all flex items-center justify-between group"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="h-8 w-8 rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                <Calendar className="h-4 w-4" />
              </div>
              <span className="text-xs font-bold text-foreground truncate">Interviews</span>
            </div>
            <Badge variant="outline" className="font-mono text-[10px] shrink-0">
              {scheduledInterviews}
            </Badge>
          </Link>

          {/* 4. Evaluations */}
          <Link
            href="/admin/evaluations"
            className="p-3.5 rounded-xl border border-border/70 bg-muted/20 hover:bg-muted/50 hover:border-purple-500/40 transition-all flex items-center justify-between group"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="h-8 w-8 rounded-lg bg-purple-500/15 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                <Award className="h-4 w-4" />
              </div>
              <span className="text-xs font-bold text-foreground truncate">7-Day Eval</span>
            </div>
            <Badge variant="outline" className="font-mono text-[10px] shrink-0">
              {activeEvaluations}
            </Badge>
          </Link>

          {/* 5. Employees */}
          <Link
            href="/admin/employees"
            className="p-3.5 rounded-xl border border-border/70 bg-muted/20 hover:bg-muted/50 hover:border-blue-500/40 transition-all flex items-center justify-between group"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="h-8 w-8 rounded-lg bg-blue-500/15 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                <Users className="h-4 w-4" />
              </div>
              <span className="text-xs font-bold text-foreground truncate">Employees</span>
            </div>
            <Badge variant="outline" className="font-mono text-[10px] shrink-0">
              {totalEmployees}
            </Badge>
          </Link>

          {/* 6. Attendance */}
          <Link
            href="/admin/attendance"
            className="p-3.5 rounded-xl border border-border/70 bg-muted/20 hover:bg-muted/50 hover:border-cyan-500/40 transition-all flex items-center justify-between group"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="h-8 w-8 rounded-lg bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                <Clock className="h-4 w-4" />
              </div>
              <span className="text-xs font-bold text-foreground truncate">Attendance</span>
            </div>
            <Badge variant="outline" className="font-mono text-[10px] shrink-0">
              {todayAttendance} Present
            </Badge>
          </Link>

          {/* 7. Leave Management */}
          <Link
            href="/admin/leave"
            className="p-3.5 rounded-xl border border-border/70 bg-muted/20 hover:bg-muted/50 hover:border-amber-500/40 transition-all flex items-center justify-between group"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="h-8 w-8 rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                <CalendarDays className="h-4 w-4" />
              </div>
              <span className="text-xs font-bold text-foreground truncate">Leaves</span>
            </div>
            <Badge
              variant="outline"
              className={`font-mono text-[10px] shrink-0 ${
                pendingLeaves > 0
                  ? "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30"
                  : ""
              }`}
            >
              {pendingLeaves > 0 ? `${pendingLeaves} Pending` : "Normal"}
            </Badge>
          </Link>

          {/* 8. Payroll */}
          <Link
            href="/admin/payroll"
            className="p-3.5 rounded-xl border border-border/70 bg-muted/20 hover:bg-muted/50 hover:border-emerald-500/40 transition-all flex items-center justify-between group"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="h-8 w-8 rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                <CreditCard className="h-4 w-4" />
              </div>
              <span className="text-xs font-bold text-foreground truncate">Payroll</span>
            </div>
            <Badge variant="outline" className="font-mono text-[10px] shrink-0">
              {latestPayroll?.code || "Active"}
            </Badge>
          </Link>

          {/* 9. Analytics & Reports */}
          <Link
            href="/admin/reports"
            className="p-3.5 rounded-xl border border-border/70 bg-muted/20 hover:bg-muted/50 hover:border-primary/40 transition-all flex items-center justify-between group"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="h-8 w-8 rounded-lg bg-primary/15 text-primary flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                <BarChart3 className="h-4 w-4" />
              </div>
              <span className="text-xs font-bold text-foreground truncate">Analytics</span>
            </div>
            <Badge variant="outline" className="font-mono text-[10px] text-emerald-600 dark:text-emerald-400 shrink-0">
              Live DB
            </Badge>
          </Link>

          {/* 10. Sub-Admins */}
          <Link
            href="/admin/subadmins"
            className="p-3.5 rounded-xl border border-border/70 bg-muted/20 hover:bg-muted/50 hover:border-rose-500/40 transition-all flex items-center justify-between group"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="h-8 w-8 rounded-lg bg-rose-500/15 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                <ShieldCheck className="h-4 w-4" />
              </div>
              <span className="text-xs font-bold text-foreground truncate">Sub-Admins</span>
            </div>
            <Badge variant="outline" className="font-mono text-[10px] shrink-0">
              {subAdminCount} Staff
            </Badge>
          </Link>
        </div>
      </div>
    </div>
  );
}
