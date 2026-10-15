import crypto from "node:crypto";
import { prisma } from "@/lib/db";
import { AuthenticatedUser } from "@/lib/auth/guards";
import {
  Role,
  ApplicationStatus,
  EvaluationStatus,
  CheckpointStatus,
  OnboardingStatus,
  IdCardStatus,
  Prisma,
} from "@prisma/client";
import { workingDayService, DEFAULT_WORKING_CALENDAR } from "./working-day-service";
import {
  WorkingDayCalendarConfig,
  EvaluationEnrollmentDetail,
  OnboardingChecklistItem,
} from "../types";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";

const STAFF_ROLES: Role[] = [Role.ADMIN, Role.HR, Role.MENTOR, Role.MANAGER];
const DECISION_ROLES: Role[] = [Role.ADMIN, Role.HR];

const DEFAULT_CHECKPOINTS = [
  { day: 1, title: "Day 1: Orientation & Development Environment", desc: "Complete portal sign-in, repository setup, and local build verification." },
  { day: 2, title: "Day 2: Architecture Walkthrough & Domain Familiarization", desc: "Review domain specifications, coding conventions, and architectural boundaries." },
  { day: 3, title: "Day 3: Initial Task Implementation", desc: "Deliver initial feature ticket or reproducible bug resolution with unit tests." },
  { day: 4, title: "Day 4: Intermediate Code Review & Refactoring", desc: "Submit code for mentor review, address feedback, and verify test coverage." },
  { day: 5, title: "Day 5: Core Milestone Implementation", desc: "Complete core programme deliverable with integration tests." },
  { day: 6, title: "Day 6: Documentation & Error Hardening", desc: "Write technical documentation, handle edge cases, and ensure clean error reporting." },
  { day: 7, title: "Day 7: Final Milestone Presentation & Supervised Review", desc: "Present final deliverable to mentor and complete 7-working-day evaluation." },
];

const DEFAULT_ONBOARDING_CHECKLIST: OnboardingChecklistItem[] = [
  { id: "id-doc", label: "Government ID & Educational Records Verified", required: true, completed: false },
  { id: "nda-agree", label: "Confidentiality & Code of Conduct Signed", required: true, completed: false },
  { id: "repo-access", label: "Internal Workspace & Repository Provisioned", required: true, completed: false },
  { id: "mentor-assign", label: "Assigned Mentor Induction Completed", required: true, completed: false },
];

export class EvaluationService {
  private assertStaff(user: AuthenticatedUser): void {
    const isStaff = user.roles.some((r) => STAFF_ROLES.includes(r));
    if (!isStaff) throw new ForbiddenError("Staff authorization required.");
  }

  private assertDecisionAuthority(user: AuthenticatedUser): void {
    const isDecision = user.roles.some((r) => DECISION_ROLES.includes(r));
    if (!isDecision) throw new ForbiddenError("Administrative or HR authorization required.");
  }

