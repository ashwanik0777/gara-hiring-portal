import React from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/guards";
import { getUserPermissions, STAFF_ROLES } from "@/lib/auth/permissions";
import { recruitmentService } from "@/features/recruitment/services/recruitment-service";
import { prisma } from "@/lib/db";
import { ApplicationStatus } from "@prisma/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/feedback/empty-state";
import {
  Users,
  Search,
  Filter,
  ArrowRight,
  Briefcase,
  Calendar,
  Clock,
  FileText,
  Award,
  CheckCircle2,
} from "lucide-react";

export const instant = false;

interface SubAdminApplicationsPageProps {
  searchParams: Promise<{
    status?: string;
    search?: string;
  }>;
}

function getInitials(name?: string | null) {
  if (!name) return "CA";
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function getStatusBadge(status: ApplicationStatus) {
  switch (status) {
    case ApplicationStatus.SUBMITTED:
      return (
        <Badge variant="outline" className="text-[10px] font-mono bg-slate-500/10 text-slate-700 dark:text-slate-300 border-slate-500/20">
          Submitted
        </Badge>
      );
    case ApplicationStatus.SCREENING:
      return (
        <Badge variant="outline" className="text-[10px] font-mono bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border-indigo-500/20">
          Screening
        </Badge>
      );
    case ApplicationStatus.SHORTLISTED:
      return (
        <Badge variant="outline" className="text-[10px] font-mono bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/20">
          Shortlisted
        </Badge>
      );
    case ApplicationStatus.INTERVIEW_SCHEDULED:
      return (
        <Badge variant="outline" className="text-[10px] font-mono bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20">
          Interview Scheduled
        </Badge>
      );
    case ApplicationStatus.INTERVIEWED:
      return (
        <Badge variant="outline" className="text-[10px] font-mono bg-cyan-500/10 text-cyan-700 dark:text-cyan-300 border-cyan-500/20">
          Interviewed
        </Badge>
      );
    case ApplicationStatus.EVALUATION_SELECTED:
      return (
        <Badge variant="outline" className="text-[10px] font-mono bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/20">
          Evaluation Selected
        </Badge>
      );
    case ApplicationStatus.OFFERED:
      return (
        <Badge variant="outline" className="text-[10px] font-mono bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20">
          Offer Extended
        </Badge>
      );
    case ApplicationStatus.OFFER_ACCEPTED:
      return (
        <Badge variant="outline" className="text-[10px] font-mono bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20">
          Offer Accepted
        </Badge>
      );
    case ApplicationStatus.HIRED:
      return (
        <Badge variant="outline" className="text-[10px] font-mono bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20">
          Hired
        </Badge>
      );
    case ApplicationStatus.REJECTED:
      return (
        <Badge variant="outline" className="text-[10px] font-mono bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/20">
          Rejected
        </Badge>
      );
    case ApplicationStatus.WITHDRAWN:
      return (
        <Badge variant="outline" className="text-[10px] font-mono text-muted-foreground border-border/80">
          Withdrawn
        </Badge>
      );
    case ApplicationStatus.ARCHIVED:
      return (
        <Badge variant="outline" className="text-[10px] font-mono text-muted-foreground border-border/80">
          Archived
        </Badge>
      );
    default:
      return <Badge variant="outline" className="text-[10px] font-mono">{status}</Badge>;
  }
}

export default async function SubAdminApplicationsPage({
  searchParams,
}: SubAdminApplicationsPageProps) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login?callbackUrl=/subadmin/applications");
  }

  const hasStaffOrAdminRole = user.roles.some((r) => STAFF_ROLES.includes(r));
  if (!hasStaffOrAdminRole) {
    redirect("/candidate/dashboard");
  }

  const permissions = await getUserPermissions(user.id, user.roles);
  if (!permissions.canApplications) {
    redirect("/subadmin");
  }

  const { status, search } = await searchParams;

  const validStatus =
    status && Object.values(ApplicationStatus).includes(status as ApplicationStatus)
      ? (status as ApplicationStatus)
      : undefined;

  // 1. Parallel database queries for accurate pipeline counts + filtered queue
  const [allStatusCounts, applications] = await Promise.all([
    prisma.application
      .groupBy({
        by: ["status"],
        where: { isArchived: false },
        _count: { status: true },
      })
      .catch(() => []),
    recruitmentService.getRecruitmentQueue(user, {
      status: validStatus,
      search: search || undefined,
    }),
  ]);

  const countByStatus: Record<string, number> = {};
  let globalTotal = 0;
  for (const item of allStatusCounts) {
    countByStatus[item.status] = item._count.status;
    globalTotal += item._count.status;
  }

  const screeningTotal =
    (countByStatus[ApplicationStatus.SUBMITTED] || 0) +
    (countByStatus[ApplicationStatus.SCREENING] || 0);

  const interviewTotal =
    (countByStatus[ApplicationStatus.SHORTLISTED] || 0) +
    (countByStatus[ApplicationStatus.INTERVIEW_SCHEDULED] || 0) +
    (countByStatus[ApplicationStatus.INTERVIEWED] || 0);

  const evaluationTotal =
    countByStatus[ApplicationStatus.EVALUATION_SELECTED] || 0;

  const hiredTotal =
    (countByStatus[ApplicationStatus.OFFERED] || 0) +
    (countByStatus[ApplicationStatus.OFFER_ACCEPTED] || 0) +
    (countByStatus[ApplicationStatus.HIRED] || 0);

  return (
    <div className="w-full space-y-6">
      {/* ─── 5 EXECUTIVE RECRUITMENT KPI CARDS ─── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5 sm:gap-4">
        {/* 1. All Applications */}
        <Link
          href="/subadmin/applications"
          className={`bg-card border border-border/80 border-l-4 border-l-blue-500 rounded-2xl p-4 sm:p-5 shadow-2xs hover:shadow-xs transition-all flex flex-col justify-between group cursor-pointer ${
            !validStatus ? "ring-1 ring-blue-500/40" : ""
          }`}
        >
          <div className="flex items-center justify-between gap-2 mb-2">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider font-mono">
              Total Pipeline
            </span>
            <div className="h-8 w-8 rounded-xl bg-blue-500/15 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
              <FileText className="h-4 w-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold font-mono text-foreground tracking-tight">
            {globalTotal}
          </div>
          <div className="mt-2 flex items-center gap-1.5 text-[11px] font-mono">
            <Badge variant="outline" className="text-[10px] bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/20">
              {hiredTotal} Hired
            </Badge>
            <span className="text-muted-foreground">
              • {globalTotal ? Math.round((hiredTotal / globalTotal) * 100) : 0}% Conv
            </span>
          </div>
        </Link>

        {/* 2. Submitted & Screening */}
        <Link
          href="/subadmin/applications?status=SCREENING"
          className={`bg-card border border-border/80 border-l-4 border-l-indigo-500 rounded-2xl p-4 sm:p-5 shadow-2xs hover:shadow-xs transition-all flex flex-col justify-between group cursor-pointer ${
            validStatus === ApplicationStatus.SCREENING || validStatus === ApplicationStatus.SUBMITTED
              ? "ring-1 ring-indigo-500/40"
              : ""
          }`}
        >
          <div className="flex items-center justify-between gap-2 mb-2">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider font-mono">
              In Screening
            </span>
            <div className="h-8 w-8 rounded-xl bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
              <Clock className="h-4 w-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold font-mono text-foreground tracking-tight">
            {screeningTotal}
          </div>
          <div className="mt-2 flex items-center gap-1.5 text-[11px] font-mono">
            <Badge variant="outline" className="text-[10px] bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border-indigo-500/20">
              Initial Intake
            </Badge>
            <span className="text-muted-foreground">
              • {globalTotal ? Math.round((screeningTotal / globalTotal) * 100) : 0}%
            </span>
          </div>
        </Link>

        {/* 3. Shortlisted & Interviews */}
        <Link
          href="/subadmin/applications?status=INTERVIEW_SCHEDULED"
          className={`bg-card border border-border/80 border-l-4 border-l-amber-500 rounded-2xl p-4 sm:p-5 shadow-2xs hover:shadow-xs transition-all flex flex-col justify-between group cursor-pointer ${
            validStatus === ApplicationStatus.INTERVIEW_SCHEDULED ||
            validStatus === ApplicationStatus.SHORTLISTED ||
            validStatus === ApplicationStatus.INTERVIEWED
              ? "ring-1 ring-amber-500/40"
              : ""
          }`}
        >
          <div className="flex items-center justify-between gap-2 mb-2">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider font-mono">
              Interview Stage
            </span>
            <div className="h-8 w-8 rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
              <Calendar className="h-4 w-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold font-mono text-foreground tracking-tight">
            {interviewTotal}
          </div>
          <div className="mt-2 flex items-center gap-1.5 text-[11px] font-mono">
            <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20">
              Panel Rounds
            </Badge>
            <span className="text-muted-foreground">
              • {globalTotal ? Math.round((interviewTotal / globalTotal) * 100) : 0}%
            </span>
          </div>
        </Link>

        {/* 4. 7-Day Supervised Evaluation */}
        <Link
          href="/subadmin/applications?status=EVALUATION_SELECTED"
          className={`bg-card border border-border/80 border-l-4 border-l-purple-500 rounded-2xl p-4 sm:p-5 shadow-2xs hover:shadow-xs transition-all flex flex-col justify-between group cursor-pointer ${
            validStatus === ApplicationStatus.EVALUATION_SELECTED ? "ring-1 ring-purple-500/40" : ""
          }`}
        >
          <div className="flex items-center justify-between gap-2 mb-2">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider font-mono">
              7-Day Eval Gate
            </span>
            <div className="h-8 w-8 rounded-xl bg-purple-500/15 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
              <Award className="h-4 w-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold font-mono text-foreground tracking-tight">
            {evaluationTotal}
          </div>
          <div className="mt-2 flex items-center gap-1.5 text-[11px] font-mono">
            <Badge variant="outline" className="text-[10px] bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/20">
              Supervised Period
            </Badge>
          </div>
        </Link>

        {/* 5. Offered & Hired */}
        <Link
          href="/subadmin/applications?status=HIRED"
          className={`col-span-2 sm:col-span-1 bg-card border border-border/80 border-l-4 border-l-emerald-500 rounded-2xl p-4 sm:p-5 shadow-2xs hover:shadow-xs transition-all flex flex-col justify-between group cursor-pointer ${
            validStatus === ApplicationStatus.HIRED ||
            validStatus === ApplicationStatus.OFFERED ||
            validStatus === ApplicationStatus.OFFER_ACCEPTED
              ? "ring-1 ring-emerald-500/40"
              : ""
          }`}
        >
          <div className="flex items-center justify-between gap-2 mb-2">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider font-mono">
              Offered & Hired
            </span>
            <div className="h-8 w-8 rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
              <CheckCircle2 className="h-4 w-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold font-mono text-foreground tracking-tight">
            {hiredTotal}
          </div>
          <div className="mt-2 flex items-center gap-1.5 text-[11px] font-mono">
            <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20">
              Intake Completed
            </Badge>
          </div>
        </Link>
      </div>

      {/* ─── Search & Stage Filter Toolbar ─── */}
      <div className="p-4 rounded-2xl border border-border/80 bg-card/80 backdrop-blur-xs shadow-2xs flex flex-col lg:flex-row gap-4 items-stretch lg:items-center justify-between">
        <form method="GET" className="flex flex-1 items-center gap-2">
          {validStatus && (
            <input type="hidden" name="status" value={validStatus} />
          )}
          <div className="relative flex-1">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              name="search"
              defaultValue={search || ""}
              placeholder="Search candidate name, email, or reference..."
              className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-border/80 bg-muted/30 text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:ring-1 focus:ring-primary focus:border-primary transition-all font-mono"
            />
          </div>
          <Button type="submit" size="sm" variant="secondary" className="rounded-xl h-9 text-xs font-semibold px-4 cursor-pointer">
            Search
          </Button>
          {(search || validStatus) && (
            <Link href="/subadmin/applications">
              <Button type="button" size="sm" variant="ghost" className="rounded-xl h-9 text-xs cursor-pointer">
                Reset
              </Button>
            </Link>
          )}
        </form>

        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 lg:pb-0">
          <Filter className="h-3.5 w-3.5 text-muted-foreground shrink-0 mr-1" />
          <Link
            href="/subadmin/applications"
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
              !validStatus
                ? "bg-primary text-primary-foreground shadow-2xs"
                : "border border-border/80 bg-muted/30 text-muted-foreground hover:text-foreground hover:bg-muted/60"
            }`}
          >
            All ({globalTotal})
          </Link>
          <Link
            href="/subadmin/applications?status=SCREENING"
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
              validStatus === ApplicationStatus.SCREENING
                ? "bg-primary text-primary-foreground shadow-2xs"
                : "border border-border/80 bg-muted/30 text-muted-foreground hover:text-foreground hover:bg-muted/60"
            }`}
          >
            Screening
          </Link>
          <Link
            href="/subadmin/applications?status=SHORTLISTED"
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
              validStatus === ApplicationStatus.SHORTLISTED
                ? "bg-primary text-primary-foreground shadow-2xs"
                : "border border-border/80 bg-muted/30 text-muted-foreground hover:text-foreground hover:bg-muted/60"
            }`}
          >
            Shortlisted
          </Link>
          <Link
            href="/subadmin/applications?status=INTERVIEW_SCHEDULED"
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
              validStatus === ApplicationStatus.INTERVIEW_SCHEDULED
                ? "bg-primary text-primary-foreground shadow-2xs"
                : "border border-border/80 bg-muted/30 text-muted-foreground hover:text-foreground hover:bg-muted/60"
            }`}
          >
            Interviewing
          </Link>
          <Link
            href="/subadmin/applications?status=EVALUATION_SELECTED"
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
              validStatus === ApplicationStatus.EVALUATION_SELECTED
                ? "bg-primary text-primary-foreground shadow-2xs"
                : "border border-border/80 bg-muted/30 text-muted-foreground hover:text-foreground hover:bg-muted/60"
            }`}
          >
            7-Day Eval
          </Link>
          <Link
            href="/subadmin/applications?status=HIRED"
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
              validStatus === ApplicationStatus.HIRED
                ? "bg-primary text-primary-foreground shadow-2xs"
                : "border border-border/80 bg-muted/30 text-muted-foreground hover:text-foreground hover:bg-muted/60"
            }`}
          >
            Hired
          </Link>
        </div>
      </div>

      {/* ─── Applications List ─── */}
      {applications.length === 0 ? (
        <EmptyState
          title="No applications match filters"
          description="Try broadening your search query or reset the pipeline stage filters."
          action={
            <Link href="/subadmin/applications">
              <Button size="sm" variant="outline" className="rounded-xl">Reset Filters</Button>
            </Link>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {applications.map((app) => (
            <Card
              key={app.id}
              className="rounded-2xl border border-border/80 hover:border-primary/50 transition-all shadow-2xs hover:shadow-xs"
            >
              <CardContent className="p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-start gap-3.5 flex-1 min-w-0">
                  <div className="h-10 w-10 rounded-2xl bg-primary/10 text-primary font-bold text-xs flex items-center justify-center shrink-0 border border-primary/20 shadow-2xs">
                    {getInitials(app.candidate.fullName)}
                  </div>

                  <div className="space-y-1 flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-[11px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-lg border border-primary/20">
                        {app.referenceCode}
                      </span>
                      {getStatusBadge(app.status)}
                      <span className="text-xs text-muted-foreground flex items-center gap-1 truncate">
                        <Briefcase className="h-3 w-3 shrink-0" />
                        <span className="font-medium text-foreground">{app.opening.title}</span>
                        <span>• {app.opening.department}</span>
                      </span>
                    </div>

                    <div>
                      <h3 className="text-sm sm:text-base font-bold text-foreground truncate">
                        {app.candidate.fullName}
                      </h3>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span>{app.candidate.email}</span>
                        {app.candidate.phone && <span>• {app.candidate.phone}</span>}
                        {app.candidate.location && <span>• {app.candidate.location}</span>}
                      </div>
                    </div>

                    {app.latestInterview && (
                      <div className="inline-flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-300 bg-amber-500/10 px-2.5 py-1 rounded-xl border border-amber-500/20 font-mono">
                        <Calendar className="h-3 w-3" />
                        <span>
                          {app.latestInterview.roundName}: {new Date(app.latestInterview.scheduledAt).toLocaleDateString()}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex sm:flex-col items-end justify-between w-full sm:w-auto gap-3 pt-3 sm:pt-0 border-t sm:border-t-0 border-border/60 shrink-0">
                  <span className="text-[11px] text-muted-foreground flex items-center gap-1 font-mono">
                    <Clock className="h-3 w-3" />
                    {new Date(app.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                  </span>

                  <Link href={`/subadmin/applications/${app.id}`}>
                    <Button size="sm" className="rounded-xl h-8 text-xs font-semibold gap-1.5 shadow-2xs cursor-pointer">
                      Review Cockpit <ArrowRight className="h-3.5 w-3.5" />
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
