"use server";

import { requireAuth } from "@/lib/auth/guards";
import { toActionError } from "@/lib/errors";
import { scheduleOutboxFlush } from "@/infrastructure/email/outbox-dispatch";
import { evaluationService, type IssueIdCardResult } from "./services/evaluation-service";
import {
  FinalizeEvaluationSchema,
  IssueIdCardSchema,
  ReviewCheckpointSchema,
  SubmitCheckpointSchema,
  TriggerEvaluationStartSchema,
  UpdateOnboardingItemSchema,
} from "./schemas";
import { parseInput, readFormFields } from "./form-input";
import { revalidateEvaluationViews } from "./revalidate";

export type EvaluationActionResult<T = unknown> =
  | { success: true; data: T }
  | { success: false; error: string };

export async function triggerEvaluationStartAction(
  formData: FormData
): Promise<EvaluationActionResult<null>> {
  try {
    const user = await requireAuth();
    const input = parseInput(
      TriggerEvaluationStartSchema,
      readFormFields(formData, ["enrollmentId", "startDate"])
    );

    await evaluationService.triggerEvaluationStart(user, input.enrollmentId, new Date(input.startDate));
    scheduleOutboxFlush();
    revalidateEvaluationViews(input.enrollmentId);

    return { success: true, data: null };
  } catch (err: unknown) {
    return { success: false, error: toActionError(err, "Failed to start evaluation") };
  }
}

export async function submitCheckpointAction(
  formData: FormData
): Promise<EvaluationActionResult<null>> {
  try {
    const user = await requireAuth();
    const input = parseInput(
      SubmitCheckpointSchema,
      readFormFields(formData, ["checkpointId", "submissionNotes"])
    );

    const { enrollmentId } = await evaluationService.submitCheckpoint(
      user,
      input.checkpointId,
      input.submissionNotes
    );
    revalidateEvaluationViews(enrollmentId);

    return { success: true, data: null };
  } catch (err: unknown) {
    return { success: false, error: toActionError(err, "Failed to submit checkpoint notes") };
  }
}

export async function reviewCheckpointAction(
  formData: FormData
): Promise<EvaluationActionResult<null>> {
  try {
    const user = await requireAuth();
    const input = parseInput(
      ReviewCheckpointSchema,
      readFormFields(formData, ["checkpointId", "feedback", "status"])
    );

    const { enrollmentId } = await evaluationService.reviewCheckpoint(
      user,
      input.checkpointId,
      input.feedback,
      input.status
    );
    revalidateEvaluationViews(enrollmentId);

    return { success: true, data: null };
  } catch (err: unknown) {
    return { success: false, error: toActionError(err, "Failed to review checkpoint") };
  }
}

export async function finalizeEvaluationAction(
  formData: FormData
): Promise<EvaluationActionResult<null>> {
  try {
    const user = await requireAuth();
    const input = parseInput(
      FinalizeEvaluationSchema,
      readFormFields(formData, ["enrollmentId", "status", "finalReviewNotes"])
    );

    await evaluationService.finalizeEvaluation(
      user,
      input.enrollmentId,
      input.status,
      input.finalReviewNotes
    );
    scheduleOutboxFlush();
    revalidateEvaluationViews(input.enrollmentId);

    return { success: true, data: null };
  } catch (err: unknown) {
    return { success: false, error: toActionError(err, "Failed to finalize evaluation") };
  }
}

export async function updateOnboardingItemAction(
  formData: FormData
): Promise<EvaluationActionResult<null>> {
  try {
    const user = await requireAuth();
    const input = parseInput(
      UpdateOnboardingItemSchema,
      readFormFields(formData, ["enrollmentId", "itemId", "completed"])
    );

    await evaluationService.updateOnboardingChecklistItem(
      user,
      input.enrollmentId,
      input.itemId,
      input.completed
    );
    revalidateEvaluationViews(input.enrollmentId);

    return { success: true, data: null };
  } catch (err: unknown) {
    return { success: false, error: toActionError(err, "Failed to update onboarding item") };
  }
}

export async function issueIdCardAction(
  formData: FormData
): Promise<EvaluationActionResult<IssueIdCardResult>> {
  try {
    const user = await requireAuth();
    const input = parseInput(
      IssueIdCardSchema,
      readFormFields(formData, ["enrollmentId", "reissueReason"])
    );

    const result = await evaluationService.approveAndIssueIdCard(
      user,
      input.enrollmentId,
      input.reissueReason
    );
    if (!result.alreadyIssued) {
      scheduleOutboxFlush();
    }
    revalidateEvaluationViews(input.enrollmentId);

    return { success: true, data: result };
  } catch (err: unknown) {
    return { success: false, error: toActionError(err, "Failed to issue ID card") };
  }
}
