import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock, Filter, Globe, Briefcase } from "lucide-react";
import type {
  HiringFunnelStageRow,
  SourceBreakdownRow,
  TimeToHireRow,
  TopOpeningRow,
} from "../types";

/*
 * Presentational pieces of the hiring funnel. Every chart is a single series (one hue,
 * thin bars with a rounded data end) whose values are printed in text colours; the
 * decorative bars are hidden from assistive technology and every figure is also in a
 * table, so nothing depends on seeing the chart.
 */

function formatPct(value: number | null): string {
  return value === null ? "—" : `${value}%`;
}

function formatDays(value: number | null): string {
  if (value === null) return "—";
  return `${value} day${value === 1 ? "" : "s"}`;
}

function Bar({ value, max, title }: { value: number; max: number; title: string }) {
  const width = max > 0 ? Math.max((value / max) * 100, value > 0 ? 1.5 : 0) : 0;
  return (
    <div className="h-2.5 w-full rounded-r-[4px] bg-muted/50" aria-hidden="true" title={title}>
      <div className="h-full rounded-r-[4px] bg-primary" style={{ width: `${width}%` }} />
    </div>
  );
}

const thClass = "py-2.5 px-3 text-left font-semibold";
const tdNum = "py-2.5 px-3 text-right font-mono tabular-nums";

