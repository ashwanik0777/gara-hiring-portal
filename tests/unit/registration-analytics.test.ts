import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma, Role } from "@prisma/client";
import type { AuthenticatedUser } from "@/lib/auth/guards";

/*
 * Round 6: registration analytics (candidate sign-ups, separate from applications).
 * Pins (1) that staff accounts are never counted, (2) the interest buckets including
 * "not chosen", (3) the verified / applied splits and conversion maths, (4) canReports
 * gating with names and e-mails limited to ADMIN and HR, (5) bounded pagination, (6) the
 * audited, injection-guarded CSV export and (7) the admin card's honest "unavailable".
 */

const { db, state } = vi.hoisted(() => ({
  state: {
    session: null as null | { user: { id: string; email: string; name: string } },
    roles: {} as Record<string, string[]>,
  },
  db: {
    $queryRaw: vi.fn(),
    candidateProfile: { findMany: vi.fn(), count: vi.fn() },
    auditLog: { create: vi.fn() },
    subAdminPermission: { findUnique: vi.fn() },
    user: { findUnique: vi.fn() },
  },
}));

vi.mock("@/lib/db", () => ({ prisma: db }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("@/lib/auth/auth", () => ({
  auth: { api: { getSession: vi.fn(async () => state.session) } },
}));

import { STAFF_ROLES } from "@/lib/auth/permissions";
import { ForbiddenError, ValidationError } from "@/lib/errors";
import { BUSINESS_TIME_ZONE, businessDateKey } from "@/lib/time/business-time";
import { MAX_EXPORT_ROWS } from "@/features/reports/services/report-service";
import {
  assembleRegistrationBreakdown,
  assembleRegistrationTrend,
  buildRegistrantCsv,
  parseRegistrationFilters,
  registrationAnalyticsService,
  REGISTRANT_MAX_PAGE_SIZE,
  REGISTRATION_DEFAULT_DAYS,
  type RegistrationSummaryRawRow,
} from "@/features/reports/services/registration-analytics-service";
import { exportRegistrantsCsvAction } from "@/features/reports/registration-actions";
import { getRegistrationOverview, UNAVAILABLE } from "@/features/analytics/services/admin-overview-service";
import type { RegistrantListItem } from "@/features/reports/types";

const admin: AuthenticatedUser = { id: "admin-1", name: "Admin", email: "admin@gara.test", roles: [Role.ADMIN] };
const hr: AuthenticatedUser = { id: "hr-1", name: "Meera HR", email: "hr@gara.test", roles: [Role.HR] };
const manager: AuthenticatedUser = { id: "mgr-1", name: "Vikram", email: "mgr@gara.test", roles: [Role.MANAGER] };
const interviewer: AuthenticatedUser = { id: "int-1", name: "Ira", email: "int@gara.test", roles: [Role.INTERVIEWER] };
const candidate: AuthenticatedUser = { id: "cand-1", name: "Cara", email: "cand@gara.test", roles: [Role.CANDIDATE] };
const intern: AuthenticatedUser = { id: "intern-1", name: "Ivan", email: "intern@gara.test", roles: [Role.INTERN] };

/** Fixed "now": 2026-10-26 12:00 in Asia/Kolkata. */
const NOW = new Date("2026-10-26T06:30:00.000Z");

/** Rebuilds the SQL of a `$queryRaw` tagged-template call. */
function sqlOfCall(call: unknown[]): Prisma.Sql {
  const [strings, ...values] = call as [TemplateStringsArray, ...unknown[]];
  return Prisma.sql(strings, ...values);
}

function summaryRow(
  interest: string | null,
  values: Partial<Omit<RegistrationSummaryRawRow, "interest">> = {}
): RegistrationSummaryRawRow {
  return { interest, registrations: 0, verified: 0, applied: 0, joined: 0, recent: 0, medianDays: null, ...values };
}

/** A healthy database: summary rows, then day/month buckets and the all-time total. */
function mockAggregates() {
  db.$queryRaw.mockImplementation(async (strings: TemplateStringsArray) => {
    const text = strings.join("?");
    if (text.includes("PERCENTILE_CONT")) {
      return [
        summaryRow("JOB", { registrations: 4, verified: 3, applied: 2, joined: 1, recent: 2, medianDays: 1.26 }),
        summaryRow("INTERNSHIP", { registrations: 5, verified: 5, applied: 1, joined: 0, recent: 1, medianDays: 3 }),
        summaryRow("NOT_CHOSEN", { registrations: 1, verified: 0, applied: 0, recent: 1 }),
        summaryRow(null, { registrations: 10, verified: 8, applied: 3, joined: 1, recent: 4, medianDays: 2.04 }),
      ];
    }
    if (text.includes("to_char")) {
      return [
        { bucket: "2026-10-25", interest: "JOB", registrations: 2 },
        { bucket: "2026-10-25", interest: "NOT_CHOSEN", registrations: 1 },
        { bucket: "2026-10", interest: "INTERNSHIP", registrations: 3 },
        // Outside every requested bucket: ignored.
        { bucket: "1999-01-01", interest: "JOB", registrations: 9 },
      ];
    }
    return [{ total: 42 }];
  });
}

function registrantRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "profile-1",
    careerInterest: "INTERNSHIP",
    user: {
      name: "Asha Rao",
      email: "asha@example.com",
      emailVerified: true,
      createdAt: new Date("2026-10-20T20:00:00.000Z"), // 2026-10-21 in Asia/Kolkata
      roles: [{ role: "CANDIDATE" }],
      employeeProfile: null,
      evaluationsAsIntern: [],
    },
    _count: { applications: 2 },
    ...overrides,
  };
}

