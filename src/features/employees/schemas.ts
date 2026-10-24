import { z } from "zod";
import { EmployeeStatus } from "@prisma/client";

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

export const CandidateOfferDecisionSchema = z.object({
  offerId: z.string().uuid("Invalid offer ID"),
  decision: z.enum(["ACCEPT", "DECLINE"]),
  declineReason: z.string().max(1000).optional().nullable(),
});

export const CreateEmployeeFromApplicationSchema = z.object({
  applicationId: z.string().uuid("Invalid application ID"),
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
export type CreateEmployeeFromApplicationInput = z.infer<typeof CreateEmployeeFromApplicationSchema>;
export type DirectCreateEmployeeInput = z.infer<typeof DirectCreateEmployeeSchema>;
export type UpdateEmployeeStatusInput = z.infer<typeof UpdateEmployeeStatusSchema>;
export type AssignManagerInput = z.infer<typeof AssignManagerSchema>;
export type UpdateOnboardingChecklistInput = z.infer<typeof UpdateOnboardingChecklistSchema>;
export type UploadEmployeeDocumentInput = z.infer<typeof UploadEmployeeDocumentSchema>;
export type ProcessExitInput = z.infer<typeof ProcessExitSchema>;
