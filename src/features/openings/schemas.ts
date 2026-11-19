import { z } from "zod";
import { OpeningStatus, OpeningType, WorkplaceType } from "@/types/enums";
import { MAX_SKILLS, MAX_SKILL_LENGTH, RESERVED_OPENING_SLUGS, isValidDateKey } from "./listing";

export const VALID_STATUS_TRANSITIONS: Record<OpeningStatus, OpeningStatus[]> = {
  [OpeningStatus.DRAFT]: [OpeningStatus.PUBLISHED],
  [OpeningStatus.PUBLISHED]: [OpeningStatus.PAUSED, OpeningStatus.CLOSED],
  [OpeningStatus.PAUSED]: [OpeningStatus.PUBLISHED, OpeningStatus.CLOSED],
  [OpeningStatus.CLOSED]: [], // Closed is terminal unless explicit reopen is supported
};

export const createOpeningSchema = z.object({
  title: z
    .string()
    .min(3, "Title must be at least 3 characters long")
    .max(150, "Title cannot exceed 150 characters"),
  slug: z
    .string()
    .min(3, "Slug must be at least 3 characters long")
    .max(150, "Slug cannot exceed 150 characters")
    .regex(/^[a-z0-9-]+$/, "Slug may only contain lowercase letters, numbers, and hyphens")
    .refine((slug) => !RESERVED_OPENING_SLUGS.includes(slug), "This slug is reserved by the careers pages"),
  department: z
    .string()
    .min(2, "Department must be at least 2 characters long")
    .max(100, "Department cannot exceed 100 characters"),
  type: z.nativeEnum(OpeningType),
  location: z
    .string()
    .min(2, "Location must be at least 2 characters long")
    .max(150, "Location cannot exceed 150 characters"),
  workplaceType: z.nativeEnum(WorkplaceType),
  description: z
    .string()
    .min(20, "Description must be at least 20 characters long")
    .max(20_000, "Description cannot exceed 20,000 characters"),
  requirements: z
    .string()
    .min(10, "Requirements must be at least 10 characters long")
    .max(20_000, "Requirements cannot exceed 20,000 characters"),
  responsibilities: z
    .string()
    .max(20_000, "Responsibilities cannot exceed 20,000 characters")
    .optional()
    .nullable(),
  // Listing details (all optional; an empty value clears the field).
  trackId: z.union([z.uuid("Choose a valid track"), z.literal("")]).optional().nullable(),
  summary: z.string().max(300, "Summary cannot exceed 300 characters").optional().nullable(),
  skills: z
    .array(z.string().trim().min(1).max(MAX_SKILL_LENGTH, `Each skill can have at most ${MAX_SKILL_LENGTH} characters`))
    .max(MAX_SKILLS, `List at most ${MAX_SKILLS} skills`)
    .optional(),
  eligibility: z.string().max(500, "Eligibility cannot exceed 500 characters").optional().nullable(),
  durationText: z.string().max(80, "Duration cannot exceed 80 characters").optional().nullable(),
  stipendPolicyText: z.string().max(300, "Stipend policy cannot exceed 300 characters").optional().nullable(),
  openingsCount: z
    .number("Enter a whole number")
    .int("Enter a whole number")
    .min(1, "At least one position")
    .max(1000, "At most 1,000 positions")
    .optional()
    .nullable(),
  /** Last date to apply, "YYYY-MM-DD" (applications close at the end of that day). */
  applyDeadline: z
    .union([z.string().refine(isValidDateKey, "Enter a valid date"), z.literal("")])
    .optional()
    .nullable(),
});

export const updateOpeningSchema = createOpeningSchema.partial();

/** Opening identifiers are database-generated UUIDs. */
export const openingIdSchema = z.uuid("Invalid opening identifier");

export const openingStatusSchema = z.nativeEnum(OpeningStatus);

export const openingStatusTransitionSchema = z.object({
  status: z.nativeEnum(OpeningStatus),
  reason: z.string().optional(),
});

export type CreateOpeningInput = z.infer<typeof createOpeningSchema>;
export type UpdateOpeningInput = z.infer<typeof updateOpeningSchema>;
export type OpeningStatusTransitionInput = z.infer<typeof openingStatusTransitionSchema>;

/** A career track (staff-managed); its slug is the URL segment of /careers/tracks/{slug}. */
export const trackSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(60, "Name cannot exceed 60 characters"),
  slug: z
    .string()
    .min(2, "Slug must be at least 2 characters")
    .max(60, "Slug cannot exceed 60 characters")
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug may only contain lowercase letters, numbers and single hyphens"),
  description: z.string().max(300, "Description cannot exceed 300 characters").optional().nullable(),
  sortOrder: z.number().int().min(0).max(1000),
  isActive: z.boolean(),
});

export const trackIdSchema = z.uuid("Invalid track identifier");

export type TrackInput = z.infer<typeof trackSchema>;