function signInAs(user: AuthenticatedUser) {
  state.session = { user: { id: user.id, email: user.email, name: user.name } };
  state.roles[user.id] = user.roles;
}

beforeEach(() => {
  vi.resetAllMocks();
  state.session = null;
  state.roles = {};
  db.subAdminPermission.findUnique.mockResolvedValue(null);
  db.user.findUnique.mockImplementation(async (args: { where: { id: string } }) => {
    const roles = state.roles[args.where.id];
    return roles ? { mustChangePassword: false, roles: roles.map((role) => ({ role })) } : null;
  });
  db.candidateProfile.findMany.mockResolvedValue([]);
  db.candidateProfile.count.mockResolvedValue(0);
  db.auditLog.create.mockResolvedValue({ id: "audit-1" });
});

describe("Registration figures are aggregated in PostgreSQL without staff accounts", () => {
  it("excludes every staff role and counts only non-draft applications as applied", async () => {
    mockAggregates();
    await registrationAnalyticsService.getRegistrationAnalytics(admin, {}, NOW);

    expect(db.$queryRaw).toHaveBeenCalledTimes(4);
    for (const call of db.$queryRaw.mock.calls) {
      const sql = sqlOfCall(call);
      expect(sql.sql).toContain('NOT EXISTS');
      expect(sql.sql).toContain('"user_roles"');
      for (const role of STAFF_ROLES) {
        expect(sql.values).toContain(role);
      }
    }
    const summary = sqlOfCall(db.$queryRaw.mock.calls.find((call) => sqlOfCall(call).sql.includes("PERCENTILE_CONT"))!);
    expect(summary.sql).toContain(`a."status"::text <> 'DRAFT'`);
    expect(summary.sql).toContain("GROUP BY ROLLUP");
    expect(summary.values).toEqual(expect.arrayContaining([Role.INTERN, Role.EMPLOYEE, "NOT_CHOSEN"]));
    // No candidate rows are read for the figures.
    expect(db.candidateProfile.findMany).not.toHaveBeenCalled();
  });

  it("buckets days and months in the business time zone with bound parameters only", async () => {
    mockAggregates();
    await registrationAnalyticsService.getRegistrationAnalytics(admin, {}, NOW);
    const bucketCalls = db.$queryRaw.mock.calls.map(sqlOfCall).filter((sql) => sql.sql.includes("to_char"));
    expect(bucketCalls).toHaveLength(2);
    for (const sql of bucketCalls) {
      expect(sql.sql).toContain("timezone(");
      expect(sql.values).toContain(BUSINESS_TIME_ZONE);
    }
    expect(bucketCalls.map((sql) => sql.values).flat()).toEqual(expect.arrayContaining(["YYYY-MM-DD", "YYYY-MM"]));
  });

  it("maps the interest buckets (including not chosen), the splits and the conversion", async () => {
    mockAggregates();
    const report = await registrationAnalyticsService.getRegistrationAnalytics(admin, {}, NOW);

    expect(report.byInterest.map((row) => row.interest)).toEqual(["JOB", "INTERNSHIP", "BOTH", "NOT_CHOSEN"]);
    const job = report.byInterest[0];
    expect(job).toMatchObject({
      label: "Job",
      registrations: 4,
      emailVerified: 3,
      emailNotVerified: 1,
      applied: 2,
      notApplied: 2,
      conversionPct: 50,
      medianDaysToFirstApplication: 1.3,
      joined: 1,
    });
    // A bucket with nobody in it is a real zero, and its rates are honest nulls.
    expect(report.byInterest[2]).toMatchObject({ registrations: 0, conversionPct: null, medianDaysToFirstApplication: null });
    expect(report.byInterest[3]).toMatchObject({ label: "Not chosen", registrations: 1, notApplied: 1, conversionPct: 0 });
    // Totals are the sum of the buckets; the median comes from the ROLLUP row.
    expect(report.totals).toMatchObject({
      interest: "ALL",
      registrations: 10,
      emailVerified: 8,
      emailNotVerified: 2,
      applied: 3,
      notApplied: 7,
      conversionPct: 30,
      medianDaysToFirstApplication: 2,
      joined: 1,
    });
    expect(report.allTimeRegistrations).toBe(42);
  });

  it("defaults to the last 30 business days and zero-fills the daily and monthly series", async () => {
    mockAggregates();
    const report = await registrationAnalyticsService.getRegistrationAnalytics(admin, {}, NOW);
    const todayKey = businessDateKey(NOW);

    expect(report.filters.endDate).toBe(todayKey);
    expect(report.daily).toHaveLength(REGISTRATION_DEFAULT_DAYS);
    expect(report.daily[0].key).toBe(report.filters.startDate);
    expect(report.daily.at(-1)?.key).toBe(todayKey);
    const oct25 = report.daily.find((point) => point.key === "2026-10-25");
    expect(oct25).toMatchObject({ total: 3, byInterest: { JOB: 2, INTERNSHIP: 0, BOTH: 0, NOT_CHOSEN: 1 } });
    expect(report.daily.reduce((sum, point) => sum + point.total, 0)).toBe(3);

    expect(report.monthly).toHaveLength(12);
    expect(report.monthly.at(-1)).toMatchObject({ key: "2026-10", label: "Oct 2026", total: 3 });
    expect(report.monthly[0].key).toBe("2025-11");
  });

  it("filters one interest bucket, with not chosen meaning a missing interest", async () => {
    mockAggregates();
    const report = await registrationAnalyticsService.getRegistrationAnalytics(admin, { interest: "NOT_CHOSEN" }, NOW);
    expect(report.byInterest.map((row) => row.interest)).toEqual(["NOT_CHOSEN"]);
    for (const call of db.$queryRaw.mock.calls) {
      expect(sqlOfCall(call).sql).toContain(`cp."careerInterest" IS NULL`);
    }
  });

  it("rejects invalid, reversed and over-long ranges before querying", async () => {
    await expect(
      registrationAnalyticsService.getRegistrationAnalytics(admin, { startDate: "2026-02-31" }, NOW)
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      registrationAnalyticsService.getRegistrationAnalytics(admin, { startDate: "2026-10-10", endDate: "2026-10-01" }, NOW)
    ).rejects.toThrow(/on or before/);
    await expect(
      registrationAnalyticsService.getRegistrationAnalytics(admin, { startDate: "2024-01-01", endDate: "2026-01-01" }, NOW)
    ).rejects.toThrow(/at most 366 days/);
    await expect(
      registrationAnalyticsService.getRegistrationAnalytics(admin, { interest: "STAFF" as never }, NOW)
    ).rejects.toBeInstanceOf(ValidationError);
    expect(db.$queryRaw).not.toHaveBeenCalled();
  });

  it("interprets the range as whole business days", () => {
    const { start, endExclusive } = parseRegistrationFilters({ startDate: "2026-10-01", endDate: "2026-10-01" }, NOW);
    // Midnight in Asia/Kolkata is 18:30 UTC the day before.
    expect(start.toISOString()).toBe("2026-09-30T18:30:00.000Z");
    expect(endExclusive.toISOString()).toBe("2026-10-01T18:30:00.000Z");
  });
});

