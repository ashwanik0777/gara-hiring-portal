import { PayrollStatus } from "@prisma/client";

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
