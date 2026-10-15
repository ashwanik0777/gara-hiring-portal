import { z } from "zod";
import { EmployeeStatus } from "@prisma/client";

export const CreateJobOfferSchema = z.object({
  applicationId: z.string().uuid("Invalid application ID"),
  department: z.string().min(2, "Department is required"),
  designation: z.string().min(2, "Designation is required"),
  expectedJoiningDate: z.string().refine((val) => !isNaN(Date.parse(val)), {
    message: "Valid ISO date required for joining date",
  }),
  location: z.string().max(100).optional().nullable(),
  termsSummary: z
    .string()
    .min(10, "Agreed terms summary must be at least 10 characters")
    .max(5000, "Terms summary cannot exceed 5000 characters"),
  notes: z.string().max(2000).optional().nullable(),
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
  department: z.string().min(2, "Department is required"),
  designation: z.string().min(2, "Designation is required"),
  joiningDate: z.string().refine((val) => !isNaN(Date.parse(val)), {
    message: "Valid ISO date required for joining date",
  }),
  managerId: z.string().uuid("Invalid manager ID").optional().nullable(),
  personalPhone: z.string().max(30).optional().nullable(),
  emergencyContact: z
    .object({
      name: z.string().min(1, "Contact name is required"),
      relation: z.string().min(1, "Relationship is required"),
      phone: z.string().min(5, "Contact phone is required"),
    })
    .optional()
    .nullable(),
  internalNotes: z.string().max(2000).optional().nullable(),
});

export const DirectCreateEmployeeSchema = z.object({
  userId: z.string().uuid("Invalid user ID"),
  employeeCode: z
    .string()
    .min(3, "Employee code must be at least 3 characters")
    .max(50, "Employee code must be at most 50 characters")
    .regex(/^[A-Z0-9-_]+$/, "Employee code must contain only uppercase alphanumeric characters, dashes, or underscores"),
  department: z.string().min(2, "Department is required"),
  designation: z.string().min(2, "Designation is required"),
  joiningDate: z.string().refine((val) => !isNaN(Date.parse(val)), {
    message: "Valid ISO date required for joining date",
  }),
  status: z.nativeEnum(EmployeeStatus).optional().default(EmployeeStatus.PROBATION),
  managerId: z.string().uuid("Invalid manager ID").optional().nullable(),
  personalPhone: z.string().max(30).optional().nullable(),
  emergencyContact: z
    .object({
      name: z.string().min(1, "Contact name is required"),
      relation: z.string().min(1, "Relationship is required"),
      phone: z.string().min(5, "Contact phone is required"),
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
  itemId: z.string().min(1, "Item ID is required"),
  completed: z.boolean(),
});

export const UploadEmployeeDocumentSchema = z.object({
  employeeId: z.string().uuid("Invalid employee ID"),
  documentType: z.string().min(2, "Document type is required"),
  title: z.string().min(2, "Title is required"),
  storageKey: z.string().min(5, "Storage key is required"),
  mimeType: z.string().min(3, "MIME type is required"),
  fileSizeBytes: z.number().int().positive("File size must be positive"),
  isConfidential: z.boolean().default(true),
});

export const ProcessExitSchema = z.object({
  employeeId: z.string().uuid("Invalid employee ID"),
  lastWorkingDate: z.string().refine((val) => !isNaN(Date.parse(val)), {
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
export type CandidateOfferDecisionInput = z.infer<typeof CandidateOfferDecisionSchema>;
export type CreateEmployeeFromApplicationInput = z.infer<typeof CreateEmployeeFromApplicationSchema>;
export type DirectCreateEmployeeInput = z.infer<typeof DirectCreateEmployeeSchema>;
export type UpdateEmployeeStatusInput = z.infer<typeof UpdateEmployeeStatusSchema>;
export type AssignManagerInput = z.infer<typeof AssignManagerSchema>;
export type UpdateOnboardingChecklistInput = z.infer<typeof UpdateOnboardingChecklistSchema>;
export type UploadEmployeeDocumentInput = z.infer<typeof UploadEmployeeDocumentSchema>;
export type ProcessExitInput = z.infer<typeof ProcessExitSchema>;