describe("Pure registration helpers", () => {
  it("keeps the overall median null and the rates null when nobody registered", () => {
    const { totals, byInterest, recent } = assembleRegistrationBreakdown([summaryRow(null)]);
    expect(totals).toMatchObject({ registrations: 0, conversionPct: null, medianDaysToFirstApplication: null });
    expect(byInterest).toHaveLength(4);
    expect(recent).toBe(0);
  });

  it("ignores unknown interest codes in the trend rows", () => {
    const points = assembleRegistrationTrend(
      ["2026-10-01"],
      [
        { bucket: "2026-10-01", interest: "BOTH", registrations: 2 },
        { bucket: "2026-10-01", interest: "SOMETHING_ELSE", registrations: 7 },
      ],
      (key) => key
    );
    expect(points).toEqual([
      { key: "2026-10-01", label: "2026-10-01", total: 2, byInterest: { JOB: 0, INTERNSHIP: 0, BOTH: 2, NOT_CHOSEN: 0 } },
    ]);
  });
});

describe("Registration analytics access (canReports; names and e-mails for ADMIN / HR only)", () => {
  it("refuses people without canReports before any query", async () => {
    for (const user of [candidate, intern, interviewer]) {
      await expect(registrationAnalyticsService.getRegistrationAnalytics(user, {}, NOW)).rejects.toBeInstanceOf(
        ForbiddenError
      );
      await expect(registrationAnalyticsService.getRegistrationSummary(user, NOW)).rejects.toBeInstanceOf(ForbiddenError);
    }
    db.subAdminPermission.findUnique.mockResolvedValue({ userId: hr.id, canReports: false });
    await expect(registrationAnalyticsService.getRegistrationAnalytics(hr, {}, NOW)).rejects.toBeInstanceOf(ForbiddenError);
    expect(db.$queryRaw).not.toHaveBeenCalled();
  });

  it("shows a MANAGER with canReports the counts but never the registrant list or CSV", async () => {
    mockAggregates();
    const report = await registrationAnalyticsService.getRegistrationAnalytics(manager, {}, NOW);
    expect(report.canViewRegistrants).toBe(false);
    expect(report.totals.registrations).toBe(10);

    await expect(registrationAnalyticsService.listRegistrants(manager, {}, NOW)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(registrationAnalyticsService.exportRegistrantsCsv(manager, {}, NOW)).rejects.toBeInstanceOf(
      ForbiddenError
    );
    expect(db.candidateProfile.findMany).not.toHaveBeenCalled();
    expect(db.auditLog.create).not.toHaveBeenCalled();
  });

  it("lets ADMIN and HR with canReports open the list; HR without canReports is refused", async () => {
    mockAggregates();
    expect((await registrationAnalyticsService.getRegistrationAnalytics(admin, {}, NOW)).canViewRegistrants).toBe(true);
    expect((await registrationAnalyticsService.getRegistrationAnalytics(hr, {}, NOW)).canViewRegistrants).toBe(true);
    await expect(registrationAnalyticsService.listRegistrants(hr, {}, NOW)).resolves.toMatchObject({ total: 0 });

    db.subAdminPermission.findUnique.mockResolvedValue({ userId: hr.id, canReports: false });
    await expect(registrationAnalyticsService.listRegistrants(hr, {}, NOW)).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("Registrant list is one bounded page", () => {
  it("pages with skip/take (at most 50), counts with the same where and never includes staff", async () => {
    db.candidateProfile.findMany.mockResolvedValue([registrantRow()]);
    db.candidateProfile.count.mockResolvedValue(120);

    const page = await registrationAnalyticsService.listRegistrants(
      admin,
      { page: "3", pageSize: 500, interest: "INTERNSHIP", emailVerified: "yes", applied: "no", search: "  asha " },
      NOW
    );

    const args = db.candidateProfile.findMany.mock.calls[0][0];
    expect(args.take).toBe(REGISTRANT_MAX_PAGE_SIZE);
    expect(args.skip).toBe(2 * REGISTRANT_MAX_PAGE_SIZE);
    expect(args).not.toHaveProperty("include");
    expect(args.where.user.roles).toEqual({ none: { role: { in: STAFF_ROLES } } });
    expect(args.where.user.emailVerified).toBe(true);
    expect(args.where.user.OR).toEqual([
      { name: { contains: "asha", mode: "insensitive" } },
      { email: { contains: "asha", mode: "insensitive" } },
    ]);
    expect(args.where.careerInterest).toBe("INTERNSHIP");
    expect(args.where.applications).toEqual({ none: { status: { not: "DRAFT" } } });
    expect(args.orderBy).toEqual([{ user: { createdAt: "desc" } }, { id: "asc" }]);
    expect(db.candidateProfile.count).toHaveBeenCalledWith({ where: args.where });

    expect(page).toMatchObject({ total: 120, page: 3, pageSize: 50, pageCount: 3 });
    expect(page.items[0]).toMatchObject({
      name: "Asha Rao",
      email: "asha@example.com",
      interest: "INTERNSHIP",
      signedUpDate: "2026-10-21",
      emailVerified: true,
      applicationCount: 2,
      stage: "CANDIDATE",
      stageLabel: "Candidate",
    });
  });

  it("never goes below page 1, defaults to 25 rows and rejects a malformed page", async () => {
    await registrationAnalyticsService.listRegistrants(admin, { page: "0" }, NOW);
    expect(db.candidateProfile.findMany.mock.calls[0][0]).toMatchObject({ skip: 0, take: 25 });

    await expect(registrationAnalyticsService.listRegistrants(admin, { page: "-2" }, NOW)).rejects.toBeInstanceOf(
      ValidationError
    );
    await expect(
      registrationAnalyticsService.listRegistrants(admin, { search: "x".repeat(101) }, NOW)
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("filters not chosen and applied with the non-draft rule", async () => {
    await registrationAnalyticsService.listRegistrants(admin, { interest: "NOT_CHOSEN", applied: "yes" }, NOW);
    const where = db.candidateProfile.findMany.mock.calls[0][0].where;
    expect(where.careerInterest).toBeNull();
    expect(where.applications).toEqual({ some: { status: { not: "DRAFT" } } });
  });

  it("derives the current stage with the lifecycle rules", async () => {
    db.candidateProfile.findMany.mockResolvedValue([
      registrantRow({
        id: "p-intern",
        user: { ...registrantRow().user, roles: [{ role: "INTERN" }], employeeProfile: { status: "ACTIVE" } },
      }),
      registrantRow({
        id: "p-eval",
        user: {
          ...registrantRow().user,
          evaluationsAsIntern: [{ status: "IN_PROGRESS", application: { status: "EVALUATION_SELECTED" } }],
        },
      }),
      registrantRow({
        id: "p-alumni",
        user: { ...registrantRow().user, roles: [{ role: "EMPLOYEE" }], employeeProfile: { status: "EXITED" } },
      }),
      registrantRow({ id: "p-none", careerInterest: null }),
    ]);
    const page = await registrationAnalyticsService.listRegistrants(admin, {}, NOW);
    expect(page.items.map((item) => item.stage)).toEqual(["INTERN", "EVALUATION", "ALUMNI", "CANDIDATE"]);
    expect(page.items[3].interest).toBe("NOT_CHOSEN");
  });
});

describe("Registrant CSV export", () => {
  it("escapes every cell and neutralises formula injection", () => {
    const item: RegistrantListItem = {
      id: "p",
      name: '=HYPERLINK("http://evil")',
      email: "a,b@example.com",
      interest: "BOTH",
      signedUpAt: new Date("2026-10-01T00:00:00.000Z"),
      signedUpDate: "2026-10-01",
      emailVerified: false,
      applicationCount: 0,
      stage: "CANDIDATE",
      stageLabel: "Candidate",
    };
    const csv = buildRegistrantCsv([item]);
    const [header, row] = csv.split("\n");
    expect(header).toBe("Name,Email,Signed up for,Signed up,Email verified,Applications,Current stage");
    expect(row).toBe(`"'=HYPERLINK(""http://evil"")","a,b@example.com",Both,2026-10-01,No,0,Candidate`);
  });

  it("is audited as EXPORT_REPORT / REGISTRATIONS without logging the search text", async () => {
    db.candidateProfile.findMany.mockResolvedValue([registrantRow()]);
    const result = await registrationAnalyticsService.exportRegistrantsCsv(
      hr,
      { search: "asha@example.com", interest: "JOB" },
      NOW
    );

    expect(result).toMatchObject({ rowCount: 1, truncated: false, fileName: "gara-registrations-2026-10-26.csv" });
    expect(result.csvContent.split("\n")).toHaveLength(2);
    expect(db.auditLog.create).toHaveBeenCalledTimes(1);
    const audit = db.auditLog.create.mock.calls[0][0].data;
    expect(audit).toMatchObject({
      actorId: hr.id,
      action: "EXPORT_REPORT",
      resourceType: "Report",
      resourceId: "REGISTRATIONS",
      diffPayload: { reportType: "REGISTRATIONS", rowCount: 1, truncated: false },
    });
    expect(audit.diffPayload.filters.search).toBe("set");
    expect(JSON.stringify(audit)).not.toContain("asha@example.com");
  });

  it("caps the export at MAX_EXPORT_ROWS and flags the cut-off", async () => {
    db.candidateProfile.findMany.mockResolvedValue(
      Array.from({ length: MAX_EXPORT_ROWS + 1 }, (_, i) => registrantRow({ id: `p-${i}` }))
    );
    const result = await registrationAnalyticsService.exportRegistrantsCsv(admin, {}, NOW);
    expect(db.candidateProfile.findMany.mock.calls[0][0].take).toBe(MAX_EXPORT_ROWS + 1);
    expect(result).toMatchObject({ rowCount: MAX_EXPORT_ROWS, truncated: true });
    expect(db.auditLog.create.mock.calls[0][0].data.diffPayload).toMatchObject({ truncated: true, rowCount: MAX_EXPORT_ROWS });
  });

  it("the Server Action authenticates, validates and returns safe errors", async () => {
    const signedOut = await exportRegistrantsCsvAction({});
    expect(signedOut).toMatchObject({ success: false, error: { code: "EXPORT_FAILED" } });

    signInAs(admin);
    const invalid = await exportRegistrantsCsvAction({ interest: "EVERYONE" });
    expect(invalid).toMatchObject({ success: false, error: { code: "VALIDATION_ERROR" } });

    signInAs(manager);
    const forbidden = await exportRegistrantsCsvAction({});
    expect(forbidden).toMatchObject({ success: false });
    if (!forbidden.success) expect(forbidden.error.message).toMatch(/administrators and HR/);
    expect(db.candidateProfile.findMany).not.toHaveBeenCalled();

    signInAs(admin);
    db.candidateProfile.findMany.mockRejectedValue(new Error('relation "candidate_profiles" does not exist at db-7'));
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const failed = await exportRegistrantsCsvAction({});
    expect(failed).toEqual({
      success: false,
      error: { code: "EXPORT_FAILED", message: "We couldn't export the registrations. Please try again." },
    });
    consoleSpy.mockRestore();
  });
});

describe("Admin overview registrations card", () => {
  it("reports all-time totals per interest, not applied yet and new in the last 7 days", async () => {
    mockAggregates();
    await expect(getRegistrationOverview(admin)).resolves.toEqual({
      total: 10,
      job: 4,
      internship: 5,
      both: 0,
      notChosen: 1,
      notApplied: 7,
      newLastSevenDays: 4,
    });
    // One grouped query, no date window on the totals.
    expect(db.$queryRaw).toHaveBeenCalledTimes(1);
    const sql = sqlOfCall(db.$queryRaw.mock.calls[0]);
    expect(sql.sql).not.toContain(`u."createdAt" <`);
  });

  it("reads unavailable (not zero) when the query fails", async () => {
    db.$queryRaw.mockRejectedValue(new Error("connection reset"));
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(getRegistrationOverview(admin)).resolves.toBe(UNAVAILABLE);
    consoleSpy.mockRestore();
  });
});
