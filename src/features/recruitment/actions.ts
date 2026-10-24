"use server";

import { Role } from "@prisma/client";
import { revalidatePath } from "next/cache";
import type { ZodError } from "zod";
import { requirePermission } from "@/lib/auth/guards";
import { toActionError } from "@/lib/errors";
import { scheduleOutboxFlush } from "@/infrastructure/email/outbox-dispatch";
import { recruitmentService } from "./services/recruitment-service";
import {
  TransitionStatusSchema,
  AssignRecruiterSchema,
  ScheduleInterviewSchema,
  RescheduleInterviewSchema,
  CancelInterviewSchema,
  SubmitFeedbackSchema,
} from "./schemas";
import type { InterviewerOption } from "./types";

export type RecruitmentActionResult<T = unknown> =
  | { success: true; data: T }
  | { success: false; error: string; fieldErrors?: Record<string, string> };

const DECISION_ROLES: Role[] = [Role.ADMIN, Role.HR];
const MAX_RATINGS_PAYLOAD_LENGTH = 2000;

/** Reads a text field; File values and missing fields become undefined so zod rejects them. */
function readText(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  return typeof value === "string" ? value : undefined;
}

/** Reads an optional text field; empty strings become null. */
function readOptionalText(formData: FormData, key: string): string | null | undefined {
  const value = formData.get(key);
  if (value === null || value === "") return null;
  return typeof value === "string" ? value : undefined;
}

function toFieldErrors(error: ZodError): Record<string, string> {
  const fieldErrors: Record<string, string> = {};
  error.issues.forEach((i) => {
    if (i.path[0]) fieldErrors[i.path[0].toString()] = i.message;
  });
  return fieldErrors;
}

function revalidateApplicationViews(applicationId?: string): void {
  for (const base of ["/admin/applications", "/subadmin/applications", "/recruitment/applications"]) {
    revalidatePath(base);
    if (applicationId) {
      revalidatePath(`${base}/${applicationId}`);
    }
  }
}

function revalidateInterviewViews(): void {
  revalidatePath("/admin/interviews");
  revalidatePath("/subadmin/interviews");
  revalidatePath("/recruitment/interviews");
}

export async function transitionStatusAction(
  formData: FormData
): Promise<RecruitmentActionResult> {
  try {
    const user = await requirePermission("canApplications", { roles: DECISION_ROLES });

    const validated = TransitionStatusSchema.safeParse({
      applicationId: readText(formData, "applicationId"),
      toStatus: readText(formData, "toStatus"),
      internalNotes: readOptionalText(formData, "internalNotes"),
      candidateMessage: readOptionalText(formData, "candidateMessage"),
    });
    if (!validated.success) {
      return { success: false, error: "Validation failed", fieldErrors: toFieldErrors(validated.error) };
    }

    const result = await recruitmentService.transitionApplicationStatus(user, validated.data);
    if (result.notificationQueued) {
      scheduleOutboxFlush();
    }

    revalidateApplicationViews(result.applicationId);
    return { success: true, data: null };
  } catch (err: unknown) {
    return { success: false, error: toActionError(err, "Stage transition failed.") };
  }
}

export async function assignRecruiterAction(
  formData: FormData
): Promise<RecruitmentActionResult> {
  try {
    const user = await requirePermission("canApplications", { roles: DECISION_ROLES });

    const validated = AssignRecruiterSchema.safeParse({
      applicationId: readText(formData, "applicationId"),
      recruiterId: readOptionalText(formData, "recruiterId"),
    });
    if (!validated.success) {
      return { success: false, error: "Validation failed", fieldErrors: toFieldErrors(validated.error) };
    }

    await recruitmentService.assignRecruiter(user, validated.data);

    revalidateApplicationViews(validated.data.applicationId);
    return { success: true, data: null };
  } catch (err: unknown) {
    return { success: false, error: toActionError(err, "Failed to assign recruiter.") };
  }
}

export async function listInterviewerOptionsAction(): Promise<
  RecruitmentActionResult<InterviewerOption[]>
> {
  try {
    const user = await requirePermission("canInterviews", { roles: DECISION_ROLES });
    const options = await recruitmentService.listInterviewerOptions(user);
    return { success: true, data: options };
  } catch (err: unknown) {
    return { success: false, error: toActionError(err, "Failed to load interviewers.") };
  }
}

