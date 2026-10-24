import { z } from "zod";
import { CheckpointStatus, EvaluationStatus } from "@prisma/client";

const recordId = (label: string) => z.string().trim().uuid(`Invalid ${label}`);

/** Converts empty form values to undefined so optional fields validate cleanly. */
const optionalText = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((value) => (value === "" || value === null ? undefined : value), schema.optional());

export const EnrollCandidateSchema = z.object({
  applicationId: recordId("application ID"),
  supervisorId: optionalText(recordId("supervisor ID")),
});

export const TriggerEvaluationStartSchema = z.object({
  enrollmentId: recordId("enrollment ID"),
  startDate: z
    .string()
    .trim()
    .min(1, "Start date is required")
    .max(40)
    .refine((value) => !Number.isNaN(Date.parse(value)), "Invalid start date format"),
});

export const SubmitCheckpointSchema = z.object({
  checkpointId: recordId("checkpoint ID"),
  submissionNotes: z.string().trim().min(1, "Submission notes are required").max(5000),
});

/** Supervisors may only record a review outcome; PENDING / SUBMITTED are intern-driven states. */
export const CHECKPOINT_REVIEW_OUTCOMES = [CheckpointStatus.REVIEWED, CheckpointStatus.BLOCKED] as const;

export const ReviewCheckpointSchema = z.object({
  checkpointId: recordId("checkpoint ID"),
  feedback: z.string().trim().min(1, "Supervisor feedback is required").max(5000),
  status: z.enum(CHECKPOINT_REVIEW_OUTCOMES, "Review status must be REVIEWED or BLOCKED"),
});

export const FinalizeEvaluationSchema = z.object({
  enrollmentId: recordId("enrollment ID"),
  status: z.enum([EvaluationStatus.PASSED, EvaluationStatus.FAILED, EvaluationStatus.EXTENDED], "Final status must be PASSED or FAILED"),
  finalReviewNotes: z.string().trim().min(5, "Please provide final evaluation notes").max(5000),
});

export const UpdateOnboardingItemSchema = z.object({
  enrollmentId: recordId("enrollment ID"),
  itemId: z.string().trim().min(1, "Checklist item is required").max(100),
  completed: z.enum(["true", "false"]).transform((value) => value === "true"),
});

export const IssueIdCardSchema = z.object({
  enrollmentId: recordId("enrollment ID"),
  reissueReason: optionalText(
    z.string().trim().min(10, "Please provide a justification of at least 10 characters").max(1000)
  ),
});
