import React from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/guards";
import { UnauthorizedState } from "@/components/feedback/unauthorized-state";
import { ForbiddenError, NotFoundError } from "@/lib/errors";
import { recruitmentService } from "@/features/recruitment/services/recruitment-service";
import { offerService } from "@/features/employees/services/offer-service";
import { JobOfferCard } from "@/features/employees/components/job-offer-card";
import { JobOfferButton } from "@/features/employees/components/job-offer-button";
import { ApplicationStatus, InterviewStatus, InterviewRecommendation, Role } from "@prisma/client";
import { StageTransitionDialog } from "@/features/recruitment/components/stage-transition-dialog";
import { InterviewSchedulerForm } from "@/features/recruitment/components/interview-scheduler-form";
import { InterviewFeedbackForm } from "@/features/recruitment/components/interview-feedback-form";
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
  Briefcase,
  ShieldCheck,
  Video,
  ShieldAlert,
} from "lucide-react";

interface RecruiterApplicationDetailPageProps {
  params: Promise<{ id: string }>;
}

// Next.js 16 Cache Components: Allow runtime data streaming
export const instant = false;

function getRecommendationBadge(rec: InterviewRecommendation) {
  switch (rec) {
    case InterviewRecommendation.STRONG_HIRE:
      return <Badge variant="success">Strong Hire</Badge>;
    case InterviewRecommendation.HIRE:
      return <Badge variant="success">Hire</Badge>;
    case InterviewRecommendation.HOLD:
      return <Badge variant="warning">Hold</Badge>;
    case InterviewRecommendation.NO_HIRE:
      return <Badge variant="destructive">No Hire</Badge>;
    default:
      return <Badge variant="outline">{rec}</Badge>;
  }
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

export default async function RecruiterApplicationDetailPage({
  params,
}: RecruiterApplicationDetailPageProps) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login?callbackUrl=/admin/applications");
  }
  if (user.mustChangePassword) {
    redirect("/set-password");
  }

  // Page-level guard: the /admin portal is restricted to Super Administrators.
  if (!user.roles.includes(Role.ADMIN)) {
    return <UnauthorizedState message="The administrator portal is restricted to Super Administrators." />;
  }

  const { id } = await params;

  let application: Awaited<ReturnType<typeof recruitmentService.getRecruiterApplicationDetail>>;
  try {
    application = await recruitmentService.getRecruiterApplicationDetail(id, user);
  } catch (error) {
    if (error instanceof NotFoundError) {
      notFound();
    }
    if (error instanceof ForbiddenError) {
      // ForbiddenError messages are operational and safe to show (e.g. own application).
      return <UnauthorizedState message={error.message} />;
    }
    throw error;
  }

  const nextRoundNumber = application.interviewSchedules.length + 1;
  const pendingInterview = application.interviewSchedules.find(
    (s) => s.status === InterviewStatus.SCHEDULED || s.status === InterviewStatus.RESCHEDULED
  );

  const offer = await offerService.getOfferByApplicationId(user, application.id);
  const isStaffAdmin = user.roles.includes("ADMIN") || user.roles.includes("HR");
  // Mirrors the offer service: offers are prepared only from these stages.
  const canPrepareOffer =
    isStaffAdmin &&
    !offer &&
    (application.status === ApplicationStatus.INTERVIEWED ||
      application.status === ApplicationStatus.EVALUATION_SELECTED);

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      {/* Back and Navigation */}
      <div>
        <Link
          href="/admin/applications"
          className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 transition-colors mb-4"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Application Queue
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
              {application.candidate.fullName}
            </h1>
            <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground mt-2">
              <span className="flex items-center gap-1.5 font-medium text-foreground">
                <Briefcase className="h-3.5 w-3.5 text-primary" /> {application.opening.title}
              </span>
              <span className="flex items-center gap-1.5">
                <Building className="h-3.5 w-3.5" /> {application.opening.department}
              </span>
              <span className="flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5" /> {application.opening.location}
              </span>
              <span className="flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5" /> Applied {new Date(application.createdAt).toLocaleDateString()}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <a
              href={application.resumeDownloadUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button size="sm" variant="outline" className="gap-1.5">
                <Download className="h-4 w-4" /> Download Resume
              </Button>
            </a>
          </div>
        </div>
      </div>

      {/* Grid: Cockpit Stage Decision & Interview Scheduling */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <StageTransitionDialog
          applicationId={application.id}
          currentStatus={application.status}
          candidateName={application.candidate.fullName}
        />

        <InterviewSchedulerForm
          applicationId={application.id}
          candidateName={application.candidate.fullName}
          defaultRoundNumber={nextRoundNumber}
        />
      </div>

      {/* Pending Interview Evaluation Form (if scheduled) */}
      {pendingInterview && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" /> Submit Interview Assessment
          </h2>
          <InterviewFeedbackForm
            scheduleId={pendingInterview.id}
            roundName={pendingInterview.roundName}
            candidateName={application.candidate.fullName}
            existingFeedback={pendingInterview.feedback}
          />
        </div>
      )}

      {/* Interview Rounds & Structured Feedback History */}
      <Card className="border-border shadow-xs">
        <CardHeader className="pb-3 border-b border-border/50">
          <CardTitle className="text-base flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-primary" /> Interview Sessions & Advisory Recommendations
            </span>
            <span className="text-xs text-muted-foreground font-mono">
              {application.interviewSchedules.length} rounds logged
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-6">
          {application.interviewSchedules.length === 0 ? (
            <p className="text-xs text-muted-foreground italic text-center py-4">
              No interview rounds scheduled yet for this candidate.
            </p>
          ) : (
            <div className="space-y-6">
              {application.interviewSchedules.map((schedule) => (
                <div
                  key={schedule.id}
                  className="p-4 rounded-xl border border-border bg-card/60 space-y-3"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border/40 pb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm text-foreground">
                          Round {schedule.roundNumber}: {schedule.roundName}
                        </span>
                        <Badge variant="outline" className="text-[10px]">
                          {schedule.status}
                        </Badge>
                      </div>
                      <div className="text-xs text-muted-foreground flex flex-wrap items-center gap-3 mt-1">
                        <span>{new Date(schedule.scheduledAt).toLocaleString()}</span>
                        <span>• {schedule.durationMinutes} mins</span>
                        {schedule.interviewer && (
                          <span>• Interviewer: {schedule.interviewer.name}</span>
                        )}
                      </div>
                    </div>

                    {schedule.meetingLink && (
                      <a
                        href={schedule.meetingLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-primary hover:underline inline-flex items-center gap-1"
                      >
                        <Video className="h-3.5 w-3.5" /> Meeting Link
                      </a>
                    )}
                  </div>

                  {schedule.feedback ? (
                    <div className="p-3 bg-muted/30 rounded-lg space-y-2 border border-border/30">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-foreground">
                          Interviewer Recommendation:
                        </span>
                        {getRecommendationBadge(schedule.feedback.recommendation)}
                      </div>

                      <div className="text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">Confidential Notes: </span>
                        {schedule.feedback.summaryNotes}
                      </div>

                      <div className="text-[11px] text-muted-foreground pt-1">
                        Evaluated by {schedule.feedback.interviewerName} on{" "}
                        {new Date(schedule.feedback.submittedAt).toLocaleDateString()}
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground italic">
                      Pending interviewer feedback submission.
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Full-Time Job Offer & Employee Hiring Section */}
      {offer ? (
        <JobOfferCard
          offer={offer}
          isStaffAdmin={isStaffAdmin}
          canHire={application.status === ApplicationStatus.OFFER_ACCEPTED}
        />
      ) : canPrepareOffer ? (
        <Card className="border-border shadow-xs">
          <CardHeader className="pb-3 border-b border-border/50">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <Briefcase className="h-4 w-4 text-primary" /> Full-Time Employment Offer
                </CardTitle>
              </div>
              <JobOfferButton
                applicationId={application.id}
                candidateName={application.candidate.fullName}
                department={application.opening.department}
                designation={application.opening.title}
              />
            </div>
          </CardHeader>
        </Card>
      ) : null}

      {/* Submitted Form Responses Snapshot */}
      <Card className="border-border shadow-xs">
        <CardHeader className="pb-3 border-b border-border/50">
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" /> Submitted Application Questionnaire
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

      {/* Complete Audit & Status History */}
      <Card className="border-border shadow-xs">
        <CardHeader className="pb-3 border-b border-border/50">
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="h-4 w-4 text-primary" /> Full Application Status & Decision Audit
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="relative border-l-2 border-border ml-3 space-y-6 pl-6 py-2">
            {application.statusHistory.map((h) => (
              <div key={h.id} className="relative group space-y-1">
                <div className="absolute -left-[31px] top-1 h-4 w-4 rounded-full border-2 border-primary bg-card" />
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-foreground">
                    {h.fromStatus} → {h.toStatus}
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    {new Date(h.createdAt).toLocaleString()}
                  </span>
                  {h.actor && (
                    <Badge variant="outline" className="text-[10px] py-0">
                      By: {h.actor.name}
                      {h.actor.email ? ` (${h.actor.email})` : ""}
                    </Badge>
                  )}
                </div>

                {h.internalNotes && (
                  <div className="p-2.5 rounded bg-muted text-xs text-foreground border border-border/40">
                    <span className="font-semibold text-warning flex items-center gap-1 text-[11px] mb-0.5">
                      <ShieldAlert className="h-3 w-3" /> Confidential Internal Note:
                    </span>
                    {h.internalNotes}
                  </div>
                )}

                {h.candidateMessage && (
                  <div className="text-xs text-muted-foreground italic pl-1">
                    Sent to candidate: &quot;{h.candidateMessage}&quot;
                  </div>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