  /**
   * Enrolls a selected candidate into the 7-working-day supervised evaluation pipeline.
   * Status defaults safely to PENDING_TRIGGER pending approved start trigger policy (OD-001).
   */
  async enrollCandidate(
    user: AuthenticatedUser,
    applicationId: string,
    supervisorId?: string
  ): Promise<{ enrollmentId: string }> {
    this.assertDecisionAuthority(user);

    const app = await prisma.application.findUnique({
      where: { id: applicationId },
      include: {
        candidate: { include: { user: true } },
        opening: true,
        enrollment: true,
      },
    });

    if (!app) throw new NotFoundError("Application record not found.");
    if (app.enrollment) {
      return { enrollmentId: app.enrollment.id };
    }

    const enrollment = await prisma.$transaction(async (tx) => {
      const createdEnrollment = await tx.internshipEnrollment.create({
        data: {
          applicationId: app.id,
          userId: app.candidate.userId,
          supervisorId: supervisorId || null,
          status: EvaluationStatus.PENDING_TRIGGER,
          workingDaysTarget: 7,
        },
      });

      // Scaffold 7 checkpoint records
      for (const cp of DEFAULT_CHECKPOINTS) {
        await tx.evaluationCheckpoint.create({
          data: {
            enrollmentId: createdEnrollment.id,
            dayNumber: cp.day,
            title: cp.title,
            description: cp.desc,
            status: CheckpointStatus.PENDING,
          },
        });
      }

      // Update application status to EVALUATION_SELECTED
      if (app.status !== ApplicationStatus.EVALUATION_SELECTED) {
        await tx.application.update({
          where: { id: app.id },
          data: { status: ApplicationStatus.EVALUATION_SELECTED },
        });

        await tx.applicationStatusHistory.create({
          data: {
            applicationId: app.id,
            fromStatus: app.status,
            toStatus: ApplicationStatus.EVALUATION_SELECTED,
            actorId: user.id,
            internalNotes: `Candidate selected for 7-working-day supervised evaluation. Enrollment ID: ${createdEnrollment.id}`,
            candidateMessage: `Congratulations! You have been selected for the GARA Innovation 7-working-day supervised evaluation period.`,
          },
        });
      }

      // Queue candidate notification
      await tx.notificationOutbox.create({
        data: {
          recipientEmail: app.candidate.user.email,
          templateName: "EVALUATION_SELECTION_NOTIFICATION",
          payload: {
            candidateName: app.candidate.user.name,
            openingTitle: app.opening.title,
            workingDays: 7,
          },
          status: "PENDING",
        },
      });

      return createdEnrollment;
    });

    return { enrollmentId: enrollment.id };
  }

  /**
   * Explicitly triggers the start of the 7-working-day evaluation window (OD-001).
   * Computes the 7th working day end date via workingDayService (OD-002).
   */
  async triggerEvaluationStart(
    user: AuthenticatedUser,
    enrollmentId: string,
    startDate: Date,
    calendar: WorkingDayCalendarConfig = DEFAULT_WORKING_CALENDAR
  ): Promise<{ startDate: Date; endDate: Date }> {
    this.assertStaff(user);

    const enrollment = await prisma.internshipEnrollment.findUnique({
      where: { id: enrollmentId },
      include: {
        application: {
          include: {
            candidate: { include: { user: true } },
            opening: true,
          },
        },
      },
    });

    if (!enrollment) throw new NotFoundError("Evaluation enrollment not found.");

    const computedEndDate = workingDayService.addWorkingDays(
      startDate,
      enrollment.workingDaysTarget,
      calendar
    );

    await prisma.$transaction(async (tx) => {
      await tx.internshipEnrollment.update({
        where: { id: enrollment.id },
        data: {
          startDate,
          endDate: computedEndDate,
          status: EvaluationStatus.IN_PROGRESS,
        },
      });

      await tx.applicationStatusHistory.create({
        data: {
          applicationId: enrollment.applicationId,
          fromStatus: ApplicationStatus.EVALUATION_SELECTED,
          toStatus: ApplicationStatus.EVALUATION_SELECTED,
          actorId: user.id,
          internalNotes: `Evaluation started on ${startDate.toDateString()}. 7-working-day end date scheduled for ${computedEndDate.toDateString()}.`,
          candidateMessage: `Your 7-working-day supervised evaluation has commenced. End date: ${computedEndDate.toLocaleDateString()}.`,
        },
      });

      await tx.notificationOutbox.create({
        data: {
          recipientEmail: enrollment.application.candidate.user.email,
          templateName: "EVALUATION_STARTED_NOTIFICATION",
          payload: {
            candidateName: enrollment.application.candidate.user.name,
            startDate: startDate.toISOString(),
            endDate: computedEndDate.toISOString(),
          },
          status: "PENDING",
        },
      });
    });

    return { startDate, endDate: computedEndDate };
  }

  /**
   * Intern submits daily progress report for a checkpoint.
   */
  async submitCheckpoint(
    user: AuthenticatedUser,
    checkpointId: string,
    submissionNotes: string
  ): Promise<void> {
    const cp = await prisma.evaluationCheckpoint.findUnique({
      where: { id: checkpointId },
      include: { enrollment: true },
    });

    if (!cp) throw new NotFoundError("Checkpoint not found.");
    if (cp.enrollment.userId !== user.id && !user.roles.includes(Role.ADMIN)) {
      throw new ForbiddenError("You can only submit checkpoints for your own evaluation.");
    }

    await prisma.evaluationCheckpoint.update({
      where: { id: checkpointId },
      data: {
        submissionNotes,
        status: CheckpointStatus.SUBMITTED,
      },
    });
  }

