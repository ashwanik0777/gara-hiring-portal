import { prisma } from "@/lib/db";
import { locatePayoutProfileBlock } from "@/features/payroll/payout-notes";
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

interface RecordedPayoutProfile {
  isPaid: boolean | null;
  stipendAmount: number | null;
}

/**
 * Reads the staff-entered payout profile stored after the `PAYROLL_PROFILE:` marker
 * in `Employee.internalNotes`. The JSON object is extracted with a string-aware
 * brace scan (so values containing `}` do not truncate it). Missing or malformed
 * data yields `null` fields — never a default amount.
 */
export function readRecordedPayoutProfile(
  internalNotes: string | null | undefined
): RecordedPayoutProfile {
  const empty: RecordedPayoutProfile = { isPaid: null, stipendAmount: null };
  if (!internalNotes) return empty;
  const block = locatePayoutProfileBlock(internalNotes);
  if (!block) return empty;

  try {
    const parsed: unknown = JSON.parse(block.json);
    if (typeof parsed !== "object" || parsed === null) return empty;
    const record = parsed as Record<string, unknown>;
    const amount = record.stipendAmount;
    return {
      isPaid: typeof record.isPaid === "boolean" ? record.isPaid : null,
      stipendAmount:
        typeof amount === "number" && Number.isFinite(amount) && amount >= 0 ? amount : null,
    };
  } catch {
    return empty;
  }
}

/**
 * Sums the amounts snapshotted at disbursement for PAID records; records without a
 * recorded amount are counted, never guessed from the current payout profile.
 */
