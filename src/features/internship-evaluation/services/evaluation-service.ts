import crypto from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/db";
import type { AuthenticatedUser } from "@/lib/auth/guards";
import {
  ApplicationStatus,
  EvaluationStatus,
  CheckpointStatus,
  OnboardingStatus,
  IdCardStatus,
  OpeningType,
  Prisma,
} from "@prisma/client";
import { VALID_APPLICATION_TRANSITIONS } from "@/features/recruitment/schemas";
import { assertNotOwnApplication } from "@/features/recruitment/services/application-access";
import { workingDayService, DEFAULT_WORKING_CALENDAR } from "./working-day-service";
import {
  assertEnrollmentInScope,
  assertEvaluationAccess,
  assertEvaluationDecisionAuthority,
  enrollmentScopeWhere,
  primaryActorRole,
  rethrowUniqueAsConflict,
  SUPERVISOR_ELIGIBLE_ROLES,
} from "./enrollment-access";
import {
  WorkingDayCalendarConfig,
  EvaluationEnrollmentDetail,
  EvaluationEnrollmentListItem,
  OnboardingChecklistItem,
  SupervisorOption,
} from "../types";
import { CHECKPOINT_REVIEW_OUTCOMES } from "../schemas";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  PolicyBlockedError,
  ValidationError,
} from "@/lib/errors";

const DEFAULT_CHECKPOINTS = [
  { day: 1, title: "Day 1: Orientation & Development Environment", desc: "Complete portal sign-in, repository setup, and local build verification." },
  { day: 2, title: "Day 2: Architecture Walkthrough & Domain Familiarization", desc: "Review domain specifications, coding conventions, and architectural boundaries." },
  { day: 3, title: "Day 3: Initial Task Implementation", desc: "Deliver initial feature ticket or reproducible bug resolution with unit tests." },
  { day: 4, title: "Day 4: Intermediate Code Review & Refactoring", desc: "Submit code for mentor review, address feedback, and verify test coverage." },
  { day: 5, title: "Day 5: Core Milestone Implementation", desc: "Complete core programme deliverable with integration tests." },
  { day: 6, title: "Day 6: Documentation & Error Hardening", desc: "Write technical documentation, handle edge cases, and ensure clean error reporting." },
  { day: 7, title: "Day 7: Final Milestone Presentation & Supervised Review", desc: "Present final deliverable to mentor and complete 7-working-day evaluation." },
];

// Default onboarding items are pending product-owner approval (POL-13 / OD-014); unchanged.
const DEFAULT_ONBOARDING_CHECKLIST: OnboardingChecklistItem[] = [
  { id: "id-doc", label: "Government ID & Educational Records Verified", required: true, completed: false },
  { id: "nda-agree", label: "Confidentiality & Code of Conduct Signed", required: true, completed: false },
  { id: "repo-access", label: "Internal Workspace & Repository Provisioned", required: true, completed: false },
  { id: "mentor-assign", label: "Assigned Mentor Induction Completed", required: true, completed: false },
];

// ---------------------------------------------------------------------------
// Explicit state machines (BUG-05 / BUG-06)
// ---------------------------------------------------------------------------

/** Evaluation statuses from which a final PASSED / FAILED outcome may be recorded (once). */
export const FINALIZABLE_EVALUATION_STATUSES: EvaluationStatus[] = [
  EvaluationStatus.IN_PROGRESS,
  EvaluationStatus.UNDER_REVIEW,
  EvaluationStatus.EXTENDED,
];

/** Final outcomes; once recorded they cannot be changed or restarted. */
export const FINAL_EVALUATION_OUTCOMES: EvaluationStatus[] = [
  EvaluationStatus.PASSED,
  EvaluationStatus.FAILED,
];

/** Checkpoint statuses the intern may submit (or resubmit) notes from. REVIEWED is final for the intern. */
export const CHECKPOINT_SUBMITTABLE_STATUSES: CheckpointStatus[] = [
  CheckpointStatus.PENDING,
  CheckpointStatus.SUBMITTED,
  CheckpointStatus.BLOCKED,
];

/**
 * Checkpoint statuses a supervisor may review from while the evaluation runs. The daily
 * checkpoint review is supervisor-led, so a PENDING checkpoint (no intern notes yet) can be
 * reviewed directly; amending an existing review is allowed too. Every review records an
 * explicitly chosen outcome and is audit-logged with the previous status.
 */
