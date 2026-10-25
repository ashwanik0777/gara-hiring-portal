import React from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ForbiddenError, NotFoundError } from "@/lib/errors";
import { requirePortalCapability } from "@/features/lifecycle/services/lifecycle-service";
import { applicationService } from "@/features/applications/services/application-service";
import { offerService } from "@/features/employees/services/offer-service";
import { CandidateOfferView } from "@/features/employees/components/candidate-offer-view";
import { ReadOnlyOfferSummary } from "@/features/lifecycle/components/read-only-offer-summary";
import {
  ApplicationStatusBadge,
  JoinedHistoryNote,
  linkButtonClass,
} from "@/features/lifecycle/components/self-service-ui";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { OpenResumeLink } from "@/features/applications/components/resume-links";
import {
  ArrowLeft,
  Calendar,
  Building,
  MapPin,
  Download,
  FileText,
  Clock,
  CheckCircle2,
  AlertCircle,
  Briefcase,
  Link2,
} from "lucide-react";

interface ApplicationDetailPageProps {
  params: Promise<{ id: string }>;
}

// Next.js 16 Cache Components: Allow runtime data streaming
export const instant = false;

export default async function ApplicationDetailPage({ params }: ApplicationDetailPageProps) {
  // Candidates see their own application; after joining it is read-only history.
  const { user, lifecycle } = await requirePortalCapability("journey", {
    callbackPath: "/candidate/applications",
  });
  const readOnly = lifecycle.applicationsReadOnly;
  const backLabel = readOnly ? "Back to My Journey" : "Back to Applications";

  const { id } = await params;

  let application: Awaited<ReturnType<typeof applicationService.getCandidateApplicationDetail>>;
  try {
    // Ownership is enforced by the service (strict IDOR check).
    application = await applicationService.getCandidateApplicationDetail(id, user.id);
  } catch (err: unknown) {
    if (err instanceof NotFoundError) {
      notFound();
    }
    if (!(err instanceof ForbiddenError)) {
      throw err;
    }
    // Forbidden: the application belongs to another candidate
    return (
      <div className="container mx-auto px-4 py-16 max-w-xl text-center">
        <div className="mx-auto w-12 h-12 rounded-full bg-destructive/10 text-destructive flex items-center justify-center mb-4">
          <AlertCircle className="h-6 w-6" aria-hidden="true" />
        </div>
        <h2 className="text-xl font-bold text-foreground">Access Restricted</h2>
        <p className="mt-2 text-sm text-muted-foreground">This application is not linked to your account.</p>
        <div className="mt-6">
          <Link href="/candidate/applications" className={linkButtonClass("outline", "md")}>
            <ArrowLeft className="h-4 w-4" aria-hidden="true" /> {backLabel}
          </Link>
        </div>
      </div>
    );
  }

  // Returns null unless this user may see the offer (candidate projection, no staff notes).
  const offer = await offerService.getOfferByApplicationId(user, application.id);

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      {/* Navigation and Top Bar */}
      <div>
        <Link
          href="/candidate/applications"
          className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 transition-colors mb-4 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" /> {backLabel}
        </Link>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-6">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span className="font-mono text-xs font-bold text-primary bg-primary/10 px-2.5 py-0.5 rounded">
                {application.referenceCode}
              </span>
              <ApplicationStatusBadge status={application.status} />
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
              {application.opening.title}
            </h2>
            <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground mt-2">
              <span className="flex items-center gap-1.5">
                <Building className="h-3.5 w-3.5" aria-hidden="true" /> {application.opening.department}
              </span>
              <span className="flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5" aria-hidden="true" /> {application.opening.location}
              </span>
              <span className="flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5" aria-hidden="true" /> Submitted on {new Date(application.createdAt).toLocaleDateString()}
              </span>
              <span className="flex items-center gap-1.5">
                <Briefcase className="h-3.5 w-3.5" aria-hidden="true" /> Form Version v{application.formVersion.versionNumber}
              </span>
            </div>
          </div>
        </div>
      </div>

      {readOnly && <JoinedHistoryNote joinedAt={lifecycle.employment?.joiningDate ?? lifecycle.upgradedAt} />}

      {/* Official Employment Offer Card: actions only before joining. */}
      {offer && (readOnly ? <ReadOnlyOfferSummary offer={offer} /> : <CandidateOfferView offer={offer} />)}

      {/* Status Timeline */}
      <Card className="border-border shadow-xs">
        <CardHeader className="pb-3 border-b border-border/50">
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="h-4 w-4 text-primary" aria-hidden="true" /> Application Progress Timeline
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-6">
          {application.timeline.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">No stage changes have been recorded yet.</p>
          ) : (
            <ol className="relative border-l-2 border-border ml-3 space-y-6 pl-6 py-2">
              {application.timeline.map((entry) => (
                <li key={entry.id} className="relative group">
                  <div className="absolute -left-[31px] top-1 h-4 w-4 rounded-full border-2 border-primary bg-card" aria-hidden="true" />
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-semibold uppercase tracking-wider text-foreground">
                        {entry.toStatus.replace(/_/g, " ")}
                      </span>
                      <span className="text-[11px] text-muted-foreground">
                        {new Date(entry.createdAt).toLocaleString()}
                      </span>
                    </div>
                    {entry.candidateMessage && (
                      <p className="text-xs text-muted-foreground mt-1.5 bg-muted/40 p-3 rounded-lg border border-border/50 leading-relaxed">
                        {entry.candidateMessage}
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>

      {/* Submitted Resume Card */}
      <Card className="border-border shadow-xs">
        <CardHeader className="pb-3 border-b border-border/50">
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" aria-hidden="true" /> Application Documents
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-6 space-y-3">
          {application.resumeLink && (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between p-4 rounded-lg border border-border bg-muted/30">
              <div className="flex items-center gap-3 min-w-0">
                <div className="p-2.5 bg-primary/10 rounded-md text-primary" aria-hidden="true">
                  <Link2 className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-medium text-foreground">Resume link</div>
                  <div className="text-xs text-muted-foreground break-all">
                    {application.resumeLink.url}
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Keep sharing set to &quot;Anyone with the link can view&quot; so the hiring team can open it.
                  </p>
                </div>
              </div>
              <OpenResumeLink link={application.resumeLink} className="shrink-0" />
            </div>
          )}
          {application.hasResume ? (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between p-4 rounded-lg border border-border bg-muted/30">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-primary/10 rounded-md text-primary" aria-hidden="true">
                  <FileText className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-sm font-medium text-foreground">Resume Document (PDF)</div>
                  <div className="text-xs text-muted-foreground">PDF attachment</div>
                </div>
              </div>

              <a
                href={application.resumeDownloadUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={linkButtonClass("outline")}
              >
                <Download className="h-3.5 w-3.5" aria-hidden="true" /> Download Document
                <span className="sr-only">(opens in a new tab)</span>
              </a>
            </div>
          ) : application.resumeLink ? null : (
            <p className="text-xs text-muted-foreground italic">
              No document was attached to this application.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Submitted Responses Snapshot */}
      <Card className="border-border shadow-xs">
        <CardHeader className="pb-3 border-b border-border/50">
          <CardTitle className="text-base flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-primary" aria-hidden="true" /> Submitted Form Answers
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-6">
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {Object.entries(application.submittedResponses).map(([key, val]) => {
              if (key === "resume") return null;
              const displayVal =
                typeof val === "object" && val !== null
                  ? JSON.stringify(val)
                  : String(val);

              return (
                <div key={key} className="p-3 rounded-lg border border-border/50 bg-card">
                  <dt className="text-[11px] font-mono text-muted-foreground uppercase tracking-wider">
                    {key.replace(/_/g, " ")}
                  </dt>
                  <dd className="text-sm font-medium text-foreground mt-1 break-words">
                    {displayVal || "—"}
                  </dd>
                </div>
              );
            })}
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}
