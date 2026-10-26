import { prisma } from "@/lib/db";
import { assertPermission, type AuthenticatedUser } from "@/lib/auth/guards";
import { getUserPermissions } from "@/lib/auth/permissions";
import {
  Prisma,
  IdCardStatus,
  OnboardingStatus,
  CertificateStatus,
} from "@prisma/client";
import {
  ExportReportInput,
  ExportReportSchema,
  ReportFilterInput,
  ReportFilterSchema,
} from "../schemas";
import {
  AppliedReportMetadata,
  ComprehensiveOperationsReport,
  EmployeeHeadcountReport,
  InternshipLifecycleReport,
  RecruitmentFunnelReport,
  ReportCsvExportResult,
  ComprehensiveAnalyticsDashboardData,
  ExecutiveKpiSummary,
  FunnelStage,
  AttendanceAnalytics,
  LeaveAnalytics,
  PayrollAnalytics,
  PlatformTelemetry,
  MonthlyRecruitmentTrend,
  DepartmentChartData,
  AttendanceDailyTrend,
  PayrollCycleTrend,
  AnalyticsChartsData,
} from "../types";
import { ValidationError } from "@/lib/errors";

/**
 * Escapes a CSV cell and neutralises spreadsheet formula injection: cells that
 * start with `=`, `+`, `-`, `@`, a tab or a carriage return are prefixed with `'`.
 */
export function escapeCsvCell(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  const safeStr = /^[=+\-@\t\r]/.test(str) ? `'${str}` : str;
  if (/[",\n\r\t]/.test(safeStr)) {
    return `"${safeStr.replace(/"/g, '""')}"`;
  }
  return safeStr;
}

/** Timestamp literal for the `timestamp(3)` columns, which store UTC wall-clock time. */
export function toUtcTimestampLiteral(instant: Date): string {
  return instant.toISOString().replace("T", " ").replace("Z", "");
}

/**
 * Rows returned by one CSV export. Larger result sets are cut off at this limit and the
 * result is flagged `truncated`, so an export can never load an unbounded table.
 */
export const MAX_EXPORT_ROWS = 10_000;

const CHART_MONTHS = 6;
const CHART_DAYS = 7;
const RECENT_PAYROLL_CYCLES = 5;

/** Statuses counted as "Interviews & Evals" in the monthly recruitment trend. */
const INTERVIEW_STAGE_STATUSES: readonly string[] = [
  "INTERVIEW_SCHEDULED",
  "INTERVIEWED",
  "EVALUATION_SELECTED",
];

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DEPARTMENT_COLORS = [
  "#3b82f6",
  "#8b5cf6",
  "#10b981",
  "#f59e0b",
  "#06b6d4",
  "#ec4899",
  "#6366f1",
  "#14b8a6",
];

/** Employees whose designation or department marks them as interns. */
const INTERN_EMPLOYEE_WHERE: Prisma.EmployeeWhereInput = {
  OR: [
    { designation: { contains: "intern", mode: "insensitive" } },
    { department: { contains: "intern", mode: "insensitive" } },
  ],
};

// ─── Aggregate row shapes (what PostgreSQL returns; never individual records) ──────

interface StatusGroup<TStatus extends string = string> {
  status: TStatus;
  _count: { _all: number };
}

interface PayrollRecordGroup {
  payrollPeriodId: string;
  status: string;
  _count: { _all: number };
  _sum: { disbursedAmount: Prisma.Decimal | null };
}

interface PayrollMissingAmountGroup {
  payrollPeriodId: string;
  _count: { _all: number };
}

interface MonthlyApplicationRow {
  /** `YYYY-MM` of the UTC month the applications were created in. */
  month: string;
  applications: number;
  interviews: number;
  hired: number;
}

interface DailyLeaveRow {
  /** Index into the day windows passed to the query (oldest day first). */
  idx: number;
  onLeave: number;
}

interface PayrollCycleSummary {
  totalEnrolled: number;
  paid: number;
  unpaid: number;
  disbursed: number;
  paidWithoutRecordedAmount: number;
}

interface PayrollSnapshot {
  periods: Array<{ id: string; code: string; status: string }>;
  summaries: Map<string, PayrollCycleSummary>;
}

interface DayWindow {
  start: Date;
  end: Date;
  day: string;
  dateStr: string;
}

interface MonthBucket {
  key: string;
  year: number;
  month: string;
  label: string;
}

/** Converts a Decimal aggregate (or a plain number from a mock) to a number. */
function decimalToNumber(value: Prisma.Decimal | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  const parsed = typeof value === "number" ? value : Number(value.toString());
  return Number.isFinite(parsed) ? parsed : 0;
}

function sumCounts(groups: ReadonlyArray<{ _count: { _all: number } }>): number {
  return groups.reduce((sum, group) => sum + group._count._all, 0);
}

function countsByKey<TKey extends string>(groups: ReadonlyArray<StatusGroup<TKey>>): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const group of groups) {
    counts[group.status] = (counts[group.status] ?? 0) + group._count._all;
  }
  return counts;
}