function summarisePaidRecords(
  records: Array<{ status: string; disbursedAmount: { toNumber(): number } | null }>
): { disbursed: number; paid: number; unpaid: number; paidWithoutRecordedAmount: number } {
  let disbursed = 0;
  let paid = 0;
  let unpaid = 0;
  let paidWithoutRecordedAmount = 0;
  for (const rec of records) {
    if (rec.status !== "PAID") {
      unpaid++;
      continue;
    }
    paid++;
    if (rec.disbursedAmount == null) {
      paidWithoutRecordedAmount++;
    } else {
      disbursed += rec.disbursedAmount.toNumber();
    }
  }
  return { disbursed, paid, unpaid, paidWithoutRecordedAmount };
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

    // 1. Recruitment Funnel Query (Real DB Data, sanitized fields)
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

    const applications = await prisma.application.findMany({
      where: applicationWhere,
      select: {
        id: true,
        status: true,
        isArchived: true,
        openingId: true,
        opening: {
          select: {
            id: true,
            title: true,
            department: true,
            type: true,
          },
        },
      },
    });

    const byStatus: Record<string, number> = {};
    const openingMap = new Map<
      string,
      {
        openingId: string;
        title: string;
        department: string;
        type: string;
        applicationCount: number;
      }
    >();
    let archivedApplications = 0;

    for (const app of applications) {
      byStatus[app.status] = (byStatus[app.status] ?? 0) + 1;
      if (app.isArchived) {
        archivedApplications += 1;
      }
      const existing = openingMap.get(app.openingId);
      if (existing) {
        existing.applicationCount += 1;
      } else {
        openingMap.set(app.openingId, {
          openingId: app.opening.id,
          title: app.opening.title,
          department: app.opening.department,
          type: app.opening.type,
          applicationCount: 1,
        });
      }
    }

    const recruitment: RecruitmentFunnelReport = {
      metadata,
      totalApplications: applications.length,
      archivedApplications,
      byStatus,
      byOpening: Array.from(openingMap.values()).sort(
        (a, b) => b.applicationCount - a.applicationCount
      ),
    };

    // 2. Internship Lifecycle Query
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

    const enrollments = await prisma.internshipEnrollment.findMany({
      where: enrollmentWhere,
      select: {
        id: true,
        status: true,
        onboarding: { select: { status: true } },
        idCard: { select: { status: true } },
        certificate: { select: { status: true } },
      },
    });

    const byEvaluationStatus: Record<string, number> = {};
    let onboardingCompletedCount = 0;
    let idCardsIssuedCount = 0;
    let certificatesActiveCount = 0;
    let certificatesRevokedCount = 0;

    for (const enr of enrollments) {
      byEvaluationStatus[enr.status] = (byEvaluationStatus[enr.status] ?? 0) + 1;
      if (enr.onboarding?.status === OnboardingStatus.COMPLETED) {
        onboardingCompletedCount += 1;
      }
      if (enr.idCard?.status === IdCardStatus.ISSUED) {
        idCardsIssuedCount += 1;
      }
      if (enr.certificate?.status === CertificateStatus.ACTIVE) {
        certificatesActiveCount += 1;
      }
      if (enr.certificate?.status === CertificateStatus.REVOKED) {
        certificatesRevokedCount += 1;
      }
    }

    const internship: InternshipLifecycleReport = {
      metadata,
      totalEnrollments: enrollments.length,
      byEvaluationStatus,
      onboardingCompletedCount,
      idCardsIssuedCount,
      certificatesActiveCount,
      certificatesRevokedCount,
    };

    // 3. Employee Headcount Query (Strictly excludes confidential fields)
    const employeeWhere: Prisma.EmployeeWhereInput = {
      ...(createdAtFilter ? { joiningDate: createdAtFilter } : {}),
      ...(department
        ? { department: { equals: department, mode: "insensitive" } }
        : {}),
    };

    const employees = await prisma.employee.findMany({
      where: employeeWhere,
      select: {
        id: true,
        status: true,
        department: true,
      },
    });

    const empByStatus: Record<string, number> = {};
    const deptCounts = new Map<string, number>();

    for (const emp of employees) {
      empByStatus[emp.status] = (empByStatus[emp.status] ?? 0) + 1;
      deptCounts.set(emp.department, (deptCounts.get(emp.department) ?? 0) + 1);
    }

    const employeesReport: EmployeeHeadcountReport = {
      metadata,
      totalEmployees: employees.length,
      byStatus: empByStatus,
      byDepartment: Array.from(deptCounts.entries())
        .map(([dept, count]) => ({ department: dept, count }))
        .sort((a, b) => b.count - a.count),
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
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

    const [
      activeOpeningsCount,
      allAttendanceLogs,
      pendingRegCount,
      allLeaves,
      latestPayrollPeriod,
      allEmployees,
      visitorCount,
      allApplications,
      allPayrollPeriods,
    ] = await Promise.all([
      prisma.opening.count({ where: { status: "PUBLISHED" } }),
      prisma.attendanceRecord
        .findMany({
          select: { status: true, date: true },
        }),
      prisma.attendanceRegularization.count({ where: { status: "PENDING" } }),
      prisma.leaveRequest
        .findMany({
          select: {
            status: true,
            startDate: true,
            endDate: true,
            leaveType: { select: { name: true } },
          },
        }),
      canPayroll
        ? prisma.payrollPeriod
            .findFirst({
              orderBy: { startDate: "desc" },
              include: {
                records: {
                  select: {
                    status: true,
                    disbursedAmount: true,
                  },
                },
              },
            })
        : Promise.resolve(null),
      prisma.employee
        .findMany({
          select: {
            designation: true,
            department: true,
            // Payout profiles live in internalNotes; only read them for payroll viewers.
            internalNotes: canPayroll,
            status: true,
          },
        }),
      prisma.siteVisitor.count(),
      prisma.application
        .findMany({
          select: {
            createdAt: true,
            status: true,
          },
        }),
      canPayroll
        ? prisma.payrollPeriod
            .findMany({
              orderBy: { startDate: "desc" },
              take: 5,
              include: {
                records: {
                  select: {
                    status: true,
                    disbursedAmount: true,
                  },
                },
              },
            })
        : Promise.resolve([]),
    ]);

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

    // 2. Attendance Stats
    const attByStatus: Record<string, number> = {};
    let todayPresent = 0;
    for (const att of allAttendanceLogs) {
      attByStatus[att.status] = (attByStatus[att.status] || 0) + 1;
      const attDate = new Date(att.date);
      if (attDate >= todayStart && attDate <= todayEnd && att.status === "PRESENT") {
        todayPresent++;
      }
    }

    const attendance: AttendanceAnalytics = {
      totalLogs: allAttendanceLogs.length,
      byStatus: attByStatus,
      pendingRegularizations: pendingRegCount,
    };

    // 3. Leave Stats
    let todayOnLeave = 0;
    let pendingLeaves = 0;
    let approvedLeaves = 0;
    let rejectedLeaves = 0;
    const leaveCategoryCounts: Record<string, number> = {};

    for (const lv of allLeaves) {
      if (lv.status === "PENDING") pendingLeaves++;
      if (lv.status === "APPROVED") approvedLeaves++;
      if (lv.status === "REJECTED") rejectedLeaves++;

      const s = new Date(lv.startDate);
      const e = new Date(lv.endDate);
      if (lv.status === "APPROVED" && s <= todayEnd && e >= todayStart) {
        todayOnLeave++;
      }

      const catName = lv.leaveType?.name || "Other";
      leaveCategoryCounts[catName] = (leaveCategoryCounts[catName] || 0) + 1;
    }

    const leaves: LeaveAnalytics = {
      totalRequests: allLeaves.length,
      pendingCount: pendingLeaves,
      approvedCount: approvedLeaves,
      rejectedCount: rejectedLeaves,
      byCategory: Object.entries(leaveCategoryCounts).map(([category, count]) => ({
        category,
        count,
      })),
    };

    // 4. Workforce composition and (permission-gated) payroll analytics
    let paidWorkforceCount = 0;
    let unpaidWorkforceCount = 0;
    let payoutNotConfiguredCount = 0;
    let fullTimeCount = 0;
    let internCount = 0;

    for (const emp of allEmployees) {
      const isIntern =
        emp.designation.toLowerCase().includes("intern") ||
        emp.department.toLowerCase().includes("intern");
      if (isIntern) internCount++;
      else fullTimeCount++;

      if (canPayroll) {
        // Only explicit, staff-recorded payout flags are counted; nothing is assumed.
        const { isPaid } = readRecordedPayoutProfile(emp.internalNotes);
        if (isPaid === true) paidWorkforceCount++;
        else if (isPaid === false) unpaidWorkforceCount++;
        else payoutNotConfiguredCount++;
      }
    }

    const latestSummary = summarisePaidRecords(latestPayrollPeriod?.records ?? []);
    const totalEnrolled = latestPayrollPeriod?.records.length ?? 0;

    const payroll: PayrollAnalytics | null = canPayroll
      ? {
          activeCycleCode: latestPayrollPeriod?.code ?? null,
          cycleStatus: latestPayrollPeriod?.status ?? null,
          totalEnrolled,
          paidCount: latestSummary.paid,
          pendingCount: latestSummary.unpaid,
          disbursedAmount: latestSummary.disbursed,
          paidWithoutRecordedAmount: latestSummary.paidWithoutRecordedAmount,
          paidWorkforce: paidWorkforceCount,
          unpaidWorkforce: unpaidWorkforceCount,
          payoutNotConfigured: payoutNotConfiguredCount,
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
    const activeStaff =
      opsReport.employees.byStatus["ACTIVE"] ||
      allEmployees.filter((e) => e.status === "ACTIVE").length;

    const kpis: ExecutiveKpiSummary = {
      totalApplications: totalApps,
      totalHired: hired,
      activeOpenings: activeOpeningsCount,
      totalEmployees: opsReport.employees.totalEmployees || allEmployees.length,
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
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const chartNow = new Date();
    const pastMonths: { year: number; monthIdx: number; label: string; month: string }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(chartNow.getFullYear(), chartNow.getMonth() - i, 1);
      pastMonths.push({
        year: d.getFullYear(),
        monthIdx: d.getMonth(),
        month: monthNames[d.getMonth()],
        label: `${monthNames[d.getMonth()]} ${d.getFullYear()}`,
      });
    }

    const monthlyRecruitmentTrends: MonthlyRecruitmentTrend[] = pastMonths.map((m) => {
      let apps = 0;
      let interviews = 0;
      let hiredCount = 0;

      for (const app of allApplications) {
        const appDate = new Date(app.createdAt);
        if (appDate.getFullYear() === m.year && appDate.getMonth() === m.monthIdx) {
          apps++;
          if (app.status.includes("INTERVIEW") || app.status === "EVALUATION_SELECTED") {
            interviews++;
          }
          if (app.status === "HIRED") {
            hiredCount++;
          }
        }
      }

      return {
        month: m.month,
        year: m.year,
        label: m.label,
        applications: apps,
        interviews,
        hired: hiredCount,
      };
    });

    const deptColors = [
      "#3b82f6",
      "#8b5cf6",
      "#10b981",
      "#f59e0b",
      "#06b6d4",
      "#ec4899",
      "#6366f1",
      "#14b8a6",
    ];
    const totalEmps = opsReport.employees.totalEmployees || allEmployees.length;
    const departmentDistribution: DepartmentChartData[] = opsReport.employees.byDepartment.map((d, idx) => ({
      department: d.department,
      count: d.count,
      percentage: totalEmps > 0 ? Math.round((d.count / totalEmps) * 100) : 0,
      color: deptColors[idx % deptColors.length],
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

    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const attendanceDailyTrends: AttendanceDailyTrend[] = [];
    for (let i = 6; i >= 0; i--) {
      const targetDate = new Date();
      targetDate.setDate(targetDate.getDate() - i);
      const dayStart = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), 0, 0, 0, 0);
      const dayEnd = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), 23, 59, 59, 999);

      let presentCount = 0;
      for (const log of allAttendanceLogs) {
        const lDate = new Date(log.date);
        if (lDate >= dayStart && lDate <= dayEnd && log.status === "PRESENT") {
          presentCount++;
        }
      }

      let leaveCount = 0;
      for (const lv of allLeaves) {
        if (lv.status === "APPROVED") {
          const s = new Date(lv.startDate);
          const e = new Date(lv.endDate);
          if (s <= dayEnd && e >= dayStart) {
            leaveCount++;
          }
        }
      }

      const activeTotal = activeStaff || 1;
      const attRate = Math.min(100, Math.round((presentCount / activeTotal) * 100));

      attendanceDailyTrends.push({
        day: dayNames[targetDate.getDay()],
        dateStr: `${monthNames[targetDate.getMonth()]} ${targetDate.getDate()}`,
        present: presentCount,
        onLeave: leaveCount,
        attendanceRate: attRate,
      });
    }

    // Only real payroll periods are charted; with no periods the chart is empty.
    const payrollCycleTrends: PayrollCycleTrend[] = allPayrollPeriods
      .slice(0, 5)
      .map((p) => {
        const summary = summarisePaidRecords(p.records);
        return {
          cycle: p.code,
          disbursedAmount: summary.disbursed,
          paidCount: summary.paid,
          unpaidCount: summary.unpaid,
          paidWithoutRecordedAmount: summary.paidWithoutRecordedAmount,
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
   * Generates a sanitized CSV export for the requested report type and records
   * an immutable AuditLog entry (`EXPORT_REPORT`).
   * Strictly omits private fields (personalPhone, emergencyContact, internalNotes, resumeStorageKey, etc.).
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
      generatedAt,
      appliedFilters,
    };
  }
}

export const reportService = new ReportService();
