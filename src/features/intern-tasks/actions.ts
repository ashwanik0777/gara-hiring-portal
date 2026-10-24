"use server";

import { requireAuth } from "@/lib/auth/guards";
import { toActionError } from "@/lib/errors";
import { taskService } from "./services/task-service";
import {
  CreateTaskSchema,
  ReviewSubmissionSchema,
  SubmitProgressReportSchema,
  SubmitTaskSchema,
} from "./schemas";
import { parseInput, readFormFields } from "@/features/internship-evaluation/form-input";
import { revalidateEvaluationViews } from "@/features/internship-evaluation/revalidate";

export type TaskActionResult<T = null> =
  | { success: true; data: T }
  | { success: false; error: string };

export async function createTaskAction(
  formData: FormData
): Promise<TaskActionResult<{ taskId: string }>> {
  try {
    const user = await requireAuth();
    const input = parseInput(
      CreateTaskSchema,
      readFormFields(formData, ["enrollmentId", "title", "description", "priority", "dueDate"])
    );

    const task = await taskService.createTask(user, {
      enrollmentId: input.enrollmentId,
      title: input.title,
      description: input.description,
      priority: input.priority,
      dueDate: input.dueDate ?? null,
    });

    revalidateEvaluationViews(task.enrollmentId);
    return { success: true, data: { taskId: task.id } };
  } catch (error: unknown) {
    return { success: false, error: toActionError(error, "Failed to create task") };
  }
}

export async function submitTaskAction(
  formData: FormData
): Promise<TaskActionResult<{ submissionId: string; versionNumber: number }>> {
  try {
    const user = await requireAuth();
    const input = parseInput(
      SubmitTaskSchema,
      readFormFields(formData, ["taskId", "submissionNotes", "deliverableUrls"])
    );

    const result = await taskService.submitTask(user, {
      taskId: input.taskId,
      submissionNotes: input.submissionNotes,
      deliverableUrls: input.deliverableUrls,
    });

    revalidateEvaluationViews(result.enrollmentId);
    return {
      success: true,
      data: { submissionId: result.submission.id, versionNumber: result.submission.versionNumber },
    };
  } catch (error: unknown) {
    return { success: false, error: toActionError(error, "Failed to submit task") };
  }
}

export async function reviewSubmissionAction(formData: FormData): Promise<TaskActionResult> {
  try {
    const user = await requireAuth();
    const input = parseInput(
      ReviewSubmissionSchema,
      readFormFields(formData, [
        "taskId",
        "submissionId",
        "status",
        "supervisorFeedback",
        "changeRequestNotes",
      ])
    );

    const result = await taskService.reviewSubmission(user, input);

    revalidateEvaluationViews(result.enrollmentId);
    return { success: true, data: null };
  } catch (error: unknown) {
    return { success: false, error: toActionError(error, "Failed to review submission") };
  }
}

export async function submitProgressReportAction(formData: FormData): Promise<TaskActionResult> {
  try {
    const user = await requireAuth();
    const input = parseInput(
      SubmitProgressReportSchema,
      readFormFields(formData, [
        "enrollmentId",
        "cadence",
        "periodIdentifier",
        "summary",
        "learnings",
        "blockers",
      ])
    );

    const report = await taskService.submitProgressReport(user, input);

    revalidateEvaluationViews(report.enrollmentId);
    return { success: true, data: null };
  } catch (error: unknown) {
    return { success: false, error: toActionError(error, "Failed to submit progress report") };
  }
}