/**
 * Sums the amounts snapshotted at disbursement for PAID records of one period; PAID
 * records without a recorded amount are counted, never guessed from the payout profile.
 */
function summarisePayrollGroups(
  periodId: string,
  statusGroups: ReadonlyArray<PayrollRecordGroup>,
  missingAmountGroups: ReadonlyArray<PayrollMissingAmountGroup>
): PayrollCycleSummary {
  const summary: PayrollCycleSummary = {
    totalEnrolled: 0,
    paid: 0,
    unpaid: 0,
    disbursed: 0,
    paidWithoutRecordedAmount: 0,
  };
  for (const group of statusGroups) {
    if (group.payrollPeriodId !== periodId) continue;
    summary.totalEnrolled += group._count._all;
    if (group.status === "PAID") {
      summary.paid += group._count._all;
      summary.disbursed += decimalToNumber(group._sum.disbursedAmount);
    } else {
      summary.unpaid += group._count._all;
    }
  }
  for (const group of missingAmountGroups) {
    if (group.payrollPeriodId === periodId) {
      summary.paidWithoutRecordedAmount += group._count._all;
    }
  }
  return summary;
}

/** The last `count` calendar days ending today (oldest first) as inclusive windows. */
function recentDayWindows(now: Date, count: number): DayWindow[] {
  const windows: DayWindow[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const target = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    windows.push({
      start: new Date(target.getFullYear(), target.getMonth(), target.getDate(), 0, 0, 0, 0),
      end: new Date(target.getFullYear(), target.getMonth(), target.getDate(), 23, 59, 59, 999),
      day: DAY_NAMES[target.getDay()],
      dateStr: `${MONTH_NAMES[target.getMonth()]} ${target.getDate()}`,
    });
  }
  return windows;
}

/** The last `count` UTC months ending with the current one (oldest first). */
function recentMonthBuckets(now: Date, count: number): MonthBucket[] {
  const buckets: MonthBucket[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const first = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const year = first.getUTCFullYear();
    const monthIndex = first.getUTCMonth();
    buckets.push({
      key: `${year}-${String(monthIndex + 1).padStart(2, "0")}`,
      year,
      month: MONTH_NAMES[monthIndex],
      label: `${MONTH_NAMES[monthIndex]} ${year}`,
    });
  }
  return buckets;
}

export class ReportService {
  /** Reports require the granular `canReports` permission (ADMIN always passes). */
  private async assertReportAccess(user: AuthenticatedUser): Promise<void> {
    await assertPermission(user, "canReports");
  }

  private buildDateWindow(
    startDateStr?: string,
    endDateStr?: string
  ): { start?: Date; end?: Date; periodLabel: string } {
    const start = startDateStr ? new Date(`${startDateStr}T00:00:00.000Z`) : undefined;
    const end = endDateStr ? new Date(`${endDateStr}T23:59:59.999Z`) : undefined;

    if (start && end && start.getTime() > end.getTime()) {
      throw new ValidationError(
        "Report startDate cannot be later than endDate."
      );
    }

    let periodLabel = "All Time";
    if (startDateStr && endDateStr) {
      periodLabel = `${startDateStr} to ${endDateStr}`;
    } else if (startDateStr) {
      periodLabel = `From ${startDateStr}`;
    } else if (endDateStr) {
      periodLabel = `Through ${endDateStr}`;
    }

    return { start, end, periodLabel };
  }

  public async getOperationsReport(
    user: AuthenticatedUser,
    rawFilters: ReportFilterInput = {}
  ): Promise<ComprehensiveOperationsReport> {
    await this.assertReportAccess(user);
    return this.buildOperationsReport(user, rawFilters);
  }

