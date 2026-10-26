import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma, Role } from "@prisma/client";
import type { AuthenticatedUser } from "@/lib/auth/guards";

/*
 * Round 5: the reports and the admin overview aggregate in PostgreSQL. These tests pin
 * (1) that grouped rows map to the same report fields the components render, (2) that
 * payroll-only data is never queried without canPayroll, (3) that a failed overview
 * query reads "unavailable" instead of 0, and (4) that no report reads attendance, leave,
 * application or employee rows without a bound.
 */

const { db } = vi.hoisted(() => ({
  db: {
    $queryRaw: vi.fn(),
    application: { groupBy: vi.fn(), count: vi.fn(), findMany: vi.fn() },
    opening: { findMany: vi.fn(), count: vi.fn() },
    internshipEnrollment: { groupBy: vi.fn(), count: vi.fn(), findMany: vi.fn() },
    employee: { groupBy: vi.fn(), count: vi.fn(), findMany: vi.fn() },
    attendanceRecord: { groupBy: vi.fn(), count: vi.fn(), findMany: vi.fn() },
    attendanceRegularization: { count: vi.fn() },
    leaveRequest: { groupBy: vi.fn(), count: vi.fn(), findMany: vi.fn() },
    leaveType: { findMany: vi.fn() },
    payrollPeriod: { findMany: vi.fn(), findFirst: vi.fn() },
    payrollRecord: { groupBy: vi.fn() },
    employeePayoutProfile: { groupBy: vi.fn() },
    siteVisitor: { count: vi.fn() },
    interviewSchedule: { count: vi.fn() },
    userRole: { count: vi.fn() },
    auditLog: { create: vi.fn() },
    subAdminPermission: { findUnique: vi.fn() },
  },
}));

vi.mock("@/lib/db", () => ({ prisma: db }));

import { ReportService, MAX_EXPORT_ROWS } from "@/features/reports/services/report-service";
import {
  getOperationsOverview,
  getRecentActivityOverview,
  getRecruitmentOverview,
  getWorkforceOverview,
  loadOverviewMetric,
  UNAVAILABLE,
} from "@/features/analytics/services/admin-overview-service";

const admin: AuthenticatedUser = { id: "admin-1", name: "Admin", email: "admin@gara.test", roles: [Role.ADMIN] };
const hr: AuthenticatedUser = { id: "hr-1", name: "Meera HR", email: "hr@gara.test", roles: [Role.HR] };
const manager: AuthenticatedUser = { id: "mgr-1", name: "Vikram", email: "mgr@gara.test", roles: [Role.MANAGER] };

/** Prisma `groupBy` rows from `{ ...keys, count }` fixtures. */
function groupRows<T extends Record<string, unknown>>(rows: Array<T & { count: number }>) {
  return rows.map(({ count, ...keys }) => ({ ...keys, _count: { _all: count } }));
}

/** Rebuilds the SQL of a `$queryRaw` tagged-template call. */
function sqlOfCall(call: unknown[]): Prisma.Sql {
  const [strings, ...values] = call as [TemplateStringsArray, ...unknown[]];
  return Prisma.sql(strings, ...values);
}

/** Noon (server time) `daysAgo` days ago: inside that day's attendance window. */
function localNoon(daysAgo: number): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysAgo, 12, 0, 0, 0);
}

