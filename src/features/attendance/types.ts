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
