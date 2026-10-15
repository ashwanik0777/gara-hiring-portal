import { z } from "zod";

export const CreateLeaveRequestSchema = z.object({
  employeeId: z.string().uuid("Invalid employee ID"),
  leaveTypeId: z.string().uuid("Invalid leave type ID"),
  startDate: z.string().refine((val) => !isNaN(Date.parse(val)), {
    message: "Valid ISO date required for start date",
  }),
  endDate: z.string().refine((val) => !isNaN(Date.parse(val)), {
    message: "Valid ISO date required for end date",
  }),
  reason: z.string().min(5, "Reason must be at least 5 characters").max(1000),
});

export const ReviewLeaveRequestSchema = z.object({
  requestId: z.string().uuid("Invalid leave request ID"),
  status: z.enum(["APPROVED", "REJECTED"]),
  reviewNotes: z.string().max(1000).optional().nullable(),
});

export type CreateLeaveRequestInput = z.infer<typeof CreateLeaveRequestSchema>;
export type ReviewLeaveRequestInput = z.infer<typeof ReviewLeaveRequestSchema>;
