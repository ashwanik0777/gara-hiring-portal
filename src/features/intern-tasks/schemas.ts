import { z } from "zod";
import { ProgressCadence, SubmissionReviewStatus, TaskPriority } from "@prisma/client";

const recordId = (label: string) => z.string().trim().uuid(`Invalid ${label}`);

/** Converts empty form values to undefined so optional fields validate cleanly. */
const optional = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((value) => (value === "" || value === null ? undefined : value), schema.optional());

const MAX_DELIVERABLE_URLS = 10;

export const CreateTaskSchema = z.object({
  enrollmentId: recordId("enrollment ID"),
  title: z.string().trim().min(1, "Task title is required").max(200),
  description: z.string().trim().min(1, "Task description is required").max(5000),
  priority: optional(z.enum(TaskPriority, "Invalid task priority")).transform(
    (value) => value ?? TaskPriority.MEDIUM
  ),
  dueDate: optional(
    z
      .string()
      .trim()
      .max(40)
      .refine((value) => !Number.isNaN(Date.parse(value)), "Invalid due date")
  ),
});

/** Comma-separated deliverable links; only absolute http(s) URLs are accepted (no javascript:/data:). */
const DeliverableUrlsSchema = optional(z.string().max(MAX_DELIVERABLE_URLS * 2100)).transform(
  (value, ctx) => {
    const urls = (value ?? "")
      .split(",")
      .map((u) => u.trim())
      .filter(Boolean);
    if (urls.length > MAX_DELIVERABLE_URLS) {
      ctx.addIssue({ code: "custom", message: `At most ${MAX_DELIVERABLE_URLS} deliverable links are allowed.` });
      return z.NEVER;
    }
    for (const url of urls) {
      let parsed: URL;
      try {
        parsed = new URL(url);
      } catch {
        ctx.addIssue({ code: "custom", message: "Invalid deliverable URL format." });
        return z.NEVER;
      }
      if ((parsed.protocol !== "https:" && parsed.protocol !== "http:") || url.length > 2048) {
        ctx.addIssue({ code: "custom", message: "Deliverable links must be http or https URLs." });
        return z.NEVER;
      }
    }
    return urls;
  }
);

export const SubmitTaskSchema = z.object({
  taskId: recordId("task ID"),
  submissionNotes: z.string().trim().min(1, "Submission notes are required").max(5000),
  deliverableUrls: DeliverableUrlsSchema,
});

/** Supervisors may only approve or request changes; PENDING is not a review outcome. */
export const SUBMISSION_REVIEW_OUTCOMES = [
  SubmissionReviewStatus.APPROVED,
  SubmissionReviewStatus.REVISION_REQUESTED,
] as const;

export const ReviewSubmissionSchema = z.object({
  taskId: recordId("task ID"),
  submissionId: recordId("submission ID"),
  status: z.enum(SUBMISSION_REVIEW_OUTCOMES, "Review status must be APPROVED or REVISION_REQUESTED"),
  supervisorFeedback: z.string().trim().min(1, "Supervisor feedback is required").max(5000),
  changeRequestNotes: optional(z.string().trim().max(5000)),
});

export const SubmitProgressReportSchema = z.object({
  enrollmentId: recordId("enrollment ID"),
  cadence: optional(z.enum(ProgressCadence, "Invalid report cadence")).transform(
    (value) => value ?? ProgressCadence.WEEKLY
  ),
  periodIdentifier: z.string().trim().min(1, "Period identifier is required").max(100),
  summary: z.string().trim().min(1, "Summary is required").max(5000),
  learnings: optional(z.string().trim().max(5000)),
  blockers: optional(z.string().trim().max(5000)),
});

export const ReviewProgressReportSchema = z.object({
  reportId: recordId("report ID"),
  supervisorFeedback: z.string().trim().min(1, "Supervisor feedback is required").max(5000),
});
