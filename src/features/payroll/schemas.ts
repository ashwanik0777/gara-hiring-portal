import { z } from "zod";

export const CreatePayrollPeriodSchema = z.object({
  code: z.string().min(4, "Period code required (e.g. 2026-04)").max(20),
  startDate: z.string().refine((val) => !isNaN(Date.parse(val)), {
    message: "Valid ISO date required for start date",
  }),
  endDate: z.string().refine((val) => !isNaN(Date.parse(val)), {
    message: "Valid ISO date required for end date",
  }),
  notes: z.string().max(1000).optional().nullable(),
});

export const RecordDisbursementSchema = z.object({
  payrollRecordId: z.string().uuid("Invalid payroll record ID"),
  disbursementReference: z.string().min(3, "Disbursement reference/UTR required").max(100),
  notes: z.string().max(1000).optional().nullable(),
});

export type CreatePayrollPeriodInput = z.infer<typeof CreatePayrollPeriodSchema>;
export type RecordDisbursementInput = z.infer<typeof RecordDisbursementSchema>;