  /**
   * Supervisor or HR reviews checkpoint and leaves structured feedback.
   */
  async reviewCheckpoint(
    user: AuthenticatedUser,
    checkpointId: string,
    feedback: string,
    status: CheckpointStatus
  ): Promise<void> {
    this.assertStaff(user);

    await prisma.evaluationCheckpoint.update({
      where: { id: checkpointId },
      data: {
        supervisorFeedback: feedback,
        status,
        reviewedById: user.id,
        reviewedAt: new Date(),
      },
    });
  }

  /**
   * Finalizes the 7-working-day supervised evaluation.
   * Gated: Only authorized HR or Admin can finalize pass/fail (OD-003).
   * On approved pass, scaffolds intern onboarding checklist.
   */
  async finalizeEvaluation(
    user: AuthenticatedUser,
    enrollmentId: string,
    status: EvaluationStatus,
    finalReviewNotes: string
  ): Promise<void> {
    this.assertDecisionAuthority(user);

    if (status !== EvaluationStatus.PASSED && status !== EvaluationStatus.FAILED && status !== EvaluationStatus.EXTENDED) {
      throw new ValidationError("Final status must be PASSED, FAILED, or EXTENDED.");
    }

    const enrollment = await prisma.internshipEnrollment.findUnique({
      where: { id: enrollmentId },
      include: {
        application: {
          include: {
            candidate: { include: { user: true } },
            opening: true,
          },
        },
      },
    });

    if (!enrollment) throw new NotFoundError("Evaluation enrollment not found.");

    await prisma.$transaction(async (tx) => {
      await tx.internshipEnrollment.update({
        where: { id: enrollment.id },
        data: {
          status,
          finalReviewNotes,
          evaluatedById: user.id,
          evaluatedAt: new Date(),
        },
      });

      if (status === EvaluationStatus.PASSED) {
        // Upgrade role to INTERN if not already present
        await tx.userRole.upsert({
          where: {
            userId_role: {
              userId: enrollment.userId,
              role: Role.INTERN,
            },
          },
          create: {
            userId: enrollment.userId,
            role: Role.INTERN,
            assignedBy: user.id,
          },
          update: {},
        });

        // Scaffold Onboarding Checklist
        await tx.internOnboarding.upsert({
          where: { enrollmentId: enrollment.id },
          create: {
            enrollmentId: enrollment.id,
            userId: enrollment.userId,
            checklistItems: DEFAULT_ONBOARDING_CHECKLIST as unknown as Prisma.InputJsonValue,
            status: OnboardingStatus.IN_PROGRESS,
          },
          update: {},
        });

        await tx.applicationStatusHistory.create({
          data: {
            applicationId: enrollment.applicationId,
            fromStatus: ApplicationStatus.EVALUATION_SELECTED,
            toStatus: ApplicationStatus.OFFERED,
            actorId: user.id,
            internalNotes: `Evaluation PASSED by ${user.name}. Final Review: ${finalReviewNotes}`,
            candidateMessage: `Congratulations! You have successfully passed the 7-working-day supervised evaluation! Welcome to the GARA Innovation Internship programme.`,
          },
        });
      } else if (status === EvaluationStatus.FAILED) {
        await tx.applicationStatusHistory.create({
          data: {
            applicationId: enrollment.applicationId,
            fromStatus: ApplicationStatus.EVALUATION_SELECTED,
            toStatus: ApplicationStatus.REJECTED,
            actorId: user.id,
            internalNotes: `Evaluation FAILED. Reason: ${finalReviewNotes}`,
            candidateMessage: `Thank you for participating in the 7-working-day evaluation. Regrettably, your submission did not meet the required milestone threshold.`,
          },
        });
      }

      await tx.notificationOutbox.create({
        data: {
          recipientEmail: enrollment.application.candidate.user.email,
          templateName: "EVALUATION_FINAL_OUTCOME",
          payload: {
            candidateName: enrollment.application.candidate.user.name,
            outcome: status,
            openingTitle: enrollment.application.opening.title,
          },
          status: "PENDING",
        },
      });
    });
  }

