import Link from "next/link";
import { AlertCircle, ArrowRight, UserPlus } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { UNAVAILABLE, type RegistrationOverview } from "@/features/analytics/services/admin-overview-service";

interface RegistrationsSummaryCardProps {
  summary: RegistrationOverview | typeof UNAVAILABLE;
  /** The registrations tab of the reports page. */
  href: string;
}

function Figure({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border/70 bg-muted/20 p-3">
      <dt className="text-[11px] font-semibold text-muted-foreground">{label}</dt>
      <dd className="mt-1 font-mono text-lg font-bold tabular-nums text-foreground">{value}</dd>
    </div>
  );
}

/**
 * Compact sign-up summary on the administrator overview: total candidate accounts, what
 * they signed up for, how many have not applied yet and how many are new this week.
 */
export function RegistrationsSummaryCard({ summary, href }: RegistrationsSummaryCardProps) {
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
        <Link
          href={href}
          className="inline-flex items-center gap-1 rounded-md text-xs font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          View registrations
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
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
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
          <div className="shrink-0 lg:w-48">
            <p className="font-mono text-3xl font-extrabold tracking-tight text-foreground">{summary.total}</p>
            <p className="text-[11px] text-muted-foreground">candidate accounts</p>
            <p className="mt-1 text-xs font-semibold text-foreground">
              {summary.newLastSevenDays} new in the last 7 days
            </p>
          </div>
          <dl className="grid flex-1 grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <Figure label="Internship" value={summary.internship} />
            <Figure label="Job" value={summary.job} />
            <Figure label="Both" value={summary.both} />
            <Figure label="Not chosen" value={summary.notChosen} />
            <Figure label="Not applied yet" value={summary.notApplied} />
          </dl>
        </div>
      )}
    </section>
  );
}

/** Suspense fallback with the card's footprint. */
export function RegistrationsSummarySkeleton() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className="rounded-2xl border border-border/80 bg-card p-5"
    >
      <span className="sr-only">Loading registrations</span>
      <div className="mb-4 flex items-center justify-between border-b border-border/60 pb-3" aria-hidden="true">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-3 w-28" />
      </div>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center" aria-hidden="true">
        <div className="space-y-2 lg:w-48">
          <Skeleton className="h-8 w-20" />
          <Skeleton className="h-3 w-32" />
        </div>
        <div className="grid flex-1 grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-16 rounded-xl" />
          ))}
        </div>
      </div>
    </div>
  );
}
