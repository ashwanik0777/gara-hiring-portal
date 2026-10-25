import React from "react";
import Link from "next/link";
import {
  ArrowRight,
  Award,
  Briefcase,
  Building2,
  CalendarClock,
  ExternalLink,
  FileText,
  Handshake,
  MapPin,
  Route,
  UserRound,
  Video,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { OpeningType, type CareerInterest } from "@/types/enums";
import type { LifecycleEnrollmentSummary } from "../types";
import {
  buildJourneyProgress,
  isClosedApplicationStatus,
  journeyRank,
  type JourneyProgress,
} from "../services/journey-progress";
import {
  getOffersAwaitingDecision,
  getOwnApplicationHistory,
  getOwnCheckpointProgress,
  getProfileCompleteness,
  getRecommendedOpenings,
  getUpcomingInterviews,
  listOwnApplications,
  type DashboardApplication,
} from "../services/self-service-dashboard-service";
import { JourneyStepper } from "./journey-stepper";
import { LocalDateTime } from "./local-date-time";
import {
  ApplicationStatusBadge,
  applicationStatusSummary,
  EmptyHint,
  EVALUATION_STATUS_LABELS,
  formatCalendarDate,
  linkButtonClass,
  ProgressBar,
  SectionCard,
  textLinkClass,
} from "./self-service-ui";

/*
 * Async sections of the candidate dashboard. Each receives the signed-in user's id from
 * the page guard and streams inside its own Suspense boundary.
 */

const OPENING_TYPE_LABELS: Record<string, string> = {
  [OpeningType.FULL_TIME]: "Full time",
  [OpeningType.INTERNSHIP]: "Internship",
};

const WORKPLACE_LABELS: Record<string, string> = {
  REMOTE: "Remote",
  HYBRID: "Hybrid",
  ON_SITE: "On site",
};

/** Picks the most advanced open application; falls back to the latest closed one. */
export function pickFeaturedApplication(applications: DashboardApplication[]): DashboardApplication | null {
  if (applications.length === 0) return null;
  return [...applications].sort((a, b) => {
    const rank = journeyRank(b.status) - journeyRank(a.status);
    return rank !== 0 ? rank : new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  })[0];
}

const OUTCOME_NOTES: Record<JourneyProgress["outcome"], string | null> = {
  in_progress: null,
  joined: null,
  rejected: "This application was not selected. The stage where it stopped is marked.",
  withdrawn: "This application was withdrawn. The stage where it stopped is marked.",
  archived: "This application was archived. The stage where it stopped is marked.",
};

export async function JourneySection({ userId }: { userId: string }) {
  const applications = await listOwnApplications(userId);
  const featured = pickFeaturedApplication(applications);

  if (!featured) {
    return (
      <SectionCard id="journey" title="Your journey" icon={<Route className="h-4 w-4" />}>
        <EmptyHint
          icon={<Route className="h-6 w-6" />}
          title="Your journey starts with an application"
          description="Apply to an opening and every stage, from screening to joining, will be tracked here."
          action={
            <Link href="/careers" className={linkButtonClass("primary")}>
              <Briefcase className="h-3.5 w-3.5" aria-hidden="true" /> Browse openings
            </Link>
          }
        />
      </SectionCard>
    );
  }

  const history = await getOwnApplicationHistory(userId, featured.id);
  const progress = buildJourneyProgress({
    status: featured.status,
    openingType: featured.opening.type,
    createdAt: featured.createdAt,
    history,
  });
  const outcomeNote = OUTCOME_NOTES[progress.outcome];
  const activeCount = applications.filter((a) => !isClosedApplicationStatus(a.status)).length;

  return (
    <SectionCard
      id="journey"
      title="Your journey"
      icon={<Route className="h-4 w-4" />}
      description={
        activeCount > 1
          ? `Showing your most advanced application (${activeCount} in progress).`
          : isClosedApplicationStatus(featured.status)
            ? "You have no application in progress. Showing your latest application."
            : "Track where your application stands."
      }
      action={
        <Link href={`/candidate/applications/${featured.id}`} className={linkButtonClass("outline")}>
          View details <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      }
    >
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="rounded-md bg-primary/10 px-2 py-0.5 font-mono text-xs font-bold text-primary">
          {featured.referenceCode}
        </span>
        <ApplicationStatusBadge status={featured.status} />
        <span className="text-sm font-semibold text-foreground">{featured.opening.title}</span>
      </div>
      <JourneyStepper progress={progress} label={`Journey for ${featured.opening.title}`} />
      <p
        className={
          outcomeNote
            ? "mt-4 rounded-xl border border-border/60 bg-muted/40 p-3 text-xs text-muted-foreground"
            : "mt-4 text-xs text-muted-foreground"
        }
      >
        {outcomeNote ?? applicationStatusSummary(featured.status)}
      </p>
    </SectionCard>
  );
}

export async function ActiveApplicationsSection({ userId }: { userId: string }) {
  const applications = await listOwnApplications(userId);
  const active = applications.filter((a) => !isClosedApplicationStatus(a.status));
  const closedCount = applications.length - active.length;

  return (
    <SectionCard
      id="active-applications"
      title="Active applications"
      icon={<FileText className="h-4 w-4" />}
      description={
        closedCount > 0
          ? `${active.length} in progress · ${closedCount} closed`
          : `${active.length} in progress`
      }
      action={
        applications.length > 0 ? (
          <Link href="/candidate/applications" className={linkButtonClass("ghost")}>
            All applications <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        ) : undefined
      }
    >
      {active.length === 0 ? (
        <EmptyHint
          icon={<FileText className="h-6 w-6" />}
          title={applications.length === 0 ? "No applications yet" : "No applications in progress"}
          description={
            applications.length === 0
              ? "When you apply to an opening, it appears here with its current stage."
              : "Your earlier applications are closed. Recommended openings are listed below."
          }
        />
      ) : (
        <ul className="divide-y divide-border/60">
          {active.map((app) => (
            <li key={app.id} className="py-3 first:pt-0 last:pb-0">
              <Link
                href={`/candidate/applications/${app.id}`}
                className="group flex flex-col gap-2 rounded-xl p-2 -m-2 transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-[11px] font-bold text-primary">{app.referenceCode}</span>
                    <ApplicationStatusBadge status={app.status} />
                  </div>
                  <p className="truncate text-sm font-semibold text-foreground group-hover:text-primary">
                    {app.opening.title}
                  </p>
                  <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <Building2 className="h-3 w-3" aria-hidden="true" /> {app.opening.department}
                    </span>
                    <span>
                      Applied <LocalDateTime iso={app.createdAt} mode="date" />
                    </span>
                  </p>
                </div>
                <span className="inline-flex items-center gap-1 text-xs font-medium text-primary">
                  Track <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

export async function UpcomingInterviewsSection({ userId }: { userId: string }) {
  const interviews = await getUpcomingInterviews(userId);

  return (
    <SectionCard id="upcoming-interviews" title="Upcoming interviews" icon={<CalendarClock className="h-4 w-4" />}>
      {interviews.length === 0 ? (
        <EmptyHint
          icon={<CalendarClock className="h-6 w-6" />}
          title="No interviews scheduled"
          description="Interviews scheduled by the hiring team will appear here with date, time and joining details."
        />
      ) : (
        <ul className="space-y-3">
          {interviews.map((interview) => (
            <li key={interview.id} className="rounded-xl border border-border/60 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-foreground">
                  Round {interview.roundNumber}: {interview.roundName}
                </p>
                {interview.status === "RESCHEDULED" && <Badge variant="warning">Rescheduled</Badge>}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                <LocalDateTime iso={interview.scheduledAt} /> · {interview.durationMinutes} min
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {interview.application.openingTitle} ·{" "}
                <Link href={`/candidate/applications/${interview.application.id}`} className={textLinkClass}>
                  {interview.application.referenceCode}
                </Link>
              </p>
              {interview.meetingLink ? (
                <a
                  href={interview.meetingLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={linkButtonClass("outline", "sm", "mt-3")}
                >
                  <Video className="h-3.5 w-3.5" aria-hidden="true" /> Join meeting
                  <ExternalLink className="h-3 w-3" aria-hidden="true" />
                  <span className="sr-only">(opens in a new tab)</span>
                </a>
              ) : (
                <p className="mt-2 text-[11px] text-muted-foreground">
                  Joining details will be shared by the hiring team.
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

export async function PendingOffersSection({ userId }: { userId: string }) {
  const offers = await getOffersAwaitingDecision(userId);

  return (
    <SectionCard id="pending-offers" title="Offers awaiting your decision" icon={<Handshake className="h-4 w-4" />}>
      {offers.length === 0 ? (
        <EmptyHint
          icon={<Handshake className="h-6 w-6" />}
          title="No offers waiting"
          description="If GARA Innovation extends an offer, you can review and respond to it here."
        />
      ) : (
        <ul className="space-y-3">
          {offers.map((offer) => (
            <li key={offer.id} className="rounded-xl border border-primary/30 bg-primary/5 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-foreground">{offer.designation}</p>
                <Badge variant="warning">Action required</Badge>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {offer.department} · Target joining {formatCalendarDate(offer.expectedJoiningDate)}
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {offer.application.openingTitle} · {offer.application.referenceCode}
              </p>
              <Link
                href={`/candidate/applications/${offer.application.id}`}
                className={linkButtonClass("primary", "sm", "mt-3")}
              >
                Review offer <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

export async function EvaluationSummarySection({
  userId,
  enrollment,
}: {
  userId: string;
  enrollment: LifecycleEnrollmentSummary;
}) {
  const progress = await getOwnCheckpointProgress(userId, enrollment.id);

  return (
    <SectionCard
      id="evaluation"
      title="Supervised internship evaluation"
      icon={<Award className="h-4 w-4" />}
      description={enrollment.openingTitle}
      className="border-primary/30"
      action={
        <Link href="/intern/dashboard" className={linkButtonClass("primary")}>
          Open evaluation workspace <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      }
    >
      <dl className="grid grid-cols-1 gap-3 text-xs sm:grid-cols-3">
        <div className="rounded-xl border border-border/60 bg-muted/30 p-3">
          <dt className="text-muted-foreground">Status</dt>
          <dd className="mt-0.5 font-semibold text-foreground">{EVALUATION_STATUS_LABELS[enrollment.status]}</dd>
        </div>
        <div className="rounded-xl border border-border/60 bg-muted/30 p-3">
          <dt className="text-muted-foreground">Start date</dt>
          <dd className="mt-0.5 font-semibold text-foreground">
            {enrollment.startDate ? formatCalendarDate(enrollment.startDate) : "Not started yet"}
          </dd>
        </div>
        <div className="rounded-xl border border-border/60 bg-muted/30 p-3">
          <dt className="text-muted-foreground">End date</dt>
          <dd className="mt-0.5 font-semibold text-foreground">
            {enrollment.endDate ? formatCalendarDate(enrollment.endDate) : "Set when the evaluation starts"}
          </dd>
        </div>
      </dl>
      {progress.total > 0 && (
        <div className="mt-4 space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Daily checkpoints submitted</span>
            <span className="font-semibold text-foreground">
              {progress.submitted} of {progress.total}
            </span>
          </div>
          <ProgressBar value={progress.submitted} max={progress.total} label="Daily checkpoints submitted" />
        </div>
      )}
    </SectionCard>
  );
}

export async function RecommendedOpeningsSection({
  userId,
  interest,
}: {
  userId: string;
  interest: CareerInterest | null;
}) {
  const openings = await getRecommendedOpenings(userId, interest);

  return (
    <SectionCard
      id="recommended-openings"
      title="Recommended openings"
      icon={<Briefcase className="h-4 w-4" />}
      description={
        interest === "JOB"
          ? "Full-time roles you have not applied to yet."
          : interest === "INTERNSHIP"
            ? "Internships you have not applied to yet."
            : "Jobs and internships you have not applied to yet."
      }
      action={
        <Link href="/careers" className={linkButtonClass("ghost")}>
          All openings <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      }
    >
      {openings.length === 0 ? (
        <EmptyHint
          icon={<Briefcase className="h-6 w-6" />}
          title="No new openings right now"
          description="There are no published openings matching your preference that you have not applied to. Check back soon."
        />
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {openings.map((opening) => (
            <li key={opening.id}>
              <Link
                href={`/careers/${opening.slug}`}
                className="group flex h-full flex-col justify-between gap-3 rounded-xl border border-border/70 bg-background p-4 transition-colors hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div className="space-y-1.5">
                  <Badge variant="outline" className="text-[10px]">
                    {OPENING_TYPE_LABELS[opening.type] ?? opening.type}
                  </Badge>
                  <p className="text-sm font-semibold text-foreground group-hover:text-primary">{opening.title}</p>
                  <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <Building2 className="h-3 w-3" aria-hidden="true" /> {opening.department}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="h-3 w-3" aria-hidden="true" /> {opening.location}
                      {WORKPLACE_LABELS[opening.workplaceType] ? ` · ${WORKPLACE_LABELS[opening.workplaceType]}` : ""}
                    </span>
                  </p>
                </div>
                <span className="inline-flex items-center gap-1 text-xs font-medium text-primary">
                  View opening <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

export async function ProfileCompletenessSection({ userId }: { userId: string }) {
  const completeness = await getProfileCompleteness(userId);
  const complete = completeness.missing.length === 0;

  return (
    <SectionCard id="profile-completeness" title="Your profile" icon={<UserRound className="h-4 w-4" />}>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Profile details added</span>
          <span className="font-semibold text-foreground">
            {completeness.completed} of {completeness.total}
          </span>
        </div>
        <ProgressBar value={completeness.completed} max={completeness.total} label="Profile details added" />
      </div>
      {complete ? (
        <p className="mt-3 text-xs text-muted-foreground">All profile details are filled in.</p>
      ) : (
        <div className="mt-3 space-y-2">
          <p className="text-xs text-muted-foreground">Not added yet:</p>
          <ul className="flex flex-wrap gap-1.5">
            {completeness.missing.map((label) => (
              <li key={label} className="rounded-full border border-border/70 px-2 py-0.5 text-[11px] text-muted-foreground">
                {label}
              </li>
            ))}
          </ul>
        </div>
      )}
      <Link href="/candidate/profile" className={linkButtonClass("outline", "sm", "mt-4 w-full")}>
        {complete ? "View profile" : "Complete profile"} <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
      </Link>
    </SectionCard>
  );
}