/** `YYYY-MM` of the current UTC month, as the monthly trend query returns it. */
function currentMonthKey(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

type GroupByArgs = { by: string[] };

/** A fully populated database, aggregated the way PostgreSQL returns it. */
function mockHealthyAnalytics() {
  db.application.groupBy.mockImplementation(async (args: GroupByArgs) =>
    args.by.includes("openingId")
      ? groupRows([
          { openingId: "open-a", count: 5 },
          { openingId: "open-b", count: 2 },
        ])
      : groupRows([
          { status: "SUBMITTED", count: 3 },
          { status: "SCREENING", count: 1 },
          { status: "HIRED", count: 2 },
          { status: "REJECTED", count: 1 },
        ])
  );
  db.application.count.mockResolvedValue(1);
  // Returned out of order on purpose: titles must be matched by id.
  db.opening.findMany.mockResolvedValue([
    { id: "open-b", title: "Product Designer", department: "Design", type: "FULL_TIME" },
    { id: "open-a", title: "Backend Intern", department: "Engineering", type: "INTERNSHIP" },
  ]);
  db.opening.count.mockResolvedValue(3);
  db.internshipEnrollment.groupBy.mockResolvedValue(
    groupRows([
      { status: "IN_PROGRESS", count: 2 },
      { status: "PASSED", count: 1 },
    ])
  );
  db.internshipEnrollment.count.mockImplementation(
    async (args: { where: { onboarding?: unknown; idCard?: unknown; certificate?: { status?: string } } }) => {
      if (args.where.onboarding) return 1;
      if (args.where.idCard) return 2;
      return args.where.certificate?.status === "ACTIVE" ? 1 : 0;
    }
  );
  db.employee.groupBy.mockResolvedValue(
    groupRows([
      { status: "ACTIVE", department: "Engineering", count: 4 },
      { status: "PROBATION", department: "Engineering", count: 1 },
      { status: "ACTIVE", department: "Design", count: 2 },
    ])
  );
  db.employee.count.mockResolvedValue(2);
  // Payout profiles grouped by the paid flag (one row per employee with a profile).
  db.employeePayoutProfile.groupBy.mockResolvedValue(
    groupRows([
      { isPaid: true, count: 1 },
      { isPaid: false, count: 1 },
    ])
  );
  db.attendanceRecord.groupBy.mockImplementation(async (args: GroupByArgs) =>
    args.by.includes("date")
      ? [
          { date: localNoon(0), _count: { _all: 3 } },
          { date: localNoon(1), _count: { _all: 2 } },
        ]
      : groupRows([
          { status: "PRESENT", count: 10 },
          { status: "ABSENT", count: 2 },
        ])
  );
  db.attendanceRegularization.count.mockResolvedValue(1);
  db.leaveRequest.groupBy.mockImplementation(async (args: GroupByArgs) =>
    args.by.includes("leaveTypeId")
      ? groupRows([
          { leaveTypeId: "lt-1", count: 4 },
          { leaveTypeId: "lt-2", count: 2 },
        ])
      : groupRows([
          { status: "PENDING", count: 2 },
          { status: "APPROVED", count: 3 },
          { status: "REJECTED", count: 1 },
        ])
  );
  db.leaveType.findMany.mockResolvedValue([
    { id: "lt-1", name: "Casual Leave" },
    { id: "lt-2", name: "Sick Leave" },
  ]);
  db.payrollPeriod.findMany.mockResolvedValue([
    { id: "p-1", code: "2026-10", status: "DRAFT" },
    { id: "p-2", code: "2026-09", status: "PAID" },
  ]);
  db.payrollRecord.groupBy.mockImplementation(async (args: GroupByArgs) =>
    args.by.includes("status")
      ? [
          { payrollPeriodId: "p-1", status: "PAID", _count: { _all: 1 }, _sum: { disbursedAmount: new Prisma.Decimal(5000) } },
          { payrollPeriodId: "p-1", status: "DRAFT", _count: { _all: 2 }, _sum: { disbursedAmount: null } },
          { payrollPeriodId: "p-2", status: "PAID", _count: { _all: 3 }, _sum: { disbursedAmount: new Prisma.Decimal(15000) } },
        ]
      : [{ payrollPeriodId: "p-2", _count: { _all: 1 } }]
  );
  db.siteVisitor.count.mockResolvedValue(70);
  db.$queryRaw.mockImplementation(async (...call: unknown[]) => {
    const text = sqlOfCall(call).text;
    if (text.includes("date_trunc")) {
      return [{ month: currentMonthKey(), applications: 4, interviews: 1, hired: 2 }];
    }
    if (text.includes("leave_requests")) {
      return [
        { idx: 6, onLeave: 2 },
        { idx: 5, onLeave: 1 },
      ];
    }
    return [];
  });
  db.auditLog.create.mockResolvedValue({});
}

beforeEach(() => {
  vi.resetAllMocks();
  // No custom permission row: role defaults apply (ADMIN: everything; HR/MANAGER: canPayroll=false).
  db.subAdminPermission.findUnique.mockResolvedValue(null);
});

// ─────────────────────────────────────────────────────────────────────────────
// Report service: grouped rows → report fields
// ─────────────────────────────────────────────────────────────────────────────

describe("Report aggregation: grouped rows map to the same report fields", () => {
  const reports = new ReportService();

  it("builds recruitment, internship and headcount figures from groupBy/count results", async () => {
    mockHealthyAnalytics();

    const data = await reports.getComprehensiveAnalytics(admin, {});

    expect(data.recruitment.totalApplications).toBe(7);
    expect(data.recruitment.archivedApplications).toBe(1);
    expect(data.recruitment.byStatus).toEqual({ SUBMITTED: 3, SCREENING: 1, HIRED: 2, REJECTED: 1 });
    expect(data.recruitment.byOpening).toEqual([
      { openingId: "open-a", title: "Backend Intern", department: "Engineering", type: "INTERNSHIP", applicationCount: 5 },
      { openingId: "open-b", title: "Product Designer", department: "Design", type: "FULL_TIME", applicationCount: 2 },
    ]);
    expect(Object.fromEntries(data.funnelStages.map((s) => [s.stage, s.count]))).toEqual({
      Applied: 7,
      "Under Review": 4,
      "Interview & Eval": 0,
      Offered: 0,
      Hired: 2,
      Rejected: 1,
    });

    expect(data.internship).toMatchObject({
      totalEnrollments: 3,
      byEvaluationStatus: { IN_PROGRESS: 2, PASSED: 1 },
      onboardingCompletedCount: 1,
      idCardsIssuedCount: 2,
      certificatesActiveCount: 1,
      certificatesRevokedCount: 0,
    });

    expect(data.employees.totalEmployees).toBe(7);
    expect(data.employees.byStatus).toEqual({ ACTIVE: 6, PROBATION: 1 });
    expect(data.employees.byDepartment).toEqual([
      { department: "Engineering", count: 5 },
      { department: "Design", count: 2 },
    ]);
    expect(data.charts.departmentDistribution.map((d) => [d.department, d.count, d.percentage])).toEqual([
      ["Engineering", 5, 71],
      ["Design", 2, 29],
    ]);
    expect(data.charts.employmentTypeDistribution.map((t) => [t.type, t.count, t.percentage])).toEqual([
      ["Full-Time", 5, 71],
      ["Interns", 2, 29],
    ]);

    // Nothing row-shaped was loaded for these figures.
    expect(db.application.findMany).not.toHaveBeenCalled();
    expect(db.attendanceRecord.findMany).not.toHaveBeenCalled();
    expect(db.leaveRequest.findMany).not.toHaveBeenCalled();
  });

  it("derives KPIs, attendance, leave and telemetry from status groups and daily aggregates", async () => {
    mockHealthyAnalytics();

    const data = await reports.getComprehensiveAnalytics(admin, {});

    expect(data.kpis).toMatchObject({
      totalApplications: 7,
      totalHired: 2,
      activeOpenings: 3,
      totalEmployees: 7,
      activeEmployees: 6,
      fullTimeCount: 5,
      internCount: 2,
      todayAttendancePresent: 3,
      todayOnLeave: 2,
      pendingLeavesCount: 2,
      totalVisitors: 70,
    });
    expect(data.telemetry).toEqual({ uniqueVisitors: 70, totalApplications: 7, conversionRate: 10 });

    expect(data.attendance).toEqual({
      totalLogs: 12,
      byStatus: { PRESENT: 10, ABSENT: 2 },
      pendingRegularizations: 1,
    });
    expect(data.leaves).toEqual({
      totalRequests: 6,
      pendingCount: 2,
      approvedCount: 3,
      rejectedCount: 1,
      byCategory: [
        { category: "Casual Leave", count: 4 },
        { category: "Sick Leave", count: 2 },
      ],
    });

    const daily = data.charts.attendanceDailyTrends;
    expect(daily).toHaveLength(7);
    expect(daily[6]).toMatchObject({ present: 3, onLeave: 2, attendanceRate: 50 });
    expect(daily[5]).toMatchObject({ present: 2, onLeave: 1, attendanceRate: 33 });
    expect(daily.slice(0, 5).every((d) => d.present === 0 && d.onLeave === 0)).toBe(true);

    const monthly = data.charts.monthlyRecruitmentTrends;
    expect(monthly).toHaveLength(6);
    expect(monthly[5]).toMatchObject({ applications: 4, interviews: 1, hired: 2 });
    expect(monthly.slice(0, 5).every((m) => m.applications === 0 && m.interviews === 0 && m.hired === 0)).toBe(true);
  });

  it("sums payroll from grouped records and the payout profile groupBy, excluding unrecorded amounts", async () => {
    mockHealthyAnalytics();

    const data = await reports.getComprehensiveAnalytics(admin, {});

    expect(data.payroll).toEqual({
      activeCycleCode: "2026-10",
      cycleStatus: "DRAFT",
      totalEnrolled: 3,
      paidCount: 1,
      pendingCount: 2,
      disbursedAmount: 5000,
      paidWithoutRecordedAmount: 0,
      paidWorkforce: 1,
      unpaidWorkforce: 1,
      // 7 employees, two with a payout profile row; the rest are not configured.
      payoutNotConfigured: 5,
    });
    expect(data.kpis.payrollCompletionRate).toBe(33);
    expect(data.kpis.payrollDisbursedAmount).toBe(5000);
    expect(data.charts.payrollCycleTrends).toEqual([
      { cycle: "2026-10", disbursedAmount: 5000, paidCount: 1, unpaidCount: 2, paidWithoutRecordedAmount: 0 },
      { cycle: "2026-09", disbursedAmount: 15000, paidCount: 3, unpaidCount: 0, paidWithoutRecordedAmount: 1 },
    ]);
    expect(db.payrollPeriod.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 5, select: { id: true, code: true, status: true } })
    );
    expect(db.payrollRecord.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        by: ["payrollPeriodId", "status"],
        where: { payrollPeriodId: { in: ["p-1", "p-2"] } },
        _sum: { disbursedAmount: true },
      })
    );
  });

  it("runs the time-bucketed queries as grouped SQL with every boundary bound as a parameter", async () => {
    mockHealthyAnalytics();

    await reports.getComprehensiveAnalytics(admin, {});

    expect(db.$queryRaw).toHaveBeenCalledTimes(2);
    const timestamp = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}$/;
    for (const call of db.$queryRaw.mock.calls) {
      const sql = sqlOfCall(call);
      expect(sql.text).toMatch(/GROUP BY/);
      // No date is ever inlined into the SQL text.
      expect(sql.text).not.toMatch(/\d{4}-\d{2}-\d{2}/);
      expect(sql.values.some((value) => typeof value === "string" && timestamp.test(value))).toBe(true);
    }
    const leaveSql = db.$queryRaw.mock.calls.map(sqlOfCall).find((sql) => sql.text.includes("leave_requests"));
    expect(leaveSql?.values.filter((value) => typeof value === "string" && timestamp.test(value))).toHaveLength(14);
    expect(leaveSql?.text).toContain("'APPROVED'");
  });

  it("applies the report filters inside the grouped queries", async () => {
    mockHealthyAnalytics();
    const openingId = "5b0a4c1e-2f53-4a7e-9f1a-3d2c1b0a9e8f";

    await reports.getComprehensiveAnalytics(manager, {
      startDate: "2026-10-01",
      endDate: "2026-10-31",
      department: "Engineering",
      openingId,
    });

    const window = { gte: new Date("2026-10-01T00:00:00.000Z"), lte: new Date("2026-10-31T23:59:59.999Z") };
    const departmentFilter = { department: { equals: "Engineering", mode: "insensitive" } };
    expect(db.application.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        by: ["openingId"],
        where: { createdAt: window, openingId, opening: departmentFilter },
        orderBy: { _count: { openingId: "desc" } },
      })
    );
    expect(db.application.count).toHaveBeenCalledWith({
      where: { createdAt: window, openingId, opening: departmentFilter, isArchived: true },
    });
    expect(db.internshipEnrollment.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { createdAt: window, application: { openingId, opening: departmentFilter } },
      })
    );
    expect(db.employee.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        by: ["status", "department"],
        where: { joiningDate: window, ...departmentFilter },
      })
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Permission scoping of payroll data
// ─────────────────────────────────────────────────────────────────────────────

