import type { ReactNode } from "react";
import { Filter, Users, CheckCircle2, Clock } from "lucide-react";
import type { AuthenticatedUser } from "@/lib/auth/guards";
import { ForbiddenError, ValidationError } from "@/lib/errors";
import { EmptyState } from "@/components/feedback/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
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

function StatTile({ label, value, icon }: { label: string; value: string; icon: ReactNode }) {
  return (
    <div className="flex flex-col justify-between rounded-2xl border border-border/80 bg-card p-4 shadow-2xs">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold text-muted-foreground">{label}</span>
        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 text-primary" aria-hidden="true">
          {icon}
        </span>
      </div>
      <span className="text-2xl font-extrabold text-foreground">{value}</span>
    </div>
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
          <h2 id="hiring-funnel-heading" className="text-base font-bold text-foreground">Hiring funnel</h2>
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
  const hireRate =
    report.totalApplications > 0
      ? `${Math.round((report.totalHired / report.totalApplications) * 1000) / 10}%`
      : "—";

  return (
    <section aria-labelledby="hiring-funnel-heading" className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 id="hiring-funnel-heading" className="text-base font-bold text-foreground">Hiring funnel</h2>
          <p className="text-xs text-muted-foreground">
            Applications submitted: {report.periodLabel.toLowerCase() === "all time" ? "all time" : report.periodLabel}
          </p>
        </div>
        {report.totalApplications > 0 && <FunnelExportButton filters={report.filters} />}
      </div>

      <HiringFunnelFiltersForm
        reportsPath={reportsPath}
        filters={report.filters}
        openingOptions={report.openingOptions}
        preservedParams={preservedParams}
        timeZoneLabel={FUNNEL_TIME_ZONE_LABEL}
      />

      {report.totalApplications === 0 ? (
        <EmptyState
          title="No applications for these filters"
          description="Nobody applied in this period, or the filters exclude every application. Widen the date range or clear the filters."
          icon={<Filter className="h-6 w-6 text-primary" />}
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile label="Applications" value={String(report.totalApplications)} icon={<Users className="h-4 w-4" />} />
            <StatTile label="Hired" value={String(report.totalHired)} icon={<CheckCircle2 className="h-4 w-4" />} />
            <StatTile label="Hire rate" value={hireRate} icon={<Filter className="h-4 w-4" />} />
            <StatTile
              label="Median time to hire"
              value={overallHire && overallHire.medianDays !== null ? `${overallHire.medianDays} d` : "—"}
              icon={<Clock className="h-4 w-4" />}
            />
          </div>

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
      <div className="space-y-2" aria-hidden="true">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-3 w-64 max-w-full" />
      </div>
      <Skeleton className="h-24 w-full rounded-2xl" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-hidden="true">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-24 rounded-2xl" />
        ))}
      </div>
      <Skeleton className="h-80 w-full rounded-2xl" />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2" aria-hidden="true">
        <Skeleton className="h-48 rounded-2xl" />
        <Skeleton className="h-48 rounded-2xl" />
      </div>
    </div>
  );
}
