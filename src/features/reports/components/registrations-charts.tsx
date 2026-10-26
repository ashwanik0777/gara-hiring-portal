import type { ReactNode } from "react";
import { CalendarDays, CalendarRange, UserPlus } from "lucide-react";
import { Card, CardTitle } from "@/components/ui/card";
import type {
  RegistrationBreakdownRow,
  RegistrationInterest,
  RegistrationTrendPoint,
} from "../types";

/*
 * Presentational pieces of the registrations tab. Like the hiring funnel, every chart is a
 * single series (one hue, thin bars with a rounded data end anchored to the baseline); the
 * bars are hidden from assistive technology and every figure is also in a table.
 */

const thClass = "py-2.5 px-3 text-left font-semibold";
const tdNum = "py-2.5 px-3 text-right font-mono tabular-nums";

const INTEREST_COLUMNS: Array<{ key: RegistrationInterest; label: string }> = [
  { key: "JOB", label: "Job" },
  { key: "INTERNSHIP", label: "Internship" },
  { key: "BOTH", label: "Both" },
  { key: "NOT_CHOSEN", label: "Not chosen" },
];

function formatPct(value: number | null): string {
  return value === null ? "—" : `${value}%`;
}

function formatDays(value: number | null): string {
  if (value === null) return "—";
  return `${value} day${value === 1 ? "" : "s"}`;
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

function HorizontalBar({ value, max, title }: { value: number; max: number; title: string }) {
  const width = max > 0 ? Math.max((value / max) * 100, value > 0 ? 1.5 : 0) : 0;
  return (
    <div className="h-2.5 w-full rounded-r-[4px] bg-muted/50" aria-hidden="true" title={title}>
      <div className="h-full rounded-r-[4px] bg-primary" style={{ width: `${width}%` }} />
    </div>
  );
}

function ChartCard({
  id,
  title,
  icon,
  meta,
  children,
}: {
  id: string;
  title: string;
  icon: ReactNode;
  meta: string;
  children: ReactNode;
}) {
  return (
    <Card className="rounded-2xl border border-border/80 p-5 shadow-2xs">
      <figure aria-labelledby={`${id}-title`} className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-3">
          <figcaption id={`${id}-title`} className="flex items-center gap-2">
            {icon}
            <CardTitle className="text-sm font-bold text-foreground">{title}</CardTitle>
          </figcaption>
          <span className="font-mono text-xs text-muted-foreground">{meta}</span>
        </div>
        {children}
      </figure>
    </Card>
  );
}

/** Registrations per interest bucket with the verified / applied splits and conversion. */
export function RegistrationInterestBreakdown({
  rows,
  totals,
}: {
  rows: RegistrationBreakdownRow[];
  /** Everyone row, shown as the table footer when more than one bucket is listed. */
  totals: RegistrationBreakdownRow;
}) {
  const max = Math.max(0, ...rows.map((row) => row.registrations));
  return (
    <ChartCard
      id="registrations-interest"
      title="What people signed up for"
      icon={<UserPlus className="h-4 w-4 text-primary" aria-hidden="true" />}
      meta={plural(totals.registrations, "registration")}
    >
      <div className="space-y-2.5" aria-hidden="true">
        {rows.map((row) => (
          <div key={row.interest} className="grid grid-cols-[minmax(5.5rem,8rem)_1fr_auto] items-center gap-3 text-xs">
            <span className="truncate font-medium text-foreground">{row.label}</span>
            <HorizontalBar value={row.registrations} max={max} title={`${row.label}: ${row.registrations}`} />
            <span className="whitespace-nowrap text-right font-mono tabular-nums text-foreground">
              {row.registrations}{" "}
              <span className="text-muted-foreground">({formatPct(row.conversionPct)} applied)</span>
            </span>
          </div>
        ))}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse text-xs">
          <caption className="sr-only">
            Registrations by what people signed up for: e-mail verification, whether they applied, conversion to a first
            application, median days to the first application, and how many joined
          </caption>
          <thead>
            <tr className="border-b border-border/80 bg-muted/40 text-[11px] text-muted-foreground">
              <th scope="col" className={thClass}>Signed up for</th>
              <th scope="col" className={`${thClass} text-right`}>Registrations</th>
              <th scope="col" className={`${thClass} text-right`}>E-mail verified</th>
              <th scope="col" className={`${thClass} text-right`}>Not verified</th>
              <th scope="col" className={`${thClass} text-right`}>Applied</th>
              <th scope="col" className={`${thClass} text-right`}>Not applied yet</th>
              <th scope="col" className={`${thClass} text-right`}>Sign-up → application</th>
              <th scope="col" className={`${thClass} text-right`}>Median time to apply</th>
              <th scope="col" className={`${thClass} text-right`}>Joined</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {rows.map((row) => (
              <BreakdownTableRow key={row.interest} row={row} />
            ))}
          </tbody>
          {rows.length > 1 && (
            <tfoot className="border-t-2 border-border/80 font-semibold">
              <BreakdownTableRow row={totals} />
            </tfoot>
          )}
        </table>
      </div>
      <p className="text-[11px] text-muted-foreground">
        &quot;Applied&quot; counts people with at least one submitted (non-draft) application. The median time to apply
        runs from sign-up to the first application. &quot;Joined&quot; counts people who became an intern or employee.
      </p>
    </ChartCard>
  );
}

function BreakdownTableRow({ row }: { row: RegistrationBreakdownRow }) {
  return (
    <tr>
      <th scope="row" className="py-2.5 px-3 text-left font-medium text-foreground">
        {row.label}
      </th>
      <td className={tdNum}>{row.registrations}</td>
      <td className={tdNum}>{row.emailVerified}</td>
      <td className={tdNum}>{row.emailNotVerified}</td>
      <td className={tdNum}>{row.applied}</td>
      <td className={tdNum}>{row.notApplied}</td>
      <td className={tdNum}>{formatPct(row.conversionPct)}</td>
      <td className={tdNum}>{formatDays(row.medianDaysToFirstApplication)}</td>
      <td className={tdNum}>{row.joined}</td>
    </tr>
  );
}

interface RegistrationTrendChartProps {
  granularity: "day" | "month";
  points: RegistrationTrendPoint[];
  /** When set, only the total column is shown (the other buckets are filtered out). */
  interest: RegistrationInterest | null;
  subtitle: string;
}

/**
 * Sign-ups per day (selected range) or per month (last 12 months): a single-hue column
 * chart with the peak labelled, plus the same figures as a table.
 */
export function RegistrationTrendChart({ granularity, points, interest, subtitle }: RegistrationTrendChartProps) {
  const total = points.reduce((sum, point) => sum + point.total, 0);
  const peak = points.reduce<RegistrationTrendPoint | null>(
    (best, point) => (point.total > 0 && (!best || point.total > best.total) ? point : best),
    null
  );
  const max = peak?.total ?? 0;
  const isDaily = granularity === "day";
  const id = isDaily ? "registrations-daily" : "registrations-monthly";
  const unit = isDaily ? "Day" : "Month";
  const columns = interest ? [] : INTEREST_COLUMNS;

  const table = (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-xs">
        <caption className="sr-only">
          Registrations per {unit.toLowerCase()}
          {columns.length > 0 ? ", by what people signed up for" : ""}
        </caption>
        <thead>
          <tr className="border-b border-border/80 bg-muted/40 text-[11px] text-muted-foreground">
            <th scope="col" className={thClass}>{unit}</th>
            <th scope="col" className={`${thClass} text-right`}>Registrations</th>
            {columns.map((column) => (
              <th key={column.key} scope="col" className={`${thClass} text-right`}>
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border/60">
          {points.map((point) => (
            <tr key={point.key}>
              <th scope="row" className="py-2 px-3 text-left font-medium text-foreground">
                <time dateTime={point.key}>{point.label}</time>
              </th>
              <td className={tdNum}>{point.total}</td>
              {columns.map((column) => (
                <td key={column.key} className={tdNum}>
                  {point.byInterest[column.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <ChartCard
      id={id}
      title={isDaily ? "Registrations per day" : "Registrations per month"}
      icon={
        isDaily ? (
          <CalendarDays className="h-4 w-4 text-primary" aria-hidden="true" />
        ) : (
          <CalendarRange className="h-4 w-4 text-primary" aria-hidden="true" />
        )
      }
      meta={subtitle}
    >
      {total === 0 ? (
        <p className="rounded-xl border border-dashed border-border/70 bg-muted/20 p-6 text-center text-xs text-muted-foreground">
          Nobody signed up in this period.
        </p>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            {plural(total, "registration")} in total
            {peak ? (
              <>
                {" "}
                · busiest {isDaily ? "day" : "month"}: <span className="font-semibold text-foreground">{peak.label}</span> (
                {peak.total})
              </>
            ) : null}
          </p>
          <div className="overflow-x-auto" aria-hidden="true">
            <div style={{ minWidth: `${points.length * 6}px` }}>
              <div className="flex h-40 items-end gap-[2px] border-b border-border">
                {points.map((point) => (
                  <div
                    key={point.key}
                    className="flex h-full min-w-[4px] flex-1 items-end"
                    title={`${point.label}: ${plural(point.total, "registration")}`}
                  >
                    {point.total > 0 && (
                      <div
                        className="w-full rounded-t-[4px] bg-primary"
                        style={{ height: `${Math.max((point.total / max) * 100, 2)}%` }}
                      />
                    )}
                  </div>
                ))}
              </div>
              <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
                <span>{points[0]?.label}</span>
                {points.length > 2 && <span>{points[Math.floor(points.length / 2)]?.label}</span>}
                <span>{points[points.length - 1]?.label}</span>
              </div>
            </div>
          </div>
        </>
      )}
      {isDaily ? (
        <details className="group rounded-xl border border-border/70">
          <summary className="cursor-pointer select-none rounded-xl px-3 py-2 text-xs font-semibold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
            Show the daily figures as a table
          </summary>
          <div className="max-h-96 overflow-y-auto border-t border-border/60">{table}</div>
        </details>
      ) : (
        table
      )}
    </ChartCard>
  );
}
