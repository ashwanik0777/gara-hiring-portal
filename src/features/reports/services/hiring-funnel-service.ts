import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { assertPermission, type AuthenticatedUser } from "@/lib/auth/guards";
import { ValidationError } from "@/lib/errors";
import { atBusinessTime, BUSINESS_TIME_ZONE } from "@/lib/time/business-time";
import { describeApplicationStage } from "@/features/applications/stage-labels";
import {
  APPLICATION_SOURCE_LABELS,
  UNKNOWN_SOURCE,
  isApplicationSource,
} from "@/features/applications/source-tracking";
import { HiringFunnelFilterSchema, type HiringFunnelFilterInput } from "../schemas";
import type {
  FunnelOpeningTypeFilter,
  HiringFunnelCsvExportResult,
  HiringFunnelFilters,
  HiringFunnelReport,
  HiringFunnelStageRow,
  SourceBreakdownRow,
  TimeToHireRow,
  TopOpeningRow,
} from "../types";
import { escapeCsvCell } from "./report-service";

/**
 * Funnel stages in pipeline order. The pipeline branches after INTERVIEWED (internships go
 * through the supervised evaluation, full-time roles straight to an offer), so "moved
 * forward" means reaching ANY later stage in this order rather than the next row.
 */
export const FUNNEL_STAGE_ORDER = [
  "SUBMITTED",
  "SCREENING",
  "SHORTLISTED",
  "INTERVIEW_SCHEDULED",
  "INTERVIEWED",
  "EVALUATION_SELECTED",
  "OFFERED",
  "OFFER_ACCEPTED",
  "HIRED",
] as const;

const INTERNSHIP_ONLY_STAGES: readonly string[] = ["EVALUATION_SELECTED"];
const SHORTLISTED_OR_LATER: readonly string[] = FUNNEL_STAGE_ORDER.slice(
  FUNNEL_STAGE_ORDER.indexOf("SHORTLISTED")
);
const TOP_OPENINGS_LIMIT = 10;
const OPENING_OPTIONS_LIMIT = 200;

const OPENING_TYPE_LABELS: Record<"ALL" | FunnelOpeningTypeFilter, string> = {
  ALL: "All openings",
  INTERNSHIP: "Internships",
  FULL_TIME: "Full-time roles",
};

// ─── Raw aggregate rows (one round trip each, all aggregated in PostgreSQL) ──────

export interface StageStatRow {
  stage: string;
  reached: number;
  progressed: number;
  current: number;
}
export interface DropOffRow {
  stage: string;
  outcome: string;
  count: number;
}
export interface StageDurationRow {
  stage: string;
  averageDays: number | null;
  samples: number;
}
export interface TimeToHireRawRow {
  openingType: string | null;
  hires: number;
  averageDays: number | null;
  medianDays: number | null;
}
export interface SourceRawRow {
  source: string;
  applications: number;
  shortlisted: number;
  hired: number;
}
export interface TopOpeningRawRow {
  openingId: string;
  title: string;
  type: string;
  department: string;
  applications: number;
  hired: number;
}

export interface HiringFunnelRawData {
  stageStats: StageStatRow[];
  dropOffs: DropOffRow[];
  stageDurations: StageDurationRow[];
  timeToHire: TimeToHireRawRow[];
  sources: SourceRawRow[];
  topOpenings: TopOpeningRawRow[];
}

// ─── Pure helpers (unit-tested on fixtures) ──────────────────────────────────────

/** ratio → percentage with one decimal; null when the denominator is zero. */
export function toPercent(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null;
  return Math.round((numerator / denominator) * 1000) / 10;
}

function roundDays(value: number | null | undefined): number | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  return Math.round(value * 10) / 10;
}

/** Stages shown for an opening-type filter (full-time roles never enter the evaluation). */
export function funnelStagesFor(openingType: FunnelOpeningTypeFilter | null): string[] {
  return FUNNEL_STAGE_ORDER.filter(
    (stage) => openingType !== "FULL_TIME" || !INTERNSHIP_ONLY_STAGES.includes(stage)
  );
}

