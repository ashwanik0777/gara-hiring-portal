import React from "react";
import { Badge } from "@/components/ui/badge";
import { EmploymentType } from "@/types/enums";
import {
  PERIOD_END_LABELS,
  PERIOD_START_LABELS,
  type PeriodEndReason,
  type PeriodStartReason,
} from "../conversion-rules";

/** One employment period as the timeline renders it (dates as Date or ISO strings). */
export interface TimelinePeriod {
  id: string;
  employmentType: EmploymentType | null;
  designation: string;
  department: string;
  startDate: Date | string;
  endDate: Date | string | null;
  startReason: PeriodStartReason;
  endReason: PeriodEndReason | null;
  /** Optional line under the period, e.g. the exit reason for staff. */
  note?: string | null;
}

const TYPE_LABELS: Record<EmploymentType, string> = {
  FULL_TIME: "Full time",
  INTERN: "Intern",
};

/** Calendar days are stored at UTC midnight, so they are formatted in UTC. */
function formatDay(value: Date | string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" }).format(
    date
  );
}

/**
 * Employment period history (joining, re-joining, conversion), newest first. Presentational
 * and server-safe; callers pass only periods the viewer may see.
 */
export function EmploymentPeriodTimeline({
  periods,
  emptyText = "No employment periods are recorded yet.",
}: {
  periods: TimelinePeriod[];
  emptyText?: string;
}) {
  if (periods.length === 0) {
    return <p className="text-xs text-muted-foreground">{emptyText}</p>;
  }

  const newestFirst = [...periods].sort(
    (a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime()
  );

  return (
    <ol className="relative ml-2 space-y-5 border-l-2 border-border pl-5 text-xs">
      {newestFirst.map((period) => {
        const current = period.endDate === null;
        return (
          <li key={period.id} className="relative space-y-1">
            <span
              aria-hidden="true"
              className={
                current
                  ? "absolute -left-[27px] top-0.5 h-3.5 w-3.5 rounded-full border-2 border-primary bg-primary"
                  : "absolute -left-[27px] top-0.5 h-3.5 w-3.5 rounded-full border-2 border-border bg-card"
              }
            />
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-foreground">{period.designation}</span>
              <span className="text-muted-foreground">· {period.department}</span>
              {period.employmentType && (
                <Badge variant="outline" className="text-[10px]">
                  {TYPE_LABELS[period.employmentType]}
                </Badge>
              )}
              {current && (
                <Badge variant="success" className="text-[10px]">
                  Current
                </Badge>
              )}
            </div>
            <p className="text-muted-foreground">
              {PERIOD_START_LABELS[period.startReason]} {formatDay(period.startDate)}
              {period.endDate
                ? ` · ${period.endReason ? PERIOD_END_LABELS[period.endReason] : "Ended"} ${formatDay(period.endDate)}`
                : " · present"}
            </p>
            {period.note && <p className="text-muted-foreground">{period.note}</p>}
          </li>
        );
      })}
    </ol>
  );
}
