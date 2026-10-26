import { z } from "zod";

const isoDateString = (message: string) =>
  z
    .string()
    .max(64)
    .refine((val) => !isNaN(Date.parse(val)), { message });

/**
 * Statuses staff may record directly. `REGULARIZATION_PENDING` is a workflow state
 * and is never set by hand.
 */
export const STAFF_SETTABLE_ATTENDANCE_STATUSES = [
  "PRESENT",
  "HALF_DAY",
  "ON_LEAVE",
  "ABSENT",
] as const;

/**
 * Staff entry or correction of another employee's attendance (requires `canAttendance`).
 * Employees never use this schema: self check-in/out takes no client input.
 */
export const LogAttendanceSchema = z
  .object({
    employeeId: z.string().uuid("Invalid employee ID"),
    date: isoDateString("Valid ISO date required for attendance date"),
    checkInTime: isoDateString("Valid ISO date-time required for check-in").optional().nullable(),
    checkOutTime: isoDateString("Valid ISO date-time required for check-out").optional().nullable(),
    status: z.enum(STAFF_SETTABLE_ATTENDANCE_STATUSES).optional().default("PRESENT"),
    notes: z.string().trim().max(1000).optional().nullable(),
  })
  .refine((val) => !val.checkOutTime || Boolean(val.checkInTime), {
    message: "A check-out time requires a check-in time.",
    path: ["checkOutTime"],
  })
  .refine(
    (val) =>
      !val.checkInTime ||
      !val.checkOutTime ||
      Date.parse(val.checkOutTime) > Date.parse(val.checkInTime),
    { message: "Check-out time must be after check-in time.", path: ["checkOutTime"] }
  );

export const RequestRegularizationSchema = z
  .object({
    attendanceRecordId: z.string().uuid("Invalid attendance record ID"),
    requestedCheckIn: isoDateString("Valid ISO date-time required for requested check-in")
      .optional()
      .nullable(),
    requestedCheckOut: isoDateString("Valid ISO date-time required for requested check-out")
      .optional()
      .nullable(),
    reason: z.string().trim().min(5, "Reason must be at least 5 characters").max(1000),
  })
  .refine((val) => Boolean(val.requestedCheckIn) || Boolean(val.requestedCheckOut), {
    message: "Provide the corrected check-in and/or check-out time.",
    path: ["requestedCheckIn"],
  })
  .refine(
    (val) =>
      !val.requestedCheckIn ||
      !val.requestedCheckOut ||
      Date.parse(val.requestedCheckOut) > Date.parse(val.requestedCheckIn),
    { message: "Requested check-out must be after requested check-in.", path: ["requestedCheckOut"] }
  );

export const ReviewRegularizationSchema = z.object({
  regularizationId: z.string().uuid("Invalid regularization ID"),
  status: z.enum(["APPROVED", "REJECTED"]),
  reviewNotes: z.string().trim().max(1000).optional().nullable(),
});

export type LogAttendanceInput = z.infer<typeof LogAttendanceSchema>;
export type RequestRegularizationInput = z.infer<typeof RequestRegularizationSchema>;
export type ReviewRegularizationInput = z.infer<typeof ReviewRegularizationSchema>;

// ---------------------------------------------------------------------------
// Read-side query parameters (URL search params are untrusted input)
// ---------------------------------------------------------------------------

/** Upper bound of one page of attendance rows. */
export const ATTENDANCE_MAX_PAGE_SIZE = 50;
export const ATTENDANCE_DEFAULT_PAGE_SIZE = 25;

const ATTENDANCE_LIST_STATUSES = [
  "PRESENT",
  "HALF_DAY",
  "ON_LEAVE",
  "ABSENT",
  "REGULARIZATION_PENDING",
] as const;

/** Invalid or unknown values fall back to the default instead of failing the page. */
export const AttendanceListQuerySchema = z.object({
  /** Calendar month `YYYY-MM`; defaults to the current month in the business time zone. */
  month: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
    .optional()
    .catch(undefined),
  status: z.enum(ATTENDANCE_LIST_STATUSES).optional().catch(undefined),
  q: z.string().trim().min(1).max(100).optional().catch(undefined),
  employee: z.string().uuid().optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(100000).optional().catch(undefined),
});

export type AttendanceListQuery = z.infer<typeof AttendanceListQuerySchema>;

/** Employee picker search (staff attendance entry form). */
export const AttendanceEmployeeSearchSchema = z.object({
  query: z.string().trim().max(100),
});
