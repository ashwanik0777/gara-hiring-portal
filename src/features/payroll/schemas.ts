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

export const UpdatePayrollPeriodStatusSchema = z.object({
  periodId: z.string().uuid("Invalid period ID"),
  status: z.enum(["DRAFT", "FINALIZED", "PAID", "VOID"]),
  notes: z.string().max(1000).optional().nullable(),
});

export const BulkDisbursementSchema = z.object({
  periodId: z.string().uuid("Invalid period ID"),
  referencePrefix: z.string().min(3, "Batch prefix required (e.g. BANK-OCT26)").max(50),
  notes: z.string().max(1000).optional().nullable(),
});

export const UpdateEmployeePayoutProfileSchema = z.object({
  employeeId: z.string().uuid("Invalid employee ID"),
  isPaid: z.boolean().default(true),
  employmentType: z.enum(["INTERN", "FULL_TIME"]).default("FULL_TIME"),
  stipendAmount: z.number().min(0).max(100000000).optional().nullable(),
  bankName: z.string().max(100).optional().nullable(),
  accountNumber: z.string().max(50).optional().nullable(),
  ifscCode: z.string().max(20).optional().nullable(),
  accountHolderName: z.string().max(100).optional().nullable(),
  panNumber: z.string().max(20).optional().nullable(),
});

export const GeneratePayrollRecordsSchema = z.object({
  periodId: z.string().uuid("Invalid period ID"),
});

export type CreatePayrollPeriodInput = z.infer<typeof CreatePayrollPeriodSchema>;
export type RecordDisbursementInput = z.infer<typeof RecordDisbursementSchema>;
export type UpdatePayrollPeriodStatusInput = z.infer<typeof UpdatePayrollPeriodStatusSchema>;
export type BulkDisbursementInput = z.infer<typeof BulkDisbursementSchema>;
export type UpdateEmployeePayoutProfileInput = z.infer<typeof UpdateEmployeePayoutProfileSchema>;
export type GeneratePayrollRecordsInput = z.infer<typeof GeneratePayrollRecordsSchema>;
