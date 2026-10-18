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

export const CreateLeaveTypeSchema = z.object({
  code: z
    .string()
    .min(2, "Code must be at least 2 characters")
    .max(30, "Code cannot exceed 30 characters")
    .regex(/^[A-Z0-9_]+$/, "Code must be uppercase letters, numbers, and underscores only"),
  name: z.string().min(2, "Name must be at least 2 characters").max(100),
  description: z.string().max(500).optional().nullable(),
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
