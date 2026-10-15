import { LeaveRequestStatus } from "@prisma/client";

export { LeaveRequestStatus };

export interface LeaveTypeItem {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  isPaid: boolean;
  requiresApproval: boolean;
  isActive: boolean;
}

export interface LeaveRequestItem {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  leaveTypeId: string;
  leaveTypeCode: string;
  leaveTypeName: string;
  startDate: Date;
  endDate: Date;
  reason: string;
  status: LeaveRequestStatus;
  reviewNotes?: string | null;
  reviewedByName?: string | null;
  reviewedAt?: Date | null;
  createdAt: Date;
}