  /**
   * Recruitment, internship and headcount figures for the filters. Everything is grouped
   * or counted in PostgreSQL: the rows read into memory are bounded by the number of
   * statuses, openings and departments, never by the number of applications or employees.
   */
  private async buildOperationsReport(
    user: AuthenticatedUser,
    rawFilters: ReportFilterInput
  ): Promise<ComprehensiveOperationsReport> {
    const parsed = ReportFilterSchema.safeParse(rawFilters);
    if (!parsed.success) {
      throw new ValidationError(
        parsed.error.issues[0]?.message ?? "Invalid report filter parameters.",
        parsed.error.issues
      );
    }

    const startDate = parsed.data.startDate || undefined;
    const endDate = parsed.data.endDate || undefined;
    const department = parsed.data.department?.trim() || undefined;
    const openingId = parsed.data.openingId || undefined;

    const { start, end, periodLabel } = this.buildDateWindow(startDate, endDate);

    const metadata: AppliedReportMetadata = {
      generatedAt: new Date(),
      generatedByUserId: user.id,
      generatedByName: user.name,
      periodLabel,
      filters: {
        startDate: startDate ?? null,
        endDate: endDate ?? null,
        department: department ?? null,
        openingId: openingId ?? null,
      },
    };

    const createdAtFilter: Prisma.DateTimeFilter | undefined =
      start || end
        ? {
            ...(start ? { gte: start } : {}),
            ...(end ? { lte: end } : {}),
          }
        : undefined;

    const applicationWhere: Prisma.ApplicationWhereInput = {
      ...(createdAtFilter ? { createdAt: createdAtFilter } : {}),
      ...(openingId ? { openingId } : {}),
      ...(department
        ? {
            opening: {
              department: { equals: department, mode: "insensitive" },
            },
          }
        : {}),
    };

    const enrollmentWhere: Prisma.InternshipEnrollmentWhereInput = {
      ...(createdAtFilter ? { createdAt: createdAtFilter } : {}),
      ...(openingId || department
        ? {
            application: {
              ...(openingId ? { openingId } : {}),
              ...(department
                ? {
                    opening: {
                      department: { equals: department, mode: "insensitive" },
                    },
                  }
                : {}),
            },
          }
        : {}),
    };

    // Headcount strictly excludes confidential fields: only status and department are grouped.
    const employeeWhere: Prisma.EmployeeWhereInput = {
      ...(createdAtFilter ? { joiningDate: createdAtFilter } : {}),
      ...(department
        ? { department: { equals: department, mode: "insensitive" } }
        : {}),
    };

    const [
      applicationStatusGroups,
      archivedApplications,
      applicationOpeningGroups,
      enrollmentStatusGroups,
      onboardingCompletedCount,
      idCardsIssuedCount,
      certificatesActiveCount,
      certificatesRevokedCount,
      employeeGroups,
    ] = await Promise.all([
      prisma.application.groupBy({
        by: ["status"],
        where: applicationWhere,
        _count: { _all: true },
      }),
      prisma.application.count({ where: { ...applicationWhere, isArchived: true } }),
      prisma.application.groupBy({
        by: ["openingId"],
        where: applicationWhere,
        _count: { _all: true },
        orderBy: { _count: { openingId: "desc" } },
      }),
      prisma.internshipEnrollment.groupBy({
        by: ["status"],
        where: enrollmentWhere,
        _count: { _all: true },
      }),
      prisma.internshipEnrollment.count({
        where: { ...enrollmentWhere, onboarding: { status: OnboardingStatus.COMPLETED } },
      }),
      prisma.internshipEnrollment.count({
        where: { ...enrollmentWhere, idCard: { status: IdCardStatus.ISSUED } },
      }),
      prisma.internshipEnrollment.count({
        where: { ...enrollmentWhere, certificate: { status: CertificateStatus.ACTIVE } },
      }),
      prisma.internshipEnrollment.count({
        where: { ...enrollmentWhere, certificate: { status: CertificateStatus.REVOKED } },
      }),
      prisma.employee.groupBy({
        by: ["status", "department"],
        where: employeeWhere,
        _count: { _all: true },
      }),
    ]);

    // 1. Recruitment funnel: status counts plus the per-opening volume (title lookup by id).
    const openingIds = applicationOpeningGroups.map((group) => group.openingId);
    const openings =
      openingIds.length > 0
        ? await prisma.opening.findMany({
            where: { id: { in: openingIds } },
            select: { id: true, title: true, department: true, type: true },
          })
        : [];
    const openingById = new Map(openings.map((opening) => [opening.id, opening]));

    const byOpening = applicationOpeningGroups
      .map((group) => {
        const opening = openingById.get(group.openingId);
        return {
          openingId: group.openingId,
          title: opening?.title ?? "Unknown opening",
          department: opening?.department ?? "",
          type: opening?.type ?? "",
          applicationCount: group._count._all,
        };
      })
      .sort((a, b) => b.applicationCount - a.applicationCount || a.title.localeCompare(b.title));

    const recruitment: RecruitmentFunnelReport = {
      metadata,
      totalApplications: sumCounts(applicationStatusGroups),
      archivedApplications,
      byStatus: countsByKey(applicationStatusGroups),
      byOpening,
    };

    // 2. Internship lifecycle
    const internship: InternshipLifecycleReport = {
      metadata,
      totalEnrollments: sumCounts(enrollmentStatusGroups),
      byEvaluationStatus: countsByKey(enrollmentStatusGroups),
      onboardingCompletedCount,
      idCardsIssuedCount,
      certificatesActiveCount,
      certificatesRevokedCount,
    };

    // 3. Employee headcount
    const empByStatus: Record<string, number> = {};
    const deptCounts = new Map<string, number>();
    for (const group of employeeGroups) {
      empByStatus[group.status] = (empByStatus[group.status] ?? 0) + group._count._all;
      deptCounts.set(group.department, (deptCounts.get(group.department) ?? 0) + group._count._all);
    }

    const employeesReport: EmployeeHeadcountReport = {
      metadata,
      totalEmployees: sumCounts(employeeGroups),
      byStatus: empByStatus,
      byDepartment: Array.from(deptCounts.entries())
        .map(([dept, count]) => ({ department: dept, count }))
        .sort((a, b) => b.count - a.count || a.department.localeCompare(b.department)),
    };

    return {
      metadata,
      recruitment,
      internship,
      employees: employeesReport,
    };
  }