describe("Report aggregation: payroll-only data stays behind canPayroll", () => {
  const reports = new ReportService();

  it("never queries payroll periods, payroll records or payout profiles for viewers without canPayroll", async () => {
    mockHealthyAnalytics();

    const data = await reports.getComprehensiveAnalytics(hr, {});

    expect(data.payroll).toBeNull();
    expect(data.kpis.paidWorkforceCount).toBeNull();
    expect(data.kpis.payrollDisbursedAmount).toBeNull();
    expect(data.charts.payrollCycleTrends).toEqual([]);
    expect(db.payrollPeriod.findMany).not.toHaveBeenCalled();
    expect(db.payrollRecord.groupBy).not.toHaveBeenCalled();
    expect(db.employeePayoutProfile.groupBy).not.toHaveBeenCalled();
    expect(db.employee.findMany).not.toHaveBeenCalled();
    const employeeQueries = JSON.stringify([...db.employee.groupBy.mock.calls, ...db.employee.count.mock.calls]);
    expect(employeeQueries).not.toContain("internalNotes");
    // The rest of the dashboard is unaffected.
    expect(data.kpis.totalEmployees).toBe(7);
    expect(data.kpis.fullTimeCount).toBe(5);
  });

  it("counts payout flags with one groupBy on EmployeePayoutProfile and never reads employee rows or notes", async () => {
    mockHealthyAnalytics();

    await reports.getComprehensiveAnalytics(admin, {});

    expect(db.employeePayoutProfile.groupBy).toHaveBeenCalledTimes(1);
    expect(db.employeePayoutProfile.groupBy).toHaveBeenCalledWith({ by: ["isPaid"], _count: { _all: true } });
    expect(db.employee.findMany).not.toHaveBeenCalled();
    const employeeQueries = JSON.stringify([...db.employee.groupBy.mock.calls, ...db.employee.count.mock.calls]);
    expect(employeeQueries).not.toContain("internalNotes");
    expect(employeeQueries).not.toContain("Encrypted");
  });

  it("reports every employee without a payout profile as not configured, never as paid or unpaid", async () => {
    mockHealthyAnalytics();
    db.employeePayoutProfile.groupBy.mockResolvedValue([]);

    const data = await reports.getComprehensiveAnalytics(admin, {});

    expect(data.payroll).toMatchObject({ paidWorkforce: 0, unpaidWorkforce: 0, payoutNotConfigured: 7 });
    expect(data.kpis.paidWorkforceCount).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Bounded reads and exports
// ─────────────────────────────────────────────────────────────────────────────

describe("Report aggregation: every row read is bounded", () => {
  const reports = new ReportService();

  it("never calls findMany on attendance, leave, application or employee tables without a take", async () => {
    mockHealthyAnalytics();
    await reports.getComprehensiveAnalytics(admin, {});

    db.application.findMany.mockResolvedValue([]);
    db.internshipEnrollment.findMany.mockResolvedValue([]);
    db.employee.findMany.mockResolvedValue([]);
    await reports.exportReportCsv(admin, { reportType: "RECRUITMENT_PIPELINE" });
    await reports.exportReportCsv(admin, { reportType: "INTERNSHIP_LIFECYCLE" });
    await reports.exportReportCsv(admin, { reportType: "EMPLOYEE_HEADCOUNT" });

    const rowModels = {
      attendanceRecord: db.attendanceRecord.findMany,
      leaveRequest: db.leaveRequest.findMany,
      application: db.application.findMany,
      employee: db.employee.findMany,
    };
    for (const [model, findMany] of Object.entries(rowModels)) {
      for (const call of findMany.mock.calls) {
        const args = call[0] as { take?: unknown };
        expect(typeof args.take, `${model}.findMany must be bounded with take`).toBe("number");
        expect(Number.isFinite(args.take as number)).toBe(true);
      }
    }
    expect(db.attendanceRecord.findMany).not.toHaveBeenCalled();
    expect(db.leaveRequest.findMany).not.toHaveBeenCalled();
    // Exports read one row more than the limit to detect truncation.
    expect(db.application.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: MAX_EXPORT_ROWS + 1 }));
    expect(db.internshipEnrollment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: MAX_EXPORT_ROWS + 1 })
    );
  });

  it("cuts an oversized export at the limit, says so, and still audits it", async () => {
    db.auditLog.create.mockResolvedValue({});
    db.employee.findMany.mockResolvedValue(
      Array.from({ length: MAX_EXPORT_ROWS + 1 }, (_, i) => ({
        employeeCode: `GARA-EMP-${i}`,
        department: "Engineering",
        designation: "Engineer",
        status: "ACTIVE",
        joiningDate: new Date("2026-01-01T00:00:00.000Z"),
        user: { name: `Person ${i}` },
        manager: null,
      }))
    );

    const result = await reports.exportReportCsv(admin, { reportType: "EMPLOYEE_HEADCOUNT" });

    expect(result.truncated).toBe(true);
    expect(result.rowCount).toBe(MAX_EXPORT_ROWS);
    expect(result.csvContent.split("\n")).toHaveLength(MAX_EXPORT_ROWS + 1);
    expect(result.csvContent).not.toContain(`GARA-EMP-${MAX_EXPORT_ROWS}`);
    expect(db.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "EXPORT_REPORT",
          diffPayload: expect.objectContaining({ rowCount: MAX_EXPORT_ROWS, truncated: true }),
        }),
      })
    );

    db.employee.findMany.mockResolvedValue([]);
    const small = await reports.exportReportCsv(admin, { reportType: "EMPLOYEE_HEADCOUNT" });
    expect(small.truncated).toBe(false);
    expect(small.rowCount).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Admin overview helpers
