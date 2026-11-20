import { z } from "zod";

const text = (label: string, min: number, max: number) =>
  z
    .string()
    .trim()
    .min(min, `${label} must have at least ${min} characters`)
    .max(max, `${label} can have at most ${max} characters`)
    .refine((value) => !/[\u0000-\u001f\u007f]/.test(value), `${label} contains invalid characters`);

/** An internship offer letter as staff fill it in (Phase 5). */
export const InternshipOfferSchema = z.object({
  applicationId: z.uuid("Invalid application"),
  designation: text("Role", 2, 120),
  department: text("Department", 2, 100),
  /** First working day, "YYYY-MM-DD". */
  startDate: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid start date"),
  tenureText: text("Tenure", 2, 120),
  stipendText: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    text("Stipend", 2, 300).optional()
  ),
  signatoryName: text("Signatory name", 2, 120),
  signatoryTitle: text("Signatory title", 2, 120),
});

export type InternshipOfferInput = z.input<typeof InternshipOfferSchema>;