export async function scheduleInterviewAction(
  formData: FormData
): Promise<RecruitmentActionResult<{ scheduleId: string }>> {
  try {
    const user = await requirePermission("canInterviews", { roles: DECISION_ROLES });

    const validated = ScheduleInterviewSchema.safeParse({
      applicationId: readText(formData, "applicationId"),
      roundNumber: readText(formData, "roundNumber") || 1,
      roundName: readText(formData, "roundName"),
      scheduledAt: readText(formData, "scheduledAt"),
      durationMinutes: readText(formData, "durationMinutes") || 45,
      meetingLink: readOptionalText(formData, "meetingLink"),
      interviewerId: readOptionalText(formData, "interviewerId"),
    });
    if (!validated.success) {
      return { success: false, error: "Validation failed", fieldErrors: toFieldErrors(validated.error) };
    }

    const result = await recruitmentService.scheduleInterview(user, validated.data);
    scheduleOutboxFlush();

    revalidateApplicationViews(result.applicationId);
    revalidateInterviewViews();
    return { success: true, data: { scheduleId: result.scheduleId } };
  } catch (err: unknown) {
    return { success: false, error: toActionError(err, "Failed to schedule interview.") };
  }
}

export async function rescheduleInterviewAction(
  formData: FormData
): Promise<RecruitmentActionResult> {
  try {
    const user = await requirePermission("canInterviews", { roles: DECISION_ROLES });

    const validated = RescheduleInterviewSchema.safeParse({
      scheduleId: readText(formData, "scheduleId"),
      newScheduledAt: readText(formData, "newScheduledAt"),
      rescheduleReason: readText(formData, "rescheduleReason"),
    });
    if (!validated.success) {
      return { success: false, error: "Validation failed", fieldErrors: toFieldErrors(validated.error) };
    }

    const result = await recruitmentService.rescheduleInterview(user, validated.data);
    scheduleOutboxFlush();

    revalidateApplicationViews(result.applicationId);
    revalidateInterviewViews();
    return { success: true, data: null };
  } catch (err: unknown) {
    return { success: false, error: toActionError(err, "Failed to reschedule interview.") };
  }
}

export async function cancelInterviewAction(
  formData: FormData
): Promise<RecruitmentActionResult> {
  try {
    const user = await requirePermission("canInterviews", { roles: DECISION_ROLES });

    const validated = CancelInterviewSchema.safeParse({
      scheduleId: readText(formData, "scheduleId"),
      cancellationReason: readText(formData, "cancellationReason"),
    });
    if (!validated.success) {
      return { success: false, error: "Cancellation reason is required", fieldErrors: toFieldErrors(validated.error) };
    }

    const result = await recruitmentService.cancelInterview(user, validated.data);
    scheduleOutboxFlush();

    revalidateApplicationViews(result.applicationId);
    revalidateInterviewViews();
    return { success: true, data: null };
  } catch (err: unknown) {
    return { success: false, error: toActionError(err, "Failed to cancel interview.") };
  }
}

export async function submitFeedbackAction(
  formData: FormData
): Promise<RecruitmentActionResult> {
  try {
    const user = await requirePermission("canInterviews");

    const rawRatings = readText(formData, "ratings");
    let ratings: unknown = {};
    if (rawRatings) {
      if (rawRatings.length > MAX_RATINGS_PAYLOAD_LENGTH) {
        return { success: false, error: "Validation failed", fieldErrors: { ratings: "Ratings payload is too large" } };
      }
      try {
        ratings = JSON.parse(rawRatings);
      } catch {
        return { success: false, error: "Validation failed", fieldErrors: { ratings: "Ratings must be valid JSON" } };
      }
    }

    const validated = SubmitFeedbackSchema.safeParse({
      scheduleId: readText(formData, "scheduleId"),
      recommendation: readText(formData, "recommendation"),
      summaryNotes: readText(formData, "summaryNotes"),
      ratings,
    });
    if (!validated.success) {
      return { success: false, error: "Validation failed", fieldErrors: toFieldErrors(validated.error) };
    }

    const result = await recruitmentService.submitInterviewFeedback(user, validated.data);

    revalidateApplicationViews(result.applicationId);
    revalidateInterviewViews();
    return { success: true, data: null };
  } catch (err: unknown) {
    return { success: false, error: toActionError(err, "Failed to submit feedback.") };
  }
}
