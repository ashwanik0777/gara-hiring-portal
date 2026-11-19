import Link from "next/link";
import { AlertCircle, ArrowRight, Briefcase, Clock, GraduationCap, HelpCircle, Layers, UserPlus, Users } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCard, StatGrid, StatGridSkeleton } from "@/components/ui/stat-card";
import { UNAVAILABLE, type RegistrationOverview } from "@/features/analytics/services/admin-overview-service";
import { REGISTRANT_DIRECTORY_PARAM_KEYS, registrantDirectoryHref } from "./registrations-filters";

interface RegistrationsSummaryCardProps {
  summary: RegistrationOverview | typeof UNAVAILABLE;
  /** The registrations tab of the reports page (analytics). */
  href: string;
  /** The Registrations page (who signed up); every figure opens the matching people there. */
  listHref?: string;
}

/**
 * Compact sign-up summary on the administrator overview: total candidate accounts, what
 * they signed up for, how many have not applied yet and how many are new this week.
 */
export function RegistrationsSummaryCard({ summary, href, listHref = "/admin/registrations" }: RegistrationsSummaryCardProps) {
  const keys = REGISTRANT_DIRECTORY_PARAM_KEYS;
  const filtered = (params: Record<string, string>) => registrantDirectoryHref(listHref, params);

  return (
    <section
      aria-labelledby="registrations-summary-heading"
      className="rounded-2xl border border-border/80 bg-card p-5 shadow-2xs"
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-3">
        <div className="flex items-center gap-2">
          <UserPlus className="h-4 w-4 text-primary" aria-hidden="true" />
          <h2 id="registrations-summary-heading" className="text-sm font-bold text-foreground">
            Registrations
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href={href}
            className="rounded-md text-xs font-semibold text-muted-foreground hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Analytics
          </Link>
          <Link
            href={listHref}
            className="inline-flex items-center gap-1 rounded-md text-xs font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            View registrations
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </div>
      </div>

      {summary === UNAVAILABLE ? (
        <p role="alert" className="flex items-start gap-2 py-4 text-xs text-muted-foreground">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
          The registration figures are unavailable right now. Refresh the page to try again.
        </p>
      ) : summary.total === 0 ? (
        <p className="py-4 text-xs text-muted-foreground">
          Nobody has created a candidate account yet. Sign-ups appear here as soon as people register.
        </p>
      ) : (
        <StatGrid columns={6} label="Registrations summary">
          <StatCard
            label="Candidate accounts"
            value={summary.total}
            icon={Users}
            tone="blue"
            size="compact"
            hint={`${summary.newLastSevenDays} new in the last 7 days`}
            href={listHref}
          />
          <StatCard
            label="Internship"
            value={summary.internship}
            icon={GraduationCap}
            tone="violet"
            size="compact"
            href={filtered({ [keys.interest]: "INTERNSHIP" })}
          />
          <StatCard
            label="Job"
            value={summary.job}
            icon={Briefcase}
            tone="indigo"
            size="compact"
            href={filtered({ [keys.interest]: "JOB" })}
          />
          <StatCard
            label="Both"
            value={summary.both}
            icon={Layers}
            tone="cyan"
            size="compact"
            href={filtered({ [keys.interest]: "BOTH" })}
          />
          <StatCard
            label="Not chosen"
            value={summary.notChosen}
            icon={HelpCircle}
            tone="slate"
            size="compact"
            href={filtered({ [keys.interest]: "NOT_CHOSEN" })}
          />
          <StatCard
            label="Not applied yet"
            value={summary.notApplied}
            icon={Clock}
            tone="amber"
            size="compact"
            href={filtered({ [keys.applied]: "no" })}
          />
        </StatGrid>
      )}
    </section>
  );
}

/** Suspense fallback with the card's footprint. */
export function RegistrationsSummarySkeleton() {
  return (
    <div className="rounded-2xl border border-border/80 bg-card p-5">
      <div className="mb-4 flex items-center justify-between border-b border-border/60 pb-3" aria-hidden="true">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-3 w-40" />
      </div>
      <StatGridSkeleton count={6} columns={6} size="compact" label="Loading registrations" />
    </div>
  );
}
