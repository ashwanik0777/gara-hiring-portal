import React from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/guards";
import { applicationService } from "@/features/applications/services/application-service";
import { ApplicationStatus } from "@/features/applications/types";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/feedback/empty-state";
import {
  Briefcase,
  Clock,
  ArrowRight,
  FileCheck2,
  Calendar,
  Building,
} from "lucide-react";

function getStatusBadge(status: ApplicationStatus) {
  switch (status) {
    case ApplicationStatus.SUBMITTED:
      return <Badge variant="default">Submitted</Badge>;
    case ApplicationStatus.SCREENING:
      return <Badge variant="warning">Under Screening</Badge>;
    case ApplicationStatus.SHORTLISTED:
      return <Badge variant="warning">Shortlisted</Badge>;
    case ApplicationStatus.INTERVIEW_SCHEDULED:
      return <Badge variant="warning">Interview Scheduled</Badge>;
    case ApplicationStatus.INTERVIEWED:
      return <Badge variant="secondary">Interview Completed</Badge>;
    case ApplicationStatus.EVALUATION_SELECTED:
      return <Badge variant="success">Evaluation Selected</Badge>;
    case ApplicationStatus.OFFERED:
      return <Badge variant="success">Offer Extended</Badge>;
    case ApplicationStatus.OFFER_ACCEPTED:
      return <Badge variant="success">Offer Accepted</Badge>;
    case ApplicationStatus.REJECTED:
      return <Badge variant="destructive">Not Selected</Badge>;
    case ApplicationStatus.WITHDRAWN:
      return <Badge variant="outline">Withdrawn</Badge>;
    case ApplicationStatus.ARCHIVED:
      return <Badge variant="secondary">Archived</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

export const instant = false;

export default async function CandidateDashboardPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login?callbackUrl=/candidate/dashboard");
  }
  if (user.mustChangePassword) {
    redirect("/set-password");
  }

  const applications = await applicationService.getCandidateApplications(user.id);

  const activeCount = applications.filter(
    (a) =>
      a.status !== ApplicationStatus.REJECTED &&
      a.status !== ApplicationStatus.WITHDRAWN &&
      a.status !== ApplicationStatus.ARCHIVED
  ).length;

  return (
    <div className="space-y-8">
      {/* Greeting Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
            Welcome back, {user.name}
          </h1>
        </div>
        <Link href="/careers">
          <Button size="sm">
            <Briefcase className="h-4 w-4 mr-2" /> Explore Open Roles
          </Button>
        </Link>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-border">
          <CardContent className="pt-6 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground">Total Applications</p>
              <p className="text-2xl font-bold text-foreground mt-1">{applications.length}</p>
            </div>
            <div className="p-3 bg-primary/10 rounded-lg text-primary">
              <FileCheck2 className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardContent className="pt-6 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground">Active in Review</p>
              <p className="text-2xl font-bold text-foreground mt-1">{activeCount}</p>
            </div>
            <div className="p-3 bg-warning/10 rounded-lg text-warning">
              <Clock className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardContent className="pt-6 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground">Account Status</p>
              <p className="text-sm font-semibold text-success mt-1.5 flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-success inline-block" />
                Active Candidate
              </p>
            </div>
            <div className="p-3 bg-secondary rounded-lg text-secondary-foreground">
              <Briefcase className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Applications Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">Submitted Applications</h2>
          <span className="text-xs text-muted-foreground">
            {applications.length} {applications.length === 1 ? "application" : "applications"}
          </span>
        </div>

        {applications.length === 0 ? (
          <EmptyState
            title="No applications submitted yet"
            description="You have not submitted any applications. Browse our open positions and apply to join GARA Innovation."
            action={
              <Link href="/careers">
                <Button size="sm">Browse Openings</Button>
              </Link>
            }
          />
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {applications.map((app) => (
              <Card
                key={app.id}
                className="border-border hover:border-primary/40 transition-colors shadow-xs"
              >
                <CardHeader className="pb-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="font-mono text-xs font-bold text-primary bg-primary/10 px-2 py-0.5 rounded">
                          {app.referenceCode}
                        </span>
                        {getStatusBadge(app.status)}
                      </div>
                      <CardTitle className="text-lg text-foreground">
                        {app.opening.title}
                      </CardTitle>
                    </div>

                    <Link href={`/candidate/applications/${app.id}`}>
                      <Button variant="outline" size="sm" className="w-full sm:w-auto">
                        Track Application <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
                      </Button>
                    </Link>
                  </div>
                </CardHeader>

                <CardContent className="pt-0 border-t border-border/40 text-xs text-muted-foreground flex flex-wrap items-center justify-between gap-3 pt-3">
                  <div className="flex flex-wrap items-center gap-4">
                    <span className="flex items-center gap-1.5">
                      <Building className="h-3.5 w-3.5" />
                      {app.opening.department}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Calendar className="h-3.5 w-3.5" />
                      Applied on {new Date(app.createdAt).toLocaleDateString()}
                    </span>
                  </div>

                  <span className="text-[11px] text-muted-foreground italic">
                    Opening type: {app.opening.type.toLowerCase()}
                  </span>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