/** Turns the aggregate rows into the report (percentages, labels, honest nulls). */
export function assembleHiringFunnel(
  raw: HiringFunnelRawData,
  context: {
    filters: HiringFunnelFilters;
    periodLabel: string;
    generatedAt: Date;
    openingOptions: HiringFunnelReport["openingOptions"];
  }
): HiringFunnelReport {
  const statByStage = new Map(raw.stageStats.map((row) => [row.stage, row]));
  const durationByStage = new Map(raw.stageDurations.map((row) => [row.stage, row]));
  const dropOff = (stage: string, outcome: string) =>
    raw.dropOffs
      .filter((row) => row.stage === stage && row.outcome === outcome)
      .reduce((sum, row) => sum + row.count, 0);

  // Every application belongs to exactly one source group, so their sum is the cohort size.
  const totalApplications = raw.sources.reduce((sum, row) => sum + row.applications, 0);

  const stageList = funnelStagesFor(context.filters.openingType);
  const finalStage = FUNNEL_STAGE_ORDER[FUNNEL_STAGE_ORDER.length - 1];
  const stages: HiringFunnelStageRow[] = stageList.map((stage) => {
    const stat = statByStage.get(stage);
    const reached = stat?.reached ?? 0;
    const progressed = stage === finalStage ? 0 : stat?.progressed ?? 0;
    const rejected = dropOff(stage, "REJECTED");
    const withdrawn = dropOff(stage, "WITHDRAWN");
    const duration = durationByStage.get(stage);
    return {
      stage,
      label: describeApplicationStage(stage),
      reached,
      reachedPct: toPercent(reached, totalApplications) ?? 0,
      progressed,
      conversionPct: stage === finalStage ? null : toPercent(progressed, reached),
      rejected,
      withdrawn,
      dropOffPct: toPercent(rejected + withdrawn, reached),
      current: stat?.current ?? 0,
      averageDaysInStage: duration && duration.samples > 0 ? roundDays(duration.averageDays) : null,
      stageSamples: duration?.samples ?? 0,
      internshipOnly: INTERNSHIP_ONLY_STAGES.includes(stage),
    };
  });

  const totalRejected = raw.dropOffs
    .filter((row) => row.outcome === "REJECTED")
    .reduce((sum, row) => sum + row.count, 0);
  const totalWithdrawn = raw.dropOffs
    .filter((row) => row.outcome === "WITHDRAWN")
    .reduce((sum, row) => sum + row.count, 0);

  // Time to hire: the ROLLUP row (openingType NULL) is the overall figure.
  const hireRow = (group: "ALL" | FunnelOpeningTypeFilter): TimeToHireRow => {
    const match = raw.timeToHire.find((row) =>
      group === "ALL" ? row.openingType === null : row.openingType === group
    );
    const hires = match?.hires ?? 0;
    return {
      group,
      label: OPENING_TYPE_LABELS[group],
      hires,
      medianDays: hires > 0 ? roundDays(match?.medianDays) : null,
      averageDays: hires > 0 ? roundDays(match?.averageDays) : null,
    };
  };
  const timeToHire: TimeToHireRow[] = context.filters.openingType
    ? [hireRow(context.filters.openingType)]
    : [hireRow("ALL"), hireRow("INTERNSHIP"), hireRow("FULL_TIME")];

  // Sources: unknown stored codes are grouped under OTHER; legacy rows stay "Not recorded".
  const sourceTotals = new Map<string, { applications: number; shortlisted: number; hired: number }>();
  for (const row of raw.sources) {
    const code =
      row.source === UNKNOWN_SOURCE ? UNKNOWN_SOURCE : isApplicationSource(row.source) ? row.source : "OTHER";
    const current = sourceTotals.get(code) ?? { applications: 0, shortlisted: 0, hired: 0 };
    current.applications += row.applications;
    current.shortlisted += row.shortlisted;
    current.hired += row.hired;
    sourceTotals.set(code, current);
  }
  const sources: SourceBreakdownRow[] = Array.from(sourceTotals.entries())
    .map(([code, totals]) => ({
      source: code,
      label: isApplicationSource(code) ? APPLICATION_SOURCE_LABELS[code] : APPLICATION_SOURCE_LABELS.UNKNOWN,
      ...totals,
      hireRatePct: toPercent(totals.hired, totals.applications),
    }))
    .sort((a, b) => b.applications - a.applications || a.label.localeCompare(b.label));

  const topOpenings: TopOpeningRow[] = raw.topOpenings.map((row) => ({ ...row }));

  return {
    generatedAt: context.generatedAt,
    periodLabel: context.periodLabel,
    filters: context.filters,
    totalApplications,
    totalHired: statByStage.get(finalStage)?.reached ?? 0,
    totalRejected,
    totalWithdrawn,
    stages,
    timeToHire,
    sources,
    topOpenings,
    openingOptions: context.openingOptions,
  };
}

