import { prisma } from "@/lib/db";
import {
  Role,
  TaskStatus,
  SubmissionReviewStatus,
} from "@prisma/client";
import {
  CreateTaskInput,
  SubmitTaskInput,
  ReviewSubmissionInput,
  CreateProgressReportInput,
  InternTaskDetail,
  ProgressReportItem,
} from "../types";

const STAFF_ROLES: Role[] = [Role.ADMIN, Role.HR, Role.MENTOR, Role.MANAGER];

export class TaskService {
  /**
   * Assign a new task to an intern.
   * Authorized for ADMIN, HR, MENTOR, MANAGER.
   */
  async createTask(
    actorUserId: string,
    actorRoles: Role[],
    input: CreateTaskInput
  ) {
    const isStaff = actorRoles.some((r) => STAFF_ROLES.includes(r));
    if (!isStaff) {
      throw new Error("Unauthorized: Only supervisors or HR/Admin can assign tasks");
    }

    const enrollment = await prisma.internshipEnrollment.findUnique({
      where: { id: input.enrollmentId },
    });

    if (!enrollment) {
      throw new Error("Internship enrollment not found");
    }

    const dueDate = input.dueDate ? new Date(input.dueDate) : null;

    const task = await prisma.internTask.create({
      data: {
        enrollmentId: input.enrollmentId,
        title: input.title.trim(),
        description: input.description.trim(),
        priority: input.priority,
        dueDate,
        status: TaskStatus.ASSIGNED,
        assignedById: actorUserId,
      },
      include: {
        assignedBy: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    return task;
  }

  /**
   * Get all tasks for an enrollment.
   */
  async getEnrollmentTasks(
    enrollmentId: string,
    actorUserId: string,
    actorRoles: Role[]
  ): Promise<InternTaskDetail[]> {
    const enrollment = await prisma.internshipEnrollment.findUnique({
      where: { id: enrollmentId },
    });

    if (!enrollment) {
      throw new Error("Internship enrollment not found");
    }

    const isStaff = actorRoles.some((r) => STAFF_ROLES.includes(r));
    if (!isStaff && enrollment.userId !== actorUserId) {
      throw new Error("Unauthorized: You cannot access tasks for another intern");
    }

    const tasks = await prisma.internTask.findMany({
      where: { enrollmentId },
      include: {
        assignedBy: {
          select: { id: true, name: true, email: true },
        },
        submissions: {
          include: {
            reviewedBy: {
              select: { id: true, name: true },
            },
          },
          orderBy: { versionNumber: "desc" },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return tasks.map((t) => ({
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
    }));
  }

  /**
   * Submit or resubmit an assigned task with version history.
   */
  async submitTask(actorUserId: string, input: SubmitTaskInput) {
    const task = await prisma.internTask.findUnique({
      where: { id: input.taskId },
      include: {
        enrollment: true,
        submissions: {
          orderBy: { versionNumber: "desc" },
          take: 1,
        },
      },
    });

    if (!task) {
      throw new Error("Task not found");
    }

    if (task.enrollment.userId !== actorUserId) {
      throw new Error("Unauthorized: You can only submit tasks assigned to your enrollment");
    }

    if (task.status === TaskStatus.COMPLETED) {
      throw new Error("Task is already approved and completed");
    }

    const nextVersion = (task.submissions[0]?.versionNumber ?? 0) + 1;

    const [submission, updatedTask] = await prisma.$transaction([
      prisma.taskSubmission.create({
        data: {
          taskId: input.taskId,
          versionNumber: nextVersion,
          submissionNotes: input.submissionNotes.trim(),
          deliverableUrls: input.deliverableUrls || [],
          status: SubmissionReviewStatus.PENDING,
        },
      }),
      prisma.internTask.update({
        where: { id: input.taskId },
        data: {
          status: TaskStatus.SUBMITTED,
        },
      }),
    ]);

    return { submission, task: updatedTask };
  }

  /**
   * Review a task submission (Approve or Request Revision).
   */
  async reviewSubmission(
    actorUserId: string,
    actorRoles: Role[],
    input: ReviewSubmissionInput
  ) {
    const isStaff = actorRoles.some((r) => STAFF_ROLES.includes(r));
    if (!isStaff) {
      throw new Error("Unauthorized: Only supervisors or HR/Admin can review submissions");
    }

    const submission = await prisma.taskSubmission.findUnique({
      where: { id: input.submissionId },
      include: { task: true },
    });

    if (!submission || submission.taskId !== input.taskId) {
      throw new Error("Submission not found");
    }

    const isApproval = input.status === SubmissionReviewStatus.APPROVED;
    const taskStatus = isApproval ? TaskStatus.COMPLETED : TaskStatus.REVISION_REQUESTED;

    const [updatedSubmission, updatedTask] = await prisma.$transaction([
      prisma.taskSubmission.update({
        where: { id: input.submissionId },
        data: {
          status: input.status,
          supervisorFeedback: input.supervisorFeedback?.trim() || null,
          reviewedById: actorUserId,
          reviewedAt: new Date(),
        },
      }),
      prisma.internTask.update({
        where: { id: input.taskId },
        data: {
          status: taskStatus,
          changeRequestNotes: isApproval ? null : (input.changeRequestNotes?.trim() || input.supervisorFeedback?.trim() || null),
        },
      }),
    ]);

    return { submission: updatedSubmission, task: updatedTask };
  }

  /**
   * Create a progress report (weekly, biweekly, or milestone check-in).
   */
  async submitProgressReport(actorUserId: string, input: CreateProgressReportInput) {
    const enrollment = await prisma.internshipEnrollment.findUnique({
      where: { id: input.enrollmentId },
    });

    if (!enrollment) {
      throw new Error("Internship enrollment not found");
    }

    if (enrollment.userId !== actorUserId) {
      throw new Error("Unauthorized: You can only submit progress reports for your own enrollment");
    }

    const report = await prisma.progressReport.create({
      data: {
        enrollmentId: input.enrollmentId,
        cadence: input.cadence,
        periodIdentifier: input.periodIdentifier.trim(),
        summary: input.summary.trim(),
        learnings: input.learnings?.trim() || null,
        blockers: input.blockers?.trim() || null,
      },
    });

    return report;
  }

  /**
   * Add supervisor feedback to a progress report.
   */
  async reviewProgressReport(
    actorUserId: string,
    actorRoles: Role[],
    reportId: string,
    supervisorFeedback: string
  ) {
    const isStaff = actorRoles.some((r) => STAFF_ROLES.includes(r));
    if (!isStaff) {
      throw new Error("Unauthorized: Only supervisors or HR/Admin can review progress reports");
    }

    const report = await prisma.progressReport.update({
      where: { id: reportId },
      data: {
        supervisorFeedback: supervisorFeedback.trim(),
        reviewedAt: new Date(),
      },
    });

    return report;
  }

  /**
   * Get progress reports for an enrollment.
   */
  async getEnrollmentProgressReports(
    enrollmentId: string,
    actorUserId: string,
    actorRoles: Role[]
  ): Promise<ProgressReportItem[]> {
    const enrollment = await prisma.internshipEnrollment.findUnique({
      where: { id: enrollmentId },
    });

    if (!enrollment) {
      throw new Error("Internship enrollment not found");
    }

    const isStaff = actorRoles.some((r) => STAFF_ROLES.includes(r));
    if (!isStaff && enrollment.userId !== actorUserId) {
      throw new Error("Unauthorized: You cannot access progress reports for another intern");
    }

    const reports = await prisma.progressReport.findMany({
      where: { enrollmentId },
      orderBy: { submittedAt: "desc" },
    });

    return reports.map((r) => ({
      id: r.id,
      enrollmentId: r.enrollmentId,
      cadence: r.cadence,
      periodIdentifier: r.periodIdentifier,
      summary: r.summary,
      learnings: r.learnings,
      blockers: r.blockers,
      supervisorFeedback: r.supervisorFeedback,
      submittedAt: r.submittedAt,
      reviewedAt: r.reviewedAt,
    }));
  }
}

export const taskService = new TaskService();
