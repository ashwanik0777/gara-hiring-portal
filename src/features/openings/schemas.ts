import { z } from "zod";
import { OpeningStatus, OpeningType, WorkplaceType } from "@prisma/client";

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
    .regex(/^[a-z0-9-]+$/, "Slug may only contain lowercase letters, numbers, and hyphens"),
  department: z
    .string()
    .min(2, "Department must be at least 2 characters long")
    .max(100, "Department cannot exceed 100 characters"),
  type: z.nativeEnum(OpeningType),
  location: z.string().min(2, "Location must be at least 2 characters long"),
  workplaceType: z.nativeEnum(WorkplaceType),
  description: z.string().min(20, "Description must be at least 20 characters long"),
  requirements: z.string().min(10, "Requirements must be at least 10 characters long"),
  responsibilities: z.string().optional().nullable(),
});

export const updateOpeningSchema = createOpeningSchema.partial();

export const openingStatusTransitionSchema = z.object({
  status: z.nativeEnum(OpeningStatus),
  reason: z.string().optional(),
});

export type CreateOpeningInput = z.infer<typeof createOpeningSchema>;
export type UpdateOpeningInput = z.infer<typeof updateOpeningSchema>;
export type OpeningStatusTransitionInput = z.infer<typeof openingStatusTransitionSchema>;
