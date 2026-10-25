"use server";

import { Role } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { requireAuth, requirePermission } from "@/lib/auth/guards";
import { toActionError } from "@/lib/errors";
import { scheduleOutboxFlush } from "@/infrastructure/email/outbox-dispatch";
import { evaluationService, type IssueIdCardResult } from "./services/evaluation-service";
import {
  ChangeSupervisorSchema,
  EnrollCandidateSchema,
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

/**
 * Internship step 1: selects a candidate for the 7-working-day supervised evaluation and
 * creates the enrollment. ADMIN / HR with canEvaluations; never on one's own application
 * (enforced by the service). The candidate is emailed and the evaluation workspace unlocks.
 */
export async function enrollCandidateAction(
  formData: FormData
): Promise<EvaluationActionResult<{ enrollmentId: string; created: boolean }>> {
  try {
    const user = await requirePermission("canEvaluations", { roles: [Role.ADMIN, Role.HR] });
    const input = parseInput(
      EnrollCandidateSchema,
      readFormFields(formData, ["applicationId", "supervisorId"])
    );

    const result = await evaluationService.enrollCandidate(user, input.applicationId, input.supervisorId);
    if (result.created) {
      scheduleOutboxFlush();
    }

    revalidateEvaluationViews(result.enrollmentId);
    for (const base of ["/admin/applications", "/subadmin/applications"]) {
      revalidatePath(base);
      revalidatePath(`${base}/${input.applicationId}`);
    }
    revalidatePath("/candidate/dashboard");

    return { success: true, data: result };
  } catch (err: unknown) {
    return { success: false, error: toActionError(err, "We couldn't select the candidate for the evaluation. Please try again.") };
  }
}

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
    return { success: false, error: toActionError(err, "We couldn't start the evaluation. Please try again.") };
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
    return { success: false, error: toActionError(err, "We couldn't save your notes. Please try again.") };
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
    return { success: false, error: toActionError(err, "We couldn't save the checkpoint review. Please try again.") };
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
    return { success: false, error: toActionError(err, "We couldn't record the final outcome. Please try again.") };
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
    return { success: false, error: toActionError(err, "We couldn't update the onboarding item. Please try again.") };
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
    return { success: false, error: toActionError(err, "We couldn't issue the ID card. Please try again.") };
  }
}

/**
 * Changes an evaluation's supervisor from the cockpit. ADMIN / HR with canEvaluations; the
 * service re-checks the final-outcome lock, separation of duties and supervisor eligibility.
 */
export async function changeEvaluationSupervisorAction(
  formData: FormData
): Promise<EvaluationActionResult<{ supervisorId: string }>> {
  try {
    const user = await requirePermission("canEvaluations", { roles: [Role.ADMIN, Role.HR] });
    const input = parseInput(
      ChangeSupervisorSchema,
      readFormFields(formData, ["enrollmentId", "supervisorId"])
    );

    const result = await evaluationService.changeSupervisor(user, input.enrollmentId, input.supervisorId);
    scheduleOutboxFlush();
    revalidateEvaluationViews(result.enrollmentId);

    return { success: true, data: { supervisorId: result.supervisorId } };
  } catch (err: unknown) {
    return { success: false, error: toActionError(err, "We couldn't change the supervisor. Please try again.") };
  }
}