/** Tidy CSV (Section, Item, Metric, Value) of a funnel report; every cell is injection-guarded. */
export function buildHiringFunnelCsv(report: HiringFunnelReport): { csvContent: string; rowCount: number } {
  const rows: Array<[string, string, string, string | number | null]> = [
    ["Filters", "Period", "Applications submitted", report.periodLabel],
    ["Filters", "Opening type", "Value", report.filters.openingType ?? "All"],
    ["Filters", "Opening", "Id", report.filters.openingId ?? "All"],
    ["Totals", "Applications", "Count", report.totalApplications],
    ["Totals", "Hired", "Count", report.totalHired],
    ["Totals", "Rejected", "Count", report.totalRejected],
    ["Totals", "Withdrawn", "Count", report.totalWithdrawn],
  ];
  for (const stage of report.stages) {
    rows.push(
      ["Stage funnel", stage.label, "Reached", stage.reached],
      ["Stage funnel", stage.label, "Reached % of applications", stage.reachedPct],
      ["Stage funnel", stage.label, "Moved forward", stage.progressed],
      ["Stage funnel", stage.label, "Moved forward %", stage.conversionPct],
      ["Stage funnel", stage.label, "Rejected at stage", stage.rejected],
      ["Stage funnel", stage.label, "Withdrew at stage", stage.withdrawn],
      ["Stage funnel", stage.label, "Drop-off %", stage.dropOffPct],
      ["Stage funnel", stage.label, "Currently at stage", stage.current],
      ["Stage funnel", stage.label, "Average days in stage", stage.averageDaysInStage]
    );
  }
  for (const hire of report.timeToHire) {
    rows.push(
      ["Time to hire", hire.label, "Hires", hire.hires],
      ["Time to hire", hire.label, "Median days", hire.medianDays],
      ["Time to hire", hire.label, "Average days", hire.averageDays]
    );
  }
  for (const source of report.sources) {
    rows.push(
      ["Sources", source.label, "Applications", source.applications],
      ["Sources", source.label, "Shortlisted", source.shortlisted],
      ["Sources", source.label, "Hired", source.hired],
      ["Sources", source.label, "Hire rate %", source.hireRatePct]
    );
  }
  for (const opening of report.topOpenings) {
    rows.push(
      ["Top openings", opening.title, "Applications", opening.applications],
      ["Top openings", opening.title, "Hired", opening.hired]
    );
  }

  const lines = [
    ["Section", "Item", "Metric", "Value"].join(","),
    ...rows.map((row) => row.map((cell) => escapeCsvCell(cell)).join(",")),
  ];
  return { csvContent: lines.join("\n"), rowCount: rows.length };
}

// ─── Date window (business time zone) ────────────────────────────────────────────

function nextDateKey(dateKey: string): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10);
}

/** Timestamp literal for the `timestamp(3)` columns, which store UTC wall-clock time. */
function toUtcTimestampLiteral(instant: Date): string {
  return instant.toISOString().replace("T", " ").replace("Z", "");
}

function describePeriod(startDate: string | null, endDate: string | null): string {
  if (startDate && endDate) return `${startDate} to ${endDate}`;
  if (startDate) return `From ${startDate}`;
  if (endDate) return `Through ${endDate}`;
  return "All time";
}

// ─── Service ──────────────────────────────────────────────────────────────────────