export const CHECKPOINT_REVIEWABLE_STATUSES: CheckpointStatus[] = [
  CheckpointStatus.PENDING,
  CheckpointStatus.SUBMITTED,
  CheckpointStatus.REVIEWED,
  CheckpointStatus.BLOCKED,
];

const OnboardingChecklistItemsSchema = z.array(
  z.object({
    id: z.string(),
    label: z.string(),
    description: z.string().optional(),
    required: z.boolean(),
    completed: z.boolean(),
    verifiedAt: z.string().nullable().optional(),
    verifiedBy: z.string().nullable().optional(),
    verifiedById: z.string().nullable().optional(),
  })
);

function parseOnboardingItems(value: Prisma.JsonValue): OnboardingChecklistItem[] {
  const parsed = OnboardingChecklistItemsSchema.safeParse(value ?? []);
  if (!parsed.success) {
    // Stored data does not match the expected shape: internal integrity failure.
    throw new Error("Stored onboarding checklist has an unexpected format.");
  }
  return parsed.data;
}

/**
 * Provisional intern ID card number (POL-10 / OD-014): neutral prefix plus a random suffix.
 * The official numbering series has not been approved and must replace this format.
 */
function generateProvisionalCardNumber(): string {
  return `IDC-${crypto.randomBytes(6).toString("hex").toUpperCase()}`;
}

export interface IssueIdCardResult {
  cardNumber: string;
  alreadyIssued: boolean;
  reissued: boolean;
}

export class EvaluationService {
  private async assertSupervisorEligible(supervisorId: string, candidateUserId: string): Promise<void> {
    if (supervisorId === candidateUserId) {
      throw new ValidationError("The candidate cannot supervise their own evaluation.");
    }
    const supervisor = await prisma.user.findUnique({
      where: { id: supervisorId },
      select: { id: true, roles: { select: { role: true } } },
    });
    if (!supervisor || !supervisor.roles.some((r) => SUPERVISOR_ELIGIBLE_ROLES.includes(r.role))) {
      throw new ValidationError("The selected supervisor must be a staff member.");
    }
  }

