import { z } from "zod";
import { EmployeeStatus } from "@prisma/client";
import { REVIEW_PERIOD_MONTHS } from "./conversion-rules";
import { OFFER_ESIGN_CONSENT_TEXT, OFFER_SIGNED_NAME_MAX_LENGTH } from "./offer-esign";

export const CreateJobOfferSchema = z.object({
  applicationId: z.string().uuid("Invalid application ID"),
  department: z.string().trim().min(2, "Department is required").max(150),
  designation: z.string().trim().min(2, "Designation is required").max(150),
  expectedJoiningDate: z.string().max(64).refine((val) => !isNaN(Date.parse(val)), {
    message: "Valid ISO date required for joining date",
  }),
  location: z.string().max(100).optional().nullable(),
  termsSummary: z
    .string()
    .min(10, "Agreed terms summary must be at least 10 characters")
    .max(5000, "Terms summary cannot exceed 5000 characters"),
  notes: z.string().max(2000).optional().nullable(),
});

export const OfferReferenceSchema = z.object({
  offerId: z.string().uuid("Invalid offer ID"),
});

export const RevokeJobOfferSchema = z.object({
  offerId: z.string().uuid("Invalid offer ID"),
  reason: z.string().trim().max(1000, "Reason cannot exceed 1000 characters").optional().nullable(),
});

/**
 * Electronic acceptance: the candidate types their full legal name (checked against the
 * account name by the service), gives explicit consent and echoes the hash of the letter
 * they reviewed.
 */
export const AcceptOfferDecisionSchema = z.object({
  offerId: z.string().uuid("Invalid offer ID"),
  decision: z.literal("ACCEPT"),
  signedName: z
    .string("Type your full legal name to sign")
    .trim()
    .min(2, "Type your full legal name to sign")
    .max(OFFER_SIGNED_NAME_MAX_LENGTH, `Your name cannot exceed ${OFFER_SIGNED_NAME_MAX_LENGTH} characters`),
  consent: z.literal(true, `Tick the box to confirm: "${OFFER_ESIGN_CONSENT_TEXT}"`),
  letterHash: z
    .string("Please reload the page and review the offer letter before accepting")
    .regex(/^[0-9a-f]{64}$/, "Please reload the page and review the offer letter before accepting"),
});

export const DeclineOfferDecisionSchema = z.object({
  offerId: z.string().uuid("Invalid offer ID"),
  decision: z.literal("DECLINE"),
  declineReason: z.string().trim().max(1000, "Reason cannot exceed 1000 characters").optional().nullable(),
});

/** A candidate's answer to an extended offer: accepting requires an electronic signature. */
export const CandidateOfferDecisionSchema = z.discriminatedUnion(
  "decision",
  [AcceptOfferDecisionSchema, DeclineOfferDecisionSchema],
  { error: "Choose whether to accept or decline the offer" }
);

/**
 * Initial employment status recorded at joining. HR chooses it explicitly: no probation
 * rule is defined (OD-015), so there is no default.
 */
export const JOINING_INITIAL_STATUSES = [EmployeeStatus.ACTIVE, EmployeeStatus.PROBATION] as const;

const JoiningEmployeeCodeSchema = z
  .string()
  .trim()
  .min(3, "Employee code must be at least 3 characters")
  .max(50, "Employee code must be at most 50 characters")
  .regex(/^[A-Z0-9-_]+$/, "Employee code must contain only uppercase alphanumeric characters, dashes, or underscores");

const JoiningDateSchema = z
  .string()
  .trim()
  .min(1, "Joining date is required")
  .max(64)
  .refine((val) => !isNaN(Date.parse(val)), {
    message: "Valid ISO date required for joining date",
  });

const JoiningInitialStatusSchema = z.enum(
  JOINING_INITIAL_STATUSES,
  "Choose the initial employment status (Active or Probation)"
);

export const CreateEmployeeFromApplicationSchema = z.object({
  applicationId: z.string().uuid("Invalid application ID"),
  employeeCode: JoiningEmployeeCodeSchema,
  department: z.string().trim().min(2, "Department is required").max(150),
  designation: z.string().trim().min(2, "Designation is required").max(150),
  joiningDate: JoiningDateSchema,
  initialStatus: JoiningInitialStatusSchema,
  managerId: z.string().uuid("Invalid manager ID").optional().nullable(),
  personalPhone: z.string().max(30).optional().nullable(),
  emergencyContact: z
    .object({
      name: z.string().min(1, "Contact name is required").max(150),
      relation: z.string().min(1, "Relationship is required").max(100),
      phone: z.string().min(5, "Contact phone is required").max(30),
    })
    .optional()
    .nullable(),
  internalNotes: z.string().max(2000).optional().nullable(),
});

