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

/**
 * Data for an attendance page. Staff holding `canAttendance` receive the team view;
 * everyone else (where the page allows it) receives only their own records.
 */
export type AttendancePageData =
  | {
      view: "team";
      employees: AttendanceEmployeeOption[];
      records: AttendanceRecordView[];
      pendingRegularizationCount: number;
      /** Employee record of the signed-in staff member, if one exists. */
      selfEmployeeId: string | null;
    }
  | {
      view: "self";
      employee: AttendanceEmployeeOption | null;
      records: AttendanceRecordView[];
    }
  | { view: "forbidden"; message: string };