  /**
   * Aggregates real-time cross-functional analytics for the Executive Dashboard
   */
  public async getComprehensiveAnalytics(
    user: AuthenticatedUser,
    rawFilters: ReportFilterInput = {}
  ): Promise<ComprehensiveAnalyticsDashboardData> {
    await this.assertReportAccess(user);
    // Payroll figures are only included for viewers who also hold `canPayroll`.
    const { canPayroll } = await getUserPermissions(user.id, user.roles);

    const opsReport = await this.buildOperationsReport(user, rawFilters);

    const now = new Date();
    const days = recentDayWindows(now, CHART_DAYS);
    const today = days[days.length - 1];
    const months = recentMonthBuckets(now, CHART_MONTHS);
    const monthsStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (CHART_MONTHS - 1), 1));

    const [
      activeOpeningsCount,
      attendanceStatusGroups,
      presentByDay,
      pendingRegCount,
      leaveStatusGroups,
      leaveTypeGroups,
      leaveByDay,
      workforceStatusGroups,
      internCount,
      visitorCount,
      monthlyRows,
      payrollSnapshot,
      payoutFlags,
    ] = await Promise.all([
      prisma.opening.count({ where: { status: "PUBLISHED" } }),
      prisma.attendanceRecord.groupBy({ by: ["status"], _count: { _all: true } }),
      prisma.attendanceRecord.groupBy({
        by: ["date"],
        where: { status: "PRESENT", date: { gte: days[0].start, lte: today.end } },
        _count: { _all: true },
      }),
      prisma.attendanceRegularization.count({ where: { status: "PENDING" } }),
      prisma.leaveRequest.groupBy({ by: ["status"], _count: { _all: true } }),
      prisma.leaveRequest.groupBy({
        by: ["leaveTypeId"],
        _count: { _all: true },
        orderBy: { _count: { leaveTypeId: "desc" } },
      }),
      this.loadApprovedLeaveByDay(days),
      prisma.employee.groupBy({ by: ["status"], _count: { _all: true } }),
      prisma.employee.count({ where: INTERN_EMPLOYEE_WHERE }),
      prisma.siteVisitor.count(),
      prisma.$queryRaw<MonthlyApplicationRow[]>`
        SELECT to_char(date_trunc('month', a."createdAt"), 'YYYY-MM') AS "month",
               COUNT(*)::int AS "applications",
               (COUNT(*) FILTER (WHERE a."status"::text IN (${Prisma.join(INTERVIEW_STAGE_STATUSES)})))::int AS "interviews",
               (COUNT(*) FILTER (WHERE a."status"::text = 'HIRED'))::int AS "hired"
        FROM "applications" a
        WHERE a."createdAt" >= ${toUtcTimestampLiteral(monthsStart)}::timestamp
        GROUP BY 1`,
      canPayroll ? this.loadPayrollSnapshot() : Promise.resolve(null),
      canPayroll ? this.countRecordedPayoutFlags() : Promise.resolve(null),
    ]);

    const leaveTypeIds = leaveTypeGroups.map((group) => group.leaveTypeId);
    const leaveTypes =
      leaveTypeIds.length > 0
        ? await prisma.leaveType.findMany({
            where: { id: { in: leaveTypeIds } },
            select: { id: true, name: true },
          })
        : [];
    const leaveTypeNameById = new Map(leaveTypes.map((type) => [type.id, type.name]));

    // 1. Funnel Stages Breakdown
    const byStatus = opsReport.recruitment.byStatus;
    const totalApps = opsReport.recruitment.totalApplications;

    // Current-stage snapshot grouped from the real ApplicationStatus values (the stage
    // history funnel is the "Hiring funnel" section).
    const underReview = (byStatus["SUBMITTED"] || 0) + (byStatus["SCREENING"] || 0);
    const inEvaluation =
      (byStatus["SHORTLISTED"] || 0) +
      (byStatus["INTERVIEW_SCHEDULED"] || 0) +
      (byStatus["INTERVIEWED"] || 0) +
      (byStatus["EVALUATION_SELECTED"] || 0);
    const offered = (byStatus["OFFERED"] || 0) + (byStatus["OFFER_ACCEPTED"] || 0);
    const hired = byStatus["HIRED"] || 0;
    const rejected = byStatus["REJECTED"] || 0;

    const funnelStages: FunnelStage[] = [
      {
        stage: "Applied",
        count: totalApps,
        percentage: 100,
        color: "bg-blue-500",
      },
      {
        stage: "Under Review",
        count: underReview,
        percentage: totalApps > 0 ? Math.round((underReview / totalApps) * 100) : 0,
        color: "bg-indigo-500",
      },
      {
        stage: "Interview & Eval",
        count: inEvaluation,
        percentage: totalApps > 0 ? Math.round((inEvaluation / totalApps) * 100) : 0,
        color: "bg-purple-500",
      },
      {
        stage: "Offered",
        count: offered,
        percentage: totalApps > 0 ? Math.round((offered / totalApps) * 100) : 0,
        color: "bg-amber-500",
      },
      {
        stage: "Hired",
        count: hired,
        percentage: totalApps > 0 ? Math.round((hired / totalApps) * 100) : 0,
        color: "bg-emerald-500",
      },
      {
        stage: "Rejected",
        count: rejected,
        percentage: totalApps > 0 ? Math.round((rejected / totalApps) * 100) : 0,
        color: "bg-rose-500",
      },
    ];

    // 2. Attendance and leave per day (the last window is today)
    const onLeaveByIndex = new Map(leaveByDay.map((row) => [row.idx, row.onLeave]));
    const dailyFigures = days.map((window, index) => ({
      window,
      present: presentByDay
        .filter((row) => row.date >= window.start && row.date <= window.end)
        .reduce((sum, row) => sum + row._count._all, 0),
      onLeave: onLeaveByIndex.get(index) ?? 0,
    }));
    const todayFigures = dailyFigures[dailyFigures.length - 1];
    const todayPresent = todayFigures.present;
    const todayOnLeave = todayFigures.onLeave;

    const attendance: AttendanceAnalytics = {
      totalLogs: sumCounts(attendanceStatusGroups),
      byStatus: countsByKey(attendanceStatusGroups),
      pendingRegularizations: pendingRegCount,
    };

    // 3. Leave Stats
    const leaveCounts = countsByKey(leaveStatusGroups);
    const pendingLeaves = leaveCounts["PENDING"] ?? 0;
    const leaveCategoryCounts = new Map<string, number>();
    for (const group of leaveTypeGroups) {
      const catName = leaveTypeNameById.get(group.leaveTypeId) || "Other";
      leaveCategoryCounts.set(catName, (leaveCategoryCounts.get(catName) ?? 0) + group._count._all);
    }

    const leaves: LeaveAnalytics = {
      totalRequests: sumCounts(leaveStatusGroups),
      pendingCount: pendingLeaves,
      approvedCount: leaveCounts["APPROVED"] ?? 0,
      rejectedCount: leaveCounts["REJECTED"] ?? 0,
      byCategory: Array.from(leaveCategoryCounts.entries())
        .map(([category, count]) => ({ category, count }))
        .sort((a, b) => b.count - a.count || a.category.localeCompare(b.category)),
    };

    // 4. Workforce composition and (permission-gated) payroll analytics
    const workforceCounts = countsByKey(workforceStatusGroups);
    const workforceTotal = sumCounts(workforceStatusGroups);
    const fullTimeCount = Math.max(workforceTotal - internCount, 0);

    const latestPeriod = payrollSnapshot?.periods[0] ?? null;
    const latestSummary: PayrollCycleSummary = (latestPeriod &&
      payrollSnapshot?.summaries.get(latestPeriod.id)) || {
      totalEnrolled: 0,
      paid: 0,
      unpaid: 0,
      disbursed: 0,
      paidWithoutRecordedAmount: 0,
    };
    const totalEnrolled = latestSummary.totalEnrolled;

    const payroll: PayrollAnalytics | null = canPayroll
      ? {
          activeCycleCode: latestPeriod?.code ?? null,
          cycleStatus: latestPeriod?.status ?? null,
          totalEnrolled,
          paidCount: latestSummary.paid,
          pendingCount: latestSummary.unpaid,
          disbursedAmount: latestSummary.disbursed,
          paidWithoutRecordedAmount: latestSummary.paidWithoutRecordedAmount,
          // Only explicit, staff-recorded payout flags are counted; nothing is assumed.
          paidWorkforce: payoutFlags?.paid ?? 0,
          unpaidWorkforce: payoutFlags?.unpaid ?? 0,
          payoutNotConfigured: Math.max(
            workforceTotal - (payoutFlags?.paid ?? 0) - (payoutFlags?.unpaid ?? 0),
            0
          ),
        }
      : null;

    // 5. Platform Telemetry (raw count of recorded visitor rows; no baseline)
    const uniqueVisitors = visitorCount;
    const telemetry: PlatformTelemetry = {
      uniqueVisitors,
      totalApplications: totalApps,
      conversionRate:
        uniqueVisitors > 0 ? Math.round((totalApps / uniqueVisitors) * 100) : 0,
    };

    // 6. KPIs
    const activeStaff = opsReport.employees.byStatus["ACTIVE"] || (workforceCounts["ACTIVE"] ?? 0);

    const kpis: ExecutiveKpiSummary = {
      totalApplications: totalApps,
      totalHired: hired,
      activeOpenings: activeOpeningsCount,
      totalEmployees: opsReport.employees.totalEmployees || workforceTotal,
      activeEmployees: activeStaff,
      fullTimeCount,
      internCount,
      paidWorkforceCount: payroll ? payroll.paidWorkforce : null,
      unpaidWorkforceCount: payroll ? payroll.unpaidWorkforce : null,
      payrollDisbursedAmount: payroll ? payroll.disbursedAmount : null,
      activePayrollCycle: payroll ? payroll.activeCycleCode : null,
      payrollCompletionRate: payroll
        ? totalEnrolled > 0
          ? Math.round((payroll.paidCount / totalEnrolled) * 100)
          : 0
        : null,
      todayAttendancePresent: todayPresent,
      todayOnLeave,
      pendingLeavesCount: pendingLeaves,
      totalVisitors: uniqueVisitors,
    };

    // 7. Time-Series and Chart Datasets
    const monthlyByKey = new Map(monthlyRows.map((row) => [row.month, row]));
    const monthlyRecruitmentTrends: MonthlyRecruitmentTrend[] = months.map((bucket) => {
      const row = monthlyByKey.get(bucket.key);
      return {
        month: bucket.month,
        year: bucket.year,
        label: bucket.label,
        applications: row?.applications ?? 0,
        interviews: row?.interviews ?? 0,
        hired: row?.hired ?? 0,
      };
    });

    const totalEmps = opsReport.employees.totalEmployees || workforceTotal;
    const departmentDistribution: DepartmentChartData[] = opsReport.employees.byDepartment.map((d, idx) => ({
      department: d.department,
      count: d.count,
      percentage: totalEmps > 0 ? Math.round((d.count / totalEmps) * 100) : 0,
      color: DEPARTMENT_COLORS[idx % DEPARTMENT_COLORS.length],
    }));

    const employmentTypeDistribution = [
      {
        type: "Full-Time",
        count: fullTimeCount,
        percentage: totalEmps > 0 ? Math.round((fullTimeCount / totalEmps) * 100) : 0,
        color: "#3b82f6",
      },
      {
        type: "Interns",
        count: internCount,
        percentage: totalEmps > 0 ? Math.round((internCount / totalEmps) * 100) : 0,
        color: "#8b5cf6",
      },
    ];

    const activeTotal = activeStaff || 1;
    const attendanceDailyTrends: AttendanceDailyTrend[] = dailyFigures.map(({ window, present, onLeave }) => ({
      day: window.day,
      dateStr: window.dateStr,
      present,
      onLeave,
      attendanceRate: Math.min(100, Math.round((present / activeTotal) * 100)),
    }));

    // Only real payroll periods are charted; with no periods the chart is empty.
    const payrollCycleTrends: PayrollCycleTrend[] = (payrollSnapshot?.periods ?? []).map((period) => {
      const summary = payrollSnapshot?.summaries.get(period.id);
      return {
        cycle: period.code,
        disbursedAmount: summary?.disbursed ?? 0,
        paidCount: summary?.paid ?? 0,
        unpaidCount: summary?.unpaid ?? 0,
        paidWithoutRecordedAmount: summary?.paidWithoutRecordedAmount ?? 0,
      };
    });

    const charts: AnalyticsChartsData = {
      monthlyRecruitmentTrends,
      departmentDistribution,
      employmentTypeDistribution,
      attendanceDailyTrends,
      payrollCycleTrends,
    };

    return {
      metadata: opsReport.metadata,
      kpis,
      funnelStages,
      charts,
      recruitment: opsReport.recruitment,
      internship: opsReport.internship,
      employees: opsReport.employees,
      attendance,
      leaves,
      payroll,
      telemetry,
    };
  }

  /**
   * Approved leave requests overlapping each day window, counted in PostgreSQL. The day
   * boundaries are bound parameters; the result has one row per window.
   */
  private loadApprovedLeaveByDay(days: ReadonlyArray<DayWindow>): Prisma.PrismaPromise<DailyLeaveRow[]> {
    const dayRows = Prisma.join(
      days.map(
        (day, index) =>
          Prisma.sql`(${index}::int, ${toUtcTimestampLiteral(day.start)}::timestamp, ${toUtcTimestampLiteral(day.end)}::timestamp)`
      )
    );
    return prisma.$queryRaw<DailyLeaveRow[]>`
      SELECT d."idx" AS "idx", COUNT(l."id")::int AS "onLeave"
      FROM (VALUES ${dayRows}) AS d("idx", "dayStart", "dayEnd")
      LEFT JOIN "leave_requests" l
        ON l."status"::text = 'APPROVED'
       AND l."startDate" <= d."dayEnd"
       AND l."endDate" >= d."dayStart"
      GROUP BY d."idx"
      ORDER BY d."idx"`;
  }

  /**
   * The most recent payroll periods with their record totals grouped by status. Only
   * called for `canPayroll` viewers; the first period is the current cycle.
   */
  private async loadPayrollSnapshot(): Promise<PayrollSnapshot> {
    const periods = await prisma.payrollPeriod.findMany({
      orderBy: { startDate: "desc" },
      take: RECENT_PAYROLL_CYCLES,
      select: { id: true, code: true, status: true },
    });
    if (periods.length === 0) {
      return { periods: [], summaries: new Map() };
    }

    const periodIds = periods.map((period) => period.id);
    const [statusGroups, missingAmountGroups] = await Promise.all([
      prisma.payrollRecord.groupBy({
        by: ["payrollPeriodId", "status"],
        where: { payrollPeriodId: { in: periodIds } },
        _count: { _all: true },
        _sum: { disbursedAmount: true },
      }),
      prisma.payrollRecord.groupBy({
        by: ["payrollPeriodId"],
        where: { payrollPeriodId: { in: periodIds }, status: "PAID", disbursedAmount: null },
        _count: { _all: true },
      }),
    ]);

    const summaries = new Map<string, PayrollCycleSummary>();
    for (const period of periods) {
      summaries.set(period.id, summarisePayrollGroups(period.id, statusGroups, missingAmountGroups));
    }
    return { periods, summaries };
  }

  /**
   * Counts employees whose payout profile is recorded as paid / unpaid, grouped in
   * PostgreSQL (`EmployeePayoutProfile.isPaid`). Employees without a profile row are
   * "not configured". Only called for `canPayroll` viewers; no other column is read.
   */
  private async countRecordedPayoutFlags(): Promise<{ paid: number; unpaid: number }> {
    const groups = await prisma.employeePayoutProfile.groupBy({
      by: ["isPaid"],
      _count: { _all: true },
    });
    const count = (isPaid: boolean) => groups.find((group) => group.isPaid === isPaid)?._count._all ?? 0;
    return { paid: count(true), unpaid: count(false) };
  }

  /**
   * Generates a sanitized CSV export for the requested report type and records
   * an immutable AuditLog entry (`EXPORT_REPORT`).
   * Strictly omits private fields (personalPhone, emergencyContact, internalNotes, resumeStorageKey, etc.).
   * At most `MAX_EXPORT_ROWS` rows are exported; the result says when the limit was hit.
   */
  public async exportReportCsv(
    user: AuthenticatedUser,
    rawInput: ExportReportInput
  ): Promise<ReportCsvExportResult> {
    await this.assertReportAccess(user);

    const parsed = ExportReportSchema.safeParse(rawInput);
    if (!parsed.success) {
      throw new ValidationError(
        parsed.error.issues[0]?.message ?? "Invalid report export parameters.",
        parsed.error.issues
      );
    }

    const { reportType } = parsed.data;
    const startDate = parsed.data.startDate || undefined;
    const endDate = parsed.data.endDate || undefined;
    const department = parsed.data.department?.trim() || undefined;
    const openingId = parsed.data.openingId || undefined;

    const { start, end } = this.buildDateWindow(startDate, endDate);

    const createdAtFilter: Prisma.DateTimeFilter | undefined =
      start || end
        ? {
            ...(start ? { gte: start } : {}),
            ...(end ? { lte: end } : {}),
          }
        : undefined;

    // One row more than the limit tells us whether the export was cut off.
    const exportTake = MAX_EXPORT_ROWS + 1;

    let headers: string[] = [];
    let rows: string[][] = [];

    if (reportType === "RECRUITMENT_PIPELINE") {
      // Select ONLY non-private fields (no resumeStorageKey, no internalNotes, no phone)
      const applications = await prisma.application.findMany({
        where: {
          ...(createdAtFilter ? { createdAt: createdAtFilter } : {}),
          ...(openingId ? { openingId } : {}),
          ...(department
            ? {
                opening: {
                  department: { equals: department, mode: "insensitive" },
                },
              }
            : {}),
        },
        select: {
          referenceCode: true,
          status: true,
          isArchived: true,
          createdAt: true,
          candidate: {
            select: {
              user: {
                select: {
                  name: true,
                },
              },
            },
          },
          opening: {
            select: {
              title: true,
              department: true,
              type: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        take: exportTake,
      });

      headers = [
        "ReferenceCode",
        "CandidateName",
        "OpeningTitle",
        "Department",
        "OpeningType",
        "ApplicationStatus",
        "IsArchived",
        "SubmittedDate",
      ];

      rows = applications.map((app) => [
        escapeCsvCell(app.referenceCode),
        escapeCsvCell(app.candidate.user.name),
        escapeCsvCell(app.opening.title),
        escapeCsvCell(app.opening.department),
        escapeCsvCell(app.opening.type),
        escapeCsvCell(app.status),
        escapeCsvCell(app.isArchived),
        escapeCsvCell(app.createdAt.toISOString().slice(0, 10)),
      ]);
    } else if (reportType === "INTERNSHIP_LIFECYCLE") {
      // Select ONLY non-private fields (no finalReviewNotes, no supervisorFeedback)
      const enrollments = await prisma.internshipEnrollment.findMany({
        where: {
          ...(createdAtFilter ? { createdAt: createdAtFilter } : {}),
          ...(openingId || department
            ? {
                application: {
                  ...(openingId ? { openingId } : {}),
                  ...(department
                    ? {
                        opening: {
                          department: { equals: department, mode: "insensitive" },
                        },
                      }
                    : {}),
                },
              }
            : {}),
        },
        select: {
          status: true,
          workingDaysTarget: true,
          createdAt: true,
          user: {
            select: {
              name: true,
            },
          },
          application: {
            select: {
              referenceCode: true,
              opening: {
                select: {
                  title: true,
                  department: true,
                },
              },
            },
          },
          onboarding: { select: { status: true } },
          idCard: { select: { status: true, cardNumber: true } },
          // Verification codes grant public access to certificate details; never exported.
          certificate: { select: { status: true } },
        },
        orderBy: { createdAt: "desc" },
        take: exportTake,
      });

      headers = [
        "ApplicationRef",
        "InternName",
        "ProgrammeTitle",
        "Department",
        "EvaluationStatus",
        "WorkingDaysTarget",
        "OnboardingStatus",
        "IdCardStatus",
        "IdCardNumber",
        "CertificateStatus",
      ];

      rows = enrollments.map((enr) => [
        escapeCsvCell(enr.application.referenceCode),
        escapeCsvCell(enr.user.name),
        escapeCsvCell(enr.application.opening.title),
        escapeCsvCell(enr.application.opening.department),
        escapeCsvCell(enr.status),
        escapeCsvCell(enr.workingDaysTarget),
        escapeCsvCell(enr.onboarding?.status ?? "NOT_STARTED"),
        escapeCsvCell(enr.idCard?.status ?? "NOT_ISSUED"),
        escapeCsvCell(enr.idCard?.cardNumber ?? ""),
        escapeCsvCell(enr.certificate?.status ?? "NOT_ISSUED"),
      ]);
    } else {
      // EMPLOYEE_HEADCOUNT: Strictly omit personalPhone, emergencyContact, internalNotes
      const employees = await prisma.employee.findMany({
        where: {
          ...(createdAtFilter ? { joiningDate: createdAtFilter } : {}),
          ...(department
            ? { department: { equals: department, mode: "insensitive" } }
            : {}),
        },
        select: {
          employeeCode: true,
          department: true,
          designation: true,
          status: true,
          joiningDate: true,
          user: {
            select: {
              name: true,
            },
          },
          manager: {
            select: {
              employeeCode: true,
              user: { select: { name: true } },
            },
          },
        },
        orderBy: { employeeCode: "asc" },
        take: exportTake,
      });

      headers = [
        "EmployeeCode",
        "EmployeeName",
        "Department",
        "Designation",
        "Status",
        "JoiningDate",
        "ManagerName",
      ];

      rows = employees.map((emp) => [
        escapeCsvCell(emp.employeeCode),
        escapeCsvCell(emp.user.name),
        escapeCsvCell(emp.department),
        escapeCsvCell(emp.designation),
        escapeCsvCell(emp.status),
        escapeCsvCell(emp.joiningDate.toISOString().slice(0, 10)),
        escapeCsvCell(emp.manager?.user.name ?? ""),
      ]);
    }

    const truncated = rows.length > MAX_EXPORT_ROWS;
    if (truncated) {
      rows = rows.slice(0, MAX_EXPORT_ROWS);
    }

    const csvLines = [
      headers.join(","),
      ...rows.map((r) => r.join(",")),
    ];
    const csvContent = csvLines.join("\n");
    const generatedAt = new Date();

    const appliedFilters: AppliedReportMetadata["filters"] = {
      startDate: startDate ?? null,
      endDate: endDate ?? null,
      department: department ?? null,
      openingId: openingId ?? null,
    };

    // Track consequential export in AuditLog
    await prisma.auditLog.create({
      data: {
        actorId: user.id,
        actorRole: user.roles.join(","),
        action: "EXPORT_REPORT",
        resourceType: "Report",
        resourceId: reportType,
        diffPayload: {
          reportType,
          rowCount: rows.length,
          truncated,
          filters: appliedFilters,
        },
      },
    });

    const dateStamp = generatedAt.toISOString().slice(0, 10);
    return {
      reportType,
      fileName: `gara-${reportType.toLowerCase().replace(/_/g, "-")}-${dateStamp}.csv`,
      csvContent,
      rowCount: rows.length,
      truncated,
      generatedAt,
      appliedFilters,
    };
  }
}

export const reportService = new ReportService();
