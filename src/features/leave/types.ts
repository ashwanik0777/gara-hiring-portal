import { LeaveRequestStatus } from "@/types/enums";

export { LeaveRequestStatus };

export interface LeaveTypeItem {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  isPaid: boolean;
  requiresApproval: boolean;
  isActive: boolean;
  createdAt?: string;
  _count?: {
    leaveRequests: number;
  };
}

export interface LeaveRequestItem {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  employeeDepartment: string;
  employeeDesignation: string;
  employeeEmail?: string;
  leaveTypeId: string;
  leaveTypeCode: string;
  leaveTypeName: string;
  isPaid: boolean;
  startDate: string; // ISO String
  endDate: string;   // ISO String
  durationDays: number;
  reason: string;
  status: LeaveRequestStatus;
  reviewNotes?: string | null;
  reviewedById?: string | null;
  reviewedByName?: string | null;
  reviewedAt?: string | null;
  createdAt: string;
}

export interface LeaveStats {
  totalRequests: number;
  pendingCount: number;
  approvedCount: number;
  rejectedCount: number;
  onLeaveTodayCount: number;
  paidLeavesCount: number;
}

export interface EmployeeOption {
  id: string;
  employeeCode: string;
  name: string;
  email: string;
  department: string;
  designation: string;
}
