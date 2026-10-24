import React from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/guards";
import { ForbiddenError, NotFoundError } from "@/lib/errors";
import { applicationService } from "@/features/applications/services/application-service";
import { offerService } from "@/features/employees/services/offer-service";
import { CandidateOfferView } from "@/features/employees/components/candidate-offer-view";
import { ApplicationStatus } from "@/features/applications/types";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
} from "lucide-react";

interface ApplicationDetailPageProps {
  params: Promise<{ id: string }>;
}

// Next.js 16 Cache Components: Allow runtime data streaming
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

export default async function ApplicationDetailPage({ params }: ApplicationDetailPageProps) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login?callbackUrl=/candidate/applications");
  }
  if (user.mustChangePassword) {
    redirect("/set-password");
  }

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
          <AlertCircle className="h-6 w-6" />
        </div>
        <h1 className="text-xl font-bold text-foreground">Access Restricted</h1>
        <div className="mt-6">
          <Link href="/candidate/dashboard">
            <Button variant="outline">
              <ArrowLeft className="h-4 w-4 mr-2" /> Back to My Dashboard
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  const offer = await offerService.getOfferByApplicationId(user, application.id);

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      {/* Navigation and Top Bar */}
      <div>
        <Link
          href="/candidate/applications"
          className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 transition-colors mb-4"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Applications
        </Link>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-6">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="font-mono text-xs font-bold text-primary bg-primary/10 px-2.5 py-0.5 rounded">
                {application.referenceCode}
              </span>
              {getStatusBadge(application.status)}
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
              {application.opening.title}
            </h1>
            <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground mt-2">
              <span className="flex items-center gap-1.5">
                <Building className="h-3.5 w-3.5" /> {application.opening.department}
              </span>
              <span className="flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5" /> {application.opening.location}
              </span>
              <span className="flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5" /> Submitted on {new Date(application.createdAt).toLocaleDateString()}
              </span>
              <span className="flex items-center gap-1.5">
                <Briefcase className="h-3.5 w-3.5" /> Form Version v{application.formVersion.versionNumber}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Official Employment Offer Card */}
      {offer && <CandidateOfferView offer={offer} />}

      {/* Status Timeline */}
      <Card className="border-border shadow-xs">
        <CardHeader className="pb-3 border-b border-border/50">
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="h-4 w-4 text-primary" /> Application Progress Timeline
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="relative border-l-2 border-border ml-3 space-y-6 pl-6 py-2">
            {application.timeline.map((entry) => (
              <div key={entry.id} className="relative group">
                <div className="absolute -left-[31px] top-1 h-4 w-4 rounded-full border-2 border-primary bg-card" />
                <div>
                  <div className="flex items-center gap-2">
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
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Submitted Resume Card */}
      <Card className="border-border shadow-xs">
        <CardHeader className="pb-3 border-b border-border/50">
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" /> Uploaded Application Documents
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-6">
          {application.hasResume ? (
            <div className="flex items-center justify-between p-4 rounded-lg border border-border bg-muted/30">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-primary/10 rounded-md text-primary">
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
                className="inline-block"
              >
                <Button variant="outline" size="sm" className="gap-1.5">
                  <Download className="h-3.5 w-3.5" /> Download Document
                </Button>
              </a>
            </div>
          ) : (
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
            <CheckCircle2 className="h-4 w-4 text-primary" /> Submitted Form Answers
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {Object.entries(application.submittedResponses).map(([key, val]) => {
              if (key === "resume") return null;
              const displayVal =
                typeof val === "object" && val !== null
                  ? JSON.stringify(val)
                  : String(val);

              return (
                <div key={key} className="p-3 rounded-lg border border-border/50 bg-card">
                  <div className="text-[11px] font-mono text-muted-foreground uppercase tracking-wider">
                    {key.replace(/_/g, " ")}
                  </div>
                  <div className="text-sm font-medium text-foreground mt-1 break-words">
                    {displayVal || "—"}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
