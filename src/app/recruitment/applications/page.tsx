import React from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/guards";
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

interface RecruitmentQueuePageProps {
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

export const instant = false;

export default async function RecruitmentQueuePage({
  searchParams,
}: RecruitmentQueuePageProps) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
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
              placeholder="Search by candidate name, email, or reference code..."
              className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-input bg-card focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <Button type="submit" size="sm" variant="secondary">
            Search
          </Button>
        </form>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Filter className="h-3.5 w-3.5 text-muted-foreground" />
          <div className="flex flex-wrap gap-1.5 text-xs">
            <Link
              href="/recruitment/applications"
              className={`px-2.5 py-1 rounded-md border text-xs font-medium transition-colors ${
                !validStatus ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted"
              }`}
            >
              All
            </Link>
            <Link
              href="/recruitment/applications?status=SUBMITTED"
              className={`px-2.5 py-1 rounded-md border text-xs font-medium transition-colors ${
                validStatus === ApplicationStatus.SUBMITTED ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted"
              }`}
            >
              Submitted
            </Link>
            <Link
              href="/recruitment/applications?status=SCREENING"
              className={`px-2.5 py-1 rounded-md border text-xs font-medium transition-colors ${
                validStatus === ApplicationStatus.SCREENING ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted"
              }`}
            >
              Screening
            </Link>
            <Link
              href="/recruitment/applications?status=SHORTLISTED"
              className={`px-2.5 py-1 rounded-md border text-xs font-medium transition-colors ${
                validStatus === ApplicationStatus.SHORTLISTED ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted"
              }`}
            >
              Shortlisted
            </Link>
            <Link
              href="/recruitment/applications?status=INTERVIEW_SCHEDULED"
              className={`px-2.5 py-1 rounded-md border text-xs font-medium transition-colors ${
                validStatus === ApplicationStatus.INTERVIEW_SCHEDULED ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted"
              }`}
            >
              Interviewing
            </Link>
          </div>
        </div>
      </div>

      {/* Applications List */}
      {applications.length === 0 ? (
        <EmptyState
          title="No applications match filters"
          description="Try broadening your search query or reset the pipeline stage filters."
          action={
            <Link href="/recruitment/applications">
              <Button size="sm" variant="outline">Reset Filters</Button>
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

                  <Link href={`/recruitment/applications/${app.id}`}>
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
