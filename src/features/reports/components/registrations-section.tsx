import { Suspense, type ReactNode } from "react";
import { CheckCircle2, Clock, MailCheck, UserCheck, UserPlus, Users } from "lucide-react";
import type { AuthenticatedUser } from "@/lib/auth/guards";
import { ForbiddenError, ValidationError } from "@/lib/errors";
import { logger } from "@/lib/logging/logger";
import { EmptyState } from "@/components/feedback/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { BUSINESS_TIME_ZONE } from "@/lib/time/business-time";
import {
  parseRegistrationFilters,
  registrationAnalyticsService,
  type RegistrantListFilterInput,
} from "../services/registration-analytics-service";
import type { RegistrationAnalyticsReport, RegistrationFilters } from "../types";
import { REGISTRATION_PARAM_KEYS, RegistrationFiltersForm } from "./registrations-filters";
import { RegistrationInterestBreakdown, RegistrationTrendChart } from "./registrations-charts";
import { RegistrantListSection, RegistrantListSkeleton } from "./registrations-list";

type SearchParamValue = string | string[] | undefined;

function firstValue(value: SearchParamValue): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

/** Reads the registrations-tab parameters from the page search params (validated by the service). */
export function readRegistrationParams(searchParams: Record<string, SearchParamValue>): RegistrantListFilterInput {
  return {
    startDate: firstValue(searchParams[REGISTRATION_PARAM_KEYS.startDate]),
    endDate: firstValue(searchParams[REGISTRATION_PARAM_KEYS.endDate]),
    interest: firstValue(searchParams[REGISTRATION_PARAM_KEYS.interest]) as RegistrantListFilterInput["interest"],
    emailVerified: firstValue(searchParams[REGISTRATION_PARAM_KEYS.emailVerified]) as RegistrantListFilterInput["emailVerified"],
    applied: firstValue(searchParams[REGISTRATION_PARAM_KEYS.applied]) as RegistrantListFilterInput["applied"],
    search: firstValue(searchParams[REGISTRATION_PARAM_KEYS.search]),
    page: firstValue(searchParams[REGISTRATION_PARAM_KEYS.page]),
  };
}

interface RegistrationsSectionProps {
  user: AuthenticatedUser;
  params: RegistrantListFilterInput;
  reportsPath: string;
  /** Dashboard parameters to keep when the registration filters change. */
  preservedParams: Record<string, string>;
}

function StatTile({ label, value, detail, icon }: { label: string; value: string; detail?: string; icon: ReactNode }) {
  return (
    <div className="flex flex-col justify-between rounded-2xl border border-border/80 bg-card p-4 shadow-2xs">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold text-muted-foreground">{label}</span>
        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 text-primary" aria-hidden="true">
          {icon}
        </span>
      </div>
      <span className="text-2xl font-extrabold text-foreground">{value}</span>
      {detail && <span className="mt-1 text-[11px] text-muted-foreground">{detail}</span>}
    </div>
  );
}

function share(part: number, whole: number): string {
  return whole > 0 ? `${Math.round((part / whole) * 1000) / 10}%` : "—";
}

function SectionHeading({ periodLabel }: { periodLabel?: string }) {
  return (
    <div>
      <h2 id="registrations-heading" className="text-base font-bold text-foreground">
        Registrations
      </h2>
      <p className="text-xs text-muted-foreground">
        Candidate accounts created{periodLabel ? `: ${periodLabel}` : ""}. Staff accounts are never counted; applications
        are reported separately in the hiring funnel.
      </p>
    </div>
  );
}

/** Default filters for the form when the requested ones were invalid. */
function fallbackFilters(): RegistrationFilters {
  return parseRegistrationFilters({}).filters;
}

/**
 * "Registrations" tab of the reports page (canReports). The figures and the registrant
 * list (names and e-mails, ADMIN and HR only) stream in sibling Suspense boundaries, so
 * their queries run in parallel; every figure is a grouped query.
 */
export async function RegistrationsSection({ user, params, reportsPath, preservedParams }: RegistrationsSectionProps) {
  const canViewRegistrants = await registrationAnalyticsService.canViewRegistrants(user);
  return (
    <div className="space-y-6">
      <Suspense fallback={<RegistrationFiguresSkeleton />}>
        <RegistrationFigures user={user} params={params} reportsPath={reportsPath} preservedParams={preservedParams} />
      </Suspense>
      {canViewRegistrants ? (
        <Suspense fallback={<RegistrantListSkeleton />}>
          <RegistrantListSection
            user={user}
            params={params}
            reportsPath={reportsPath}
            preservedParams={preservedParams}
          />
        </Suspense>
      ) : (
        <p className="rounded-xl border border-border bg-muted/30 p-4 text-xs text-muted-foreground">
          Names and e-mail addresses of the people who signed up are visible to administrators and HR only.
        </p>
      )}
    </div>
  );
}

async function RegistrationFigures({ user, params, reportsPath, preservedParams }: RegistrationsSectionProps) {
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

  return (
    <section aria-labelledby="registrations-heading" className="space-y-6">
      <SectionHeading periodLabel={report.periodLabel} />

      <RegistrationFiltersForm
        reportsPath={reportsPath}
        filters={report.filters}
        preservedParams={preservedParams}
        timeZoneLabel={report.timeZone}
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatTile label="Registrations" value={String(totals.registrations)} icon={<UserPlus className="h-4 w-4" />} />
        <StatTile
          label="Applied"
          value={String(totals.applied)}
          detail={`${share(totals.applied, totals.registrations)} of sign-ups`}
          icon={<CheckCircle2 className="h-4 w-4" />}
        />
        <StatTile
          label="Not applied yet"
          value={String(totals.notApplied)}
          detail={`${share(totals.notApplied, totals.registrations)} of sign-ups`}
          icon={<Clock className="h-4 w-4" />}
        />
        <StatTile
          label="E-mail verified"
          value={String(totals.emailVerified)}
          detail={`${totals.emailNotVerified} not verified`}
          icon={<MailCheck className="h-4 w-4" />}
        />
        <StatTile
          label="Joined later"
          value={String(totals.joined)}
          detail="Became an intern or employee"
          icon={<UserCheck className="h-4 w-4" />}
        />
        <StatTile
          label="All time"
          value={String(report.allTimeRegistrations)}
          detail={report.filters.interest ? "For this interest" : "Every registration"}
          icon={<Users className="h-4 w-4" />}
        />
      </div>

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

/** Suspense fallback of the tab (the list has its own fallback once the tab renders). */
export function RegistrationsSkeleton() {
  return <RegistrationFiguresSkeleton />;
}

function RegistrationFiguresSkeleton() {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className="space-y-6">
      <span className="sr-only">Loading registrations</span>
      <div className="space-y-2" aria-hidden="true">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-3 w-72 max-w-full" />
      </div>
      <Skeleton className="h-24 w-full rounded-2xl" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6" aria-hidden="true">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-24 rounded-2xl" />
        ))}
      </div>
      <Skeleton className="h-64 w-full rounded-2xl" />
      <Skeleton className="h-56 w-full rounded-2xl" />
    </div>
  );
}
