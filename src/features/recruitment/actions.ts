"use server";

import { requireAuth } from "@/lib/auth/guards";
import { recruitmentService } from "./services/recruitment-service";
import {
  TransitionStatusSchema,
  ScheduleInterviewSchema,
  RescheduleInterviewSchema,
  CancelInterviewSchema,
  SubmitFeedbackSchema,
} from "./schemas";
import { ValidationError, ForbiddenError } from "@/lib/errors";
import { revalidatePath } from "next/cache";

export type RecruitmentActionResult<T = unknown> =
  | { success: true; data: T }
  | { success: false; error: string; fieldErrors?: Record<string, string> };

export async function transitionStatusAction(
  formData: FormData
): Promise<RecruitmentActionResult> {
  try {
    const user = await requireAuth();

    const raw = {
      applicationId: formData.get("applicationId") as string,
      toStatus: formData.get("toStatus") as string,
      internalNotes: (formData.get("internalNotes") as string) || null,
      candidateMessage: (formData.get("candidateMessage") as string) || null,
    };

    const validated = TransitionStatusSchema.safeParse(raw);
    if (!validated.success) {
      const fieldErrors: Record<string, string> = {};
      validated.error.issues.forEach((i) => {
        if (i.path[0]) fieldErrors[i.path[0].toString()] = i.message;
      });
      return { success: false, error: "Validation failed", fieldErrors };
    }

    await recruitmentService.transitionApplicationStatus(user, validated.data);

    revalidatePath(`/recruitment/applications/${validated.data.applicationId}`);
    revalidatePath("/recruitment/applications");

    return { success: true, data: null };
  } catch (err: unknown) {
    if (err instanceof ValidationError || err instanceof ForbiddenError) {
      return { success: false, error: err.message };
    }
    const message = err instanceof Error ? err.message : "Stage transition failed";
    return { success: false, error: message };
  }
}

export async function assignRecruiterAction(
  formData: FormData
): Promise<RecruitmentActionResult> {
  try {
    const user = await requireAuth();

    const applicationId = formData.get("applicationId") as string;
    const recruiterId = (formData.get("recruiterId") as string) || null;

    if (!applicationId) {
      return { success: false, error: "Application ID is required" };
    }

    await recruitmentService.assignRecruiter(user, applicationId, recruiterId);

    revalidatePath(`/recruitment/applications/${applicationId}`);
    revalidatePath("/recruitment/applications");

    return { success: true, data: null };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to assign recruiter";
    return { success: false, error: message };
  }
}

export async function scheduleInterviewAction(
  formData: FormData
): Promise<RecruitmentActionResult<{ scheduleId: string }>> {
  try {
    const user = await requireAuth();

    const raw = {
      applicationId: formData.get("applicationId") as string,
      roundNumber: formData.get("roundNumber") || 1,
      roundName: formData.get("roundName") as string,
      scheduledAt: formData.get("scheduledAt") as string,
      durationMinutes: formData.get("durationMinutes") || 45,
      meetingLink: (formData.get("meetingLink") as string) || null,
      interviewerId: (formData.get("interviewerId") as string) || null,
    };

    const validated = ScheduleInterviewSchema.safeParse(raw);
    if (!validated.success) {
      const fieldErrors: Record<string, string> = {};
      validated.error.issues.forEach((i) => {
        if (i.path[0]) fieldErrors[i.path[0].toString()] = i.message;
      });
      return { success: false, error: "Validation failed", fieldErrors };
    }

    const result = await recruitmentService.scheduleInterview(user, validated.data);

    revalidatePath(`/recruitment/applications/${validated.data.applicationId}`);
    revalidatePath("/recruitment/applications");
    revalidatePath("/recruitment/interviews");

    return { success: true, data: result };
  } catch (err: unknown) {
    if (err instanceof ValidationError || err instanceof ForbiddenError) {
      return { success: false, error: err.message };
    }
    const message = err instanceof Error ? err.message : "Failed to schedule interview";
    return { success: false, error: message };
  }
}

export async function rescheduleInterviewAction(
  formData: FormData
): Promise<RecruitmentActionResult> {
  try {
    const user = await requireAuth();

    const raw = {
      scheduleId: formData.get("scheduleId") as string,
      newScheduledAt: formData.get("newScheduledAt") as string,
      rescheduleReason: formData.get("rescheduleReason") as string,
    };

    const validated = RescheduleInterviewSchema.safeParse(raw);
    if (!validated.success) {
      const fieldErrors: Record<string, string> = {};
      validated.error.issues.forEach((i) => {
        if (i.path[0]) fieldErrors[i.path[0].toString()] = i.message;
      });
      return { success: false, error: "Validation failed", fieldErrors };
    }

    await recruitmentService.rescheduleInterview(user, validated.data);

    revalidatePath("/recruitment/applications");
    revalidatePath("/recruitment/interviews");

    return { success: true, data: null };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to reschedule interview";
    return { success: false, error: message };
  }
}

export async function cancelInterviewAction(
  formData: FormData
): Promise<RecruitmentActionResult> {
  try {
    const user = await requireAuth();

    const raw = {
      scheduleId: formData.get("scheduleId") as string,
      cancellationReason: formData.get("cancellationReason") as string,
    };

    const validated = CancelInterviewSchema.safeParse(raw);
    if (!validated.success) {
      return { success: false, error: "Cancellation reason is required" };
    }

    await recruitmentService.cancelInterview(user, validated.data);

    revalidatePath("/recruitment/applications");
    revalidatePath("/recruitment/interviews");

    return { success: true, data: null };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to cancel interview";
    return { success: false, error: message };
  }
}

export async function submitFeedbackAction(
  formData: FormData
): Promise<RecruitmentActionResult> {
  try {
    const user = await requireAuth();

    const scheduleId = formData.get("scheduleId") as string;
    const recommendation = formData.get("recommendation") as string;
    const summaryNotes = formData.get("summaryNotes") as string;
    const rawRatings = formData.get("ratings") as string;

    let ratings: Record<string, unknown> = {};
    if (rawRatings) {
      try {
        ratings = JSON.parse(rawRatings);
      } catch {
        // Fallback empty
      }
    }

    const validated = SubmitFeedbackSchema.safeParse({
      scheduleId,
      recommendation,
      summaryNotes,
      ratings,
    });

    if (!validated.success) {
      const fieldErrors: Record<string, string> = {};
      validated.error.issues.forEach((i) => {
        if (i.path[0]) fieldErrors[i.path[0].toString()] = i.message;
      });
      return { success: false, error: "Validation failed", fieldErrors };
    }

    await recruitmentService.submitInterviewFeedback(user, validated.data);

    revalidatePath("/recruitment/applications");
    revalidatePath("/recruitment/interviews");

    return { success: true, data: null };
  } catch (err: unknown) {
    if (err instanceof ForbiddenError) {
      return { success: false, error: err.message };
    }
    const message = err instanceof Error ? err.message : "Failed to submit feedback";
    return { success: false, error: message };
  }
}
