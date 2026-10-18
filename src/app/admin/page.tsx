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
  Eye,
  ArrowRight,
  Plus,
  UserCheck,
  Activity,
  Layers,
} from "lucide-react";

export const instant = false;

export default async function AdminOverviewPage() {
  // 1. Query live database counts for all primary workforce & recruitment modules
  const [
    totalApplications,
    activeOpenings,
    scheduledInterviews,
    activeEvaluations,
    totalEmployees,
    pendingLeaves,
    attendanceCount,
    totalVisitors,
    subAdminCount,
  ] = await Promise.all([
    prisma.application.count().catch(() => 0),
    prisma.opening
      .count({ where: { status: OpeningStatus.PUBLISHED } })
      .catch(() => 0),
    prisma.interviewSchedule
      .count({ where: { status: InterviewStatus.SCHEDULED } })
      .catch(() => 0),
    prisma.internshipEnrollment
      .count({ where: { status: EvaluationStatus.IN_PROGRESS } })
      .catch(() => 0),
    prisma.employee.count().catch(() => 0),
    prisma.leaveRequest
      .count({ where: { status: LeaveRequestStatus.PENDING } })
      .catch(() => 0),
    prisma.attendanceRecord.count().catch(() => 0),
    getUniqueVisitorCount().catch(() => 0),
    prisma.userRole
      .count({ where: { role: { in: ["HR", "MANAGER", "INTERVIEWER", "MENTOR"] } } })
      .catch(() => 0),
  ]);

  // 2. Query application pipeline breakdown for funnel analytics
  const [
    submittedCount,
    underReviewCount,
    shortlistedCount,
    inEvaluationCount,
    hiredCount,
  ] = await Promise.all([
    prisma.application
      .count({ where: { status: ApplicationStatus.SUBMITTED } })
      .catch(() => 0),
    prisma.application
      .count({ where: { status: ApplicationStatus.SCREENING } })
      .catch(() => 0),
    prisma.application
      .count({
        where: {
          status: {
            in: [
              ApplicationStatus.SHORTLISTED,
              ApplicationStatus.INTERVIEW_SCHEDULED,
              ApplicationStatus.INTERVIEWED,
            ],
          },
        },
      })
      .catch(() => 0),
    prisma.application
      .count({ where: { status: ApplicationStatus.EVALUATION_SELECTED } })
      .catch(() => 0),
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
  ]);

  // 3. Query real recent applications
  const recentApplications = await prisma.application
    .findMany({
      take: 4,
      orderBy: { createdAt: "desc" },
      include: {
        opening: {
          select: { title: true, department: true },
        },
        candidate: {
          include: {
            user: { select: { name: true, email: true } },
          },
        },
      },
    })
    .catch(() => []);

  // 4. Query recently published or created job openings
  const recentOpenings = await prisma.opening
    .findMany({
      take: 3,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        title: true,
        department: true,
        status: true,
        type: true,
        createdAt: true,
        _count: { select: { applications: true } },
      },
    })
    .catch(() => []);

  return (
    <div className="space-y-6">
      {/* Row 1: 4 Primary Recruitment & Evaluation KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Total Applications */}
        <Link
          href="/admin/applications"
          className="bg-card border border-border/70 border-l-4 border-l-blue-600 rounded-xl p-4 shadow-2xs hover:shadow-xs transition-all flex items-center justify-between group"
        >
          <div>
            <p className="text-[11px] font-bold text-muted-foreground tracking-wider uppercase">
              Total Applications
            </p>
            <p className="text-2xl sm:text-3xl font-extrabold font-mono text-foreground mt-1">
              {totalApplications}
            </p>
            <p className="text-[11px] font-medium text-muted-foreground mt-1 flex items-center gap-1 group-hover:text-blue-600 dark:group-hover:text-blue-400">
              <span>Candidate Pipeline</span>
              <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
            </p>
          </div>
          <div className="h-10 w-10 rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400 flex items-center justify-center shrink-0">
            <FileText className="h-5 w-5" />
          </div>
        </Link>

        {/* Card 2: Active Job Openings */}
        <Link
          href="/admin/openings"
          className="bg-card border border-border/70 border-l-4 border-l-emerald-600 rounded-xl p-4 shadow-2xs hover:shadow-xs transition-all flex items-center justify-between group"
        >
          <div>
            <p className="text-[11px] font-bold text-muted-foreground tracking-wider uppercase">
              Active Openings
            </p>
            <p className="text-2xl sm:text-3xl font-extrabold font-mono text-foreground mt-1">
              {activeOpenings}
            </p>
            <p className="text-[11px] font-medium text-muted-foreground mt-1 flex items-center gap-1 group-hover:text-emerald-600 dark:group-hover:text-emerald-400">
              <span>Published on Careers</span>
              <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
            </p>
          </div>
          <div className="h-10 w-10 rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400 flex items-center justify-center shrink-0">
            <Briefcase className="h-5 w-5" />
          </div>
        </Link>

        {/* Card 3: Interviews Scheduled */}
        <Link
          href="/admin/interviews"
          className="bg-card border border-border/70 border-l-4 border-l-amber-600 rounded-xl p-4 shadow-2xs hover:shadow-xs transition-all flex items-center justify-between group"
        >
          <div>
            <p className="text-[11px] font-bold text-muted-foreground tracking-wider uppercase">
              Interviews Scheduled
            </p>
            <p className="text-2xl sm:text-3xl font-extrabold font-mono text-foreground mt-1">
              {scheduledInterviews}
            </p>
            <p className="text-[11px] font-medium text-muted-foreground mt-1 flex items-center gap-1 group-hover:text-amber-600 dark:group-hover:text-amber-400">
              <span>Upcoming Panels</span>
              <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
            </p>
          </div>
          <div className="h-10 w-10 rounded-xl bg-amber-50 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400 flex items-center justify-center shrink-0">
            <Calendar className="h-5 w-5" />
          </div>
        </Link>

        {/* Card 4: 7-Day Supervised Evaluations */}
        <Link
          href="/admin/evaluations"
          className="bg-card border border-border/70 border-l-4 border-l-purple-600 rounded-xl p-4 shadow-2xs hover:shadow-xs transition-all flex items-center justify-between group"
        >
          <div>
            <p className="text-[11px] font-bold text-muted-foreground tracking-wider uppercase">
              7-Day Evaluations
            </p>
            <p className="text-2xl sm:text-3xl font-extrabold font-mono text-foreground mt-1">
              {activeEvaluations}
            </p>
            <p className="text-[11px] font-medium text-muted-foreground mt-1 flex items-center gap-1 group-hover:text-purple-600 dark:group-hover:text-purple-400">
              <span>Supervised Period</span>
              <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
            </p>
          </div>
          <div className="h-10 w-10 rounded-xl bg-purple-50 text-purple-600 dark:bg-purple-950/60 dark:text-purple-400 flex items-center justify-center shrink-0">
            <Award className="h-5 w-5" />
          </div>
        </Link>
      </div>

      {/* Row 2: Secondary Operational HRMS & Workforce Health Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1: Active Employees & Interns */}
        <Link
          href="/admin/employees"
          className="bg-card border border-border/70 rounded-xl p-4 shadow-2xs hover:shadow-xs transition-shadow flex flex-col justify-between group"
        >
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-muted-foreground">
              Employees & Interns
            </p>
            <div className="h-8 w-8 rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400 flex items-center justify-center shrink-0">
              <UserCheck className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2">
            <p className="text-2xl font-bold font-mono text-foreground">
              {totalEmployees}
            </p>
            <p className="text-[11px] font-medium text-blue-600 dark:text-blue-400 flex items-center gap-1 mt-1">
              <span>Active workforce records</span>
            </p>
          </div>
        </Link>

        {/* Metric 2: Today's Attendance Entries */}
        <Link
          href="/admin/attendance"
          className="bg-card border border-border/70 rounded-xl p-4 shadow-2xs hover:shadow-xs transition-shadow flex flex-col justify-between group"
        >
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-muted-foreground">
              Attendance Logged
            </p>
            <div className="h-8 w-8 rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400 flex items-center justify-center shrink-0">
              <Clock className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2">
            <p className="text-2xl font-bold font-mono text-foreground">
              {attendanceCount}
            </p>
            <p className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400 flex items-center gap-1 mt-1">
              <span>Clock-in verified entries</span>
            </p>
          </div>
        </Link>

        {/* Metric 3: Pending Leave Requests */}
        <Link
          href="/admin/leave"
          className="bg-card border border-border/70 rounded-xl p-4 shadow-2xs hover:shadow-xs transition-shadow flex flex-col justify-between group"
        >
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-muted-foreground">
              Leave Requests
            </p>
            <div className="h-8 w-8 rounded-lg bg-amber-50 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400 flex items-center justify-center shrink-0">
              <CalendarDays className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2">
            <p className="text-2xl font-bold font-mono text-foreground">
              {pendingLeaves}
            </p>
            <p className="text-[11px] font-medium text-amber-600 dark:text-amber-400 flex items-center gap-1 mt-1">
              <span>Awaiting admin review</span>
            </p>
          </div>
        </Link>

        {/* Metric 4: Verified Portal Visitors */}
        <div className="bg-card border border-border/70 rounded-xl p-4 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-muted-foreground">
              Verified Visitors
            </p>
            <div className="h-8 w-8 rounded-lg bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 flex items-center justify-center shrink-0">
              <Eye className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2">
            <p className="text-2xl font-bold font-mono text-foreground">
              {totalVisitors}
            </p>
            <p className="text-[11px] font-medium text-muted-foreground flex items-center gap-1 mt-1">
              <span>Unique portal traffic</span>
            </p>
          </div>
        </div>
      </div>

      {/* Row 3: Pipeline Breakdown Funnel & Recent System Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Hiring Pipeline & Evaluation Funnel (7 cols) */}
        <div className="lg:col-span-7 bg-card border border-border/70 rounded-2xl p-5 shadow-2xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-2 mb-4">
              <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
                <Layers className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                <span>Candidate Pipeline & Funnel Breakdown</span>
              </h2>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                {totalApplications} Total
              </span>
            </div>

            {totalApplications === 0 ? (
              <div className="py-12 px-4 text-center rounded-xl border border-dashed border-border/70 bg-muted/10 my-4">
                <FileText className="h-8 w-8 text-muted-foreground/60 mx-auto mb-2" />
                <p className="text-sm font-semibold text-foreground">
                  No Applications in Pipeline Yet
                </p>
                <p className="text-xs text-muted-foreground max-w-sm mx-auto mt-1 mb-4">
                  Candidates who apply through the public Careers portal will automatically appear in this pipeline breakdown.
                </p>
                <Link
                  href="/admin/openings/new"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white transition-colors"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Create First Job Opening</span>
                </Link>
              </div>
            ) : (
              <div className="space-y-4 my-2">
                {/* Stage 1: Received / Submitted */}
                <div>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="font-semibold text-foreground flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-slate-400" />
                      Submitted & Screening
                    </span>
                    <span className="font-mono text-muted-foreground font-semibold">
                      {submittedCount} ({totalApplications ? Math.round((submittedCount / totalApplications) * 100) : 0}%)
                    </span>
                  </div>
                  <div className="w-full h-2.5 rounded-full bg-muted/50 overflow-hidden">
                    <div
                      className="h-full bg-slate-500 rounded-full"
                      style={{
                        width: `${totalApplications ? (submittedCount / totalApplications) * 100 : 0}%`,
                      }}
                    />
                  </div>
                </div>

                {/* Stage 2: Under Review */}
                <div>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="font-semibold text-foreground flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-blue-500" />
                      Under HR Review
                    </span>
                    <span className="font-mono text-muted-foreground font-semibold">
                      {underReviewCount} ({totalApplications ? Math.round((underReviewCount / totalApplications) * 100) : 0}%)
                    </span>
                  </div>
                  <div className="w-full h-2.5 rounded-full bg-muted/50 overflow-hidden">
                    <div
                      className="h-full bg-blue-500 rounded-full"
                      style={{
                        width: `${totalApplications ? (underReviewCount / totalApplications) * 100 : 0}%`,
                      }}
                    />
                  </div>
                </div>

                {/* Stage 3: Shortlisted & Interviewing */}
                <div>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="font-semibold text-foreground flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-amber-500" />
                      Shortlisted / Interviewing
                    </span>
                    <span className="font-mono text-muted-foreground font-semibold">
                      {shortlistedCount} ({totalApplications ? Math.round((shortlistedCount / totalApplications) * 100) : 0}%)
                    </span>
                  </div>
                  <div className="w-full h-2.5 rounded-full bg-muted/50 overflow-hidden">
                    <div
                      className="h-full bg-amber-500 rounded-full"
                      style={{
                        width: `${totalApplications ? (shortlistedCount / totalApplications) * 100 : 0}%`,
                      }}
                    />
                  </div>
                </div>

                {/* Stage 4: 7-Day Supervised Evaluation */}
                <div>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="font-semibold text-foreground flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-purple-500" />
                      7-Day Supervised Evaluation
                    </span>
                    <span className="font-mono text-muted-foreground font-semibold">
                      {inEvaluationCount} ({totalApplications ? Math.round((inEvaluationCount / totalApplications) * 100) : 0}%)
                    </span>
                  </div>
                  <div className="w-full h-2.5 rounded-full bg-muted/50 overflow-hidden">
                    <div
                      className="h-full bg-purple-500 rounded-full"
                      style={{
                        width: `${totalApplications ? (inEvaluationCount / totalApplications) * 100 : 0}%`,
                      }}
                    />
                  </div>
                </div>

                {/* Stage 5: Offered & Onboarded */}
                <div>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="font-semibold text-foreground flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-emerald-500" />
                      Offered & Onboarded
                    </span>
                    <span className="font-mono text-muted-foreground font-semibold">
                      {hiredCount} ({totalApplications ? Math.round((hiredCount / totalApplications) * 100) : 0}%)
                    </span>
                  </div>
                  <div className="w-full h-2.5 rounded-full bg-muted/50 overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 rounded-full"
                      style={{
                        width: `${totalApplications ? (hiredCount / totalApplications) * 100 : 0}%`,
                      }}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between text-[11px] text-muted-foreground mt-4 pt-3 border-t border-border/50">
            <span>Configured Policy: 7-Working-Day Evaluation Gate</span>
            <Link
              href="/admin/applications"
              className="font-semibold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
            >
              <span>Manage Candidates</span>
              <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        </div>

        {/* Right Column: Recent Applications & System Activity (5 cols) */}
        <div className="lg:col-span-5 bg-card border border-border/70 rounded-2xl p-5 shadow-2xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-2 mb-3">
              <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
                <Activity className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                <span>Recent Candidate Applications</span>
              </h2>
              <Link
                href="/admin/applications"
                className="text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:underline"
              >
                View All
              </Link>
            </div>

            {recentApplications.length === 0 ? (
              <div className="py-10 px-4 text-center rounded-xl border border-dashed border-border/70 bg-muted/10 my-2">
                <Users className="h-7 w-7 text-muted-foreground/60 mx-auto mb-1.5" />
                <p className="text-xs font-semibold text-foreground">
                  No Submissions Recorded Yet
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Latest applicant activities and candidate records will appear here in real-time.
                </p>
              </div>
            ) : (
              <div className="space-y-2.5 my-2">
                {recentApplications.map((app) => (
                  <div
                    key={app.id}
                    className="p-3 rounded-xl border border-border/70 bg-muted/20 hover:bg-muted/40 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-foreground truncate">
                          {app.candidate?.user?.name || "Candidate"}
                        </p>
                        <p className="text-[11px] text-muted-foreground truncate">
                          Applied for {app.opening?.title || "Role"}
                        </p>
                      </div>
                      <span className="shrink-0 text-[10px] font-mono px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 font-semibold uppercase">
                        {app.status.replace(/_/g, " ")}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {/* Active Job Openings Summary */}
            <div className="mt-4 pt-3 border-t border-border/50">
              <div className="flex items-center justify-between gap-2 mb-2">
                <h3 className="text-xs font-bold text-foreground flex items-center gap-1.5">
                  <Briefcase className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span>Recent Job Openings</span>
                </h3>
                <Link
                  href="/admin/openings"
                  className="text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:underline"
                >
                  Manage
                </Link>
              </div>

              {recentOpenings.length === 0 ? (
                <p className="text-[11px] text-muted-foreground">No active openings published yet.</p>
              ) : (
                <div className="space-y-1.5">
                  {recentOpenings.map((opening) => (
                    <div
                      key={opening.id}
                      className="p-2 rounded-lg border border-border/60 bg-muted/15 flex items-center justify-between text-xs"
                    >
                      <div className="min-w-0 flex-1 pr-2">
                        <span className="font-semibold text-foreground truncate block">
                          {opening.title}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          {opening.department} • {opening._count.applications} applied
                        </span>
                      </div>
                      <span className="shrink-0 text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 font-semibold uppercase">
                        {opening.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-border/50">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Sub-Admin Staff: {subAdminCount} provisioned</span>
              <Link
                href="/admin/subadmins"
                className="font-semibold text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1"
              >
                Manage Staff <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Row 4: Core Administrative Operational Hub */}
      <div className="border border-border/70 rounded-2xl p-5 bg-card shadow-2xs">
        <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-4">
          Core Platform Management Modules
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {/* Applications */}
          <Link
            href="/admin/applications"
            className="p-3.5 rounded-xl border border-border/70 bg-muted/15 hover:bg-muted/50 transition-colors flex flex-col justify-between group"
          >
            <div className="h-8 w-8 rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400 flex items-center justify-center mb-2.5">
              <FileText className="h-4 w-4 group-hover:scale-110 transition-transform" />
            </div>
            <div>
              <div className="text-xs font-bold text-foreground">Applications</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">Screen candidates</div>
            </div>
          </Link>

          {/* Job Openings */}
          <Link
            href="/admin/openings"
            className="p-3.5 rounded-xl border border-border/70 bg-muted/15 hover:bg-muted/50 transition-colors flex flex-col justify-between group"
          >
            <div className="h-8 w-8 rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400 flex items-center justify-center mb-2.5">
              <Briefcase className="h-4 w-4 group-hover:scale-110 transition-transform" />
            </div>
            <div>
              <div className="text-xs font-bold text-foreground">Job Openings</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">Manage positions</div>
            </div>
          </Link>

          {/* Interviews */}
          <Link
            href="/admin/interviews"
            className="p-3.5 rounded-xl border border-border/70 bg-muted/15 hover:bg-muted/50 transition-colors flex flex-col justify-between group"
          >
            <div className="h-8 w-8 rounded-lg bg-amber-50 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400 flex items-center justify-center mb-2.5">
              <Calendar className="h-4 w-4 group-hover:scale-110 transition-transform" />
            </div>
            <div>
              <div className="text-xs font-bold text-foreground">Interviews</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">Panels & schedules</div>
            </div>
          </Link>

          {/* Evaluations */}
          <Link
            href="/admin/evaluations"
            className="p-3.5 rounded-xl border border-border/70 bg-muted/15 hover:bg-muted/50 transition-colors flex flex-col justify-between group"
          >
            <div className="h-8 w-8 rounded-lg bg-purple-50 text-purple-600 dark:bg-purple-950/60 dark:text-purple-400 flex items-center justify-center mb-2.5">
              <Award className="h-4 w-4 group-hover:scale-110 transition-transform" />
            </div>
            <div>
              <div className="text-xs font-bold text-foreground">7-Day Eval</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">Cockpit & scores</div>
            </div>
          </Link>

          {/* Attendance */}
          <Link
            href="/admin/attendance"
            className="p-3.5 rounded-xl border border-border/70 bg-muted/15 hover:bg-muted/50 transition-colors flex flex-col justify-between group"
          >
            <div className="h-8 w-8 rounded-lg bg-cyan-50 text-cyan-600 dark:bg-cyan-950/60 dark:text-cyan-400 flex items-center justify-center mb-2.5">
              <Clock className="h-4 w-4 group-hover:scale-110 transition-transform" />
            </div>
            <div>
              <div className="text-xs font-bold text-foreground">Attendance</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">Clock-in records</div>
            </div>
          </Link>

          {/* Sub-Admins */}
          <Link
            href="/admin/subadmins"
            className="p-3.5 rounded-xl border border-border/70 bg-muted/15 hover:bg-muted/50 transition-colors flex flex-col justify-between group"
          >
            <div className="h-8 w-8 rounded-lg bg-rose-50 text-rose-600 dark:bg-rose-950/60 dark:text-rose-400 flex items-center justify-center mb-2.5">
              <ShieldCheck className="h-4 w-4 group-hover:scale-110 transition-transform" />
            </div>
            <div>
              <div className="text-xs font-bold text-foreground">Sub-Admins</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">Role permissions</div>
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}
