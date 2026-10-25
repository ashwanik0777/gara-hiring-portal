import React from "react";
import Link from "next/link";
import { requirePortalCapability } from "@/features/lifecycle/services/lifecycle-service";
import { applicationService } from "@/features/applications/services/application-service";
import { ApplicationStatus } from "@/features/applications/types";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/feedback/empty-state";
import {
  ApplicationStatusBadge,
  applicationStatusSummary,
  JoinedHistoryNote,
  linkButtonClass,
} from "@/features/lifecycle/components/self-service-ui";
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

/** Statuses that ask the candidate to look at or act on the application. */
const ATTENTION_STATUSES: readonly string[] = [
  ApplicationStatus.INTERVIEW_SCHEDULED,
  ApplicationStatus.EVALUATION_SELECTED,
  ApplicationStatus.OFFERED,
  ApplicationStatus.OFFER_ACCEPTED,
];

export default async function CandidateApplicationsPage() {
  // Candidates manage their applications here; after joining this becomes read-only history.
  const { user, lifecycle } = await requirePortalCapability("journey", {
    callbackPath: "/candidate/applications",
  });
  const readOnly = lifecycle.applicationsReadOnly;
  const joinedAt = lifecycle.employment?.joiningDate ?? lifecycle.upgradedAt;

  // Ownership is enforced by the service: only this user's own applications are listed.
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
      <header className="space-y-2">
        <h2 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
          {readOnly ? "My Journey" : "My Applications"}
        </h2>
        {readOnly ? (
          <JoinedHistoryNote joinedAt={joinedAt} />
        ) : (
          <p className="text-sm text-muted-foreground">
            Every application you submitted, with its current stage.
          </p>
        )}
      </header>

      {/* KPI Stat Cards (counts of the listed applications only) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <div className="p-4 rounded-xl border border-border/70 bg-card shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase">
              Total Applied
            </span>
            <FileCheck2 className="h-4 w-4 text-blue-500" aria-hidden="true" />
          </div>
          <p className="text-2xl font-bold font-mono text-foreground mt-2">
            {applications.length}
          </p>
        </div>

        <div className="p-4 rounded-xl border border-border/70 bg-card shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase">
              {readOnly ? "Not Closed" : "In Review"}
            </span>
            <Clock className="h-4 w-4 text-amber-500" aria-hidden="true" />
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
            <Calendar className="h-4 w-4 text-purple-500" aria-hidden="true" />
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
            <CheckCircle2 className="h-4 w-4 text-emerald-500" aria-hidden="true" />
          </div>
          <p className="text-2xl font-bold font-mono text-foreground mt-2">
            {offerCount}
          </p>
        </div>
      </div>

      {/* Applications List */}
      <section className="space-y-4" aria-labelledby="applications-list-heading">
        <div className="flex items-center justify-between gap-3">
          <h3
            id="applications-list-heading"
            className="text-sm font-bold uppercase tracking-wider text-muted-foreground"
          >
            {readOnly ? "Application History" : "Submitted Records"} ({applications.length})
          </h3>
          <span className="hidden truncate text-xs text-muted-foreground font-mono sm:inline">
            {user.email}
          </span>
        </div>

        {applications.length === 0 ? (
          readOnly ? (
            <EmptyState
              title="No application history"
              description="There are no applications on record for this account."
            />
          ) : (
            <EmptyState
              title="No applications submitted yet"
              description="You haven't submitted any applications yet. Discover open roles and internships at GARA Innovation."
              action={
                <Link href="/careers" className={linkButtonClass("primary")}>
                  <Briefcase className="h-4 w-4" aria-hidden="true" /> Browse Openings
                </Link>
              }
            />
          )
        ) : (
          <ul className="grid grid-cols-1 gap-4">
            {applications.map((app) => {
              const isImportant = !readOnly && ATTENTION_STATUSES.includes(app.status);
              const appliedDate = new Date(app.createdAt).toLocaleDateString("en-US", {
                year: "numeric",
                month: "short",
                day: "numeric",
              });

              return (
                <li key={app.id}>
                  <Card className="border-border/70 hover:border-primary/40 transition-all shadow-2xs hover:shadow-xs">
                    <CardHeader className="pb-3">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 mb-2 flex-wrap">
                            <span className="font-mono text-xs font-bold text-primary bg-primary/10 px-2 py-0.5 rounded border border-primary/20">
                              {app.referenceCode}
                            </span>
                            <ApplicationStatusBadge status={app.status} />
                            <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                              <Clock className="h-3 w-3" aria-hidden="true" /> Applied {appliedDate}
                            </span>
                          </div>

                          <CardTitle className="text-base sm:text-lg font-bold text-foreground">
                            {app.opening.title}
                          </CardTitle>

                          <div className="flex items-center gap-3 sm:gap-4 text-xs text-muted-foreground mt-1.5 flex-wrap">
                            <span className="flex items-center gap-1">
                              <Building className="h-3.5 w-3.5" aria-hidden="true" />
                              {app.opening.department}
                            </span>
                            <span className="flex items-center gap-1">
                              <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                              {app.opening.location}
                            </span>
                            <span className="capitalize font-mono text-[11px] bg-muted/60 px-1.5 py-0.5 rounded">
                              {app.opening.type.toLowerCase().replace(/_/g, " ")}
                            </span>
                          </div>
                        </div>

                        <div className="shrink-0 sm:self-center">
                          <Link
                            href={`/candidate/applications/${app.id}`}
                            className={linkButtonClass("outline", "sm", "w-full sm:w-auto")}
                          >
                            <Eye className="h-3.5 w-3.5" aria-hidden="true" /> View Details
                            <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                            <span className="sr-only">for {app.opening.title}</span>
                          </Link>
                        </div>
                      </div>
                    </CardHeader>

                    {/* Status Banner */}
                    <CardContent className="pt-0">
                      <div
                        className={`p-3 rounded-lg text-xs flex items-start gap-2 ${
                          isImportant
                            ? "bg-blue-50/70 border border-blue-200 text-blue-900 dark:bg-blue-950/40 dark:border-blue-800 dark:text-blue-200"
                            : "bg-muted/40 border border-border/60 text-muted-foreground"
                        }`}
                      >
                        {isImportant ? (
                          <AlertCircle className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" aria-hidden="true" />
                        ) : (
                          <CheckCircle2 className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" aria-hidden="true" />
                        )}
                        <p className="min-w-0 flex-1 font-medium">
                          {applicationStatusSummary(app.status, readOnly)}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
