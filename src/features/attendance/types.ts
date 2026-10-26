import {
  AttendanceStatus,
  AttendanceEntryMethod,
  RegularizationStatus,
} from "@prisma/client";

export { AttendanceStatus, AttendanceEntryMethod, RegularizationStatus };

export interface AttendanceRecordItem {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  date: Date;
  checkInTime?: Date | null;
  checkOutTime?: Date | null;
  status: AttendanceStatus;
  entryMethod: AttendanceEntryMethod;
  notes?: string | null;
}

export interface AttendanceRegularizationItem {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  attendanceRecordId: string;
  date: Date;
  requestedCheckIn?: Date | null;
  requestedCheckOut?: Date | null;
  reason: string;
  status: RegularizationStatus;
  reviewNotes?: string | null;
  reviewedByName?: string | null;
  reviewedAt?: Date | null;
  createdAt: Date;
}

/** Serializable attendance row passed to Client Components (ISO strings). */
export interface AttendanceRecordView {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  department: string;
  designation: string;
  date: string;
  checkInTime: string | null;
  checkOutTime: string | null;
  status: AttendanceStatus;
  entryMethod: AttendanceEntryMethod;
  notes: string | null;
}

export interface AttendanceEmployeeOption {
  id: string;
  employeeCode: string;
  name: string;
  email: string;
  department: string;
  designation: string;
}

/** Database-level page of a list: 1-based page, bounded page size and the total count. */
export interface PageInfo {
  page: number;
  pageSize: number;
  total: number;
  pageCount: number;
}

/** The calendar month shown (`YYYY-MM`) and its UTC day window (ISO strings). */
export interface AttendanceWindow {
  month: string;
  start: string;
  endExclusive: string;
}

/** List filters of an attendance page; every value travels in the URL. */
export interface AttendanceListFilters {
  month: string;
  status?: AttendanceStatus;
  search?: string;
  employeeId?: string;
}

/** Today's recorded statuses, counted in the database. */
export interface AttendanceTodayCounts {
  dateKey: string;
  present: number;
  onLeaveOrAbsent: number;
}

export interface AttendanceHistoryPage {
  items: AttendanceRecordItem[];
  page: PageInfo;
}

/**
 * Data for an attendance page. Staff holding `canAttendance` receive the team view;
 * everyone else (where the page allows it) receives only their own records.
 */
export type AttendancePageData =
  | {
      view: "team";
      /** First page of the employee picker (server-bounded). */
      employees: AttendanceEmployeeOption[];
      employeesTotal: number;
      records: AttendanceRecordView[];
      page: PageInfo;
      filters: AttendanceListFilters;
      window: AttendanceWindow;
      todayCounts: AttendanceTodayCounts;
      pendingRegularizationCount: number;
      /** Employee record of the signed-in staff member, if one exists. */
      selfEmployeeId: string | null;
    }
  | {
      view: "self";
      employee: AttendanceEmployeeOption | null;
      records: AttendanceRecordView[];
      page: PageInfo;
      filters: AttendanceListFilters;
      window: AttendanceWindow;
      /** Today's own row (UTC day), independent of the month being browsed. */
      todayRecord: AttendanceRecordView | null;
    }
  | { view: "forbidden"; message: string };
