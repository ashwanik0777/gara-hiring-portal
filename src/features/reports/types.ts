export type ReportType =
  | "RECRUITMENT_PIPELINE"
  | "INTERNSHIP_LIFECYCLE"
  | "EMPLOYEE_HEADCOUNT";

export interface ReportFilterCriteria {
  startDate?: string; // ISO date string YYYY-MM-DD
  endDate?: string;   // ISO date string YYYY-MM-DD
  department?: string;
  openingId?: string;
}

export interface AppliedReportMetadata {
  generatedAt: Date;
  generatedByUserId: string;
  generatedByName: string;
  periodLabel: string;
  filters: {
    startDate: string | null;
    endDate: string | null;
    department: string | null;
    openingId: string | null;
  };
}

export interface RecruitmentFunnelReport {
  metadata: AppliedReportMetadata;
  totalApplications: number;
  archivedApplications: number;
  byStatus: Record<string, number>;
  byOpening: Array<{
    openingId: string;
    title: string;
    department: string;
    type: string;
    applicationCount: number;
  }>;
}

export interface InternshipLifecycleReport {
  metadata: AppliedReportMetadata;
  totalEnrollments: number;
  byEvaluationStatus: Record<string, number>;
  onboardingCompletedCount: number;
  idCardsIssuedCount: number;
  certificatesActiveCount: number;
  certificatesRevokedCount: number;
}

export interface EmployeeHeadcountReport {
  metadata: AppliedReportMetadata;
  totalEmployees: number;
  byStatus: Record<string, number>;
  byDepartment: Array<{
    department: string;
    count: number;
  }>;
}

export interface ComprehensiveOperationsReport {
  metadata: AppliedReportMetadata;
  recruitment: RecruitmentFunnelReport;
  internship: InternshipLifecycleReport;
  employees: EmployeeHeadcountReport;
}

export interface ReportCsvExportResult {
  reportType: ReportType;
  fileName: string;
  csvContent: string;
  rowCount: number;
  /** True when more rows matched than the export limit; only the first rows are included. */
  truncated: boolean;
  generatedAt: Date;
  appliedFilters: AppliedReportMetadata["filters"];
}

// ─── Executive Analytics & Dashboard Types ─────────────────────────────────────

export interface ExecutiveKpiSummary {
  totalApplications: number;
  totalHired: number;
  activeOpenings: number;
  totalEmployees: number;
  activeEmployees: number;
  fullTimeCount: number;
  internCount: number;
  /**
   * Payroll KPIs are `null` when the viewer lacks the `canPayroll` permission.
   * `activePayrollCycle` is also `null` when no payroll period has been created.
   */
  paidWorkforceCount: number | null;
  unpaidWorkforceCount: number | null;
  payrollDisbursedAmount: number | null;
  activePayrollCycle: string | null;
  payrollCompletionRate: number | null;
  todayAttendancePresent: number;
  todayOnLeave: number;
  pendingLeavesCount: number;
  totalVisitors: number;
}

export interface FunnelStage {
  stage: string;
  count: number;
  percentage: number;
  color: string;
}

export interface AttendanceAnalytics {
  totalLogs: number;
  byStatus: Record<string, number>;
  pendingRegularizations: number;
}

export interface LeaveAnalytics {
  totalRequests: number;
  pendingCount: number;
  approvedCount: number;
  rejectedCount: number;
  byCategory: Array<{ category: string; count: number }>;
}

export interface PayrollAnalytics {
  /** `null` when no payroll period exists ("Not configured"). */
  activeCycleCode: string | null;
  cycleStatus: string | null;
  totalEnrolled: number;
  paidCount: number;
  pendingCount: number;
  /** Sum of recorded payout amounts for PAID records only; unset amounts are excluded. */
  disbursedAmount: number;
  /** PAID records whose employee has no recorded payout amount (excluded from the total). */
  paidWithoutRecordedAmount: number;
  /** Employees explicitly configured as paid / unpaid in their payout profile. */
  paidWorkforce: number;
  unpaidWorkforce: number;
  /** Employees without a configured payout profile. */
  payoutNotConfigured: number;
}

