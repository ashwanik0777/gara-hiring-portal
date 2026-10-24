import {
  TaskPriority,
  TaskStatus,
  SubmissionReviewStatus,
  ProgressCadence,
} from "@prisma/client";

export { TaskPriority, TaskStatus, SubmissionReviewStatus, ProgressCadence };

export interface TaskSubmissionItem {
  id: string;
  versionNumber: number;
  submissionNotes: string;
  deliverableUrls?: string[] | null;
  status: SubmissionReviewStatus;
  supervisorFeedback?: string | null;
  reviewedAt?: Date | null;
  submittedAt: Date;
  /** Display name only; staff identifiers and contact details are not needed by the task list. */
  reviewedBy?: {
    name: string;
  } | null;
}

export interface InternTaskDetail {
  id: string;
  enrollmentId: string;
  title: string;
  description: string;
  priority: TaskPriority;
  dueDate?: Date | null;
  status: TaskStatus;
  changeRequestNotes?: string | null;
  /** Display name only; the intern's browser never needs the assigning staff member's email. */
  assignedBy: {
    name: string;
  };
  createdAt: Date;
  updatedAt: Date;
  submissions: TaskSubmissionItem[];
}

export interface ProgressReportItem {
  id: string;
  enrollmentId: string;
  cadence: ProgressCadence;
  periodIdentifier: string;
  summary: string;
  learnings?: string | null;
  blockers?: string | null;
  supervisorFeedback?: string | null;
  submittedAt: Date;
  reviewedAt?: Date | null;
}

export interface CreateTaskInput {
  enrollmentId: string;
  title: string;
  description: string;
  priority: TaskPriority;
  dueDate?: string | null;
}

export interface SubmitTaskInput {
  taskId: string;
  submissionNotes: string;
  deliverableUrls?: string[];
}

export interface ReviewSubmissionInput {
  taskId: string;
  submissionId: string;
  status: SubmissionReviewStatus;
  supervisorFeedback?: string;
  changeRequestNotes?: string;
}

export interface CreateProgressReportInput {
  enrollmentId: string;
  cadence: ProgressCadence;
  periodIdentifier: string;
  summary: string;
  learnings?: string;
  blockers?: string;
}
