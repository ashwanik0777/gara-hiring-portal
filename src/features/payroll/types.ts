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

export interface PayrollDashboardData {
  periods: PayrollPeriodDetail[];
  activePeriod: PayrollPeriodDetail | null;
  records: PayrollRecordWithEmployee[];
  employees: EmployeePayoutProfile[];
  stats: PayrollStats;
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
  records: MyPayrollRecord[];
}
