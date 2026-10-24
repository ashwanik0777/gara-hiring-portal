import { z } from "zod";
import { SIGNATORY_FIELD_MAX_LENGTH } from "./constants";

const recordId = (label: string) => z.string().trim().uuid(`Invalid ${label}`);

/** Converts empty form values to undefined so optional fields validate cleanly. */
const optional = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((value) => (value === "" || value === null ? undefined : value), schema.optional());

/** Printed certificate text: no control characters. */
const printableText = (label: string, min: number, max: number) =>
  z
    .string()
    .trim()
    .min(min, `${label} is required`)
    .max(max, `${label} is too long`)
    .refine((value) => !/\p{Cc}/u.test(value), `${label} contains invalid characters`);

const ChecklistResponsesSchema = z
  .array(
    z.object({
      id: z.string().trim().min(1).max(100),
      completed: z.boolean(),
    })
  )
  .max(50, "Too many checklist items");

export const RecordCompletionSchema = z.object({
  enrollmentId: recordId("enrollment ID"),
  isEligibleForCertificate: z
    .enum(["true", "false"], "Eligibility must be true or false")
    .transform((value) => value === "true"),
  completionNotes: optional(z.string().trim().max(2000)),
  checklistResponses: z
    .string("Checklist responses are required")
    .max(20000)
    .transform((value, ctx) => {
      try {
        return JSON.parse(value) as unknown;
      } catch {
        ctx.addIssue({ code: "custom", message: "Invalid checklist data format" });
        return z.NEVER;
      }
    })
    .pipe(ChecklistResponsesSchema),
});

export const IssueCertificateSchema = z.object({
  enrollmentId: recordId("enrollment ID"),
  signatoryName: printableText("Signatory name", 2, SIGNATORY_FIELD_MAX_LENGTH),
  signatoryTitle: printableText("Signatory title", 2, SIGNATORY_FIELD_MAX_LENGTH),
});

export const ReissueCertificateSchema = z.object({
  certificateId: recordId("certificate ID"),
  reason: z.string().trim().min(10, "Please provide a reissue reason of at least 10 characters").max(1000),
  signatoryName: optional(printableText("Signatory name", 2, SIGNATORY_FIELD_MAX_LENGTH)),
  signatoryTitle: optional(printableText("Signatory title", 2, SIGNATORY_FIELD_MAX_LENGTH)),
});
