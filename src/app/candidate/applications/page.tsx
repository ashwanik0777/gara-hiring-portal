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
  FileCheck2,
  Calendar,
  Building,
  MapPin,
  CheckCircle2,
  AlertCircle,
  Eye,
  ChevronRight,
} from "lucide-react";

// Next.js 16 Cache Components route config
export const instant = false;

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
    case ApplicationStatus.HIRED:
      return <Badge variant="success">Hired (Employee)</Badge>;
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

function getStatusDescription(status: ApplicationStatus): {
  message: string;
  isImportant?: boolean;
} {
  switch (status) {
    case ApplicationStatus.SUBMITTED:
      return { message: "Your application has been received and is queued for recruiter screening." };
    case ApplicationStatus.SCREENING:
      return { message: "The hiring team is currently reviewing your resume and profile." };
    case ApplicationStatus.SHORTLISTED:
      return { message: "Congratulations! You have been shortlisted for the next evaluation stage." };
    case ApplicationStatus.INTERVIEW_SCHEDULED:
      return { message: "An interview has been scheduled. Check your email and application timeline for details.", isImportant: true };
    case ApplicationStatus.INTERVIEWED:
      return { message: "Your interview feedback is being compiled by the evaluation panel." };
    case ApplicationStatus.EVALUATION_SELECTED:
      return { message: "Selected for practical 7-working-day internship evaluation.", isImportant: true };
    case ApplicationStatus.OFFERED:
      return { message: "Action Required: An offer has been extended! Click below to review and respond.", isImportant: true };
    case ApplicationStatus.OFFER_ACCEPTED:
      return { message: "Offer accepted. Welcome to GARA Innovation!", isImportant: true };
    case ApplicationStatus.HIRED:
      return { message: "Onboarding initiated as a full-time employee." };
    case ApplicationStatus.REJECTED:
      return { message: "We appreciate your interest. We are unable to move forward at this time." };
    default:
      return { message: "Application on record." };
  }
}

export default async function CandidateApplicationsPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login?callbackUrl=/candidate/applications");
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

  const interviewCount = applications.filter(
    (a) =>
      a.status === ApplicationStatus.INTERVIEW_SCHEDULED ||
      a.status === ApplicationStatus.INTERVIEWED ||
      a.status === ApplicationStatus.EVALUATION_SELECTED
  ).length;

  const offerCount = applications.filter(
    (a) =>
      a.status === ApplicationStatus.OFFERED ||
      a.status === ApplicationStatus.OFFER_ACCEPTED ||
      a.status === ApplicationStatus.HIRED
  ).length;

  return (
    <div className="w-full space-y-6">
      {/* KPI Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <div className="p-4 rounded-xl border border-border/70 bg-card shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase">
              Total Applied
            </span>
            <FileCheck2 className="h-4 w-4 text-blue-500" />
          </div>
          <p className="text-2xl font-bold font-mono text-foreground mt-2">
            {applications.length}
          </p>
        </div>

        <div className="p-4 rounded-xl border border-border/70 bg-card shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase">
              In Review
            </span>
            <Clock className="h-4 w-4 text-amber-500" />
          </div>
          <p className="text-2xl font-bold font-mono text-foreground mt-2">
            {activeCount}
          </p>
        </div>

        <div className="p-4 rounded-xl border border-border/70 bg-card shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase">
              Interviews
            </span>
            <Calendar className="h-4 w-4 text-purple-500" />
          </div>
          <p className="text-2xl font-bold font-mono text-foreground mt-2">
            {interviewCount}
          </p>
        </div>

        <div className="p-4 rounded-xl border border-border/70 bg-card shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase">
              Offers
            </span>
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          </div>
          <p className="text-2xl font-bold font-mono text-foreground mt-2">
            {offerCount}
          </p>
        </div>
      </div>

      {/* Applications List */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
            Submitted Records ({applications.length})
          </h2>
          <span className="text-xs text-muted-foreground font-mono">
            {user.email}
          </span>
        </div>

        {applications.length === 0 ? (
          <EmptyState
            title="No applications submitted yet"
            description="You haven't submitted any job applications yet. Discover open engineering, design, and business roles at GARA Innovation."
            action={
              <Link href="/careers">
                <Button size="sm">
                  <Briefcase className="h-4 w-4 mr-1.5" /> Browse Openings
                </Button>
              </Link>
            }
          />
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {applications.map((app) => {
              const statusInfo = getStatusDescription(app.status);
              const appliedDate = new Date(app.createdAt).toLocaleDateString("en-US", {
                year: "numeric",
                month: "short",
                day: "numeric",
              });

              return (
                <Card
                  key={app.id}
                  className="border-border/70 hover:border-primary/40 transition-all shadow-2xs hover:shadow-xs"
                >
                  <CardHeader className="pb-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                          <span className="font-mono text-xs font-bold text-primary bg-primary/10 px-2 py-0.5 rounded border border-primary/20">
                            {app.referenceCode}
                          </span>
                          {getStatusBadge(app.status)}
                          <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                            <Clock className="h-3 w-3" /> Applied {appliedDate}
                          </span>
                        </div>

                        <CardTitle className="text-base sm:text-lg font-bold text-foreground">
                          {app.opening.title}
                        </CardTitle>

                        <div className="flex items-center gap-3 sm:gap-4 text-xs text-muted-foreground mt-1.5 flex-wrap">
                          <span className="flex items-center gap-1">
                            <Building className="h-3.5 w-3.5" />
                            {app.opening.department}
                          </span>
                          <span className="flex items-center gap-1">
                            <MapPin className="h-3.5 w-3.5" />
                            {app.opening.location}
                          </span>
                          <span className="capitalize font-mono text-[11px] bg-muted/60 px-1.5 py-0.2 rounded">
                            {app.opening.type.toLowerCase()}
                          </span>
                        </div>
                      </div>

                      <div className="shrink-0 sm:self-center">
                        <Link href={`/candidate/applications/${app.id}`}>
                          <Button size="sm" variant="outline" className="text-xs w-full sm:w-auto">
                            <Eye className="h-3.5 w-3.5 mr-1.5" /> View Details
                            <ChevronRight className="h-3.5 w-3.5 ml-1" />
                          </Button>
                        </Link>
                      </div>
                    </div>
                  </CardHeader>

                  {/* Status Banner */}
                  <CardContent className="pt-0">
                    <div
                      className={`p-3 rounded-lg text-xs flex items-start gap-2 ${
                        statusInfo.isImportant
                          ? "bg-blue-50/70 border border-blue-200 text-blue-900 dark:bg-blue-950/40 dark:border-blue-800 dark:text-blue-200"
                          : "bg-muted/40 border border-border/60 text-muted-foreground"
                      }`}
                    >
                      {statusInfo.isImportant ? (
                        <AlertCircle className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
                      ) : (
                        <CheckCircle2 className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">{statusInfo.message}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
