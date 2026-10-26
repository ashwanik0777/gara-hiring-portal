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

/** Database-level page of a list: 1-based page, bounded page size and the total count. */
export interface PageInfo {
  page: number;
  pageSize: number;
  total: number;
  pageCount: number;
}

/** Filters of the leave request list; every value travels in the URL. */
export interface LeaveListFilters {
  status?: LeaveRequestStatus;
  leaveTypeId?: string;
  search?: string;
}

export interface LeaveRequestPage {
  items: LeaveRequestItem[];
  page: PageInfo;
}

/** Approved leave overlapping today and approved leave starting in the next 14 days (bounded). */
export interface LeaveCalendar {
  onLeaveToday: LeaveRequestItem[];
  upcoming: LeaveRequestItem[];
}

/** Bounded employee picker options with the total number of matching employees. */
export interface EmployeeOptionsResult {
  options: EmployeeOption[];
  total: number;
}

/**
 * Calendar days on record for one employee (no entitlements or balances: OD-007), with
 * the most recent other requests.
 */
export interface EmployeeLeaveSummary {
  approvedDays: number;
  pendingDays: number;
  totalRequests: number;
  recentOther: LeaveRequestItem[];
}

export type LeaveTab = "requests" | "calendar" | "types" | "apply";

/** Data for a leave page: team view for `canLeave` staff, otherwise own requests only. */
export type LeavePageData =
  | {
      view: "team";
      requests: LeaveRequestItem[];
      page: PageInfo;
      filters: LeaveListFilters;
      calendar: LeaveCalendar;
      leaveTypes: LeaveTypeItem[];
      stats: LeaveStats;
      employees: EmployeeOption[];
      /** Total non-exited employees; the picker holds at most the first page of them. */
      employeesTotal: number;
      canManageTypes: boolean;
      canSeedDefaultTypes: boolean;
    }
  | {
      view: "self";
      requests: LeaveRequestItem[];
      page: PageInfo;
      filters: LeaveListFilters;
      calendar: LeaveCalendar;
      leaveTypes: LeaveTypeItem[];
      stats: LeaveStats;
      /** The signed-in user's own employee record, if one exists. */
      employees: EmployeeOption[];
      employeesTotal: number;
    }
  | { view: "forbidden"; message: string };