  /**
   * Updates an onboarding checklist item.
   */
  async updateOnboardingChecklistItem(
    user: AuthenticatedUser,
    enrollmentId: string,
    itemId: string,
    completed: boolean
  ): Promise<void> {
    this.assertStaff(user);

    const onboarding = await prisma.internOnboarding.findUnique({
      where: { enrollmentId },
    });

    if (!onboarding) throw new NotFoundError("Onboarding record not found.");

    const items = (onboarding.checklistItems ?? []) as unknown as OnboardingChecklistItem[];
    const updatedItems = items.map((item) => {
      if (item.id === itemId) {
        return {
          ...item,
          completed,
          verifiedAt: completed ? new Date().toISOString() : null,
          verifiedBy: completed ? user.name : null,
        };
      }
      return item;
    });

    const allRequiredCompleted = updatedItems
      .filter((i) => i.required)
      .every((i) => i.completed);

    const newStatus = allRequiredCompleted ? OnboardingStatus.COMPLETED : OnboardingStatus.IN_PROGRESS;

    await prisma.internOnboarding.update({
      where: { enrollmentId },
      data: {
        checklistItems: updatedItems as unknown as Prisma.InputJsonValue,
        status: newStatus,
        completedAt: allRequiredCompleted ? new Date() : null,
      },
    });
  }

  /**
   * Approves and generates an Intern ID Card.
   *
   * STRICT POLICY GATES (Prompt 5 & OD-014):
   * 1. Evaluation MUST be approved as PASSED.
   * 2. Onboarding MUST be fully COMPLETED.
   * 3. Must be authorized ADMIN or HR.
   * Never issue an ID card merely because 7 days elapsed!
   */
  async approveAndIssueIdCard(
    user: AuthenticatedUser,
    enrollmentId: string
  ): Promise<{ cardNumber: string }> {
    this.assertDecisionAuthority(user);

    const enrollment = await prisma.internshipEnrollment.findUnique({
      where: { id: enrollmentId },
      include: {
        onboarding: true,
        user: true,
      },
    });

    if (!enrollment) throw new NotFoundError("Enrollment record not found.");

    // GATE 1: Evaluation must be passed
    if (enrollment.status !== EvaluationStatus.PASSED) {
      throw new ValidationError(
        `[Policy Gate Violation]: Intern ID card cannot be issued because evaluation status is ${enrollment.status}. Evaluation must be approved as PASSED first.`
      );
    }

    // GATE 2: Onboarding must be completed
    if (enrollment.onboarding?.status !== OnboardingStatus.COMPLETED) {
      throw new ValidationError(
        `[Policy Gate Violation]: Intern ID card cannot be issued because onboarding checklist is not complete. Status: ${enrollment.onboarding?.status ?? "NOT_STARTED"}.`
      );
    }

    const randomSuffix = crypto.randomBytes(3).toString("hex").toUpperCase();
    const cardNumber = `GARA-INT-2026-${randomSuffix}`;

    await prisma.$transaction(async (tx) => {
      await tx.internIdCard.upsert({
        where: { enrollmentId: enrollment.id },
        create: {
          enrollmentId: enrollment.id,
          userId: enrollment.userId,
          cardNumber,
          status: IdCardStatus.ISSUED,
          approvedById: user.id,
          approvedAt: new Date(),
          issuedAt: new Date(),
        },
        update: {
          cardNumber,
          status: IdCardStatus.ISSUED,
          approvedById: user.id,
          approvedAt: new Date(),
          issuedAt: new Date(),
        },
      });

      await tx.notificationOutbox.create({
        data: {
          recipientEmail: enrollment.user.email,
          templateName: "ID_CARD_ISSUED_NOTIFICATION",
          payload: {
            cardNumber,
            recipientName: enrollment.user.name,
            issuedAt: new Date().toISOString(),
          },
          status: "PENDING",
        },
      });
    });

    return { cardNumber };
  }

