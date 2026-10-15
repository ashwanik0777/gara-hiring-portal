import { z } from "zod";
import { AttendanceStatus, AttendanceEntryMethod } from "@prisma/client";

export const LogAttendanceSchema = z.object({
  employeeId: z.string().uuid("Invalid employee ID"),
  date: z.string().refine((val) => !isNaN(Date.parse(val)), {
    message: "Valid ISO date required for attendance date",
  }),
  checkInTime: z
    .string()
    .refine((val) => !isNaN(Date.parse(val)), {
      message: "Valid ISO date-time required for check-in",
    })
    .optional()
    .nullable(),
  checkOutTime: z
    .string()
    .refine((val) => !isNaN(Date.parse(val)), {
      message: "Valid ISO date-time required for check-out",
    })
    .optional()
    .nullable(),
  status: z.nativeEnum(AttendanceStatus).optional().default(AttendanceStatus.PRESENT),
  entryMethod: z.nativeEnum(AttendanceEntryMethod).optional().default(AttendanceEntryMethod.WEB_PORTAL),
  notes: z.string().max(1000).optional().nullable(),
});

export const RequestRegularizationSchema = z.object({
  attendanceRecordId: z.string().uuid("Invalid attendance record ID"),
  requestedCheckIn: z
    .string()
    .refine((val) => !isNaN(Date.parse(val)), {
      message: "Valid ISO date-time required for requested check-in",
    })
    .optional()
    .nullable(),
  requestedCheckOut: z
    .string()
    .refine((val) => !isNaN(Date.parse(val)), {
      message: "Valid ISO date-time required for requested check-out",
    })
    .optional()
    .nullable(),
  reason: z.string().min(5, "Reason must be at least 5 characters").max(1000),
});

export const ReviewRegularizationSchema = z.object({
  regularizationId: z.string().uuid("Invalid regularization ID"),
  status: z.enum(["APPROVED", "REJECTED"]),
  reviewNotes: z.string().max(1000).optional().nullable(),
});

export type LogAttendanceInput = z.infer<typeof LogAttendanceSchema>;
export type RequestRegularizationInput = z.infer<typeof RequestRegularizationSchema>;
export type ReviewRegularizationInput = z.infer<typeof ReviewRegularizationSchema>;
