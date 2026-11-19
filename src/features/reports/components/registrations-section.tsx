import Link from "next/link";
import { ArrowRight, CheckCircle2, Clock, MailCheck, UserCheck, UserPlus, Users } from "lucide-react";
import type { AuthenticatedUser } from "@/lib/auth/guards";
import { ForbiddenError, ValidationError } from "@/lib/errors";
import { logger } from "@/lib/logging/logger";
import { EmptyState } from "@/components/feedback/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCard, StatGrid, StatGridSkeleton } from "@/components/ui/stat-card";
import { BUSINESS_TIME_ZONE } from "@/lib/time/business-time";
import {
  parseRegistrationFilters,
  registrationAnalyticsService,
  type RegistrationFilterInput,
} from "../services/registration-analytics-service";
import type { RegistrationAnalyticsReport, RegistrationFilters } from "../types";
import {
  REGISTRANT_DIRECTORY_PARAM_KEYS,
  REGISTRATION_PARAM_KEYS,
  RegistrationFiltersForm,
  registrantDirectoryHref,
} from "./registrations-filters";
import { RegistrationInterestBreakdown, RegistrationTrendChart } from "./registrations-charts";
import { reportToolbarClass } from "./report-toolbar";

type SearchParamValue = string | string[] | undefined;

function firstValue(value: SearchParamValue): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

/** Reads the registrations-tab parameters from the page search params (validated by the service). */
export function readRegistrationParams(searchParams: Record<string, SearchParamValue>): RegistrationFilterInput {
  return {
    startDate: firstValue(searchParams[REGISTRATION_PARAM_KEYS.startDate]),
    endDate: firstValue(searchParams[REGISTRATION_PARAM_KEYS.endDate]),
    interest: firstValue(searchParams[REGISTRATION_PARAM_KEYS.interest]) as RegistrationFilterInput["interest"],
  };
}

interface RegistrationsSectionProps {
  user: AuthenticatedUser;
  params: RegistrationFilterInput;
  reportsPath: string;
  /** The Registrations page of the same console (full registrant list and details). */
  registrationsPath: string;
  /** Dashboard parameters to keep when the registration filters change. */
  preservedParams: Record<string, string>;
}

function share(part: number, whole: number): string {
  return whole > 0 ? `${Math.round((part / whole) * 1000) / 10}%` : "—";
}

/** The tab strip already shows "Registrations", so the section heading is for screen readers. */
function SectionHeading() {
  return (
    <h2 id="registrations-heading" className="sr-only">
      Registrations
    </h2>
  );
}

/** Default filters for the form when the requested ones were invalid. */
function fallbackFilters(): RegistrationFilters {
  return parseRegistrationFilters({}).filters;
}

/** Link card to the Registrations page, or a note for viewers who may only see counts. */
function RegistrantListLink({
  canViewRegistrants,
  registrationsPath,
  filters,
}: {
  canViewRegistrants: boolean;
  registrationsPath: string;
  filters: RegistrationFilters;
}) {
  if (!canViewRegistrants) {
    return (
      <p className="rounded-xl border border-border bg-muted/30 p-4 text-xs text-muted-foreground">
        Names and e-mail addresses of the people who signed up are visible to administrators and HR only.
      </p>
    );
  }
  const keys = REGISTRANT_DIRECTORY_PARAM_KEYS;
  const periodHref = registrantDirectoryHref(registrationsPath, {
    [keys.startDate]: filters.startDate,
    [keys.endDate]: filters.endDate,
    [keys.interest]: filters.interest ?? "",
  });
  const linkClass =
    "inline-flex h-9 items-center justify-center gap-1.5 rounded-xl px-3 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
  return (
    <div className={`${reportToolbarClass} flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between`}>
      <div className="flex items-start gap-2.5">
        <Users className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
        <div>
          <p className="text-sm font-semibold text-foreground">Who signed up</p>
          <p className="text-[11px] text-muted-foreground">
            Names, e-mails and everything people entered at sign-up are on the Registrations page.
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Link href={periodHref} className={`${linkClass} border border-border bg-card text-foreground hover:bg-accent`}>
          People from this period
        </Link>
        <Link href={registrationsPath} className={`${linkClass} bg-primary text-primary-foreground hover:bg-primary/90`}>
          View all registrations
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      </div>
    </div>
  );
}

/**
 * "Registrations" tab of the reports page (canReports): sign-up figures and charts, every
 * figure a grouped query. The full registrant list with names, e-mails and details lives on
 * the Registrations page (ADMIN and HR with canReports); the figures link to it for them.
 */
