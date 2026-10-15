import { z } from "zod";
import { ApplicationStatus, InterviewRecommendation } from "@prisma/client";

/**
 * Valid Application Lifecycle State Machine.
 * Any attempted transition outside these transitions will be rejected by the server.
 */
export const VALID_APPLICATION_TRANSITIONS: Record<ApplicationStatus, ApplicationStatus[]> = {
  [ApplicationStatus.DRAFT]: [ApplicationStatus.SUBMITTED],
  [ApplicationStatus.SUBMITTED]: [
    ApplicationStatus.SCREENING,
    ApplicationStatus.REJECTED,
    ApplicationStatus.WITHDRAWN,
  ],
  [ApplicationStatus.SCREENING]: [
    ApplicationStatus.SHORTLISTED,
    ApplicationStatus.REJECTED,
    ApplicationStatus.WITHDRAWN,
  ],
  [ApplicationStatus.SHORTLISTED]: [
    ApplicationStatus.INTERVIEW_SCHEDULED,
    ApplicationStatus.REJECTED,
    ApplicationStatus.WITHDRAWN,
  ],
  [ApplicationStatus.INTERVIEW_SCHEDULED]: [
    ApplicationStatus.INTERVIEWED,
    ApplicationStatus.SHORTLISTED,
    ApplicationStatus.REJECTED,
    ApplicationStatus.WITHDRAWN,
  ],
  [ApplicationStatus.INTERVIEWED]: [
    ApplicationStatus.INTERVIEW_SCHEDULED, // Next interview round
    ApplicationStatus.SHORTLISTED,
    ApplicationStatus.EVALUATION_SELECTED, // 7-day supervised evaluation entry (Internships only)
    ApplicationStatus.OFFERED, // Direct full-time offer (skips internship evaluation)
    ApplicationStatus.REJECTED,
    ApplicationStatus.WITHDRAWN,
  ],
  [ApplicationStatus.EVALUATION_SELECTED]: [
    ApplicationStatus.OFFERED,
    ApplicationStatus.REJECTED,
  ],
  [ApplicationStatus.OFFERED]: [
    ApplicationStatus.OFFER_ACCEPTED,
    ApplicationStatus.REJECTED,
    ApplicationStatus.WITHDRAWN,
  ],
  [ApplicationStatus.OFFER_ACCEPTED]: [
    ApplicationStatus.HIRED,
  ],
  [ApplicationStatus.HIRED]: [],
  [ApplicationStatus.REJECTED]: [ApplicationStatus.ARCHIVED],
  [ApplicationStatus.WITHDRAWN]: [ApplicationStatus.ARCHIVED],
  [ApplicationStatus.ARCHIVED]: [],
};

export const TransitionStatusSchema = z.object({
  applicationId: z.string().uuid("Invalid application ID"),
  toStatus: z.nativeEnum(ApplicationStatus),
  internalNotes: z.string().max(2000).optional().nullable(),
  candidateMessage: z.string().max(2000).optional().nullable(),
});

export const ScheduleInterviewSchema = z.object({
  applicationId: z.string().uuid("Invalid application ID"),
  roundNumber: z.coerce.number().int().min(1).max(10).default(1),
  roundName: z.string().min(2, "Round name is required").max(100),
  scheduledAt: z.string().refine((val) => !isNaN(Date.parse(val)), {
    message: "Valid ISO date/time string is required",
  }),
  durationMinutes: z.coerce.number().int().min(15).max(180).default(45),
  meetingLink: z.string().url("Please enter a valid meeting URL").or(z.literal("")).optional().nullable(),
  interviewerId: z.string().uuid("Invalid interviewer ID").optional().nullable(),
});

export const RescheduleInterviewSchema = z.object({
  scheduleId: z.string().uuid("Invalid interview schedule ID"),
  newScheduledAt: z.string().refine((val) => !isNaN(Date.parse(val)), {
    message: "Valid ISO date/time string is required",
  }),
  rescheduleReason: z.string().min(3, "Reschedule reason is required").max(500),
});

export const CancelInterviewSchema = z.object({
  scheduleId: z.string().uuid("Invalid interview schedule ID"),
  cancellationReason: z.string().min(3, "Cancellation reason is required").max(500),
});

export const SubmitFeedbackSchema = z.object({
  scheduleId: z.string().uuid("Invalid interview schedule ID"),
  ratings: z.record(z.string(), z.unknown()).default({}),
  recommendation: z.nativeEnum(InterviewRecommendation),
  summaryNotes: z.string().min(5, "Evaluation summary notes are required (confidential)").max(3000),
});

export type TransitionStatusInput = z.infer<typeof TransitionStatusSchema>;
export type ScheduleInterviewInput = z.infer<typeof ScheduleInterviewSchema>;
export type RescheduleInterviewInput = z.infer<typeof RescheduleInterviewSchema>;
export type CancelInterviewInput = z.infer<typeof CancelInterviewSchema>;
export type SubmitFeedbackInput = z.infer<typeof SubmitFeedbackSchema>;
