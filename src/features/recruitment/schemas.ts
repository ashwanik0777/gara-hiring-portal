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
    ApplicationStatus.HIRED, // Intern "Mark as joined" after a PASSED evaluation (joining flow only)
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

/**
 * Statuses owned by dedicated flows. They are reachable only through selecting an
 * internship candidate for the 7-working-day evaluation (EVALUATION_SELECTED, which
 * also creates the enrollment), extending an offer (OFFERED), the candidate's own
 * acceptance (OFFER_ACCEPTED) and HR "Mark as joined" (HIRED) — never through the
 * generic stage-transition endpoint, so no stage can be reached without the records
 * and consent its flow requires.
 */
export const FLOW_OWNED_APPLICATION_STATUSES: readonly ApplicationStatus[] = [
  ApplicationStatus.EVALUATION_SELECTED,
  ApplicationStatus.OFFERED,
  ApplicationStatus.OFFER_ACCEPTED,
  ApplicationStatus.HIRED,
];

/**
 * Application statuses on which no new interview may be scheduled or rescheduled.
 */
export const INTERVIEW_CLOSED_APPLICATION_STATUSES: readonly ApplicationStatus[] = [
  ApplicationStatus.REJECTED,
  ApplicationStatus.WITHDRAWN,
  ApplicationStatus.HIRED,
  ApplicationStatus.ARCHIVED,
];

/**
 * Application statuses that represent a recorded decision. Interview feedback that
 * already exists can no longer be edited once one of these is reached.
 */
export const FEEDBACK_LOCKED_APPLICATION_STATUSES: readonly ApplicationStatus[] = [
  ApplicationStatus.EVALUATION_SELECTED,
  ApplicationStatus.OFFERED,
  ApplicationStatus.OFFER_ACCEPTED,
  ApplicationStatus.HIRED,
  ApplicationStatus.REJECTED,
  ApplicationStatus.WITHDRAWN,
  ApplicationStatus.ARCHIVED,
];

/**
 * True when an internship application may be selected for the supervised evaluation:
 * its stage allows EVALUATION_SELECTED, or it already reached that stage without an
 * enrollment (records created before selection became a dedicated flow).
 */
export function canSelectForEvaluation(status: ApplicationStatus): boolean {
  return (
    status === ApplicationStatus.EVALUATION_SELECTED ||
    (VALID_APPLICATION_TRANSITIONS[status] ?? []).includes(ApplicationStatus.EVALUATION_SELECTED)
  );
}

/**
 * Targets that staff may choose through the generic stage-transition endpoint.
 */
export function getManualTransitionTargets(status: ApplicationStatus): ApplicationStatus[] {
  return (VALID_APPLICATION_TRANSITIONS[status] ?? []).filter(
    (target) => !FLOW_OWNED_APPLICATION_STATUSES.includes(target)
  );
}

export const TransitionStatusSchema = z.object({
  applicationId: z.string().uuid("Invalid application ID"),
  toStatus: z.nativeEnum(ApplicationStatus),
  internalNotes: z.string().max(2000).optional().nullable(),
  candidateMessage: z.string().max(2000).optional().nullable(),
});

export const AssignRecruiterSchema = z.object({
  applicationId: z.string().uuid("Invalid application ID"),
  recruiterId: z.string().uuid("Invalid recruiter ID").nullable(),
});

export const ScheduleInterviewSchema = z.object({
  applicationId: z.string().uuid("Invalid application ID"),
  roundNumber: z.coerce.number().int().min(1).max(10).default(1),
  roundName: z.string().trim().min(2, "Round name is required").max(100),
  scheduledAt: z.string().max(64).refine((val) => !isNaN(Date.parse(val)), {
    message: "Valid ISO date/time string is required",
  }),
  durationMinutes: z.coerce.number().int().min(15).max(180).default(45),
  meetingLink: z.string().max(2048).url("Please enter a valid meeting URL").refine((u) => u.startsWith("https://") || u.startsWith("http://"), { message: "Meeting link must start with http:// or https://" }).or(z.literal("")).optional().nullable(),
  interviewerId: z.string().uuid("Invalid interviewer ID").optional().nullable(),
});

export const RescheduleInterviewSchema = z.object({
  scheduleId: z.string().uuid("Invalid interview schedule ID"),
  newScheduledAt: z.string().max(64).refine((val) => !isNaN(Date.parse(val)), {
    message: "Valid ISO date/time string is required",
  }),
  rescheduleReason: z.string().trim().min(3, "Reschedule reason is required").max(500),
});

export const CancelInterviewSchema = z.object({
  scheduleId: z.string().uuid("Invalid interview schedule ID"),
  cancellationReason: z.string().trim().min(3, "Cancellation reason is required").max(500),
});

const RatingScoreSchema = z.number().int().min(1, "Ratings range from 1 to 5").max(5, "Ratings range from 1 to 5");

/**
 * Structured scorecard: only the criteria captured by the feedback form are accepted,
 * each on the form's 1-5 scale. Unknown keys are rejected.
 */
export const InterviewRatingsSchema = z
  .object({
    technical: RatingScoreSchema.optional(),
    problemSolving: RatingScoreSchema.optional(),
    communication: RatingScoreSchema.optional(),
  })
  .strict();

export const SubmitFeedbackSchema = z.object({
  scheduleId: z.string().uuid("Invalid interview schedule ID"),
  ratings: InterviewRatingsSchema.default({}),
  recommendation: z.nativeEnum(InterviewRecommendation),
  summaryNotes: z.string().trim().min(5, "Evaluation summary notes are required (confidential)").max(3000),
});

export type TransitionStatusInput = z.infer<typeof TransitionStatusSchema>;
export type AssignRecruiterInput = z.infer<typeof AssignRecruiterSchema>;
export type ScheduleInterviewInput = z.infer<typeof ScheduleInterviewSchema>;
export type RescheduleInterviewInput = z.infer<typeof RescheduleInterviewSchema>;
export type CancelInterviewInput = z.infer<typeof CancelInterviewSchema>;
export type SubmitFeedbackInput = z.infer<typeof SubmitFeedbackSchema>;
