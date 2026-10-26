import { PayrollStatus } from "@/types/enums";

export { PayrollStatus };

export type EmploymentCategory = "INTERN" | "FULL_TIME";

export interface PayrollPeriodItem {
  id: string;
  code: string;
  startDate: Date;
  endDate: Date;
  status: PayrollStatus;
  notes?: string | null;
  totalRecords: number;
}

export interface PayrollRecordItem {
  id: string;
  payrollPeriodId: string;
  payrollPeriodCode: string;
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  department: string;
  designation: string;
  status: PayrollStatus;
  disbursementReference?: string | null;
  disbursedAt?: Date | null;
  notes?: string | null;
  finalizedByName?: string | null;
  finalizedAt?: Date | null;
}

/**
 * Payout details as they may be sent to a browser. Account numbers and PANs are
 * masked on the server (last four characters only); `null` means "Not configured".
 */
export interface MaskedPayoutDetails {
  /** `null` when no payout profile has been configured for the employee. */
  isPaid: boolean | null;
  employmentType: EmploymentCategory | null;
  stipendAmount: number | null;
  bankName: string | null;
  accountNumberMasked: string | null;
  ifscCode: string | null;
  accountHolderName: string | null;
  panMasked: string | null;
}

export interface EmployeePayoutProfile extends MaskedPayoutDetails {
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  employeeEmail: string;
  department: string;
  designation: string;
  joiningDate: string;
}

export interface PayrollRecordWithEmployee extends MaskedPayoutDetails {
  id: string;
  payrollPeriodId: string;
  payrollPeriodCode: string;
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  employeeEmail: string;
  department: string;
  designation: string;
  status: PayrollStatus;
  disbursementReference?: string | null;
  disbursedAt?: string | null;
  notes?: string | null;
  finalizedByName?: string | null;
  finalizedAt?: string | null;
  createdAt: string;
}

export interface PayrollPeriodDetail {
  id: string;
  code: string;
  startDate: string;
  endDate: string;
  status: PayrollStatus;
  notes?: string | null;
  totalRecords: number;
  paidRecords: number;
  pendingRecords: number;
}

/** Counts and sums of the active period, computed in PostgreSQL. */
export interface PayrollStats {
  totalEnrolled: number;
  draftCount: number;
  finalizedCount: number;
  paidCount: number;
  voidCount: number;
  completionRate: number;
  /** Sum of configured amounts for PAID records; records without an amount are excluded. */
  totalDisbursedAmount: number;
  /** PAID records whose employee has no configured amount (excluded from the total). */
  paidRecordsWithoutAmount: number;
  totalPaidWorkforce: number;
  totalUnpaidWorkforce: number;
  totalUnconfiguredWorkforce: number;
}

/** Database-level page of a list: 1-based page, bounded page size and the total count. */
export interface PageInfo {
  page: number;
  pageSize: number;
  total: number;
  pageCount: number;
}

/** Record filters of the payout register; every value travels in the URL and is applied in SQL. */
export interface PayrollRecordFilters {
  status?: PayrollStatus;
  search?: string;
  /** Employment category recorded in the payout profile. */
  type?: EmploymentCategory;
}

/** What the payout profile dialog needs; satisfied by directory entries and register rows. */
export interface PayoutProfileTarget extends MaskedPayoutDetails {
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  employeeEmail: string;
  department: string;
  designation: string;
}

export type PayrollTab = "records" | "periods" | "profiles" | "export";

/** Read-side query of the staff console (validated from URL search params). */
export interface PayrollDashboardQueryInput {
  periodId?: string;
  status?: PayrollStatus;
  search?: string;
  type?: EmploymentCategory;
  page?: number;
  periodsPage?: number;
  directoryPage?: number;
  directorySearch?: string;
}

export interface PayrollDashboardData {
  /** Latest periods (one page, newest first); always includes the active period. */
  periods: PayrollPeriodDetail[];
  periodsPage: PageInfo;
  activePeriod: PayrollPeriodDetail | null;
  /** One page of the active period's records. */
  records: PayrollRecordWithEmployee[];
  recordsPage: PageInfo;
  recordFilters: PayrollRecordFilters;
  /** One page of the payout directory. */
  employees: EmployeePayoutProfile[];
  employeesPage: PageInfo;
  directorySearch?: string;
  stats: PayrollStats;
}

/** Register CSV built on the server from SQL (masked identifiers only). */
export interface PayrollRegisterExport {
  filename: string;
  csvContent: string;
  rowCount: number;
  /** True when more records matched than one export may contain. */
  truncated: boolean;
}

export interface MyPayrollRecord {
  id: string;
  payrollPeriodCode: string;
  periodStartDate: string;
  periodEndDate: string;
  status: PayrollStatus;
  disbursementReference: string | null;
  disbursedAt: string | null;
}

/** Self-service view: only the signed-in employee's own records, masked. */
export interface MyPayrollOverview {
  employee: {
    employeeCode: string;
    employeeName: string;
    department: string;
    designation: string;
  } | null;
  payout: MaskedPayoutDetails | null;
  /** One page of the employee's own records, newest period first. */
  records: MyPayrollRecord[];
  page: PageInfo;
}