  /**
   * Retrieves full evaluation details for the cockpit.
   */
  async getEvaluationDetail(
    enrollmentId: string,
    user: AuthenticatedUser
  ): Promise<EvaluationEnrollmentDetail> {
    this.assertStaff(user);

    const enrollment = await prisma.internshipEnrollment.findUnique({
      where: { id: enrollmentId },
      include: {
        application: {
          include: {
            candidate: { include: { user: true } },
            opening: true,
          },
        },
        supervisor: {
          select: { id: true, name: true, email: true },
        },
        checkpoints: {
          orderBy: { dayNumber: "asc" },
        },
        onboarding: true,
        idCard: true,
        tasks: {
          include: {
            assignedBy: {
              select: { id: true, name: true, email: true },
            },
            submissions: {
              include: {
                reviewedBy: { select: { id: true, name: true } },
              },
              orderBy: { versionNumber: "desc" },
            },
          },
          orderBy: { createdAt: "desc" },
        },
        completion: true,
        certificate: true,
      },
    });

    if (!enrollment) throw new NotFoundError("Evaluation enrollment not found.");

    return {
      id: enrollment.id,
      applicationId: enrollment.applicationId,
      referenceCode: enrollment.application.referenceCode,
      candidateName: enrollment.application.candidate.user.name,
      candidateEmail: enrollment.application.candidate.user.email,
      openingTitle: enrollment.application.opening.title,
      openingDepartment: enrollment.application.opening.department,
      supervisor: enrollment.supervisor,
      startDate: enrollment.startDate,
      endDate: enrollment.endDate,
      workingDaysTarget: enrollment.workingDaysTarget,
      status: enrollment.status,
      finalReviewNotes: enrollment.finalReviewNotes,
      checkpoints: enrollment.checkpoints.map((cp) => ({
        id: cp.id,
        dayNumber: cp.dayNumber,
        title: cp.title,
        description: cp.description,
        submissionNotes: cp.submissionNotes,
        supervisorFeedback: cp.supervisorFeedback,
        status: cp.status,
        reviewedAt: cp.reviewedAt,
      })),
      onboarding: enrollment.onboarding
        ? {
            id: enrollment.onboarding.id,
            status: enrollment.onboarding.status,
            checklistItems: (enrollment.onboarding.checklistItems ?? []) as unknown as OnboardingChecklistItem[],
            completedAt: enrollment.onboarding.completedAt,
          }
        : null,
      idCard: enrollment.idCard
        ? {
            id: enrollment.idCard.id,
            cardNumber: enrollment.idCard.cardNumber,
            status: enrollment.idCard.status,
            approvedAt: enrollment.idCard.approvedAt,
            issuedAt: enrollment.idCard.issuedAt,
          }
        : null,
      tasks: (enrollment.tasks ?? []).map((t) => ({
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
        submissions: (t.submissions ?? []).map((s) => ({
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
      })),
      completion: enrollment.completion
        ? {
            id: enrollment.completion.id,
            status: enrollment.completion.status,
            checklistResponses:
              (enrollment.completion.checklistResponses as unknown as {
                id: string;
                label: string;
                completed: boolean;
              }[]) || null,
            isEligibleForCertificate: enrollment.completion.isEligibleForCertificate,
            completionNotes: enrollment.completion.completionNotes,
          }
        : null,
      certificate: enrollment.certificate
        ? {
            id: enrollment.certificate.id,
            verificationCode: enrollment.certificate.verificationCode,
            enrollmentId: enrollment.certificate.enrollmentId,
            recipientName: enrollment.certificate.recipientName,
            programmeTitle: enrollment.certificate.programmeTitle,
            issueDate: enrollment.certificate.issueDate,
            completionDate: enrollment.certificate.completionDate,
            signatoryTitle: enrollment.certificate.signatoryTitle,
            signatoryName: enrollment.certificate.signatoryName,
            status: enrollment.certificate.status,
            qrPayloadUrl: enrollment.certificate.qrPayloadUrl,
            versionNumber: enrollment.certificate.versionNumber,
            pdfStorageKey: enrollment.certificate.pdfStorageKey,
            createdAt: enrollment.certificate.createdAt,
          }
        : null,
    };
  }
}

export const evaluationService = new EvaluationService();
