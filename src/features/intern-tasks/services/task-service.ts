import { prisma } from "@/lib/db";
import type { AuthenticatedUser } from "@/lib/auth/guards";
import { Prisma, TaskStatus, SubmissionReviewStatus } from "@prisma/client";
import {
  CreateTaskInput,
  SubmitTaskInput,
  ReviewSubmissionInput,
  CreateProgressReportInput,
  InternTaskDetail,
  InternTaskPage,
  ListPageQuery,
  ProgressReportPage,
} from "../types";
import { SUBMISSION_REVIEW_OUTCOMES } from "../schemas";
import {
  assertEnrollmentInScope,
  assertEvaluationAccess,
  primaryActorRole,
  rethrowUniqueAsConflict,
} from "@/features/internship-evaluation/services/enrollment-access";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";

interface EnrollmentRef {
  id: string;
  userId: string;
  supervisorId: string | null;
}

/** Tasks / progress reports per page by default; `TASK_LIST_MAX_PAGE_SIZE` is the ceiling. */
export const TASK_LIST_PAGE_SIZE = 20;
export const TASK_LIST_MAX_PAGE_SIZE = 50;
/** Newest submission versions returned per task. */
export const SUBMISSION_HISTORY_LIMIT = 10;

function normalizePaging(query: ListPageQuery): { page: number; pageSize: number; skip: number } {
  const clamp = (value: number, min: number, max: number) =>
    Number.isFinite(value) ? Math.min(max, Math.max(min, Math.trunc(value))) : min;
  const page = clamp(query.page ?? 1, 1, Number.MAX_SAFE_INTEGER);
  const pageSize = clamp(query.pageSize ?? TASK_LIST_PAGE_SIZE, 1, TASK_LIST_MAX_PAGE_SIZE);
  return { page, pageSize, skip: (page - 1) * pageSize };
}

/** Columns the task list renders. Staff identifiers and emails are not needed by the browser. */
const taskListSelect = {
  id: true,
  enrollmentId: true,
  title: true,
  description: true,
  priority: true,
  dueDate: true,
  status: true,
  changeRequestNotes: true,
  createdAt: true,
  updatedAt: true,
  assignedBy: { select: { name: true } },
  submissions: {
    select: {
      id: true,
      versionNumber: true,
      submissionNotes: true,
      deliverableUrls: true,
      status: true,
      supervisorFeedback: true,
      reviewedAt: true,
      submittedAt: true,
      reviewedBy: { select: { name: true } },
    },
    orderBy: { versionNumber: "desc" },
    take: SUBMISSION_HISTORY_LIMIT,
  },
} satisfies Prisma.InternTaskSelect;

type TaskListRow = Prisma.InternTaskGetPayload<{ select: typeof taskListSelect }>;

function toTaskDetail(t: TaskListRow): InternTaskDetail {
  return {
    id: t.id,
    enrollmentId: t.enrollmentId,
    title: t.title,
    description: t.description,
    priority: t.priority,
    dueDate: t.dueDate,
    status: t.status,
    changeRequestNotes: t.changeRequestNotes,
    assignedBy: t.assignedBy,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
    submissions: t.submissions.map((s) => ({
      id: s.id,
      versionNumber: s.versionNumber,
      submissionNotes: s.submissionNotes,
      deliverableUrls: (s.deliverableUrls as string[]) || null,
      status: s.status,
      supervisorFeedback: s.supervisorFeedback,
      reviewedAt: s.reviewedAt,
      submittedAt: s.submittedAt,
      reviewedBy: s.reviewedBy,
    })),
  };
}

const progressReportSelect = {
  id: true,
  enrollmentId: true,
  cadence: true,
  periodIdentifier: true,
  summary: true,
  learnings: true,
  blockers: true,
  supervisorFeedback: true,
  submittedAt: true,
  reviewedAt: true,
} satisfies Prisma.ProgressReportSelect;

export class TaskService {
  /**
   * Interns read their own enrollment; staff need evaluation access for that specific enrollment.
   */
  private async assertCanReadEnrollment(user: AuthenticatedUser, enrollment: EnrollmentRef): Promise<void> {
    if (enrollment.userId === user.id) {
      return;
    }
    const access = await assertEvaluationAccess(user);
    assertEnrollmentInScope(access, user, enrollment);
  }

  /**
   * Assign a new task to an intern.
   * Authorized for ADMIN/HR (any enrollment) and the assigned supervisor, all with canEvaluations.
   */
  async createTask(user: AuthenticatedUser, input: CreateTaskInput) {
    const access = await assertEvaluationAccess(user);

    const enrollment = await prisma.internshipEnrollment.findUnique({
      where: { id: input.enrollmentId },
      select: { id: true, userId: true, supervisorId: true },
    });

    if (!enrollment) {
      throw new NotFoundError("Internship enrollment not found");
    }
    assertEnrollmentInScope(access, user, enrollment);

    const dueDate = input.dueDate ? new Date(input.dueDate) : null;
    if (dueDate && Number.isNaN(dueDate.getTime())) {
      throw new ValidationError("Invalid due date");
    }

    return prisma.internTask.create({
      data: {
        enrollmentId: input.enrollmentId,
        title: input.title.trim(),
        description: input.description.trim(),
        priority: input.priority,
        dueDate,
        status: TaskStatus.ASSIGNED,
        assignedById: user.id,
      },
      select: { id: true, enrollmentId: true },
    });
  }

