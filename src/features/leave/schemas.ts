import { z } from "zod";

/**
 * Technical upper bound on the length of one leave request (inclusive calendar days).
 * It is not a leave policy (entitlements are pending OD-007); it only keeps the
 * leave → attendance sync bounded and rejects obviously malformed ranges.
 */
export const MAX_LEAVE_REQUEST_SPAN_DAYS = 366;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const isoDateString = (message: string) =>
  z
    .string()
    .max(64)
    .refine((val) => !isNaN(Date.parse(val)), { message });

function utcDayStart(value: string): number {
  const d = new Date(value);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

export const CreateLeaveRequestSchema = z
  .object({
    employeeId: z.string().uuid("Invalid employee ID"),
    leaveTypeId: z.string().uuid("Invalid leave type ID"),
    startDate: isoDateString("Valid ISO date required for start date"),
    endDate: isoDateString("Valid ISO date required for end date"),
    reason: z.string().trim().min(5, "Reason must be at least 5 characters").max(1000),
  })
  .refine((val) => utcDayStart(val.endDate) >= utcDayStart(val.startDate), {
    message: "End date cannot precede start date.",
    path: ["endDate"],
  })
  .refine(
    (val) =>
      (utcDayStart(val.endDate) - utcDayStart(val.startDate)) / MS_PER_DAY + 1 <=
      MAX_LEAVE_REQUEST_SPAN_DAYS,
    {
      message: `A single leave request cannot span more than ${MAX_LEAVE_REQUEST_SPAN_DAYS} days.`,
      path: ["endDate"],
    }
  );

export const ReviewLeaveRequestSchema = z.object({
  requestId: z.string().uuid("Invalid leave request ID"),
  status: z.enum(["APPROVED", "REJECTED"]),
  reviewNotes: z.string().trim().max(1000).optional().nullable(),
});

export const CreateLeaveTypeSchema = z.object({
  code: z
    .string()
    .trim()
    .min(2, "Code must be at least 2 characters")
    .max(30, "Code cannot exceed 30 characters")
    .regex(/^[A-Z0-9_]+$/, "Code must be uppercase letters, numbers, and underscores only"),
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(100),
  description: z.string().trim().max(500).optional().nullable(),
  isPaid: z.boolean().default(true),
  requiresApproval: z.boolean().default(true),
});

export const ToggleLeaveTypeSchema = z.object({
  id: z.string().uuid("Invalid leave type ID"),
  isActive: z.boolean(),
});

export type CreateLeaveRequestInput = z.infer<typeof CreateLeaveRequestSchema>;
export type ReviewLeaveRequestInput = z.infer<typeof ReviewLeaveRequestSchema>;
export type CreateLeaveTypeInput = z.infer<typeof CreateLeaveTypeSchema>;
export type ToggleLeaveTypeInput = z.infer<typeof ToggleLeaveTypeSchema>;