export interface PlatformTelemetry {
  uniqueVisitors: number;
  totalApplications: number;
  conversionRate: number;
}

export interface MonthlyRecruitmentTrend {
  month: string;
  year: number;
  label: string;
  applications: number;
  interviews: number;
  hired: number;
}

export interface DepartmentChartData {
  department: string;
  count: number;
  percentage: number;
  color: string;
}

export interface AttendanceDailyTrend {
  day: string;
  dateStr: string;
  present: number;
  onLeave: number;
  attendanceRate: number;
}

export interface PayrollCycleTrend {
  cycle: string;
  /** Sum of recorded payout amounts for PAID records only. */
  disbursedAmount: number;
  paidCount: number;
  unpaidCount: number;
  paidWithoutRecordedAmount: number;
}

export interface AnalyticsChartsData {
  monthlyRecruitmentTrends: MonthlyRecruitmentTrend[];
  departmentDistribution: DepartmentChartData[];
  employmentTypeDistribution: Array<{
    type: string;
    count: number;
    percentage: number;
    color: string;
  }>;
  attendanceDailyTrends: AttendanceDailyTrend[];
  payrollCycleTrends: PayrollCycleTrend[];
}

export interface ComprehensiveAnalyticsDashboardData {
  metadata: AppliedReportMetadata;
  kpis: ExecutiveKpiSummary;
  funnelStages: FunnelStage[];
  charts: AnalyticsChartsData;
  recruitment: RecruitmentFunnelReport;
  internship: InternshipLifecycleReport;
  employees: EmployeeHeadcountReport;
  attendance: AttendanceAnalytics;
  leaves: LeaveAnalytics;
  /** `null` when the viewer lacks the `canPayroll` permission. */
  payroll: PayrollAnalytics | null;
  telemetry: PlatformTelemetry;
}

// ─── Hiring Funnel Analytics ───────────────────────────────────────────────────

export type FunnelOpeningTypeFilter = "INTERNSHIP" | "FULL_TIME";

export interface HiringFunnelFilters {
  startDate: string | null;
  endDate: string | null;
  openingType: FunnelOpeningTypeFilter | null;
  openingId: string | null;
}

export interface HiringFunnelStageRow {
  stage: string;
  label: string;
  /** Applications in the cohort that ever reached this stage (from the stage history). */
  reached: number;
  /** `reached` as a share of all applications in the cohort (0–100, one decimal). */
  reachedPct: number;
  /** Applications that reached a later funnel stage after this one. */
  progressed: number;
  /** `progressed / reached`; null for the final stage or when nobody reached the stage. */
  conversionPct: number | null;
  /** Rejected / withdrawn while at this stage. */
  rejected: number;
  withdrawn: number;
  dropOffPct: number | null;
  /** Applications currently at this stage. */
  current: number;
  /** Average days spent in this stage (completed stays only); null without data. */
  averageDaysInStage: number | null;
  stageSamples: number;
  /** True for stages only internships pass through. */
  internshipOnly: boolean;
}

export interface TimeToHireRow {
  group: "ALL" | FunnelOpeningTypeFilter;
  label: string;
  hires: number;
  medianDays: number | null;
  averageDays: number | null;
}

export interface SourceBreakdownRow {
  source: string;
  label: string;
  applications: number;
  shortlisted: number;
  hired: number;
  /** hired / applications (0–100, one decimal); null without applications. */
  hireRatePct: number | null;
}

export interface TopOpeningRow {
  openingId: string;
  title: string;
  type: string;
  department: string;
  applications: number;
  hired: number;
}

export interface HiringFunnelReport {
  generatedAt: Date;
  periodLabel: string;
  filters: HiringFunnelFilters;
  totalApplications: number;
  totalHired: number;
  totalRejected: number;
  totalWithdrawn: number;
  stages: HiringFunnelStageRow[];
  timeToHire: TimeToHireRow[];
  sources: SourceBreakdownRow[];
  topOpenings: TopOpeningRow[];
  openingOptions: Array<{ id: string; title: string; type: string; status: string }>;
}

export interface HiringFunnelCsvExportResult {
  fileName: string;
  csvContent: string;
  rowCount: number;
  generatedAt: Date;
  filters: HiringFunnelFilters;
}
