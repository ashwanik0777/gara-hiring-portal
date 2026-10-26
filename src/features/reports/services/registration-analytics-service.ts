import { z } from "zod";
import { ApplicationStatus, Prisma, Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { assertPermission, hasPermission, type AuthenticatedUser } from "@/lib/auth/guards";
import { STAFF_ROLES } from "@/lib/auth/permissions";
import { ForbiddenError, ValidationError } from "@/lib/errors";
import { atBusinessTime, businessDateKey, BUSINESS_TIME_ZONE } from "@/lib/time/business-time";
import { determineLifecycleStage, STAGE_LABELS } from "@/features/lifecycle/capabilities";
import type { EmployeeStatus, EvaluationStatus } from "@/types/enums";
import type {
  RegistrantCsvExportResult,
  RegistrantListFilters,
  RegistrantListItem,
  RegistrantListPage,
  RegistrationAnalyticsReport,
  RegistrationBreakdownRow,
  RegistrationFilters,
  RegistrationInterest,
  RegistrationTrendPoint,
} from "../types";
import { escapeCsvCell, MAX_EXPORT_ROWS, toUtcTimestampLiteral } from "./report-service";
import { toPercent } from "./hiring-funnel-service";

/*
 * Registration analytics: how many people created a candidate account, split by what they
 * signed up for, separately from the applications they submitted.
 *
 * A "registration" is a user with a CandidateProfile and no staff role (ADMIN, HR,
 * MANAGER, INTERVIEWER, MENTOR); the sign-up moment is `User.createdAt`. "Applied" means
 * at least one application that is not a DRAFT. "Joined" means the person holds the
 * INTERN or EMPLOYEE role. Every figure is aggregated in PostgreSQL; the registrant list
 * (names and e-mails) is paginated and limited to ADMIN and HR with `canReports`.
 */

export const REGISTRATION_INTERESTS: readonly RegistrationInterest[] = ["JOB", "INTERNSHIP", "BOTH", "NOT_CHOSEN"];

export const REGISTRATION_INTEREST_LABELS: Record<RegistrationInterest | "ALL", string> = {
  ALL: "Everyone",
  JOB: "Job",
  INTERNSHIP: "Internship",
  BOTH: "Both",
  NOT_CHOSEN: "Not chosen",
};

/** Default range of the tab: the last 30 days including today (business time). */
export const REGISTRATION_DEFAULT_DAYS = 30;
/** Longest range accepted (keeps the daily series bounded). */
export const REGISTRATION_MAX_RANGE_DAYS = 366;
export const REGISTRATION_TREND_MONTHS = 12;
/** "New" registrations on the admin overview: today and the previous 6 days. */
export const REGISTRATION_RECENT_DAYS = 7;
export const REGISTRANT_DEFAULT_PAGE_SIZE = 25;
export const REGISTRANT_MAX_PAGE_SIZE = 50;
const MAX_PAGE_NUMBER = 100_000;

const NOT_CHOSEN = "NOT_CHOSEN";
const JOINED_ROLES: readonly Role[] = [Role.INTERN, Role.EMPLOYEE];
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// ─── Validation ─────────────────────────────────────────────────────────────────

/** True for a real calendar date in YYYY-MM-DD form (rejects values such as 2026-02-31). */
function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

const optionalCalendarDate = (label: string) =>
  z
    .string()
    .trim()
    .optional()
    .refine((value) => !value || isCalendarDate(value), `${label} must be a valid date (YYYY-MM-DD).`);

const yesNoFilter = (message: string) => z.enum(["", "yes", "no"], message).optional();

/** Filters of the registrations tab ("" = not set; an empty range means the last 30 days). */
export const RegistrationFilterSchema = z.object({
  startDate: optionalCalendarDate("Start date"),
  endDate: optionalCalendarDate("End date"),
  interest: z
    .enum(["", "JOB", "INTERNSHIP", "BOTH", "NOT_CHOSEN"], "Choose what people signed up for from the list.")
    .optional(),
});

/** Registrant list / CSV filters: the tab filters plus verified, applied, search and page. */
export const RegistrantListFilterSchema = RegistrationFilterSchema.extend({
  emailVerified: yesNoFilter("Choose an e-mail verification filter from the list."),
  applied: yesNoFilter("Choose an application filter from the list."),
  search: z.string().trim().max(100, "Search with at most 100 characters.").optional(),
  page: z
    .union([z.string(), z.number()])
    .optional()
    .refine(
      (value) => value === undefined || value === "" || /^\d{1,6}$/.test(String(value)),
      "Choose a valid page number."
    ),
  pageSize: z.number().int().optional(),
});

export type RegistrationFilterInput = z.input<typeof RegistrationFilterSchema>;
export type RegistrantListFilterInput = z.input<typeof RegistrantListFilterSchema>;

// ─── Date helpers (business time zone) ─────────────────────────────────────────

function addDaysToKey(dateKey: string, days: number): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

function daysBetweenKeys(fromKey: string, toKey: string): number {
  const from = Date.parse(`${fromKey}T00:00:00.000Z`);
  const to = Date.parse(`${toKey}T00:00:00.000Z`);
  return Math.round((to - from) / 86_400_000);
}

function dayLabel(dateKey: string): string {
  const [, month, day] = dateKey.split("-").map(Number);
  return `${MONTH_NAMES[month - 1]} ${day}`;
}

/** The last `count` month keys (YYYY-MM) ending with the month of `todayKey`, oldest first. */
function recentMonthKeys(todayKey: string, count: number): string[] {
  const [year, month] = todayKey.split("-").map(Number);
  const keys: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const first = new Date(Date.UTC(year, month - 1 - i, 1));
    keys.push(`${first.getUTCFullYear()}-${String(first.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return keys;
}

function monthLabel(monthKey: string): string {
  const [year, month] = monthKey.split("-").map(Number);
  return `${MONTH_NAMES[month - 1]} ${year}`;
}

interface ParsedWindow {
  filters: RegistrationFilters;
  start: Date;
  endExclusive: Date;
}

/**
 * Validates the tab filters. Missing dates default to the last 30 days ending today in the
 * business time zone; the range may not exceed REGISTRATION_MAX_RANGE_DAYS.
 */
export function parseRegistrationFilters(raw: RegistrationFilterInput | undefined, now = new Date()): ParsedWindow {
  const parsed = RegistrationFilterSchema.safeParse(raw ?? {});
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0]?.message ?? "Check the registration filters.");
  }
  return windowFromParsed(parsed.data, now);
}

function windowFromParsed(data: z.output<typeof RegistrationFilterSchema>, now: Date): ParsedWindow {
  const todayKey = businessDateKey(now);
  let startDate = data.startDate || null;
  let endDate = data.endDate || null;
  if (!startDate && !endDate) {
    endDate = todayKey;
    startDate = addDaysToKey(todayKey, -(REGISTRATION_DEFAULT_DAYS - 1));
  } else if (startDate && !endDate) {
    endDate = startDate > todayKey ? startDate : todayKey;
  } else if (!startDate && endDate) {
    startDate = addDaysToKey(endDate, -(REGISTRATION_DEFAULT_DAYS - 1));
  }
  // Both are set from here on.
  const start = startDate as string;
  const end = endDate as string;
  if (start > end) {
    throw new ValidationError("The start date must be on or before the end date.");
  }
  if (daysBetweenKeys(start, end) + 1 > REGISTRATION_MAX_RANGE_DAYS) {
    throw new ValidationError(`Choose a range of at most ${REGISTRATION_MAX_RANGE_DAYS} days.`);
  }
  const interest = data.interest ? (data.interest as RegistrationInterest) : null;
  return {
    filters: { startDate: start, endDate: end, interest },
    start: atBusinessTime(start, 0, 0),
    endExclusive: atBusinessTime(addDaysToKey(end, 1), 0, 0),
  };
}

function describePeriod(filters: RegistrationFilters): string {
  return filters.startDate === filters.endDate
    ? filters.startDate
    : `${filters.startDate} to ${filters.endDate}`;
}

// ─── Raw aggregate rows ─────────────────────────────────────────────────────────

export interface RegistrationSummaryRawRow {
  /** Interest bucket; null on the ROLLUP (everyone) row. */
  interest: string | null;
  registrations: number;
  verified: number;
  applied: number;
  joined: number;
  recent: number;
  medianDays: number | null;
}

export interface RegistrationBucketRawRow {
  bucket: string;
  interest: string;
  registrations: number;
}

// ─── Pure helpers (unit-tested on fixtures) ────────────────────────────────────

function isInterest(value: string | null): value is RegistrationInterest {
  return value !== null && (REGISTRATION_INTERESTS as readonly string[]).includes(value);
}

function roundDays(value: number | null | undefined): number | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  return Math.round(value * 10) / 10;
}

function emptyInterestCounts(): Record<RegistrationInterest, number> {
  return { JOB: 0, INTERNSHIP: 0, BOTH: 0, NOT_CHOSEN: 0 };
}

function breakdownRow(
  interest: RegistrationInterest | "ALL",
  counts: { registrations: number; verified: number; applied: number; joined: number },
  medianDays: number | null | undefined
): RegistrationBreakdownRow {
  return {
    interest,
    label: REGISTRATION_INTEREST_LABELS[interest],
    registrations: counts.registrations,
    emailVerified: counts.verified,
    emailNotVerified: Math.max(counts.registrations - counts.verified, 0),
    applied: counts.applied,
    notApplied: Math.max(counts.registrations - counts.applied, 0),
    conversionPct: toPercent(counts.applied, counts.registrations),
    medianDaysToFirstApplication: counts.applied > 0 ? roundDays(medianDays) : null,
    joined: counts.joined,
  };
}

/**
 * Turns the grouped summary rows into one row per interest bucket (always all four, in a
 * fixed order) plus the everyone row. Counts of the everyone row are the sum of the
 * buckets; its median comes from the ROLLUP row (medians cannot be summed).
 */
export function assembleRegistrationBreakdown(rows: RegistrationSummaryRawRow[]): {
  totals: RegistrationBreakdownRow;
  byInterest: RegistrationBreakdownRow[];
  recent: number;
} {
  const rollup = rows.find((row) => row.interest === null);
  const byInterest = REGISTRATION_INTERESTS.map((interest) => {
    const row = rows.find((candidate) => candidate.interest === interest);
    return breakdownRow(
      interest,
      {
        registrations: row?.registrations ?? 0,
        verified: row?.verified ?? 0,
        applied: row?.applied ?? 0,
        joined: row?.joined ?? 0,
      },
      row?.medianDays
    );
  });
  const bucketRows = rows.filter((row) => isInterest(row.interest));
  const sum = (key: "registrations" | "verified" | "applied" | "joined" | "recent") =>
    bucketRows.reduce((total, row) => total + row[key], 0);
  return {
    totals: breakdownRow(
      "ALL",
      { registrations: sum("registrations"), verified: sum("verified"), applied: sum("applied"), joined: sum("joined") },
      rollup?.medianDays
    ),
    byInterest,
    recent: sum("recent"),
  };
}

/** Zero-filled trend points for the given bucket keys (zero is a real count here). */
export function assembleRegistrationTrend(
  keys: string[],
  rows: RegistrationBucketRawRow[],
  label: (key: string) => string
): RegistrationTrendPoint[] {
  const points = new Map<string, RegistrationTrendPoint>(
    keys.map((key) => [key, { key, label: label(key), total: 0, byInterest: emptyInterestCounts() }])
  );
  for (const row of rows) {
    const point = points.get(row.bucket);
    if (!point || !isInterest(row.interest)) continue;
    point.byInterest[row.interest] += row.registrations;
    point.total += row.registrations;
  }
  return keys.map((key) => points.get(key) as RegistrationTrendPoint);
}

function yesNo(value: string | undefined): boolean | null {
  if (value === "yes") return true;
  if (value === "no") return false;
  return null;
}

// ─── Registrant list (Prisma, bounded) ─────────────────────────────────────────

const NON_DRAFT_APPLICATION: Prisma.ApplicationWhereInput = { status: { not: ApplicationStatus.DRAFT } };

const registrantSelect = {
  id: true,
  careerInterest: true,
  user: {
    select: {
      name: true,
      email: true,
      emailVerified: true,
      createdAt: true,
      roles: { select: { role: true } },
      employeeProfile: { select: { status: true } },
      // Same facts as the lifecycle resolver: the latest enrollment and its application.
      evaluationsAsIntern: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { status: true, application: { select: { status: true } } },
      },
    },
  },
  _count: { select: { applications: { where: NON_DRAFT_APPLICATION } } },
} satisfies Prisma.CandidateProfileSelect;

type RegistrantRow = Prisma.CandidateProfileGetPayload<{ select: typeof registrantSelect }>;

/** Where clause shared by the list, its count and the CSV export. */
export function registrantWhere(
  filters: RegistrantListFilters,
  start: Date,
  endExclusive: Date
): Prisma.CandidateProfileWhereInput {
  const userWhere: Prisma.UserWhereInput = {
    roles: { none: { role: { in: STAFF_ROLES } } },
    createdAt: { gte: start, lt: endExclusive },
    ...(filters.emailVerified !== null ? { emailVerified: filters.emailVerified } : {}),
    ...(filters.search
      ? {
          OR: [
            { name: { contains: filters.search, mode: "insensitive" } },
            { email: { contains: filters.search, mode: "insensitive" } },
          ],
        }
      : {}),
  };
  return {
    user: userWhere,
    ...(filters.interest === NOT_CHOSEN
      ? { careerInterest: null }
      : filters.interest
        ? { careerInterest: filters.interest }
        : {}),
    ...(filters.applied === true
      ? { applications: { some: NON_DRAFT_APPLICATION } }
      : filters.applied === false
        ? { applications: { none: NON_DRAFT_APPLICATION } }
        : {}),
  };
}

function toRegistrantItem(row: RegistrantRow): RegistrantListItem {
  const latestEnrollment = row.user.evaluationsAsIntern[0];
  // An enrollment whose application already led to joining (HIRED) is history.
  const enrollmentStatus =
    latestEnrollment && latestEnrollment.application.status !== ApplicationStatus.HIRED
      ? (latestEnrollment.status as EvaluationStatus)
      : null;
  const stage = determineLifecycleStage({
    roles: row.user.roles.map((entry) => entry.role),
    enrollmentStatus,
    employeeStatus: (row.user.employeeProfile?.status as EmployeeStatus | undefined) ?? null,
  });
  return {
    id: row.id,
    name: row.user.name,
    email: row.user.email,
    interest: row.careerInterest ?? NOT_CHOSEN,
    signedUpAt: row.user.createdAt,
    signedUpDate: businessDateKey(row.user.createdAt),
    emailVerified: row.user.emailVerified,
    applicationCount: row._count.applications,
    stage,
    stageLabel: STAGE_LABELS[stage],
  };
}

/** CSV of registrant rows; every cell goes through `escapeCsvCell` (formula-injection guard). */
export function buildRegistrantCsv(items: RegistrantListItem[]): string {
  const header = ["Name", "Email", "Signed up for", "Signed up", "Email verified", "Applications", "Current stage"];
  const lines = [
    header.join(","),
    ...items.map((item) =>
      [
        item.name,
        item.email,
        REGISTRATION_INTEREST_LABELS[item.interest],
        item.signedUpDate,
        item.emailVerified ? "Yes" : "No",
        item.applicationCount,
        item.stageLabel,
      ]
        .map((cell) => escapeCsvCell(cell))
        .join(",")
    ),
  ];
  return lines.join("\n");
}

function clampPageSize(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) return REGISTRANT_DEFAULT_PAGE_SIZE;
  return Math.min(REGISTRANT_MAX_PAGE_SIZE, Math.max(1, Math.trunc(value)));
}

// ─── Service ──────────────────────────────────────────────────────────────────────

export class RegistrationAnalyticsService {
  /** Counts: staff with `canReports` (ADMIN always passes). */
  private async assertCountsAccess(user: AuthenticatedUser): Promise<void> {
    await assertPermission(user, "canReports");
  }

  /** Names and e-mails: ADMIN, or HR holding `canReports`. Other report viewers see counts only. */
  async canViewRegistrants(user: AuthenticatedUser): Promise<boolean> {
    if (user.roles.includes(Role.ADMIN)) return true;
    return user.roles.includes(Role.HR) && (await hasPermission(user, "canReports"));
  }

  private async assertRegistrantAccess(user: AuthenticatedUser): Promise<void> {
    await this.assertCountsAccess(user);
    if (!(await this.canViewRegistrants(user))) {
      throw new ForbiddenError("The registrant list is available to administrators and HR with the reports permission.");
    }
  }

  /** Registration analytics for the reports tab. */
  async getRegistrationAnalytics(
    user: AuthenticatedUser,
    rawFilters: RegistrationFilterInput = {},
    now = new Date()
  ): Promise<RegistrationAnalyticsReport> {
    await this.assertCountsAccess(user);
    const { filters, start, endExclusive } = parseRegistrationFilters(rawFilters, now);

    const todayKey = businessDateKey(now);
    const monthKeys = recentMonthKeys(todayKey, REGISTRATION_TREND_MONTHS);
    const monthsStart = atBusinessTime(`${monthKeys[0]}-01`, 0, 0);
    const recentSince = atBusinessTime(addDaysToKey(todayKey, -(REGISTRATION_RECENT_DAYS - 1)), 0, 0);
    const dayCount = daysBetweenKeys(filters.startDate, filters.endDate) + 1;
    const dayKeys = Array.from({ length: dayCount }, (_, index) => addDaysToKey(filters.startDate, index));

    const [summaryRows, dailyRows, monthlyRows, allTimeRows, canViewRegistrants] = await Promise.all([
      this.loadSummary(filters.interest, { start, endExclusive }, recentSince),
      this.loadBuckets("day", filters.interest, { start, endExclusive }),
      this.loadBuckets("month", filters.interest, { start: monthsStart, endExclusive: null }),
      this.loadTotal(filters.interest),
      this.canViewRegistrants(user),
    ]);

    const { totals, byInterest } = assembleRegistrationBreakdown(summaryRows);
    return {
      generatedAt: now,
      filters,
      periodLabel: describePeriod(filters),
      timeZone: BUSINESS_TIME_ZONE,
      allTimeRegistrations: allTimeRows[0]?.total ?? 0,
      totals,
      byInterest: filters.interest ? byInterest.filter((row) => row.interest === filters.interest) : byInterest,
      daily: assembleRegistrationTrend(dayKeys, dailyRows, dayLabel),
      monthly: assembleRegistrationTrend(monthKeys, monthlyRows, monthLabel),
      canViewRegistrants,
    };
  }

  /**
   * All-time figures for the admin overview card: total, per interest, not applied yet and
   * new in the last 7 days (today and the 6 days before, business time).
   */
  async getRegistrationSummary(
    user: AuthenticatedUser,
    now = new Date()
  ): Promise<{
    total: number;
    byInterest: Record<RegistrationInterest, number>;
    notApplied: number;
    newLastSevenDays: number;
  }> {
    await this.assertCountsAccess(user);
    const recentSince = atBusinessTime(
      addDaysToKey(businessDateKey(now), -(REGISTRATION_RECENT_DAYS - 1)),
      0,
      0
    );
    const rows = await this.loadSummary(null, null, recentSince);
    const { totals, byInterest, recent } = assembleRegistrationBreakdown(rows);
    const counts = emptyInterestCounts();
    for (const row of byInterest) {
      if (row.interest !== "ALL") counts[row.interest] = row.registrations;
    }
    return { total: totals.registrations, byInterest: counts, notApplied: totals.notApplied, newLastSevenDays: recent };
  }

  /** Parses the list filters (validation errors surface as ValidationError). */
  parseListFilters(
    raw: RegistrantListFilterInput | undefined,
    now = new Date()
  ): { filters: RegistrantListFilters; start: Date; endExclusive: Date; page: number; pageSize: number } {
    const parsed = RegistrantListFilterSchema.safeParse(raw ?? {});
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues[0]?.message ?? "Check the registrant filters.");
    }
    const { filters, start, endExclusive } = windowFromParsed(parsed.data, now);
    const pageNumber = parsed.data.page === undefined || parsed.data.page === "" ? 1 : Number(parsed.data.page);
    return {
      filters: {
        ...filters,
        emailVerified: yesNo(parsed.data.emailVerified),
        applied: yesNo(parsed.data.applied),
        search: parsed.data.search ? parsed.data.search : null,
      },
      start,
      endExclusive,
      page: Math.min(MAX_PAGE_NUMBER, Math.max(1, Math.trunc(pageNumber) || 1)),
      pageSize: clampPageSize(parsed.data.pageSize),
    };
  }

  /** One page (≤ 50) of registrants, newest first, with the total in the same round trip. */
  async listRegistrants(
    user: AuthenticatedUser,
    rawFilters: RegistrantListFilterInput = {},
    now = new Date()
  ): Promise<RegistrantListPage> {
    await this.assertRegistrantAccess(user);
    const { filters, start, endExclusive, page, pageSize } = this.parseListFilters(rawFilters, now);
    const where = registrantWhere(filters, start, endExclusive);

    const [rows, total] = await Promise.all([
      prisma.candidateProfile.findMany({
        where,
        select: registrantSelect,
        orderBy: [{ user: { createdAt: "desc" } }, { id: "asc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.candidateProfile.count({ where }),
    ]);

    return {
      items: rows.map(toRegistrantItem),
      total,
      page,
      pageSize,
      pageCount: Math.max(1, Math.ceil(total / pageSize)),
      filters,
    };
  }

  /**
   * CSV of the registrants matching the filters (names and e-mails, so ADMIN / HR with
   * canReports only). Capped at MAX_EXPORT_ROWS like the other exports and recorded in the
   * audit log as EXPORT_REPORT / REGISTRATIONS.
   */
  async exportRegistrantsCsv(
    user: AuthenticatedUser,
    rawFilters: RegistrantListFilterInput = {},
    now = new Date()
  ): Promise<RegistrantCsvExportResult> {
    await this.assertRegistrantAccess(user);
    const { filters, start, endExclusive } = this.parseListFilters(rawFilters, now);

    const rows = await prisma.candidateProfile.findMany({
      where: registrantWhere(filters, start, endExclusive),
      select: registrantSelect,
      orderBy: [{ user: { createdAt: "desc" } }, { id: "asc" }],
      // One row more than the limit tells us whether the export was cut off.
      take: MAX_EXPORT_ROWS + 1,
    });
    const truncated = rows.length > MAX_EXPORT_ROWS;
    const items = rows.slice(0, MAX_EXPORT_ROWS).map(toRegistrantItem);
    const csvContent = buildRegistrantCsv(items);

    await prisma.auditLog.create({
      data: {
        actorId: user.id,
        actorRole: user.roles.join(","),
        action: "EXPORT_REPORT",
        resourceType: "Report",
        resourceId: "REGISTRATIONS",
        diffPayload: {
          reportType: "REGISTRATIONS",
          rowCount: items.length,
          truncated,
          filters: {
            startDate: filters.startDate,
            endDate: filters.endDate,
            interest: filters.interest,
            emailVerified: filters.emailVerified,
            applied: filters.applied,
            // The search text may be part of a name or e-mail address; only its presence is logged.
            search: filters.search ? "set" : null,
          },
        },
      },
    });

    return {
      fileName: `gara-registrations-${businessDateKey(now)}.csv`,
      csvContent,
      rowCount: items.length,
      truncated,
      generatedAt: now,
    };
  }

  // ─── Aggregate queries (bound parameters only) ───────────────────────────────

  /** Conditions on `cp` (candidate_profiles) and `u` (users) shared by every aggregate. */
  private registrantConditions(
    interest: RegistrationInterest | null,
    window: { start: Date; endExclusive: Date | null } | null
  ): Prisma.Sql {
    const conditions: Prisma.Sql[] = [
      Prisma.sql`NOT EXISTS (
        SELECT 1 FROM "user_roles" sr
        WHERE sr."userId" = u."id" AND sr."role"::text IN (${Prisma.join(STAFF_ROLES)})
      )`,
    ];
    if (window) {
      conditions.push(Prisma.sql`u."createdAt" >= ${toUtcTimestampLiteral(window.start)}::timestamp`);
      if (window.endExclusive) {
        conditions.push(Prisma.sql`u."createdAt" < ${toUtcTimestampLiteral(window.endExclusive)}::timestamp`);
      }
    }
    if (interest === NOT_CHOSEN) {
      conditions.push(Prisma.sql`cp."careerInterest" IS NULL`);
    } else if (interest) {
      conditions.push(Prisma.sql`cp."careerInterest"::text = ${interest}`);
    }
    return Prisma.join(conditions, " AND ");
  }

  /**
   * One grouped row per interest bucket plus the ROLLUP row: registrations, verified,
   * applied (a non-draft application exists), joined (INTERN/EMPLOYEE role), sign-ups
   * since `recentSince`, and the median days from sign-up to the first application.
   */
  private loadSummary(
    interest: RegistrationInterest | null,
    window: { start: Date; endExclusive: Date } | null,
    recentSince: Date
  ): Promise<RegistrationSummaryRawRow[]> {
    return prisma.$queryRaw<RegistrationSummaryRawRow[]>`
      WITH reg AS (
        SELECT cp."id" AS "profileId", u."createdAt", u."emailVerified",
               COALESCE(cp."careerInterest"::text, ${NOT_CHOSEN}) AS "interest",
               EXISTS (
                 SELECT 1 FROM "user_roles" jr
                 WHERE jr."userId" = u."id" AND jr."role"::text IN (${Prisma.join(JOINED_ROLES)})
               ) AS "joined"
        FROM "candidate_profiles" cp
        JOIN "users" u ON u."id" = cp."userId"
        WHERE ${this.registrantConditions(interest, window)}
      ),
      first_application AS (
        SELECT a."candidateId", MIN(a."createdAt") AS "firstAt"
        FROM "applications" a
        JOIN reg r ON r."profileId" = a."candidateId"
        WHERE a."status"::text <> 'DRAFT'
        GROUP BY a."candidateId"
      )
      SELECT r."interest" AS "interest",
             COUNT(*)::int AS "registrations",
             (COUNT(*) FILTER (WHERE r."emailVerified"))::int AS "verified",
             COUNT(f."candidateId")::int AS "applied",
             (COUNT(*) FILTER (WHERE r."joined"))::int AS "joined",
             (COUNT(*) FILTER (WHERE r."createdAt" >= ${toUtcTimestampLiteral(recentSince)}::timestamp))::int AS "recent",
             (PERCENTILE_CONT(0.5) WITHIN GROUP (
               ORDER BY EXTRACT(EPOCH FROM (f."firstAt" - r."createdAt")) / 86400.0
             ))::float8 AS "medianDays"
      FROM reg r
      LEFT JOIN first_application f ON f."candidateId" = r."profileId"
      GROUP BY ROLLUP (r."interest")`;
  }

  /** Sign-ups per business-time day or month and interest bucket inside the window. */
  private loadBuckets(
    granularity: "day" | "month",
    interest: RegistrationInterest | null,
    window: { start: Date; endExclusive: Date | null }
  ): Promise<RegistrationBucketRawRow[]> {
    const format = granularity === "day" ? "YYYY-MM-DD" : "YYYY-MM";
    return prisma.$queryRaw<RegistrationBucketRawRow[]>`
      SELECT to_char(timezone(${BUSINESS_TIME_ZONE}::text, u."createdAt" AT TIME ZONE 'UTC'), ${format}::text) AS "bucket",
             COALESCE(cp."careerInterest"::text, ${NOT_CHOSEN}) AS "interest",
             COUNT(*)::int AS "registrations"
      FROM "candidate_profiles" cp
      JOIN "users" u ON u."id" = cp."userId"
      WHERE ${this.registrantConditions(interest, window)}
      GROUP BY 1, 2`;
  }

  /** Registrants ever (interest filter applied). */
  private loadTotal(interest: RegistrationInterest | null): Promise<Array<{ total: number }>> {
    return prisma.$queryRaw<Array<{ total: number }>>`
      SELECT COUNT(*)::int AS "total"
      FROM "candidate_profiles" cp
      JOIN "users" u ON u."id" = cp."userId"
      WHERE ${this.registrantConditions(interest, null)}`;
  }
}

export const registrationAnalyticsService = new RegistrationAnalyticsService();