/**
 * 3 or 6 months, chosen explicitly (no default). Form values arrive as strings, so numeric
 * strings are converted before the literal check.
 */
const reviewPeriodMonthsSchema = (message: string) =>
  z.preprocess(
    (value) => (typeof value === "string" && value.trim() !== "" ? Number(value) : value),
    z.literal(REVIEW_PERIOD_MONTHS, message)
  );

/** Intern "Mark as joined" from a PASSED internship evaluation. */
export const MarkInternJoinedSchema = z.object({
  enrollmentId: z.string().uuid("Invalid enrollment ID"),
  employeeCode: JoiningEmployeeCodeSchema,
  department: z.string().trim().min(2, "Department is required").max(150),
  designation: z.string().trim().min(2, "Designation is required").max(150),
  joiningDate: JoiningDateSchema,
  initialStatus: JoiningInitialStatusSchema,
  managerId: z.string().uuid("Invalid manager ID").optional().nullable(),
  // Product-owner decision (2026-10-25): HR chooses when the first progress review happens.
  reviewAfterMonths: reviewPeriodMonthsSchema("Choose when the progress review takes place (after 3 or 6 months)"),
});

const CalendarDaySchema = (message: string) =>
  z
    .string(message)
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, message)
    .refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`)), message);

const optionalReviewText = (max: number, label: string) =>
  z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? null : value),
    z.string().trim().max(max, `${label} cannot exceed ${max} characters`).nullable().optional()
  );

const ReviewOutcomeBaseSchema = z.object({
  reviewId: z.string().uuid("Invalid review reference"),
  /** Staff only: never shown to the intern. */
  internalNotes: optionalReviewText(5000, "Internal notes"),
  /** Shown to the intern in their workspace and email. */
  sharedSummary: optionalReviewText(2000, "The summary for the intern"),
});

/**
 * Outcome of the intern progress review meeting (product-owner decision 2026-10-25):
 * CONVERT creates a full-time offer the intern answers in the portal, EXTEND schedules the
 * next review after 3 or 6 months, END_INTERNSHIP records the decision (the exit itself is
 * processed through the existing exit flow).
 */
export const RecordReviewOutcomeSchema = z.discriminatedUnion(
  "outcome",
  [
    ReviewOutcomeBaseSchema.extend({
      outcome: z.literal("CONVERT"),
      proposedDesignation: z.string("Designation is required").trim().min(2, "Designation is required").max(150),
      proposedDepartment: z.string("Department is required").trim().min(2, "Department is required").max(150),
      effectiveDate: CalendarDaySchema("Choose the date the full-time role starts"),
      initialStatus: JoiningInitialStatusSchema,
    }),
    ReviewOutcomeBaseSchema.extend({
      outcome: z.literal("EXTEND"),
      nextReviewAfterMonths: reviewPeriodMonthsSchema("Choose when the next review takes place (after 3 or 6 months)"),
    }),
    ReviewOutcomeBaseSchema.extend({
      outcome: z.literal("END_INTERNSHIP"),
    }),
  ],
  { error: "Choose the review outcome" }
);

/** The intern's answer to a full-time conversion offer. */
export const ConversionOfferResponseSchema = z.object({
  reviewId: z.string().uuid("Invalid offer reference"),
  decision: z.enum(["ACCEPT", "DECLINE"], "Choose whether to accept or decline the offer"),
});

export const DirectCreateEmployeeSchema = z.object({
  userId: z.string().uuid("Invalid user ID"),
  // Direct creation bypasses the application/offer gate, so an explicit, audited reason is required.
  justification: z
    .string()
    .trim()
    .min(10, "A justification of at least 10 characters is required")
    .max(1000, "Justification cannot exceed 1000 characters"),
  employeeCode: z
    .string()
    .min(3, "Employee code must be at least 3 characters")
    .max(50, "Employee code must be at most 50 characters")
    .regex(/^[A-Z0-9-_]+$/, "Employee code must contain only uppercase alphanumeric characters, dashes, or underscores"),
  department: z.string().trim().min(2, "Department is required").max(150),
  designation: z.string().trim().min(2, "Designation is required").max(150),
  joiningDate: z.string().max(64).refine((val) => !isNaN(Date.parse(val)), {
    message: "Valid ISO date required for joining date",
  }),
  status: z
    .nativeEnum(EmployeeStatus)
    .refine((status) => status !== EmployeeStatus.EXITED, {
      message: "An employee record cannot be created in EXITED status",
    })
    .optional()
    .default(EmployeeStatus.PROBATION),
  managerId: z.string().uuid("Invalid manager ID").optional().nullable(),
  personalPhone: z.string().max(30).optional().nullable(),
  emergencyContact: z
    .object({
      name: z.string().min(1, "Contact name is required").max(150),
      relation: z.string().min(1, "Relationship is required").max(100),
      phone: z.string().min(5, "Contact phone is required").max(30),
    })
    .optional()
    .nullable(),
  internalNotes: z.string().max(2000).optional().nullable(),
});

export const UpdateEmployeeStatusSchema = z.object({
  employeeId: z.string().uuid("Invalid employee ID"),
  toStatus: z.nativeEnum(EmployeeStatus),
  remarks: z.string().max(1000).optional().nullable(),
});

export const AssignManagerSchema = z.object({
  employeeId: z.string().uuid("Invalid employee ID"),
  managerId: z.string().uuid("Invalid manager ID").nullable(),
  remarks: z.string().max(1000).optional().nullable(),
});

export const UpdateOnboardingChecklistSchema = z.object({
  employeeId: z.string().uuid("Invalid employee ID"),
  itemId: z.string().min(1, "Item ID is required").max(100),
  completed: z.boolean(),
});

export const UploadEmployeeDocumentSchema = z.object({
  employeeId: z.string().uuid("Invalid employee ID"),
  documentType: z.string().min(2, "Document type is required").max(100),
  title: z.string().min(2, "Title is required").max(200),
  storageKey: z.string().min(5, "Storage key is required").max(500),
  mimeType: z.string().min(3, "MIME type is required").max(100),
  fileSizeBytes: z.number().int().positive("File size must be positive"),
  isConfidential: z.boolean().default(true),
});

export const ProcessExitSchema = z.object({
  employeeId: z.string().uuid("Invalid employee ID"),
  lastWorkingDate: z.string().max(64).refine((val) => !isNaN(Date.parse(val)), {
    message: "Valid ISO date required for last working date",
  }),
  resignationDate: z
    .string()
    .refine((val) => !isNaN(Date.parse(val)), {
      message: "Valid ISO date required for resignation date",
    })
    .optional()
    .nullable(),
  reason: z.string().max(1000).optional().nullable(),
  exitInterviewNotes: z.string().max(4000).optional().nullable(),
});

export type CreateJobOfferInput = z.infer<typeof CreateJobOfferSchema>;
export type RevokeJobOfferInput = z.infer<typeof RevokeJobOfferSchema>;
export type CandidateOfferDecisionInput = z.infer<typeof CandidateOfferDecisionSchema>;
export type AcceptOfferDecisionInput = z.infer<typeof AcceptOfferDecisionSchema>;
export type DeclineOfferDecisionInput = z.infer<typeof DeclineOfferDecisionSchema>;
export type CreateEmployeeFromApplicationInput = z.infer<typeof CreateEmployeeFromApplicationSchema>;
export type MarkInternJoinedInput = z.infer<typeof MarkInternJoinedSchema>;
export type RecordReviewOutcomeInput = z.infer<typeof RecordReviewOutcomeSchema>;
export type ConversionOfferResponseInput = z.infer<typeof ConversionOfferResponseSchema>;
export type DirectCreateEmployeeInput = z.infer<typeof DirectCreateEmployeeSchema>;
export type UpdateEmployeeStatusInput = z.infer<typeof UpdateEmployeeStatusSchema>;
export type AssignManagerInput = z.infer<typeof AssignManagerSchema>;
export type UpdateOnboardingChecklistInput = z.infer<typeof UpdateOnboardingChecklistSchema>;
export type UploadEmployeeDocumentInput = z.infer<typeof UploadEmployeeDocumentSchema>;
export type ProcessExitInput = z.infer<typeof ProcessExitSchema>;
