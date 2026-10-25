import React from "react";
import { History } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { ApplicationStatus, type EvaluationStatus } from "@/types/enums";

/*
 * Small presentational building blocks shared by the self-service dashboards. Server
 * safe (no hooks); every value they show is passed in by the page.
 */

type LinkButtonVariant = "primary" | "outline" | "ghost";

/**
 * Button styling for links, so navigation stays a single focusable <a> (a <button>
 * nested inside a link is invalid and announced twice by screen readers).
 */
export function linkButtonClass(
  variant: LinkButtonVariant = "outline",
  size: "sm" | "md" = "sm",
  className?: string
): string {
  return cn(
    "inline-flex items-center justify-center gap-1.5 rounded-xl font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
    size === "sm" ? "h-8 px-3 text-xs" : "h-10 px-4 text-sm",
    variant === "primary" && "bg-primary text-primary-foreground shadow-xs hover:bg-primary-hover",
    variant === "outline" && "border border-border bg-card text-foreground hover:bg-accent hover:text-accent-foreground",
    variant === "ghost" && "text-foreground hover:bg-accent hover:text-accent-foreground",
    className
  );
}

/** Inline text link with a visible focus ring. */
export const textLinkClass =
  "font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-sm";

interface SectionCardProps {
  /** Unique id; the heading id is derived from it. */
  id: string;
  title: string;
  description?: React.ReactNode;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  headingLevel?: "h2" | "h3";
}