export function FunnelStageChart({
  stages,
  totalApplications,
}: {
  stages: HiringFunnelStageRow[];
  totalApplications: number;
}) {
  return (
    <Card className="rounded-2xl border border-border/80 p-5 shadow-2xs">
      <figure aria-labelledby="funnel-stage-title" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-3">
          <figcaption id="funnel-stage-title" className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-primary" aria-hidden="true" />
            <CardTitle className="text-sm font-bold text-foreground">Applications reaching each stage</CardTitle>
          </figcaption>
          <span className="font-mono text-xs text-muted-foreground">{totalApplications} applications</span>
        </div>

        <div className="space-y-2.5" aria-hidden="true">
          {stages.map((stage) => (
            <div key={stage.stage} className="grid grid-cols-[minmax(7rem,11rem)_1fr_auto] items-center gap-3 text-xs">
              <span className="truncate font-medium text-foreground">{stage.label}</span>
              <Bar
                value={stage.reached}
                max={totalApplications}
                title={`${stage.label}: ${stage.reached} reached (${stage.reachedPct}%)`}
              />
              <span className="w-24 text-right font-mono tabular-nums text-foreground">
                {stage.reached} <span className="text-muted-foreground">({stage.reachedPct}%)</span>
              </span>
            </div>
          ))}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-xs">
            <caption className="sr-only">
              Stage funnel: applications that reached each stage, the share that moved forward, and drop-off
            </caption>
            <thead>
              <tr className="border-b border-border/80 bg-muted/40 text-[11px] text-muted-foreground">
                <th scope="col" className={thClass}>Stage</th>
                <th scope="col" className={`${thClass} text-right`}>Reached</th>
                <th scope="col" className={`${thClass} text-right`}>Moved forward</th>
                <th scope="col" className={`${thClass} text-right`}>Rejected here</th>
                <th scope="col" className={`${thClass} text-right`}>Withdrew here</th>
                <th scope="col" className={`${thClass} text-right`}>Drop-off</th>
                <th scope="col" className={`${thClass} text-right`}>Currently here</th>
                <th scope="col" className={`${thClass} text-right`}>Avg. time in stage</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {stages.map((stage) => (
                <tr key={stage.stage}>
                  <th scope="row" className="py-2.5 px-3 text-left font-medium text-foreground">
                    {stage.label}
                    {stage.internshipOnly && (
                      <Badge variant="outline" className="ml-2 text-[10px]">
                        Internships
                      </Badge>
                    )}
                  </th>
                  <td className={tdNum}>{stage.reached}</td>
                  <td className={tdNum}>
                    {stage.conversionPct === null ? (
                      <span className="text-muted-foreground">{stage.stage === "HIRED" ? "Final stage" : "—"}</span>
                    ) : (
                      `${stage.progressed} (${stage.conversionPct}%)`
                    )}
                  </td>
                  <td className={tdNum}>{stage.rejected}</td>
                  <td className={tdNum}>{stage.withdrawn}</td>
                  <td className={tdNum}>{formatPct(stage.dropOffPct)}</td>
                  <td className={tdNum}>{stage.current}</td>
                  <td className={tdNum}>{formatDays(stage.averageDaysInStage)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-muted-foreground">
          &quot;Moved forward&quot; counts applications that later reached any further stage (internships continue
          through the evaluation, full-time roles go straight to an offer). Time in stage only counts stays that have
          ended.
        </p>
      </figure>
    </Card>
  );
}

export function TimeToHireCard({ rows }: { rows: TimeToHireRow[] }) {
  return (
    <Card className="rounded-2xl border border-border/80 p-5 shadow-2xs">
      <div className="mb-3 flex items-center gap-2 border-b border-border/60 pb-3">
        <Clock className="h-4 w-4 text-primary" aria-hidden="true" />
        <CardTitle className="text-sm font-bold text-foreground">Time to hire</CardTitle>
      </div>
      <table className="w-full border-collapse text-xs">
        <caption className="sr-only">Days from application to hired, by opening type</caption>
        <thead>
          <tr className="border-b border-border/80 text-[11px] text-muted-foreground">
            <th scope="col" className={thClass}>Group</th>
            <th scope="col" className={`${thClass} text-right`}>Hires</th>
            <th scope="col" className={`${thClass} text-right`}>Median</th>
            <th scope="col" className={`${thClass} text-right`}>Average</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/60">
          {rows.map((row) => (
            <tr key={row.group}>
              <th scope="row" className="py-2.5 px-3 text-left font-medium text-foreground">{row.label}</th>
              <td className={tdNum}>{row.hires}</td>
              <td className={tdNum}>{row.hires > 0 ? formatDays(row.medianDays) : <span className="text-muted-foreground">No hires yet</span>}</td>
              <td className={tdNum}>{row.hires > 0 ? formatDays(row.averageDays) : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-3 text-[11px] text-muted-foreground">Measured from submission to the first move to Hired.</p>
    </Card>
  );
}

export function StageDurationChart({ stages }: { stages: HiringFunnelStageRow[] }) {
  const measured = stages.filter((stage) => stage.averageDaysInStage !== null);
  const max = Math.max(0, ...measured.map((stage) => stage.averageDaysInStage ?? 0));
  return (
    <Card className="rounded-2xl border border-border/80 p-5 shadow-2xs">
      <figure aria-labelledby="stage-duration-title">
        <figcaption id="stage-duration-title" className="mb-3 flex items-center gap-2 border-b border-border/60 pb-3">
          <Clock className="h-4 w-4 text-primary" aria-hidden="true" />
          <CardTitle className="text-sm font-bold text-foreground">Average days per stage</CardTitle>
        </figcaption>
        {measured.length === 0 ? (
          <p className="py-6 text-center text-xs text-muted-foreground">
            No completed stage stays yet for these filters.
          </p>
        ) : (
          <>
            <div className="space-y-2.5" aria-hidden="true">
              {measured.map((stage) => (
                <div key={stage.stage} className="grid grid-cols-[minmax(7rem,11rem)_1fr_auto] items-center gap-3 text-xs">
                  <span className="truncate font-medium text-foreground">{stage.label}</span>
                  <Bar
                    value={stage.averageDaysInStage ?? 0}
                    max={max}
                    title={`${stage.label}: ${formatDays(stage.averageDaysInStage)}`}
                  />
                  <span className="w-20 text-right font-mono tabular-nums text-foreground">
                    {formatDays(stage.averageDaysInStage)}
                  </span>
                </div>
              ))}
            </div>
            <table className="sr-only">
              <caption>Average days spent in each stage</caption>
              <thead>
                <tr>
                  <th scope="col">Stage</th>
                  <th scope="col">Average days</th>
                  <th scope="col">Completed stays</th>
                </tr>
              </thead>
              <tbody>
                {measured.map((stage) => (
                  <tr key={stage.stage}>
                    <th scope="row">{stage.label}</th>
                    <td>{stage.averageDaysInStage}</td>
                    <td>{stage.stageSamples}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </figure>
    </Card>
  );
}

export function SourceBreakdownTable({ sources }: { sources: SourceBreakdownRow[] }) {
  const max = Math.max(0, ...sources.map((source) => source.applications));
  return (
    <Card className="rounded-2xl border border-border/80 p-5 shadow-2xs">
      <div className="mb-3 flex items-center gap-2 border-b border-border/60 pb-3">
        <Globe className="h-4 w-4 text-primary" aria-hidden="true" />
        <CardTitle className="text-sm font-bold text-foreground">Where candidates come from</CardTitle>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] border-collapse text-xs">
          <caption className="sr-only">Applications, shortlisted, hired and hire rate by source</caption>
          <thead>
            <tr className="border-b border-border/80 text-[11px] text-muted-foreground">
              <th scope="col" className={thClass}>Source</th>
              <th scope="col" className={`${thClass} w-1/3`}>
                <span className="sr-only">Share of applications</span>
              </th>
              <th scope="col" className={`${thClass} text-right`}>Applications</th>
              <th scope="col" className={`${thClass} text-right`}>Shortlisted</th>
              <th scope="col" className={`${thClass} text-right`}>Hired</th>
              <th scope="col" className={`${thClass} text-right`}>Hire rate</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {sources.map((source) => (
              <tr key={source.source}>
                <th scope="row" className="py-2.5 px-3 text-left font-medium text-foreground">{source.label}</th>
                <td className="py-2.5 px-3">
                  <Bar value={source.applications} max={max} title={`${source.label}: ${source.applications} applications`} />
                </td>
                <td className={tdNum}>{source.applications}</td>
                <td className={tdNum}>{source.shortlisted}</td>
                <td className={tdNum}>{source.hired}</td>
                <td className={tdNum}>{formatPct(source.hireRatePct)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-[11px] text-muted-foreground">
        Source is the candidate&apos;s own answer, otherwise the campaign link they used; direct applications count as
        Careers page. &quot;Not recorded&quot; covers applications from before source tracking.
      </p>
    </Card>
  );
}

export function TopOpeningsTable({ openings }: { openings: TopOpeningRow[] }) {
  const max = Math.max(0, ...openings.map((opening) => opening.applications));
  return (
    <Card className="rounded-2xl border border-border/80 p-5 shadow-2xs">
      <div className="mb-3 flex items-center gap-2 border-b border-border/60 pb-3">
        <Briefcase className="h-4 w-4 text-primary" aria-hidden="true" />
        <CardTitle className="text-sm font-bold text-foreground">Top openings by applications</CardTitle>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] border-collapse text-xs">
          <caption className="sr-only">Openings with the most applications</caption>
          <thead>
            <tr className="border-b border-border/80 text-[11px] text-muted-foreground">
              <th scope="col" className={thClass}>Opening</th>
              <th scope="col" className={thClass}>Type</th>
              <th scope="col" className={`${thClass} w-1/4`}>
                <span className="sr-only">Share of applications</span>
              </th>
              <th scope="col" className={`${thClass} text-right`}>Applications</th>
              <th scope="col" className={`${thClass} text-right`}>Hired</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {openings.map((opening) => (
              <tr key={opening.openingId}>
                <th scope="row" className="py-2.5 px-3 text-left font-medium text-foreground">
                  {opening.title}
                  <span className="block text-[11px] font-normal text-muted-foreground">{opening.department}</span>
                </th>
                <td className="py-2.5 px-3 text-muted-foreground">
                  {opening.type === "INTERNSHIP" ? "Internship" : "Full-time"}
                </td>
                <td className="py-2.5 px-3">
                  <Bar value={opening.applications} max={max} title={`${opening.title}: ${opening.applications} applications`} />
                </td>
                <td className={tdNum}>{opening.applications}</td>
                <td className={tdNum}>{opening.hired}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
