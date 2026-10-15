import React from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/guards";
import { getUserPermissions, STAFF_ROLES } from "@/lib/auth/permissions";
import { recruitmentService } from "@/features/recruitment/services/recruitment-service";
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
} from "lucide-react";

export const instant = false;

interface SubAdminApplicationsPageProps {
  searchParams: Promise<{
    status?: string;
    search?: string;
  }>;
}

function getStatusBadge(status: ApplicationStatus) {
  switch (status) {
    case ApplicationStatus.SUBMITTED:
      return <Badge variant="default">Submitted</Badge>;
    case ApplicationStatus.SCREENING:
      return <Badge variant="warning">Screening</Badge>;
    case ApplicationStatus.SHORTLISTED:
      return <Badge variant="warning">Shortlisted</Badge>;
    case ApplicationStatus.INTERVIEW_SCHEDULED:
      return <Badge variant="warning">Interview Scheduled</Badge>;
    case ApplicationStatus.INTERVIEWED:
      return <Badge variant="secondary">Interviewed</Badge>;
    case ApplicationStatus.EVALUATION_SELECTED:
      return <Badge variant="success">Evaluation Selected</Badge>;
    case ApplicationStatus.OFFERED:
      return <Badge variant="success">Offer Extended</Badge>;
    case ApplicationStatus.OFFER_ACCEPTED:
      return <Badge variant="success">Offer Accepted</Badge>;
    case ApplicationStatus.REJECTED:
      return <Badge variant="destructive">Rejected</Badge>;
    case ApplicationStatus.WITHDRAWN:
      return <Badge variant="outline">Withdrawn</Badge>;
    case ApplicationStatus.ARCHIVED:
      return <Badge variant="secondary">Archived</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
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

  const applications = await recruitmentService.getRecruitmentQueue(user, {
    status: validStatus,
    search: search || undefined,
  });

  const totalCount = applications.length;
  const screeningCount = applications.filter((a) => a.status === ApplicationStatus.SCREENING).length;
  const interviewCount = applications.filter(
    (a) => a.status === ApplicationStatus.INTERVIEW_SCHEDULED || a.status === ApplicationStatus.INTERVIEWED
  ).length;
  const evaluationCount = applications.filter(
    (a) => a.status === ApplicationStatus.EVALUATION_SELECTED
  ).length;

  return (
    <div className="space-y-6">
      {/* Header and Queue Description */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground flex items-center gap-2.5">
            <Users className="h-6 w-6 text-primary" /> Application Queue
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            Review applicant pipelines, schedule rounds, and record evaluation verdicts.
          </p>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card className="border-border">
          <CardContent className="pt-6">
            <p className="text-xs font-medium text-muted-foreground">Active in Queue</p>
            <p className="text-2xl font-bold text-foreground mt-1">{totalCount}</p>
          </CardContent>
        </Card>
        <Card className="border-border">
          <CardContent className="pt-6">
            <p className="text-xs font-medium text-muted-foreground">In Screening</p>
            <p className="text-2xl font-bold text-warning mt-1">{screeningCount}</p>
          </CardContent>
        </Card>
        <Card className="border-border">
          <CardContent className="pt-6">
            <p className="text-xs font-medium text-muted-foreground">Interviews Active</p>
            <p className="text-2xl font-bold text-primary mt-1">{interviewCount}</p>
          </CardContent>
        </Card>
        <Card className="border-border">
          <CardContent className="pt-6">
            <p className="text-xs font-medium text-muted-foreground">Evaluation Selected</p>
            <p className="text-2xl font-bold text-success mt-1">{evaluationCount}</p>
          </CardContent>
        </Card>
      </div>

      {/* Search & Filter Toolbar */}
      <div className="bg-card border border-border p-4 rounded-xl flex flex-col sm:flex-row gap-4 items-center justify-between">
        <form method="GET" className="flex flex-1 w-full sm:w-auto items-center gap-2">
          <div className="relative flex-1">
            <Search className="h-4 w-4 absolute left-3 top-3 text-muted-foreground" />
            <input
              type="text"
              name="search"
              defaultValue={search || ""}
              placeholder="Filter by applicant name, reference, email, or opening title..."
              className="w-full pl-9 pr-4 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition"
            />
          </div>
          {status && <input type="hidden" name="status" value={status} />}
          <Button type="submit" variant="secondary" size="sm">
            Search
          </Button>
          {(search || status) && (
            <Link href="/subadmin/applications">
              <Button type="button" variant="outline" size="sm">
                Reset
              </Button>
            </Link>
          )}
        </form>

        {/* Quick Status Filter Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto pb-2 sm:pb-0">
          <span className="text-xs text-muted-foreground flex items-center gap-1 mr-1">
            <Filter className="h-3 w-3" /> Status:
          </span>
          <Link
            href={search ? `/subadmin/applications?search=${encodeURIComponent(search)}` : "/subadmin/applications"}
            className={`px-2.5 py-1 text-xs rounded-md font-medium transition ${
              !status
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            All
          </Link>
          {[
            { label: "Submitted", val: ApplicationStatus.SUBMITTED },
            { label: "Screening", val: ApplicationStatus.SCREENING },
            { label: "Interview", val: ApplicationStatus.INTERVIEW_SCHEDULED },
            { label: "Evaluation", val: ApplicationStatus.EVALUATION_SELECTED },
          ].map((tab) => (
            <Link
              key={tab.val}
              href={`/subadmin/applications?status=${tab.val}${search ? `&search=${encodeURIComponent(search)}` : ""}`}
              className={`px-2.5 py-1 text-xs rounded-md font-medium whitespace-nowrap transition ${
                status === tab.val
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              {tab.label}
            </Link>
          ))}
        </div>
      </div>

      {/* Applications List */}
      {applications.length === 0 ? (
        <EmptyState
          title="No applications match query"
          description="Try broadening your filter criteria or invite candidates to apply via public postings."
          action={
            <Link href="/subadmin/applications">
              <Button size="sm">Clear Filters</Button>
            </Link>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {applications.map((app) => (
            <Card
              key={app.id}
              className="border-border hover:border-primary/40 transition-colors shadow-xs"
            >
              <CardContent className="p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="space-y-1.5 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs font-bold text-primary bg-primary/10 px-2 py-0.5 rounded">
                      {app.referenceCode}
                    </span>
                    {getStatusBadge(app.status)}
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Briefcase className="h-3 w-3" />
                      {app.opening.title} ({app.opening.department})
                    </span>
                  </div>

                  <div>
                    <h3 className="text-base font-semibold text-foreground">
                      {app.candidate.fullName}
                    </h3>
                    <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                      <span>{app.candidate.email}</span>
                      {app.candidate.phone && <span>• {app.candidate.phone}</span>}
                      {app.candidate.location && <span>• {app.candidate.location}</span>}
                    </div>
                  </div>

                  {app.latestInterview && (
                    <div className="inline-flex items-center gap-1.5 text-xs text-primary bg-primary/5 px-2.5 py-1 rounded border border-primary/20">
                      <Calendar className="h-3.5 w-3.5" />
                      <span>
                        {app.latestInterview.roundName}: {new Date(app.latestInterview.scheduledAt).toLocaleDateString()}
                      </span>
                    </div>
                  )}
                </div>

                <div className="flex sm:flex-col items-end justify-between w-full sm:w-auto gap-3 pt-2 sm:pt-0 border-t sm:border-t-0 border-border/60">
                  <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    Applied {new Date(app.createdAt).toLocaleDateString()}
                  </span>

                  <Link href={`/subadmin/applications/${app.id}`}>
                    <Button size="sm" className="gap-1.5">
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
