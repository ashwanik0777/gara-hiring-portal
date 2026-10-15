"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/guards";
import { taskService } from "./services/task-service";
import { TaskPriority, SubmissionReviewStatus, ProgressCadence } from "@prisma/client";

export async function createTaskAction(formData: FormData) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: "Authentication required" };
    }

    const enrollmentId = formData.get("enrollmentId") as string;
    const title = formData.get("title") as string;
    const description = formData.get("description") as string;
    const priority = (formData.get("priority") as TaskPriority) || TaskPriority.MEDIUM;
    const dueDate = (formData.get("dueDate") as string) || null;

    if (!enrollmentId || !title || !description) {
      return { success: false, error: "Enrollment ID, title, and description are required" };
    }

    const task = await taskService.createTask(user.id, user.roles, {
      enrollmentId,
      title,
      description,
      priority,
      dueDate,
    });

    revalidatePath(`/recruitment/evaluations/${enrollmentId}`);
    revalidatePath("/intern/dashboard");
    return { success: true, task };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to create task";
    return { success: false, error: message };
  }
}

export async function submitTaskAction(formData: FormData) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: "Authentication required" };
    }

    const taskId = formData.get("taskId") as string;
    const submissionNotes = formData.get("submissionNotes") as string;
    const deliverableUrlsRaw = formData.get("deliverableUrls") as string;
    const deliverableUrls = deliverableUrlsRaw
      ? deliverableUrlsRaw.split(",").map((u) => u.trim()).filter(Boolean)
      : [];

    if (!taskId || !submissionNotes) {
      return { success: false, error: "Task ID and submission notes are required" };
    }

    const result = await taskService.submitTask(user.id, {
      taskId,
      submissionNotes,
      deliverableUrls,
    });

    revalidatePath("/intern/dashboard");
    return { success: true, result };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to submit task";
    return { success: false, error: message };
  }
}

export async function reviewSubmissionAction(formData: FormData) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: "Authentication required" };
    }

    const taskId = formData.get("taskId") as string;
    const submissionId = formData.get("submissionId") as string;
    const status = formData.get("status") as SubmissionReviewStatus;
    const supervisorFeedback = formData.get("supervisorFeedback") as string;
    const changeRequestNotes = formData.get("changeRequestNotes") as string;

    if (!taskId || !submissionId || !status) {
      return { success: false, error: "Task ID, submission ID, and status are required" };
    }

    const result = await taskService.reviewSubmission(user.id, user.roles, {
      taskId,
      submissionId,
      status,
      supervisorFeedback,
      changeRequestNotes,
    });

    revalidatePath("/recruitment/evaluations");
    revalidatePath("/intern/dashboard");
    return { success: true, result };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to review submission";
    return { success: false, error: message };
  }
}

export async function submitProgressReportAction(formData: FormData) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: "Authentication required" };
    }

    const enrollmentId = formData.get("enrollmentId") as string;
    const cadence = (formData.get("cadence") as ProgressCadence) || ProgressCadence.WEEKLY;
    const periodIdentifier = formData.get("periodIdentifier") as string;
    const summary = formData.get("summary") as string;
    const learnings = formData.get("learnings") as string;
    const blockers = formData.get("blockers") as string;

    if (!enrollmentId || !periodIdentifier || !summary) {
      return { success: false, error: "Enrollment ID, period identifier, and summary are required" };
    }

    const report = await taskService.submitProgressReport(user.id, {
      enrollmentId,
      cadence,
      periodIdentifier,
      summary,
      learnings,
      blockers,
    });

    revalidatePath(`/recruitment/evaluations/${enrollmentId}`);
    revalidatePath("/intern/dashboard");
    return { success: true, report };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to submit progress report";
    return { success: false, error: message };
  }
}

export async function reviewProgressReportAction(formData: FormData) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: "Authentication required" };
    }

    const reportId = formData.get("reportId") as string;
    const supervisorFeedback = formData.get("supervisorFeedback") as string;

    if (!reportId || !supervisorFeedback) {
      return { success: false, error: "Report ID and feedback are required" };
    }

    const report = await taskService.reviewProgressReport(
      user.id,
      user.roles,
      reportId,
      supervisorFeedback
    );

    revalidatePath("/recruitment/evaluations");
    revalidatePath("/intern/dashboard");
    return { success: true, report };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to review progress report";
    return { success: false, error: message };
  }
}