export function SectionCard({
  id,
  title,
  description,
  icon,
  action,
  children,
  className,
  headingLevel = "h2",
}: SectionCardProps) {
  const Heading = headingLevel;
  const headingId = `${id}-heading`;
  return (
    <section
      id={id}
      aria-labelledby={headingId}
      className={cn("scroll-mt-6 rounded-2xl border border-border/70 bg-card p-4 shadow-2xs sm:p-5", className)}
    >
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2.5">
          {icon && (
            <span
              aria-hidden="true"
              className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"
            >
              {icon}
            </span>
          )}
          <div className="min-w-0">
            <Heading id={headingId} className="text-sm font-semibold text-foreground sm:text-base">
              {title}
            </Heading>
            {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
          </div>
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {children}
    </section>
  );
}

/** Compact, honest empty state for a dashboard section. */
export function EmptyHint({
  icon,
  title,
  description,
  action,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border px-4 py-6 text-center">
      {icon && (
        <span aria-hidden="true" className="text-muted-foreground/70">
          {icon}
        </span>
      )}
      <p className="text-sm font-medium text-foreground">{title}</p>
      {description && <p className="max-w-sm text-xs text-muted-foreground">{description}</p>}
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}

/** Accessible progress bar for recorded counts (never for estimates). */
export function ProgressBar({ value, max, label }: { value: number; max: number; label: string }) {
  const percent = max > 0 ? Math.round((Math.min(value, max) / max) * 100) : 0;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={Math.min(value, max)}
      aria-valuetext={`${value} of ${max}`}
      className="h-2 w-full overflow-hidden rounded-full bg-muted"
    >
      <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${percent}%` }} />
    </div>
  );
}

/** Formats a calendar-day value (stored as a UTC date) without shifting it by the server's time zone. */
export function formatCalendarDate(iso: string | Date | null | undefined): string {
  if (!iso) return "Not set";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Not set";
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(date);
}

/**
 * Note shown on the read-only "My Journey" pages after joining. The date is the recorded
 * joining date (or, without an employment record, when the joining role was granted).
 */
export function JoinedHistoryNote({ joinedAt }: { joinedAt: string | null }) {
  return (
    <p
      role="note"
      className="flex items-start gap-2 rounded-xl border border-emerald-500/30 bg-emerald-50 p-3 text-xs text-emerald-950 dark:bg-emerald-950/40 dark:text-emerald-50"
    >
      <History className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span>
        {joinedAt
          ? `You joined GARA Innovation on ${formatCalendarDate(joinedAt)}; this is your application history.`
          : "You are part of GARA Innovation; this is your application history."}
      </span>
    </p>
  );
}

/** Wraps a streaming section placeholder in a polite status region with a label. */
export function SectionSkeleton({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div role="status" aria-busy="true" className={className}>
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}

/** Placeholder matching the journey stepper card. */
export function JourneySkeleton() {
  return (
    <SectionSkeleton label="Loading your journey">
      <div className="space-y-5 rounded-2xl border border-border/70 bg-card p-5">
        <div className="space-y-2">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-3 w-64 max-w-full" />
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="flex items-center gap-3 md:flex-col">
              <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
              <Skeleton className="h-3 w-20" />
            </div>
          ))}
        </div>
      </div>
    </SectionSkeleton>
  );
}

export const EVALUATION_STATUS_LABELS: Record<EvaluationStatus, string> = {
  PENDING_TRIGGER: "Waiting to start",
  IN_PROGRESS: "In progress",
  UNDER_REVIEW: "Under review",
  PASSED: "Passed",
  FAILED: "Not passed",
  EXTENDED: "Extended",
};

const APPLICATION_STATUS_BADGES: Record<
  ApplicationStatus,
  { label: string; variant: "default" | "secondary" | "success" | "warning" | "destructive" | "outline" }
> = {
  DRAFT: { label: "Draft", variant: "outline" },
  SUBMITTED: { label: "Submitted", variant: "default" },
  SCREENING: { label: "Under Screening", variant: "warning" },
  SHORTLISTED: { label: "Shortlisted", variant: "warning" },
  INTERVIEW_SCHEDULED: { label: "Interview Scheduled", variant: "warning" },
  INTERVIEWED: { label: "Interview Completed", variant: "secondary" },
  EVALUATION_SELECTED: { label: "Evaluation Selected", variant: "success" },
  OFFERED: { label: "Offer Extended", variant: "success" },
  OFFER_ACCEPTED: { label: "Offer Accepted", variant: "success" },
  HIRED: { label: "Joined", variant: "success" },
  REJECTED: { label: "Not Selected", variant: "destructive" },
  WITHDRAWN: { label: "Withdrawn", variant: "outline" },
  ARCHIVED: { label: "Archived", variant: "secondary" },
};

export function ApplicationStatusBadge({ status }: { status: string }) {
  const config = APPLICATION_STATUS_BADGES[status as ApplicationStatus];
  if (!config) {
    return <Badge variant="outline">{status.replace(/_/g, " ")}</Badge>;
  }
  return <Badge variant={config.variant}>{config.label}</Badge>;
}

/**
 * One-line, factual explanation of an application status for the candidate.
 * `readOnly` drops prompts to act (joined users only review their history).
 */
export function applicationStatusSummary(status: string, readOnly = false): string {
  switch (status) {
    case ApplicationStatus.SUBMITTED:
      return "Your application was received and is waiting for screening.";
    case ApplicationStatus.SCREENING:
      return "The hiring team is reviewing your application.";
    case ApplicationStatus.SHORTLISTED:
      return "You have been shortlisted for the next stage.";
    case ApplicationStatus.INTERVIEW_SCHEDULED:
      return readOnly
        ? "An interview was scheduled for this application."
        : "An interview is scheduled. Check the interview details and your email.";
    case ApplicationStatus.INTERVIEWED:
      return "The interview is complete and the outcome is being reviewed.";
    case ApplicationStatus.EVALUATION_SELECTED:
      return "Selected for the supervised 7-working-day internship evaluation.";
    case ApplicationStatus.OFFERED:
      return readOnly
        ? "An offer was extended for this application."
        : "An offer has been extended and is waiting for your decision.";
    case ApplicationStatus.OFFER_ACCEPTED:
      return readOnly
        ? "You accepted the offer for this application."
        : "You accepted the offer. HR will mark you as joined.";
    case ApplicationStatus.HIRED:
      return "You joined GARA Innovation through this application.";
    case ApplicationStatus.REJECTED:
      return "This application was not selected.";
    case ApplicationStatus.WITHDRAWN:
      return "This application was withdrawn.";
    case ApplicationStatus.ARCHIVED:
      return "This application was archived.";
    default:
      return "Application on record.";
  }
}
