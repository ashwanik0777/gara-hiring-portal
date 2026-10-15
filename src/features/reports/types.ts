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
  generatedAt: Date;
  appliedFilters: AppliedReportMetadata["filters"];
}