export async function RegistrationsSection({
  user,
  params,
  reportsPath,
  registrationsPath,
  preservedParams,
}: RegistrationsSectionProps) {
  let report: RegistrationAnalyticsReport;
  try {
    report = await registrationAnalyticsService.getRegistrationAnalytics(user, {
      startDate: params.startDate,
      endDate: params.endDate,
      interest: params.interest,
    });
  } catch (error) {
    if (error instanceof ValidationError) {
      return (
        <section aria-labelledby="registrations-heading" className="space-y-4">
          <SectionHeading />
          <RegistrationFiltersForm
            reportsPath={reportsPath}
            filters={fallbackFilters()}
            preservedParams={preservedParams}
            timeZoneLabel={BUSINESS_TIME_ZONE}
          />
          <div role="alert" className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
            {error.message}
          </div>
        </section>
      );
    }
    if (error instanceof ForbiddenError) {
      return (
        <p role="alert" className="rounded-xl border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
          Registration analytics require the reports permission.
        </p>
      );
    }
    logger.error("Registration analytics could not be loaded", error);
    return (
      <section aria-labelledby="registrations-heading" className="space-y-4">
        <SectionHeading />
        <p role="alert" className="rounded-xl border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
          Registration figures are unavailable right now. Refresh the page to try again.
        </p>
      </section>
    );
  }

  const { totals } = report;
  // Each figure opens the matching people on the Registrations page (same window and interest).
  const keys = REGISTRANT_DIRECTORY_PARAM_KEYS;
  const listHref = (extra: Record<string, string> = {}) =>
    report.canViewRegistrants
      ? registrantDirectoryHref(registrationsPath, {
          [keys.startDate]: report.filters.startDate,
          [keys.endDate]: report.filters.endDate,
          [keys.interest]: report.filters.interest ?? "",
          ...extra,
        })
      : undefined;

  return (
    <section aria-labelledby="registrations-heading" className="space-y-6">
      <SectionHeading />

      <RegistrationFiltersForm
        reportsPath={reportsPath}
        filters={report.filters}
        preservedParams={preservedParams}
        timeZoneLabel={report.timeZone}
      />

      <StatGrid columns={6} label="Registration figures">
        <StatCard
          label="Registrations"
          value={totals.registrations}
          icon={UserPlus}
          tone="blue"
          hint={report.periodLabel}
          href={listHref()}
        />
        <StatCard
          label="Applied"
          value={totals.applied}
          icon={CheckCircle2}
          tone="emerald"
          hint={`${share(totals.applied, totals.registrations)} of sign-ups`}
          href={listHref({ [keys.applied]: "yes" })}
        />
        <StatCard
          label="Not applied yet"
          value={totals.notApplied}
          icon={Clock}
          tone="amber"
          hint={`${share(totals.notApplied, totals.registrations)} of sign-ups`}
          href={listHref({ [keys.applied]: "no" })}
        />
        <StatCard
          label="E-mail verified"
          value={totals.emailVerified}
          icon={MailCheck}
          tone="cyan"
          hint={`${totals.emailNotVerified} not verified`}
          href={listHref({ [keys.emailVerified]: "yes" })}
        />
        <StatCard
          label="Joined later"
          value={totals.joined}
          icon={UserCheck}
          tone="violet"
          hint="Became an intern or employee"
        />
        <StatCard
          label="All time"
          value={report.allTimeRegistrations}
          icon={Users}
          tone="slate"
          hint={report.filters.interest ? "For this interest" : "Every registration"}
        />
      </StatGrid>

      <RegistrantListLink
        canViewRegistrants={report.canViewRegistrants}
        registrationsPath={registrationsPath}
        filters={report.filters}
      />

      {totals.registrations === 0 ? (
        <EmptyState
          title="Nobody signed up in this period"
          description="No candidate account was created in this date range for these filters. Widen the date range or clear the filters."
          icon={<UserPlus className="h-6 w-6 text-primary" />}
        />
      ) : (
        <>
          <RegistrationInterestBreakdown rows={report.byInterest} totals={totals} />
          <RegistrationTrendChart
            granularity="day"
            points={report.daily}
            interest={report.filters.interest}
            subtitle={report.periodLabel}
          />
        </>
      )}

      <RegistrationTrendChart
        granularity="month"
        points={report.monthly}
        interest={report.filters.interest}
        subtitle="Last 12 months"
      />

    </section>
  );
}

/** Suspense fallback of the tab. */
export function RegistrationsSkeleton() {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className="space-y-6">
      <span className="sr-only">Loading registrations</span>
      <Skeleton className="h-28 w-full rounded-2xl sm:h-24" />
      <StatGridSkeleton count={6} columns={6} label="Loading registration figures" />
      <Skeleton className="h-16 w-full rounded-2xl" />
      <Skeleton className="h-64 w-full rounded-2xl" />
      <Skeleton className="h-56 w-full rounded-2xl" />
    </div>
  );
}
