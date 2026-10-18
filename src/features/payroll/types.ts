import { PayrollStatus } from "@/types/enums";

export { PayrollStatus };

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

export interface EmployeePayoutProfile {
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  employeeEmail: string;
  department: string;
  designation: string;
  joiningDate: string;
  isPaid: boolean;
  employmentType: "INTERN" | "FULL_TIME";
  stipendAmount?: number | null;
  bankName?: string | null;
  accountNumber?: string | null;
  ifscCode?: string | null;
  accountHolderName?: string | null;
  panNumber?: string | null;
}

export interface PayrollRecordWithEmployee {
  id: string;
  payrollPeriodId: string;
  payrollPeriodCode: string;
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  employeeEmail: string;
  department: string;
  designation: string;
  isPaid: boolean;
  employmentType: "INTERN" | "FULL_TIME";
  status: PayrollStatus;
  disbursementReference?: string | null;
  disbursedAt?: string | null;
  notes?: string | null;
  finalizedByName?: string | null;
  finalizedAt?: string | null;
  createdAt: string;
  // Payout details from profile
  stipendAmount?: number | null;
  bankName?: string | null;
  accountNumber?: string | null;
  ifscCode?: string | null;
  accountHolderName?: string | null;
  panNumber?: string | null;
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
  completionRate: number;
  totalDisbursedAmount?: number;
  totalPaidWorkforce: number;
  totalUnpaidWorkforce: number;
}

export interface PayrollDashboardData {
  periods: PayrollPeriodDetail[];
  activePeriod: PayrollPeriodDetail | null;
  records: PayrollRecordWithEmployee[];
  employees: EmployeePayoutProfile[];
  stats: PayrollStats;
}
