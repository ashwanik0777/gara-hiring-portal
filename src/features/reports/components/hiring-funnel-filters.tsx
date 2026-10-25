import Link from "next/link";
import { Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { HiringFunnelFilters, HiringFunnelReport } from "../types";

/** URL parameters owned by the hiring funnel section (the dashboard uses its own). */
export const FUNNEL_PARAM_KEYS = {
  startDate: "funnelStart",
  endDate: "funnelEnd",
  openingType: "funnelType",
  openingId: "funnelOpening",
} as const;

export const FUNNEL_TAB_PARAM = { name: "tab", value: "funnel" } as const;

interface HiringFunnelFiltersProps {
  reportsPath: string;
  filters: HiringFunnelFilters;
  openingOptions: HiringFunnelReport["openingOptions"];
  /** Dashboard parameters kept when the funnel filters are applied. */
  preservedParams: Record<string, string>;
  timeZoneLabel: string;
}

const fieldClass =
  "h-9 w-full rounded-xl border border-input bg-card px-3 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";

/**
 * Plain GET form (works without JavaScript): date range, opening type and opening. The
 * values are validated again on the server.
 */
export function HiringFunnelFiltersForm({
  reportsPath,
  filters,
  openingOptions,
  preservedParams,
  timeZoneLabel,
}: HiringFunnelFiltersProps) {
  const resetParams = new URLSearchParams(preservedParams);
  resetParams.set(FUNNEL_TAB_PARAM.name, FUNNEL_TAB_PARAM.value);

  return (
    <form method="GET" action={reportsPath} className="rounded-2xl border border-border/80 bg-card p-4 shadow-2xs">
      <input type="hidden" name={FUNNEL_TAB_PARAM.name} value={FUNNEL_TAB_PARAM.value} />
      {Object.entries(preservedParams).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5 lg:items-end">
        <div className="space-y-1">
          <label htmlFor="funnel-start" className="block text-[11px] font-semibold text-muted-foreground">
            Submitted from
          </label>
          <input
            id="funnel-start"
            type="date"
            name={FUNNEL_PARAM_KEYS.startDate}
            defaultValue={filters.startDate ?? ""}
            className={fieldClass}
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="funnel-end" className="block text-[11px] font-semibold text-muted-foreground">
            Submitted until
          </label>
          <input
            id="funnel-end"
            type="date"
            name={FUNNEL_PARAM_KEYS.endDate}
            defaultValue={filters.endDate ?? ""}
            className={fieldClass}
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="funnel-type" className="block text-[11px] font-semibold text-muted-foreground">
            Opening type
          </label>
          <select
            id="funnel-type"
            name={FUNNEL_PARAM_KEYS.openingType}
            defaultValue={filters.openingType ?? ""}
            className={fieldClass}
          >
            <option value="">All types</option>
            <option value="INTERNSHIP">Internships</option>
            <option value="FULL_TIME">Full-time roles</option>
          </select>
        </div>
        <div className="space-y-1">
          <label htmlFor="funnel-opening" className="block text-[11px] font-semibold text-muted-foreground">
            Opening
          </label>
          <select
            id="funnel-opening"
            name={FUNNEL_PARAM_KEYS.openingId}
            defaultValue={filters.openingId ?? ""}
            className={fieldClass}
          >
            <option value="">All openings</option>
            {openingOptions.map((opening) => (
              <option key={opening.id} value={opening.id}>
                {opening.title}
                {opening.status !== "PUBLISHED" ? ` (${opening.status.toLowerCase()})` : ""}
              </option>
            ))}
          </select>
        </div>
        <div className="flex gap-2">
          <Button type="submit" size="sm" className="h-9 flex-1">
            <Filter className="h-3.5 w-3.5" aria-hidden="true" />
            Apply
          </Button>
          <Link
            href={`${reportsPath}?${resetParams.toString()}`}
            className="inline-flex h-9 items-center justify-center rounded-xl border border-border bg-card px-3 text-xs font-medium hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            Reset
          </Link>
        </div>
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">
        The funnel follows the applications submitted in this period. Dates use the company time zone ({timeZoneLabel}).
      </p>
    </form>
  );
}