export class HiringFunnelService {
  /** Parses and validates the filters; the date range is interpreted in business time. */
  parseFilters(rawFilters: HiringFunnelFilterInput): {
    filters: HiringFunnelFilters;
    start: Date | null;
    endExclusive: Date | null;
  } {
    const parsed = HiringFunnelFilterSchema.safeParse(rawFilters ?? {});
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues[0]?.message ?? "Check the funnel filters.");
    }
    const filters: HiringFunnelFilters = {
      startDate: parsed.data.startDate || null,
      endDate: parsed.data.endDate || null,
      openingType: parsed.data.openingType || null,
      openingId: parsed.data.openingId || null,
    };
    if (filters.startDate && filters.endDate && filters.startDate > filters.endDate) {
      throw new ValidationError("The start date must be on or before the end date.");
    }
    return {
      filters,
      start: filters.startDate ? atBusinessTime(filters.startDate, 0, 0) : null,
      endExclusive: filters.endDate ? atBusinessTime(nextDateKey(filters.endDate), 0, 0) : null,
    };
  }

  /** Funnel analytics for staff with the `canReports` permission (ADMIN always passes). */
  async getHiringFunnel(
    user: AuthenticatedUser,
    rawFilters: HiringFunnelFilterInput = {}
  ): Promise<HiringFunnelReport> {
    await assertPermission(user, "canReports");
    const { filters, start, endExclusive } = this.parseFilters(rawFilters);

    const [raw, openingOptions] = await Promise.all([
      this.loadAggregates(filters, start, endExclusive),
      prisma.opening.findMany({
        select: { id: true, title: true, type: true, status: true },
        orderBy: { createdAt: "desc" },
        take: OPENING_OPTIONS_LIMIT,
      }),
    ]);

    return assembleHiringFunnel(raw, {
      filters,
      periodLabel: describePeriod(filters.startDate, filters.endDate),
      generatedAt: new Date(),
      openingOptions: openingOptions.map((opening) => ({
        id: opening.id,
        title: opening.title,
        type: opening.type,
        status: opening.status,
      })),
    });
  }

  /** CSV of the funnel for the same filters, recorded in the audit log like other exports. */
  async exportHiringFunnelCsv(
    user: AuthenticatedUser,
    rawFilters: HiringFunnelFilterInput = {}
  ): Promise<HiringFunnelCsvExportResult> {
    const report = await this.getHiringFunnel(user, rawFilters);
    const { csvContent, rowCount } = buildHiringFunnelCsv(report);

    await prisma.auditLog.create({
      data: {
        actorId: user.id,
        actorRole: user.roles.join(","),
        action: "EXPORT_REPORT",
        resourceType: "Report",
        resourceId: "HIRING_FUNNEL",
        diffPayload: { reportType: "HIRING_FUNNEL", rowCount, filters: { ...report.filters } },
      },
    });

    return {
      fileName: `gara-hiring-funnel-${report.generatedAt.toISOString().slice(0, 10)}.csv`,
      csvContent,
      rowCount,
      generatedAt: report.generatedAt,
      filters: report.filters,
    };
  }

  /**
   * Runs the aggregate queries. Every query starts from the same `scoped` CTE (the cohort
   * of non-draft applications matching the filters) and returns only grouped rows, so the
   * amount of data read into memory is bounded by the number of stages, sources and
   * openings — never by the number of applications. All values are bound parameters.
   */
  private async loadAggregates(
    filters: HiringFunnelFilters,
    start: Date | null,
    endExclusive: Date | null
  ): Promise<HiringFunnelRawData> {
    const conditions: Prisma.Sql[] = [Prisma.sql`a."status"::text <> 'DRAFT'`];
    if (start) conditions.push(Prisma.sql`a."createdAt" >= ${toUtcTimestampLiteral(start)}::timestamp`);
    if (endExclusive) {
      conditions.push(Prisma.sql`a."createdAt" < ${toUtcTimestampLiteral(endExclusive)}::timestamp`);
    }
    if (filters.openingType) conditions.push(Prisma.sql`o."type"::text = ${filters.openingType}`);
    if (filters.openingId) conditions.push(Prisma.sql`a."openingId" = ${filters.openingId}`);

    const scoped = Prisma.sql`scoped AS (
      SELECT a."id", a."openingId", a."status"::text AS "status", a."createdAt", a."source",
             o."type"::text AS "openingType"
      FROM "applications" a
      JOIN "openings" o ON o."id" = a."openingId"
      WHERE ${Prisma.join(conditions, " AND ")}
    )`;

    // Every (application, stage) pair the application has been in: history rows in both
    // directions plus the current status (covers records created before history existed).
    const reached = Prisma.sql`reached AS (
      SELECT h."applicationId", h."toStatus" AS "stage"
      FROM "application_status_history" h JOIN scoped s ON s."id" = h."applicationId"
      UNION
      SELECT h."applicationId", h."fromStatus"
      FROM "application_status_history" h JOIN scoped s ON s."id" = h."applicationId"
      UNION
      SELECT s."id", s."status" FROM scoped s
    )`;

    const stageRanks = Prisma.join(
      FUNNEL_STAGE_ORDER.map((stage, index) => Prisma.sql`(${stage}::text, ${index + 1}::int)`)
    );

    const [stageStats, dropOffs, stageDurations, timeToHire, sources, topOpenings] = await Promise.all([
      prisma.$queryRaw<StageStatRow[]>`
        WITH ${scoped}, ${reached},
        ranked AS (
          SELECT r."applicationId", r."stage", f."rank"
          FROM reached r
          JOIN (VALUES ${stageRanks}) AS f("stage", "rank") ON f."stage" = r."stage"
        ),
        furthest AS (
          SELECT "applicationId", MAX("rank") AS "maxRank" FROM ranked GROUP BY "applicationId"
        )
        SELECT k."stage" AS "stage",
               COUNT(*)::int AS "reached",
               (COUNT(*) FILTER (WHERE fu."maxRank" > k."rank"))::int AS "progressed",
               (COUNT(*) FILTER (WHERE s."status" = k."stage"))::int AS "current"
        FROM ranked k
        JOIN furthest fu ON fu."applicationId" = k."applicationId"
        JOIN scoped s ON s."id" = k."applicationId"
        GROUP BY k."stage"`,
      prisma.$queryRaw<DropOffRow[]>`
        WITH ${scoped}
        SELECT h."fromStatus" AS "stage", h."toStatus" AS "outcome",
               COUNT(DISTINCT h."applicationId")::int AS "count"
        FROM "application_status_history" h
        JOIN scoped s ON s."id" = h."applicationId"
        WHERE h."toStatus" IN ('REJECTED', 'WITHDRAWN')
        GROUP BY h."fromStatus", h."toStatus"`,
      prisma.$queryRaw<StageDurationRow[]>`
        WITH ${scoped},
        steps AS (
          SELECT h."toStatus" AS "stage", h."createdAt" AS "enteredAt",
                 LEAD(h."createdAt") OVER (
                   PARTITION BY h."applicationId" ORDER BY h."createdAt", h."id"
                 ) AS "leftAt"
          FROM "application_status_history" h
          JOIN scoped s ON s."id" = h."applicationId"
        )
        SELECT "stage",
               AVG(EXTRACT(EPOCH FROM ("leftAt" - "enteredAt")) / 86400.0)::float8 AS "averageDays",
               COUNT(*)::int AS "samples"
        FROM steps
        WHERE "leftAt" IS NOT NULL
        GROUP BY "stage"`,
      prisma.$queryRaw<TimeToHireRawRow[]>`
        WITH ${scoped},
        hires AS (
          SELECT s."openingType",
                 EXTRACT(EPOCH FROM (MIN(h."createdAt") - s."createdAt")) / 86400.0 AS "days"
          FROM scoped s
          JOIN "application_status_history" h
            ON h."applicationId" = s."id" AND h."toStatus" = 'HIRED'
          GROUP BY s."id", s."openingType", s."createdAt"
        )
        SELECT "openingType",
               COUNT(*)::int AS "hires",
               AVG("days")::float8 AS "averageDays",
               (PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY "days"))::float8 AS "medianDays"
        FROM hires
        GROUP BY ROLLUP ("openingType")`,
      prisma.$queryRaw<SourceRawRow[]>`
        WITH ${scoped}, ${reached},
        flags AS (
          SELECT s."id", COALESCE(s."source", ${UNKNOWN_SOURCE}) AS "source",
                 BOOL_OR(r."stage" IN (${Prisma.join(SHORTLISTED_OR_LATER)})) AS "shortlisted",
                 BOOL_OR(r."stage" = 'HIRED') AS "hired"
          FROM scoped s
          JOIN reached r ON r."applicationId" = s."id"
          GROUP BY s."id", s."source"
        )
        SELECT "source",
               COUNT(*)::int AS "applications",
               (COUNT(*) FILTER (WHERE "shortlisted"))::int AS "shortlisted",
               (COUNT(*) FILTER (WHERE "hired"))::int AS "hired"
        FROM flags
        GROUP BY "source"`,
      prisma.$queryRaw<TopOpeningRawRow[]>`
        WITH ${scoped}
        SELECT s."openingId", o."title", o."type"::text AS "type", o."department",
               COUNT(*)::int AS "applications",
               (COUNT(*) FILTER (WHERE s."status" = 'HIRED'))::int AS "hired"
        FROM scoped s
        JOIN "openings" o ON o."id" = s."openingId"
        GROUP BY s."openingId", o."title", o."type", o."department"
        ORDER BY "applications" DESC, o."title" ASC
        LIMIT ${TOP_OPENINGS_LIMIT}`,
    ]);

    return { stageStats, dropOffs, stageDurations, timeToHire, sources, topOpenings };
  }
}

/** Shown next to the date filters: the range is applied in the company's time zone. */
export const FUNNEL_TIME_ZONE_LABEL = BUSINESS_TIME_ZONE;

export const hiringFunnelService = new HiringFunnelService();
