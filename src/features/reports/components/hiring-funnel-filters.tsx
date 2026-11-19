import Link from "next/link";
import { Filter, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { HiringFunnelFilters, HiringFunnelReport } from "../types";
import {
  ReportToolbarLabel,
  reportFieldClass,
  reportFieldLabelClass,
  reportSecondaryLinkClass,
  reportToolbarClass,
  reportToolbarNoteClass,
} from "./report-toolbar";

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
    <form method="GET" action={reportsPath} aria-labelledby="funnel-filters-label" className={reportToolbarClass}>
      <input type="hidden" name={FUNNEL_TAB_PARAM.name} value={FUNNEL_TAB_PARAM.value} />
      {Object.entries(preservedParams).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
        <ReportToolbarLabel id="funnel-filters-label" icon={SlidersHorizontal} className="lg:mb-2.5 lg:w-20">
          Filters
        </ReportToolbarLabel>
        <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-2 sm:items-end lg:grid-cols-4">
          <div className="space-y-1">
            <label htmlFor="funnel-start" className={reportFieldLabelClass}>
              Submitted from
            </label>
            <input
              id="funnel-start"
              type="date"
              name={FUNNEL_PARAM_KEYS.startDate}
              defaultValue={filters.startDate ?? ""}
              className={reportFieldClass}
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="funnel-end" className={reportFieldLabelClass}>
              Submitted until
            </label>
            <input
              id="funnel-end"
              type="date"
              name={FUNNEL_PARAM_KEYS.endDate}
              defaultValue={filters.endDate ?? ""}
              className={reportFieldClass}
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="funnel-type" className={reportFieldLabelClass}>
              Opening type
            </label>
            <select
              id="funnel-type"
              name={FUNNEL_PARAM_KEYS.openingType}
              defaultValue={filters.openingType ?? ""}
              className={reportFieldClass}
            >
              <option value="">All types</option>
              <option value="INTERNSHIP">Internships</option>
              <option value="FULL_TIME">Full-time roles</option>
            </select>
          </div>
          <div className="space-y-1">
            <label htmlFor="funnel-opening" className={reportFieldLabelClass}>
              Opening
            </label>
            <select
              id="funnel-opening"
              name={FUNNEL_PARAM_KEYS.openingId}
              defaultValue={filters.openingId ?? ""}
              className={reportFieldClass}
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
        </div>
        <div className="flex gap-2 lg:shrink-0">
          <Button type="submit" size="sm" className="h-9 flex-1 rounded-xl lg:flex-none">
            <Filter className="h-3.5 w-3.5" aria-hidden="true" />
            Apply
          </Button>
          <Link href={`${reportsPath}?${resetParams.toString()}`} className={reportSecondaryLinkClass}>
            Reset
          </Link>
        </div>
      </div>
      <p className={reportToolbarNoteClass}>
        The funnel follows the applications submitted in this period. Dates use the company time zone ({timeZoneLabel}).
      </p>
    </form>
  );
}