// ─────────────────────────────────────────────────────────────────────────────

describe("Admin overview helpers", () => {
  it("loadOverviewMetric returns the value, or 'unavailable' (never 0) when the query fails", async () => {
    await expect(loadOverviewMetric("ok", async () => 42)).resolves.toBe(42);
    await expect(loadOverviewMetric("boom", async () => Promise.reject(new Error("connection reset")))).resolves.toBe(
      UNAVAILABLE
    );
  });

  it("collapses the pipeline counts into one status groupBy", async () => {
    db.application.groupBy.mockResolvedValue(
      groupRows([
        { status: "DRAFT", count: 1 },
        { status: "SUBMITTED", count: 3 },
        { status: "SCREENING", count: 1 },
        { status: "SHORTLISTED", count: 2 },
        { status: "INTERVIEW_SCHEDULED", count: 1 },
        { status: "INTERVIEWED", count: 1 },
        { status: "EVALUATION_SELECTED", count: 2 },
        { status: "OFFERED", count: 1 },
        { status: "OFFER_ACCEPTED", count: 1 },
        { status: "HIRED", count: 4 },
        { status: "REJECTED", count: 3 },
      ])
    );

    await expect(getRecruitmentOverview()).resolves.toEqual({
      total: 20,
      submitted: 3,
      screening: 1,
      shortlisted: 2,
      interviewing: 2,
      inEvaluation: 2,
      hired: 6,
    });
    expect(db.application.groupBy).toHaveBeenCalledTimes(1);
    expect(db.application.count).not.toHaveBeenCalled();
    expect(db.application.findMany).not.toHaveBeenCalled();
  });

  it("reports the pipeline as unavailable when its query fails", async () => {
    db.application.groupBy.mockRejectedValue(new Error("connection reset"));
    await expect(getRecruitmentOverview()).resolves.toBe(UNAVAILABLE);
  });

  it("builds the workforce breakdown from a department groupBy without loading employees", async () => {
    db.employee.groupBy.mockResolvedValue(
      groupRows([
        { department: "Engineering", count: 4 },
        { department: "", count: 1 },
        { department: "Design", count: 2 },
        { department: "Finance", count: 2 },
        { department: "Ops", count: 1 },
      ])
    );
    db.employee.count.mockResolvedValue(3);

    await expect(getWorkforceOverview()).resolves.toEqual({
      totalEmployees: 10,
      fullTime: 7,
      interns: 3,
      topDepartments: [
        { department: "Engineering", count: 4 },
        { department: "Design", count: 2 },
        { department: "Finance", count: 2 },
        { department: "General", count: 1 },
      ],
    });
    expect(db.employee.findMany).not.toHaveBeenCalled();
  });

  it("marks only the workforce figures whose query failed as unavailable", async () => {
    db.employee.groupBy.mockRejectedValue(new Error("timeout"));
    db.employee.count.mockResolvedValue(3);
    await expect(getWorkforceOverview()).resolves.toEqual({
      totalEmployees: UNAVAILABLE,
      fullTime: UNAVAILABLE,
      interns: 3,
      topDepartments: UNAVAILABLE,
    });

    db.employee.groupBy.mockResolvedValue(groupRows([{ department: "Engineering", count: 4 }]));
    db.employee.count.mockRejectedValue(new Error("timeout"));
    await expect(getWorkforceOverview()).resolves.toEqual({
      totalEmployees: 4,
      fullTime: UNAVAILABLE,
      interns: UNAVAILABLE,
      topDepartments: [{ department: "Engineering", count: 4 }],
    });
  });

  it("keeps the other module counts when one count fails", async () => {
    db.opening.count.mockResolvedValue(3);
    db.interviewSchedule.count.mockResolvedValue(2);
    db.internshipEnrollment.count.mockResolvedValue(5);
    db.leaveRequest.count.mockRejectedValue(new Error("connection reset"));
    db.attendanceRecord.count.mockResolvedValue(8);
    db.userRole.count.mockResolvedValue(4);
    db.payrollPeriod.findFirst.mockResolvedValue(null);

    await expect(getOperationsOverview()).resolves.toEqual({
      activeOpenings: 3,
      scheduledInterviews: 2,
      activeEvaluations: 5,
      pendingLeaves: UNAVAILABLE,
      todayAttendance: 8,
      todayOnLeave: UNAVAILABLE,
      subAdminCount: 4,
      latestPayrollCode: null,
    });
    expect(db.attendanceRecord.count).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: "PRESENT" }) })
    );
  });

  it("shows recent feeds as unavailable individually and selects only rendered columns", async () => {
    db.application.findMany.mockRejectedValue(new Error("connection reset"));
    db.opening.findMany.mockResolvedValue([
      { id: "op-1", title: "Dev", department: "Eng", type: "FULL_TIME", _count: { applications: 6 } },
    ]);
    db.siteVisitor.count.mockRejectedValue(new Error("connection reset"));

    const recent = await getRecentActivityOverview();

    expect(recent.recentApplications).toBe(UNAVAILABLE);
    expect(recent.recentOpenings).toEqual([
      { id: "op-1", title: "Dev", department: "Eng", type: "FULL_TIME", applicationCount: 6 },
    ]);
    expect(recent.totalVisitors).toBeNull();
    const applicationArgs = db.application.findMany.mock.calls[0]?.[0] as { take: number; select: Record<string, unknown> };
    expect(applicationArgs.take).toBe(5);
    expect(Object.keys(applicationArgs.select).sort()).toEqual(["candidate", "createdAt", "id", "opening", "status"]);
    expect(JSON.stringify(applicationArgs.select)).not.toContain("resumeStorageKey");
    expect(JSON.stringify(applicationArgs.select)).not.toContain("email");
  });
});
