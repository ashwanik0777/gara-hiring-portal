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

/** True for a real calendar date in YYYY-MM-DD form (rejects values such as 2026-02-31). */
function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

const uuidSchema = z.string().uuid();

/** Optional date filter; "" (an empty form field) means no limit. */
const optionalCalendarDate = (label: string) =>
  z
    .string()
    .optional()
    .refine((value) => !value || isCalendarDate(value), `${label} must be a valid date (YYYY-MM-DD).`);

/** Filters of the hiring funnel section (cohort = applications submitted in the range). */
export const HiringFunnelFilterSchema = z.object({
  startDate: optionalCalendarDate("Start date"),
  endDate: optionalCalendarDate("End date"),
  openingType: z.enum(["", "INTERNSHIP", "FULL_TIME"], "Choose an opening type from the list.").optional(),
  openingId: z
    .string()
    .optional()
    .refine((value) => !value || uuidSchema.safeParse(value).success, "Choose an opening from the list."),
});

export type ReportFilterInput = z.infer<typeof ReportFilterSchema>;
export type HiringFunnelFilterInput = z.input<typeof HiringFunnelFilterSchema>;
export type ExportReportInput = z.infer<typeof ExportReportSchema>;
