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
  /** True when the request belongs to the viewing user (reviewers cannot act on it). */
  isOwnRequest?: boolean;
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

/** Outcome of reviewing a leave request. */
export interface LeaveReviewResult {
  status: "APPROVED" | "REJECTED";
  /** Attendance days newly marked ON_LEAVE by an approval. */
  attendanceDaysMarked: number;
  /**
   * `YYYY-MM-DD` UTC days inside the approved range that were left unchanged because
   * attendance (a check-in, PRESENT/HALF_DAY, or a pending correction) is already recorded.
   */
  skippedDates: string[];
}

/** Data for a leave page: team view for `canLeave` staff, otherwise own requests only. */
export type LeavePageData =
  | {
      view: "team";
      requests: LeaveRequestItem[];
      leaveTypes: LeaveTypeItem[];
      stats: LeaveStats;
      employees: EmployeeOption[];
      canManageTypes: boolean;
      canSeedDefaultTypes: boolean;
    }
  | {
      view: "self";
      requests: LeaveRequestItem[];
      leaveTypes: LeaveTypeItem[];
      stats: LeaveStats;
      /** The signed-in user's own employee record, if one exists. */
      employees: EmployeeOption[];
    }
  | { view: "forbidden"; message: string };
