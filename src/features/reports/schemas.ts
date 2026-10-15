import { z } from "zod";

export const ReportFilterSchema = z.object({
  startDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Start date must be in YYYY-MM-DD format")
    .optional()
    .or(z.literal("")),
  endDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "End date must be in YYYY-MM-DD format")
    .optional()
    .or(z.literal("")),
  department: z.string().trim().max(100).optional().or(z.literal("")),
  openingId: z.string().uuid().optional().or(z.literal("")),
});

export const ExportReportSchema = ReportFilterSchema.extend({
  reportType: z.enum([
    "RECRUITMENT_PIPELINE",
    "INTERNSHIP_LIFECYCLE",
    "EMPLOYEE_HEADCOUNT",
  ]),
});

export type ReportFilterInput = z.infer<typeof ReportFilterSchema>;
export type ExportReportInput = z.infer<typeof ExportReportSchema>;
