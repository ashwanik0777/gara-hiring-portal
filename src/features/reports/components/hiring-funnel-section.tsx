import { Filter, Users, CheckCircle2, Clock, Percent } from "lucide-react";
import type { AuthenticatedUser } from "@/lib/auth/guards";
import { ForbiddenError, ValidationError } from "@/lib/errors";
import { EmptyState } from "@/components/feedback/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCard, StatGrid, StatGridSkeleton } from "@/components/ui/stat-card";
import { FUNNEL_TIME_ZONE_LABEL, hiringFunnelService } from "../services/hiring-funnel-service";
import type { HiringFunnelFilterInput } from "../schemas";
import type { HiringFunnelFilters, HiringFunnelReport } from "../types";
import { FUNNEL_PARAM_KEYS, HiringFunnelFiltersForm } from "./hiring-funnel-filters";
import {
  FunnelStageChart,
  SourceBreakdownTable,
  StageDurationChart,
  TimeToHireCard,
  TopOpeningsTable,
} from "./hiring-funnel-charts";
import { FunnelExportButton } from "./funnel-export-button";

type SearchParamValue = string | string[] | undefined;

function firstValue(value: SearchParamValue): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

/** Reads the funnel filters from the reports page search params (validated by the service). */
export function readHiringFunnelParams(
  searchParams: Record<string, SearchParamValue>
): HiringFunnelFilterInput {
  return {
    startDate: firstValue(searchParams[FUNNEL_PARAM_KEYS.startDate]),
    endDate: firstValue(searchParams[FUNNEL_PARAM_KEYS.endDate]),
    openingType: firstValue(searchParams[FUNNEL_PARAM_KEYS.openingType]) as HiringFunnelFilterInput["openingType"],
    openingId: firstValue(searchParams[FUNNEL_PARAM_KEYS.openingId]),
  };
}

const EMPTY_FILTERS: HiringFunnelFilters = {
  startDate: null,
  endDate: null,
  openingType: null,
  openingId: null,
};

interface HiringFunnelSectionProps {
  user: AuthenticatedUser;
  filters: HiringFunnelFilterInput;
  reportsPath: string;
  /** Dashboard parameters to keep when the funnel filters change. */
  preservedParams: Record<string, string>;
}

/** The tab strip already shows "Hiring Funnel", so the section heading is for screen readers. */
function SectionHeading() {
  return (
    <h2 id="hiring-funnel-heading" className="sr-only">
      Hiring funnel
    </h2>
  );
}

/**
 * "Hiring funnel" section of the reports page (canReports). Streams inside Suspense; all
 * figures come from aggregate queries over the stage history.
 */
export async function HiringFunnelSection({
  user,
  filters,
  reportsPath,
  preservedParams,
}: HiringFunnelSectionProps) {
  let report: HiringFunnelReport;
  try {
    report = await hiringFunnelService.getHiringFunnel(user, filters);
  } catch (error) {
    if (error instanceof ValidationError) {
      return (
        <section aria-labelledby="hiring-funnel-heading" className="space-y-4">
          <SectionHeading />
          <HiringFunnelFiltersForm
            reportsPath={reportsPath}
            filters={EMPTY_FILTERS}
            openingOptions={[]}
            preservedParams={preservedParams}
            timeZoneLabel={FUNNEL_TIME_ZONE_LABEL}
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
          The hiring funnel requires the reports permission.
        </p>
      );
    }
    throw error;
  }

  const overallHire = report.timeToHire[0];
  // null (not a fake 0%) when nobody applied; StatCard shows it as "not recorded".
  const hireRate =
    report.totalApplications > 0
      ? `${Math.round((report.totalHired / report.totalApplications) * 1000) / 10}%`
      : null;
  const periodLabel = report.periodLabel.toLowerCase() === "all time" ? "all time" : report.periodLabel;

  return (
    <section aria-labelledby="hiring-funnel-heading" className="space-y-6">
      <SectionHeading />

      <HiringFunnelFiltersForm
        reportsPath={reportsPath}
        filters={report.filters}
        openingOptions={report.openingOptions}
        preservedParams={preservedParams}
        timeZoneLabel={FUNNEL_TIME_ZONE_LABEL}
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted-foreground">Applications submitted: {periodLabel}</p>
        {report.totalApplications > 0 && <FunnelExportButton filters={report.filters} />}
      </div>

      {report.totalApplications === 0 ? (
        <EmptyState
          title="No applications for these filters"
          description="Nobody applied in this period, or the filters exclude every application. Widen the date range or clear the filters."
          icon={<Filter className="h-6 w-6 text-primary" />}
        />
      ) : (
        <>
          <StatGrid columns={4} label="Hiring funnel figures">
            <StatCard label="Applications" value={report.totalApplications} icon={Users} tone="blue" hint={periodLabel} />
            <StatCard label="Hired" value={report.totalHired} icon={CheckCircle2} tone="emerald" />
            <StatCard label="Hire rate" value={hireRate} icon={Percent} tone="violet" hint="Hired out of applications" />
            <StatCard
              label="Median time to hire"
              value={overallHire && overallHire.medianDays !== null ? `${overallHire.medianDays} d` : null}
              icon={Clock}
              tone="amber"
              hint={overallHire && overallHire.medianDays === null ? "No hires yet" : "Submission to hired"}
            />
          </StatGrid>

          <FunnelStageChart stages={report.stages} totalApplications={report.totalApplications} />

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <TimeToHireCard rows={report.timeToHire} />
            <StageDurationChart stages={report.stages} />
          </div>

          <SourceBreakdownTable sources={report.sources} />
          <TopOpeningsTable openings={report.topOpenings} />
        </>
      )}
    </section>
  );
}

/** Suspense fallback mirroring the section layout. */
export function HiringFunnelSkeleton() {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className="space-y-6">
      <span className="sr-only">Loading hiring funnel</span>
      <Skeleton className="h-28 w-full rounded-2xl sm:h-24" />
      <Skeleton className="h-3 w-56 max-w-full" />
      <StatGridSkeleton count={4} columns={4} label="Loading hiring funnel figures" />
      <Skeleton className="h-80 w-full rounded-2xl" />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2" aria-hidden="true">
        <Skeleton className="h-48 rounded-2xl" />
        <Skeleton className="h-48 rounded-2xl" />
      </div>
    </div>
  );
}