  /**
   * Staff who may be assigned as evaluation supervisor (ADMIN / HR / MENTOR / MANAGER /
   * INTERVIEWER). The candidate is excluded so nobody supervises their own evaluation.
   * Gated like enrollment itself: ADMIN / HR with canEvaluations.
   */
  async listSupervisorOptions(
    user: AuthenticatedUser,
    excludeUserId?: string
  ): Promise<SupervisorOption[]> {
    await assertEvaluationDecisionAuthority(user);

    const users = await prisma.user.findMany({
      where: {
        roles: { some: { role: { in: SUPERVISOR_ELIGIBLE_ROLES } } },
        ...(excludeUserId ? { id: { not: excludeUserId } } : {}),
      },
      select: { id: true, name: true, email: true, roles: { select: { role: true } } },
      orderBy: { name: "asc" },
    });

    return users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      roles: u.roles.map((r) => r.role).filter((role) => SUPERVISOR_ELIGIBLE_ROLES.includes(role)),
    }));
  }

  /**
   * Selects an internship candidate for the 7-working-day supervised evaluation (internship
   * step 1): moves the application to EVALUATION_SELECTED (a flow-owned stage) and creates the
   * enrollment, its checkpoints, the candidate email and the audit row in one transaction.
   * Status defaults safely to PENDING_TRIGGER pending the approved start trigger policy (OD-001).
   */
  async enrollCandidate(
    user: AuthenticatedUser,
    applicationId: string,
    supervisorId?: string
  ): Promise<{ enrollmentId: string; created: boolean }> {
    await assertEvaluationDecisionAuthority(user);

    const app = await prisma.application.findUnique({
      where: { id: applicationId },
      include: {
        candidate: { include: { user: true } },
        opening: true,
        enrollment: true,
      },
    });

    if (!app) throw new NotFoundError("Application record not found.");
    // Separation of duties comes first: staff never act on (or learn about) their own enrollment.
    assertNotOwnApplication(user, app.candidate.userId);
    if (app.enrollment) {
      return { enrollmentId: app.enrollment.id, created: false };
    }

    if (app.opening.type !== OpeningType.INTERNSHIP) {
      throw new ValidationError("Only internship applications can enter the supervised evaluation.");
    }

    const needsTransition = app.status !== ApplicationStatus.EVALUATION_SELECTED;
    if (
      needsTransition &&
      !VALID_APPLICATION_TRANSITIONS[app.status].includes(ApplicationStatus.EVALUATION_SELECTED)
    ) {
      throw new ValidationError(
        `An application in status ${app.status} cannot be moved to EVALUATION_SELECTED.`
      );
    }

    if (supervisorId) {
      await this.assertSupervisorEligible(supervisorId, app.candidate.userId);
    }

    try {
      const enrollment = await prisma.$transaction(async (tx) => {
        if (needsTransition) {
          const moved = await tx.application.updateMany({
            where: { id: app.id, status: app.status },
            data: { status: ApplicationStatus.EVALUATION_SELECTED },
          });
          if (moved.count !== 1) {
            throw new ConflictError("The application status changed. Please reload and try again.");
          }

          await tx.applicationStatusHistory.create({
            data: {
              applicationId: app.id,
              fromStatus: app.status,
              toStatus: ApplicationStatus.EVALUATION_SELECTED,
              actorId: user.id,
              internalNotes: "Candidate selected for the 7-working-day supervised evaluation.",
              candidateMessage:
                "You have been selected for the GARA Innovation 7-working-day supervised evaluation period.",
            },
          });
        }

        const createdEnrollment = await tx.internshipEnrollment.create({
          data: {
            applicationId: app.id,
            userId: app.candidate.userId,
            supervisorId: supervisorId ?? null,
            status: EvaluationStatus.PENDING_TRIGGER,
            workingDaysTarget: 7,
          },
        });

        await tx.evaluationCheckpoint.createMany({
          data: DEFAULT_CHECKPOINTS.map((cp) => ({
            enrollmentId: createdEnrollment.id,
            dayNumber: cp.day,
            title: cp.title,
            description: cp.desc,
            status: CheckpointStatus.PENDING,
          })),
        });

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

        await tx.auditLog.create({
          data: {
            actorId: user.id,
            actorRole: primaryActorRole(user),
            action: "EVALUATION_ENROLLED",
            resourceType: "InternshipEnrollment",
            resourceId: createdEnrollment.id,
            diffPayload: {
              applicationId: app.id,
              applicationFromStatus: app.status,
              supervisorId: supervisorId ?? null,
            },
          },
        });

        return createdEnrollment;
      });

      return { enrollmentId: enrollment.id, created: true };
    } catch (error) {
      rethrowUniqueAsConflict(error, "This application is already enrolled in an evaluation.");
    }
  }

  /**
   * Explicitly triggers the start of the 7-working-day evaluation window (OD-001).
   * Only PENDING_TRIGGER → IN_PROGRESS is allowed; a started or finalized evaluation is never reset.
   */
  async triggerEvaluationStart(
    user: AuthenticatedUser,
    enrollmentId: string,
    startDate: Date,
    calendar: WorkingDayCalendarConfig = DEFAULT_WORKING_CALENDAR
  ): Promise<{ startDate: Date; endDate: Date }> {
    const access = await assertEvaluationAccess(user);

    const enrollment = await prisma.internshipEnrollment.findUnique({
      where: { id: enrollmentId },
      include: {
        application: {
          include: {
            candidate: { include: { user: true } },
          },
        },
      },
    });

    if (!enrollment) throw new NotFoundError("Evaluation enrollment not found.");
    assertEnrollmentInScope(access, user, enrollment);

    if (enrollment.status !== EvaluationStatus.PENDING_TRIGGER) {
      throw new ConflictError(
        `The evaluation can only be started once. Current status: ${enrollment.status}.`
      );
    }

    const computedEndDate = workingDayService.addWorkingDays(
      startDate,
      enrollment.workingDaysTarget,
      calendar
    );

    await prisma.$transaction(async (tx) => {
      const started = await tx.internshipEnrollment.updateMany({
        where: { id: enrollment.id, status: EvaluationStatus.PENDING_TRIGGER },
        data: {
          startDate,
          endDate: computedEndDate,
          status: EvaluationStatus.IN_PROGRESS,
        },
      });
      if (started.count !== 1) {
        throw new ConflictError("The evaluation was already started. Please reload the page.");
      }

      // The application status is unchanged; the row records the evaluation start on the timeline.
      await tx.applicationStatusHistory.create({
        data: {
          applicationId: enrollment.applicationId,
          fromStatus: enrollment.application.status,
          toStatus: enrollment.application.status,
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

      await tx.auditLog.create({
        data: {
          actorId: user.id,
          actorRole: primaryActorRole(user),
          action: "EVALUATION_STARTED",
          resourceType: "InternshipEnrollment",
          resourceId: enrollment.id,
          diffPayload: {
            fromStatus: EvaluationStatus.PENDING_TRIGGER,
            toStatus: EvaluationStatus.IN_PROGRESS,
            startDate: startDate.toISOString(),
            endDate: computedEndDate.toISOString(),
          },
        },
      });
    });

    return { startDate, endDate: computedEndDate };
  }

  /**
   * Intern submits (or resubmits) notes for a daily checkpoint of their own running evaluation.
   */
  async submitCheckpoint(
    user: AuthenticatedUser,
    checkpointId: string,
    submissionNotes: string
  ): Promise<{ enrollmentId: string }> {
    const cp = await prisma.evaluationCheckpoint.findUnique({
      where: { id: checkpointId },
      include: { enrollment: true },
    });

    if (!cp) throw new NotFoundError("Checkpoint not found.");
    if (cp.enrollment.userId !== user.id) {
      throw new ForbiddenError("You can only submit checkpoints for your own evaluation.");
    }
    if (cp.enrollment.status !== EvaluationStatus.IN_PROGRESS) {
      throw new ValidationError("Checkpoint notes can only be submitted while the evaluation is in progress.");
    }
    if (!CHECKPOINT_SUBMITTABLE_STATUSES.includes(cp.status)) {
      throw new ConflictError("This checkpoint has already been reviewed and can no longer be changed.");
    }

    const result = await prisma.evaluationCheckpoint.updateMany({
      where: {
        id: cp.id,
        status: cp.status,
        enrollment: { status: EvaluationStatus.IN_PROGRESS },
      },
      data: {
        submissionNotes,
        status: CheckpointStatus.SUBMITTED,
      },
    });
    if (result.count !== 1) {
      throw new ConflictError("The checkpoint changed while you were submitting. Please reload and try again.");
    }

    return { enrollmentId: cp.enrollmentId };
  }

  /**
   * Supervisor or HR reviews a checkpoint (submitted by the intern or not) and leaves structured
   * feedback with an explicit outcome. Every review (including amendments) is audit-logged with
   * the previous status and feedback.
   */
  async reviewCheckpoint(
    user: AuthenticatedUser,
    checkpointId: string,
    feedback: string,
    status: CheckpointStatus
  ): Promise<{ enrollmentId: string }> {
    if (!(CHECKPOINT_REVIEW_OUTCOMES as readonly CheckpointStatus[]).includes(status)) {
      throw new ValidationError("Review status must be REVIEWED or BLOCKED.");
    }

    const access = await assertEvaluationAccess(user);

    const cp = await prisma.evaluationCheckpoint.findUnique({
      where: { id: checkpointId },
      include: { enrollment: true },
    });

    if (!cp) throw new NotFoundError("Checkpoint not found.");
    assertEnrollmentInScope(access, user, cp.enrollment);

    if (cp.enrollment.status !== EvaluationStatus.IN_PROGRESS) {
      throw new ValidationError("Checkpoints can only be reviewed while the evaluation is in progress.");
    }
    if (!CHECKPOINT_REVIEWABLE_STATUSES.includes(cp.status)) {
      throw new ConflictError(`A checkpoint in status ${cp.status} cannot be reviewed.`);
    }

    await prisma.$transaction(async (tx) => {
      const reviewed = await tx.evaluationCheckpoint.updateMany({
        where: {
          id: cp.id,
          status: cp.status,
          enrollment: { status: EvaluationStatus.IN_PROGRESS },
        },
        data: {
          supervisorFeedback: feedback,
          status,
          reviewedById: user.id,
          reviewedAt: new Date(),
        },
      });
      if (reviewed.count !== 1) {
        throw new ConflictError("The checkpoint changed while you were reviewing. Please reload and try again.");
      }

      await tx.auditLog.create({
        data: {
          actorId: user.id,
          actorRole: primaryActorRole(user),
          action: "EVALUATION_CHECKPOINT_REVIEWED",
          resourceType: "EvaluationCheckpoint",
          resourceId: cp.id,
          diffPayload: {
            enrollmentId: cp.enrollmentId,
            dayNumber: cp.dayNumber,
            fromStatus: cp.status,
            toStatus: status,
            reviewedWithoutInternSubmission: cp.status === CheckpointStatus.PENDING,
            previousFeedback: cp.supervisorFeedback,
            feedback,
          },
        },
      });
    });

    return { enrollmentId: cp.enrollmentId };
  }

  /**
   * Records the final evaluation outcome (OD-003: human decision by HR/Admin).
   * Only a running evaluation can be finalized, and only once (PASSED / FAILED are final).
   *
   * POL-07: the outcome is recorded on the enrollment only. The application status, offers and
   * the INTERN role are NOT changed here; those remain explicit staff actions (OD-003 / OD-020).
   */
  async finalizeEvaluation(
    user: AuthenticatedUser,
    enrollmentId: string,
    status: EvaluationStatus,
    finalReviewNotes: string
  ): Promise<void> {
    const access = await assertEvaluationDecisionAuthority(user);

    if (status === EvaluationStatus.EXTENDED) {
      throw new PolicyBlockedError(
        "OD-003",
        "Evaluation extensions are not configured. Record PASSED or FAILED, or wait for an approved extension policy."
      );
    }
    if (!FINAL_EVALUATION_OUTCOMES.includes(status)) {
      throw new ValidationError("Final status must be PASSED or FAILED.");
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
    assertEnrollmentInScope(access, user, enrollment);

    if (enrollment.status === EvaluationStatus.PENDING_TRIGGER) {
      throw new ValidationError("The evaluation has not started yet. Start it before recording a final outcome.");
    }
    if (!FINALIZABLE_EVALUATION_STATUSES.includes(enrollment.status)) {
      throw new ConflictError(
        `A final outcome (${enrollment.status}) has already been recorded for this evaluation.`
      );
    }

    await prisma.$transaction(async (tx) => {
      const finalized = await tx.internshipEnrollment.updateMany({
        where: { id: enrollment.id, status: { in: FINALIZABLE_EVALUATION_STATUSES } },
        data: {
          status,
          finalReviewNotes,
          evaluatedById: user.id,
          evaluatedAt: new Date(),
        },
      });
      if (finalized.count !== 1) {
        throw new ConflictError("A final outcome was already recorded for this evaluation. Please reload.");
      }

      if (status === EvaluationStatus.PASSED) {
        // Scaffold the onboarding checklist so HR can verify the onboarding items.
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
      }

      await tx.auditLog.create({
        data: {
          actorId: user.id,
          actorRole: primaryActorRole(user),
          action: "EVALUATION_FINALIZED",
          resourceType: "InternshipEnrollment",
          resourceId: enrollment.id,
          diffPayload: {
            fromStatus: enrollment.status,
            toStatus: status,
            finalReviewNotes,
          },
        },
      });

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
   * Updates an onboarding checklist item. The JSON read-modify-write runs under a row lock.
   */
  async updateOnboardingChecklistItem(
    user: AuthenticatedUser,
    enrollmentId: string,
    itemId: string,
    completed: boolean
  ): Promise<void> {
    const access = await assertEvaluationAccess(user);

    const enrollment = await prisma.internshipEnrollment.findUnique({
      where: { id: enrollmentId },
      select: { id: true, userId: true, supervisorId: true, status: true },
    });

    if (!enrollment) throw new NotFoundError("Enrollment record not found.");
    assertEnrollmentInScope(access, user, enrollment);

    if (enrollment.status !== EvaluationStatus.PASSED) {
      throw new ValidationError("Onboarding is only available after the evaluation is recorded as PASSED.");
    }

    await prisma.$transaction(async (tx) => {
      // Serialize concurrent checklist edits for this enrollment.
      await tx.$queryRaw`SELECT "id" FROM "intern_onboardings" WHERE "enrollmentId" = ${enrollmentId} FOR UPDATE`;

      const onboarding = await tx.internOnboarding.findUnique({
        where: { enrollmentId },
      });
      if (!onboarding) throw new NotFoundError("Onboarding record not found.");

      const items = parseOnboardingItems(onboarding.checklistItems);
      const target = items.find((item) => item.id === itemId);
      if (!target) throw new NotFoundError("Onboarding checklist item not found.");
      if (target.completed === completed) {
        return;
      }

      const now = new Date();
      const updatedItems = items.map((item) =>
        item.id === itemId
          ? {
              ...item,
              completed,
              verifiedAt: completed ? now.toISOString() : null,
              verifiedBy: completed ? user.name : null,
              verifiedById: completed ? user.id : null,
            }
          : item
      );

      const requiredItems = updatedItems.filter((i) => i.required);
      const allRequiredCompleted = requiredItems.length > 0 && requiredItems.every((i) => i.completed);

      await tx.internOnboarding.update({
        where: { id: onboarding.id },
        data: {
          checklistItems: updatedItems as unknown as Prisma.InputJsonValue,
          status: allRequiredCompleted ? OnboardingStatus.COMPLETED : OnboardingStatus.IN_PROGRESS,
          completedAt: allRequiredCompleted ? now : null,
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: user.id,
          actorRole: primaryActorRole(user),
          action: "ONBOARDING_ITEM_UPDATED",
          resourceType: "InternOnboarding",
          resourceId: onboarding.id,
          diffPayload: {
            enrollmentId,
            itemId,
            fromCompleted: target.completed,
            toCompleted: completed,
          },
        },
      });
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
   *
   * Idempotent: an already issued card is returned unchanged. Generating a new number for an
   * existing card requires an explicit justification and is audit-logged.
   *
   * The gates are evaluated inside the transaction while the onboarding row is locked (the same
   * lock `updateOnboardingChecklistItem` takes), so un-verifying an onboarding item concurrently
   * cannot lose to issuance.
   */
  async approveAndIssueIdCard(
    user: AuthenticatedUser,
    enrollmentId: string,
    reissueReason?: string
  ): Promise<IssueIdCardResult> {
    const access = await assertEvaluationDecisionAuthority(user);

    try {
      return await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "intern_onboardings" WHERE "enrollmentId" = ${enrollmentId} FOR UPDATE`;

        const enrollment = await tx.internshipEnrollment.findUnique({
          where: { id: enrollmentId },
          include: {
            onboarding: true,
            user: true,
            idCard: true,
          },
        });

        if (!enrollment) throw new NotFoundError("Enrollment record not found.");
        assertEnrollmentInScope(access, user, enrollment);

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

        const existing = enrollment.idCard;
        if (existing?.cardNumber && !reissueReason) {
          if (existing.status === IdCardStatus.ISSUED) {
            return { cardNumber: existing.cardNumber, alreadyIssued: true, reissued: false };
          }
          throw new ConflictError(
            `An ID card number was already generated for this intern (status: ${existing.status}). Provide a justification to reissue it.`
          );
        }
        if (reissueReason && !existing?.cardNumber) {
          throw new ValidationError("There is no issued ID card to reissue.");
        }

        const cardNumber = generateProvisionalCardNumber();
        const now = new Date();
        const isReissue = Boolean(existing?.cardNumber);

        let cardId = existing?.id ?? null;
        if (!existing) {
          const created = await tx.internIdCard.create({
            data: {
              enrollmentId: enrollment.id,
              userId: enrollment.userId,
              cardNumber,
              status: IdCardStatus.ISSUED,
              approvedById: user.id,
              approvedAt: now,
              issuedAt: now,
            },
            select: { id: true },
          });
          cardId = created.id;
        } else {
          const updated = await tx.internIdCard.updateMany({
            where: { id: existing.id, cardNumber: existing.cardNumber },
            data: {
              cardNumber,
              status: IdCardStatus.ISSUED,
              approvedById: user.id,
              approvedAt: now,
              issuedAt: now,
            },
          });
          if (updated.count !== 1) {
            throw new ConflictError("The ID card changed while it was being issued. Please reload.");
          }
        }

        await tx.auditLog.create({
          data: {
            actorId: user.id,
            actorRole: primaryActorRole(user),
            action: isReissue ? "ID_CARD_REISSUED" : "ID_CARD_ISSUED",
            resourceType: "InternIdCard",
            resourceId: cardId ?? enrollment.id,
            diffPayload: {
              enrollmentId: enrollment.id,
              previousCardNumber: existing?.cardNumber ?? null,
              previousStatus: existing?.status ?? null,
              cardNumber,
              reason: reissueReason ?? null,
            },
          },
        });

        await tx.notificationOutbox.create({
          data: {
            recipientEmail: enrollment.user.email,
            templateName: "ID_CARD_ISSUED_NOTIFICATION",
            payload: {
              cardNumber,
              recipientName: enrollment.user.name,
              issuedAt: now.toISOString(),
            },
            status: "PENDING",
          },
        });

        return { cardNumber, alreadyIssued: false, reissued: isReissue };
      });
    } catch (error) {
      rethrowUniqueAsConflict(error, "An ID card was issued for this intern at the same time. Please reload.");
    }
  }

  /**
   * Changes the supervisor of an internship evaluation (product-owner decision 2026-10-25).
   * ADMIN / HR with canEvaluations; never on one's own enrollment; only while no final outcome
   * (PASSED / FAILED) is recorded. The new supervisor must be eligible staff, never the intern
   * and never the current supervisor. Conditional write on the current supervisor and status,
   * audit row, and EVALUATION_SUPERVISOR_CHANGED emails to the intern and the new supervisor.
   */
  async changeSupervisor(
    user: AuthenticatedUser,
    enrollmentId: string,
    supervisorId: string
  ): Promise<{ enrollmentId: string; supervisorId: string }> {
    await assertEvaluationDecisionAuthority(user);

    const enrollment = await prisma.internshipEnrollment.findUnique({
      where: { id: enrollmentId },
      select: {
        id: true,
        userId: true,
        status: true,
        supervisorId: true,
        user: { select: { name: true, email: true } },
        application: { select: { opening: { select: { title: true } } } },
      },
    });
    if (!enrollment) throw new NotFoundError("Evaluation enrollment not found.");
    if (enrollment.userId === user.id) {
      throw new ForbiddenError("You cannot review or decide on your own internship records.");
    }
    if (FINAL_EVALUATION_OUTCOMES.includes(enrollment.status)) {
      throw new ConflictError("The supervisor cannot be changed after the final evaluation outcome is recorded.");
    }
    if (supervisorId === enrollment.supervisorId) {
      throw new ValidationError("This person already supervises the evaluation. Choose a different supervisor.");
    }
    await this.assertSupervisorEligible(supervisorId, enrollment.userId);

    const newSupervisor = await prisma.user.findUnique({
      where: { id: supervisorId },
      select: { name: true, email: true },
    });
    if (!newSupervisor) {
      throw new ValidationError("The selected supervisor must be a staff member.");
    }

    await prisma.$transaction(async (tx) => {
      const changed = await tx.internshipEnrollment.updateMany({
        where: {
          id: enrollment.id,
          supervisorId: enrollment.supervisorId,
          status: { notIn: FINAL_EVALUATION_OUTCOMES },
        },
        data: { supervisorId },
      });
      if (changed.count !== 1) {
        throw new ConflictError("The evaluation was changed by another action. Please reload and try again.");
      }

      await tx.auditLog.create({
        data: {
          actorId: user.id,
          actorRole: primaryActorRole(user),
          action: "EVALUATION_SUPERVISOR_CHANGED",
          resourceType: "InternshipEnrollment",
          resourceId: enrollment.id,
          diffPayload: {
            fromSupervisorId: enrollment.supervisorId,
            toSupervisorId: supervisorId,
            evaluationStatus: enrollment.status,
          },
        },
      });

      const common = {
        internName: enrollment.user.name,
        openingTitle: enrollment.application.opening.title,
        newSupervisorName: newSupervisor.name,
      };
      await tx.notificationOutbox.create({
        data: {
          recipientEmail: enrollment.user.email,
          templateName: "EVALUATION_SUPERVISOR_CHANGED",
          payload: { recipientName: enrollment.user.name, recipientRole: "INTERN", ...common },
          status: "PENDING",
        },
      });
      await tx.notificationOutbox.create({
        data: {
          recipientEmail: newSupervisor.email,
          templateName: "EVALUATION_SUPERVISOR_CHANGED",
          payload: { recipientName: newSupervisor.name, recipientRole: "SUPERVISOR", ...common },
          status: "PENDING",
        },
      });
    });

    return { enrollmentId: enrollment.id, supervisorId };
  }

  /**
   * Lists enrollments visible to the staff member (all for ADMIN/HR, assigned ones for supervisors).
   */
  async listEnrollmentsForStaff(user: AuthenticatedUser): Promise<EvaluationEnrollmentListItem[]> {
    const access = await assertEvaluationAccess(user);

    const enrollments = await prisma.internshipEnrollment.findMany({
      where: {
        ...enrollmentScopeWhere(access, user),
        // Staff never review their own enrollment.
        userId: { not: user.id },
      },
      include: {
        user: { select: { name: true, email: true } },
        application: {
          select: {
            referenceCode: true,
            opening: { select: { title: true, department: true } },
            hiredEmployee: { select: { id: true, employmentType: true } },
            // The period this application opened (kept as history after a re-join).
            employmentPeriods: {
              select: { employmentType: true },
              orderBy: { startDate: "asc" },
              take: 1,
            },
          },
        },
        supervisor: { select: { name: true } },
        checkpoints: { select: { status: true } },
        idCard: { select: { cardNumber: true, status: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return enrollments.map((enr) => ({
      id: enr.id,
      referenceCode: enr.application.referenceCode,
      candidateName: enr.user.name,
      candidateEmail: enr.user.email,
      openingTitle: enr.application.opening.title,
      openingDepartment: enr.application.opening.department,
      supervisorName: enr.supervisor?.name ?? null,
      status: enr.status,
      startDate: enr.startDate,
      endDate: enr.endDate,
      reviewedCheckpoints: enr.checkpoints.filter((c) => c.status === CheckpointStatus.REVIEWED).length,
      totalCheckpoints: enr.checkpoints.length,
      idCardNumber: enr.idCard?.cardNumber ?? null,
      joined: Boolean(enr.application.employmentPeriods[0] ?? enr.application.hiredEmployee),
      joinedEmploymentType:
        enr.application.employmentPeriods[0]?.employmentType ?? enr.application.hiredEmployee?.employmentType ?? null,
    }));
  }

  /**
   * Retrieves full evaluation details for the cockpit (record-level scoped).
   */
  async getEvaluationDetail(
    enrollmentId: string,
    user: AuthenticatedUser
  ): Promise<EvaluationEnrollmentDetail> {
    const access = await assertEvaluationAccess(user);

    const enrollment = await prisma.internshipEnrollment.findUnique({
      where: { id: enrollmentId },
      include: {
        application: {
          include: {
            candidate: { include: { user: true } },
            opening: true,
            // The period this application opened, if the person joined from it.
            employmentPeriods: {
              select: { employmentType: true, startDate: true },
              orderBy: { startDate: "asc" },
              take: 1,
            },
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
        user: {
          select: {
            employeeProfile: {
              select: {
                id: true,
                employeeCode: true,
                status: true,
                employmentType: true,
                joiningDate: true,
                applicationId: true,
              },
            },
          },
        },
      },
    });

    if (!enrollment) throw new NotFoundError("Evaluation enrollment not found.");
    assertEnrollmentInScope(access, user, enrollment);

    const employeeProfile = enrollment.user?.employeeProfile ?? null;
    // Joined from this application: the period it opened (a later re-join moves
    // Employee.applicationId to the newer application, but the period remains).
    const joinedPeriod = enrollment.application.employmentPeriods[0] ?? null;
    const viaThisApplication =
      joinedPeriod !== null || employeeProfile?.applicationId === enrollment.applicationId;

    return {
      id: enrollment.id,
      applicationId: enrollment.applicationId,
      applicationStatus: enrollment.application.status,
      openingType: enrollment.application.opening.type,
      internUserId: enrollment.userId,
      employment: employeeProfile
        ? {
            id: employeeProfile.id,
            employeeCode: employeeProfile.employeeCode,
            status: employeeProfile.status,
            employmentType: joinedPeriod?.employmentType ?? employeeProfile.employmentType,
            joiningDate: joinedPeriod?.startDate ?? employeeProfile.joiningDate,
            viaThisApplication,
          }
        : null,
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
            checklistItems: parseOnboardingItems(enrollment.onboarding.checklistItems),
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
