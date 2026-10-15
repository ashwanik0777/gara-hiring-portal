"use server";

import { requireAuth } from "@/lib/auth/guards";
import { evaluationService } from "./services/evaluation-service";
import {
  EvaluationStatus,
  CheckpointStatus,
} from "@prisma/client";
import { ValidationError, ForbiddenError } from "@/lib/errors";
import { revalidatePath } from "next/cache";

export type EvaluationActionResult<T = unknown> =
  | { success: true; data: T }
  | { success: false; error: string };

export async function enrollCandidateAction(
  formData: FormData
): Promise<EvaluationActionResult<{ enrollmentId: string }>> {
  try {
    const user = await requireAuth();
    const applicationId = formData.get("applicationId") as string;
    const supervisorId = (formData.get("supervisorId") as string) || undefined;

    if (!applicationId) return { success: false, error: "Application ID is required" };

    const result = await evaluationService.enrollCandidate(user, applicationId, supervisorId);
    revalidatePath(`/recruitment/evaluations/${result.enrollmentId}`);
    revalidatePath("/recruitment/evaluations");

    return { success: true, data: result };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to enroll candidate";
    return { success: false, error: message };
  }
}

export async function triggerEvaluationStartAction(
  formData: FormData
): Promise<EvaluationActionResult> {
  try {
    const user = await requireAuth();
    const enrollmentId = formData.get("enrollmentId") as string;
    const startDateRaw = formData.get("startDate") as string;

    if (!enrollmentId || !startDateRaw) {
      return { success: false, error: "Enrollment ID and Start Date are required" };
    }

    const startDate = new Date(startDateRaw);
    if (isNaN(startDate.getTime())) {
      return { success: false, error: "Invalid start date format" };
    }

    await evaluationService.triggerEvaluationStart(user, enrollmentId, startDate);
    revalidatePath(`/recruitment/evaluations/${enrollmentId}`);

    return { success: true, data: null };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to start evaluation";
    return { success: false, error: message };
  }
}

export async function submitCheckpointAction(
  formData: FormData
): Promise<EvaluationActionResult> {
  try {
    const user = await requireAuth();
    const checkpointId = formData.get("checkpointId") as string;
    const submissionNotes = formData.get("submissionNotes") as string;

    if (!checkpointId || !submissionNotes) {
      return { success: false, error: "Checkpoint ID and submission notes are required" };
    }

    await evaluationService.submitCheckpoint(user, checkpointId, submissionNotes);
    revalidatePath("/intern/checkpoints");

    return { success: true, data: null };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to submit checkpoint notes";
    return { success: false, error: message };
  }
}

export async function reviewCheckpointAction(
  formData: FormData
): Promise<EvaluationActionResult> {
  try {
    const user = await requireAuth();
    const checkpointId = formData.get("checkpointId") as string;
    const enrollmentId = formData.get("enrollmentId") as string;
    const feedback = formData.get("feedback") as string;
    const status = formData.get("status") as CheckpointStatus;

    if (!checkpointId || !feedback || !status) {
      return { success: false, error: "Checkpoint ID, feedback, and status are required" };
    }

    await evaluationService.reviewCheckpoint(user, checkpointId, feedback, status);
    if (enrollmentId) {
      revalidatePath(`/recruitment/evaluations/${enrollmentId}`);
    }

    return { success: true, data: null };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to review checkpoint";
    return { success: false, error: message };
  }
}

export async function finalizeEvaluationAction(
  formData: FormData
): Promise<EvaluationActionResult> {
  try {
    const user = await requireAuth();
    const enrollmentId = formData.get("enrollmentId") as string;
    const status = formData.get("status") as EvaluationStatus;
    const finalReviewNotes = formData.get("finalReviewNotes") as string;

    if (!enrollmentId || !status || !finalReviewNotes) {
      return { success: false, error: "Enrollment ID, status, and review notes are required" };
    }

    await evaluationService.finalizeEvaluation(user, enrollmentId, status, finalReviewNotes);
    revalidatePath(`/recruitment/evaluations/${enrollmentId}`);
    revalidatePath("/recruitment/evaluations");

    return { success: true, data: null };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to finalize evaluation";
    return { success: false, error: message };
  }
}

export async function updateOnboardingItemAction(
  formData: FormData
): Promise<EvaluationActionResult> {
  try {
    const user = await requireAuth();
    const enrollmentId = formData.get("enrollmentId") as string;
    const itemId = formData.get("itemId") as string;
    const completed = formData.get("completed") === "true";

    if (!enrollmentId || !itemId) {
      return { success: false, error: "Enrollment ID and Item ID are required" };
    }

    await evaluationService.updateOnboardingChecklistItem(user, enrollmentId, itemId, completed);
    revalidatePath(`/recruitment/evaluations/${enrollmentId}`);

    return { success: true, data: null };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to update onboarding item";
    return { success: false, error: message };
  }
}

export async function issueIdCardAction(
  formData: FormData
): Promise<EvaluationActionResult<{ cardNumber: string }>> {
  try {
    const user = await requireAuth();
    const enrollmentId = formData.get("enrollmentId") as string;

    if (!enrollmentId) return { success: false, error: "Enrollment ID is required" };

    const result = await evaluationService.approveAndIssueIdCard(user, enrollmentId);
    revalidatePath(`/recruitment/evaluations/${enrollmentId}`);

    return { success: true, data: result };
  } catch (err: unknown) {
    if (err instanceof ValidationError || err instanceof ForbiddenError) {
      return { success: false, error: err.message };
    }
    const message = err instanceof Error ? err.message : "Failed to issue ID card";
    return { success: false, error: message };
  }
}