  /**
   * One page of an enrollment's tasks (newest first) with the latest submission versions.
   * Interns read their own enrollment; staff need evaluation access for that enrollment.
   */
  async getEnrollmentTasks(
    enrollmentId: string,
    user: AuthenticatedUser,
    query: ListPageQuery = {}
  ): Promise<InternTaskPage> {
    const enrollment = await prisma.internshipEnrollment.findUnique({
      where: { id: enrollmentId },
      select: { id: true, userId: true, supervisorId: true },
    });

    if (!enrollment) {
      throw new NotFoundError("Internship enrollment not found");
    }
    await this.assertCanReadEnrollment(user, enrollment);

    const { page, pageSize, skip } = normalizePaging(query);
    const where: Prisma.InternTaskWhereInput = { enrollmentId };
    const [rows, total] = await Promise.all([
      prisma.internTask.findMany({
        where,
        select: taskListSelect,
        orderBy: { createdAt: "desc" },
        skip,
        take: pageSize,
      }),
      prisma.internTask.count({ where }),
    ]);

    return {
      items: rows.map(toTaskDetail),
      total,
      page,
      pageSize,
      pageCount: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  /**
   * Submit or resubmit an assigned task with version history.
   * The version number is computed under a task row lock; the @@unique([taskId, versionNumber])
   * constraint is the final guard against concurrent submissions.
   */
  async submitTask(user: AuthenticatedUser, input: SubmitTaskInput) {
    const task = await prisma.internTask.findUnique({
      where: { id: input.taskId },
      include: { enrollment: { select: { id: true, userId: true } } },
    });

    if (!task) {
      throw new NotFoundError("Task not found");
    }

    if (task.enrollment.userId !== user.id) {
      throw new ForbiddenError("You can only submit tasks assigned to your enrollment");
    }

    if (task.status === TaskStatus.COMPLETED) {
      throw new ConflictError("Task is already approved and completed");
    }

    try {
      return await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "intern_tasks" WHERE "id" = ${task.id} FOR UPDATE`;

        const latest = await tx.taskSubmission.findFirst({
          where: { taskId: task.id },
          orderBy: { versionNumber: "desc" },
          select: { versionNumber: true },
        });
        const nextVersion = (latest?.versionNumber ?? 0) + 1;

        const submission = await tx.taskSubmission.create({
          data: {
            taskId: task.id,
            versionNumber: nextVersion,
            submissionNotes: input.submissionNotes.trim(),
            deliverableUrls: input.deliverableUrls ?? [],
            status: SubmissionReviewStatus.PENDING,
          },
          select: { id: true, versionNumber: true },
        });

        const updated = await tx.internTask.updateMany({
          where: { id: task.id, status: { not: TaskStatus.COMPLETED } },
          data: { status: TaskStatus.SUBMITTED },
        });
        if (updated.count !== 1) {
          throw new ConflictError("Task is already approved and completed");
        }

        return { submission, enrollmentId: task.enrollment.id };
      });
    } catch (error) {
      rethrowUniqueAsConflict(
        error,
        "Another submission for this task was recorded at the same time. Please refresh and try again."
      );
    }
  }

  /**
   * Review a task submission (Approve or Request Revision).
   * Only the latest PENDING submission of a task that is not yet completed can be reviewed.
   */
  async reviewSubmission(user: AuthenticatedUser, input: ReviewSubmissionInput) {
    if (!(SUBMISSION_REVIEW_OUTCOMES as readonly SubmissionReviewStatus[]).includes(input.status)) {
      throw new ValidationError("Review status must be APPROVED or REVISION_REQUESTED.");
    }

    const access = await assertEvaluationAccess(user);

    const submission = await prisma.taskSubmission.findUnique({
      where: { id: input.submissionId },
      include: {
        task: {
          include: {
            enrollment: { select: { id: true, userId: true, supervisorId: true } },
          },
        },
      },
    });

    if (!submission || submission.taskId !== input.taskId) {
      throw new NotFoundError("Submission not found");
    }
    assertEnrollmentInScope(access, user, submission.task.enrollment);

    if (submission.status !== SubmissionReviewStatus.PENDING) {
      throw new ConflictError("This submission has already been reviewed.");
    }
    if (submission.task.status === TaskStatus.COMPLETED) {
      throw new ConflictError("This task is already approved and completed.");
    }

    const isApproval = input.status === SubmissionReviewStatus.APPROVED;
    const taskStatus = isApproval ? TaskStatus.COMPLETED : TaskStatus.REVISION_REQUESTED;
    const supervisorFeedback = input.supervisorFeedback?.trim() || null;
    const changeRequestNotes = isApproval
      ? null
      : input.changeRequestNotes?.trim() || supervisorFeedback;

    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "intern_tasks" WHERE "id" = ${submission.taskId} FOR UPDATE`;

      const latest = await tx.taskSubmission.findFirst({
        where: { taskId: submission.taskId },
        orderBy: { versionNumber: "desc" },
        select: { id: true },
      });
      if (!latest || latest.id !== submission.id) {
        throw new ConflictError("A newer version of this submission exists. Review the latest version instead.");
      }

      const reviewed = await tx.taskSubmission.updateMany({
        where: { id: submission.id, status: SubmissionReviewStatus.PENDING },
        data: {
          status: input.status,
          supervisorFeedback,
          reviewedById: user.id,
          reviewedAt: new Date(),
        },
      });
      if (reviewed.count !== 1) {
        throw new ConflictError("This submission has already been reviewed.");
      }

      const taskUpdated = await tx.internTask.updateMany({
        where: { id: submission.taskId, status: { not: TaskStatus.COMPLETED } },
        data: { status: taskStatus, changeRequestNotes },
      });
      if (taskUpdated.count !== 1) {
        throw new ConflictError("This task is already approved and completed.");
      }

      await tx.auditLog.create({
        data: {
          actorId: user.id,
          actorRole: primaryActorRole(user),
          action: "TASK_SUBMISSION_REVIEWED",
          resourceType: "TaskSubmission",
          resourceId: submission.id,
          diffPayload: {
            taskId: submission.taskId,
            enrollmentId: submission.task.enrollment.id,
            versionNumber: submission.versionNumber,
            fromStatus: submission.status,
            toStatus: input.status,
            taskFromStatus: submission.task.status,
            taskToStatus: taskStatus,
            supervisorFeedback,
          },
        },
      });
    });

    return {
      enrollmentId: submission.task.enrollment.id,
      taskId: submission.taskId,
      submissionId: submission.id,
      status: input.status,
    };
  }

  /**
   * Create a progress report (weekly, biweekly, or milestone check-in).
   */
  async submitProgressReport(user: AuthenticatedUser, input: CreateProgressReportInput) {
    const enrollment = await prisma.internshipEnrollment.findUnique({
      where: { id: input.enrollmentId },
      select: { id: true, userId: true },
    });

    if (!enrollment) {
      throw new NotFoundError("Internship enrollment not found");
    }

    if (enrollment.userId !== user.id) {
      throw new ForbiddenError("You can only submit progress reports for your own enrollment");
    }

    return prisma.progressReport.create({
      data: {
        enrollmentId: input.enrollmentId,
        cadence: input.cadence,
        periodIdentifier: input.periodIdentifier.trim(),
        summary: input.summary.trim(),
        learnings: input.learnings?.trim() || null,
        blockers: input.blockers?.trim() || null,
      },
      select: { id: true, enrollmentId: true },
    });
  }

  /**
   * Add supervisor feedback to a progress report (record-level scoped).
   */
  async reviewProgressReport(user: AuthenticatedUser, reportId: string, supervisorFeedback: string) {
    const access = await assertEvaluationAccess(user);

    const report = await prisma.progressReport.findUnique({
      where: { id: reportId },
      include: { enrollment: { select: { id: true, userId: true, supervisorId: true } } },
    });

    if (!report) {
      throw new NotFoundError("Progress report not found");
    }
    assertEnrollmentInScope(access, user, report.enrollment);

    return prisma.progressReport.update({
      where: { id: report.id },
      data: {
        supervisorFeedback: supervisorFeedback.trim(),
        reviewedAt: new Date(),
      },
      select: { id: true, enrollmentId: true },
    });
  }

  /**
   * One page of an enrollment's progress reports (newest first). Same access rules as tasks.
   */
  async getEnrollmentProgressReports(
    enrollmentId: string,
    user: AuthenticatedUser,
    query: ListPageQuery = {}
  ): Promise<ProgressReportPage> {
    const enrollment = await prisma.internshipEnrollment.findUnique({
      where: { id: enrollmentId },
      select: { id: true, userId: true, supervisorId: true },
    });

    if (!enrollment) {
      throw new NotFoundError("Internship enrollment not found");
    }
    await this.assertCanReadEnrollment(user, enrollment);

    const { page, pageSize, skip } = normalizePaging(query);
    const where: Prisma.ProgressReportWhereInput = { enrollmentId };
    const [items, total] = await Promise.all([
      prisma.progressReport.findMany({
        where,
        select: progressReportSelect,
        orderBy: { submittedAt: "desc" },
        skip,
        take: pageSize,
      }),
      prisma.progressReport.count({ where }),
    ]);

    return {
      items,
      total,
      page,
      pageSize,
      pageCount: Math.max(1, Math.ceil(total / pageSize)),
    };
  }
}

export const taskService = new TaskService();
