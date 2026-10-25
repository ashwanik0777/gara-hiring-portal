import { prisma } from "@/lib/db";
import { assertPermission, hasPermission, type AuthenticatedUser } from "@/lib/auth/guards";
import {
  ConversionOfferStatus,
  ConversionReviewOutcome,
  ConversionReviewStatus,
  EmployeeStatus,
  EmploymentPeriodEndReason,
  EmploymentPeriodStartReason,
  EmploymentType,
  Prisma,
  Role,
} from "@prisma/client";
import { enqueueJob } from "@/infrastructure/jobs/job-queue";
import { JOB_TYPES } from "@/features/automation/job-types";
import { atBusinessTime } from "@/lib/time/business-time";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import { JOINING_INITIAL_STATUSES, type ConversionOfferResponseInput, type RecordReviewOutcomeInput } from "../schemas";
import {
  calendarDayKey,
  classifyReviewDue,
  conversionEffectiveDedupeKey,
  isCalendarDayPast,
  isCalendarDayReached,
  isReviewPeriodMonths,
  nextReviewDate,
  parseCalendarDay,
  REVIEW_OUTCOME_LABELS,
} from "../conversion-rules";
import type {
  ConversionResponseResult,
  InternReviewBoard,
  InternReviewItem,
  ReviewOutcomeResult,
} from "../types";
import {
  closeCurrentPeriods,
  grantJoiningRole,
  openEmploymentPeriod,
  revokeJoiningRole,
} from "./employment-records";

/*
 * Intern progress review and full-time conversion (product-owner decisions of 2026-10-25):
 * - At intern joining HR chooses a review after 3 or 6 months (see employee-service).
 * - The review outcome is CONVERT (full-time offer the intern answers in the portal), EXTEND
 *   (next review after 3 or 6 months) or END_INTERNSHIP (the exit itself is processed through
 *   the existing exit flow; nothing is exited automatically).
 * - An accepted conversion takes effect on its effective date: immediately when that day has
 *   been reached, otherwise through a CONVERSION_EFFECTIVE job.
 */

const REVIEW_DECISION_ROLES: Role[] = [Role.ADMIN, Role.HR];

/** How many decided reviews the board shows. */
const RECENT_DECISIONS_LIMIT = 25;

type Tx = Prisma.TransactionClient;

/** ADMIN, or HR with canEmployees (ADMIN always holds every permission). */
async function canDecideReviews(user: AuthenticatedUser): Promise<boolean> {
  if (!user.roles.some((role) => REVIEW_DECISION_ROLES.includes(role))) {
    return false;
  }
  return hasPermission(user, "canEmployees");
}

async function assertReviewDecisionAuthority(user: AuthenticatedUser): Promise<void> {
  if (!user.roles.some((role) => REVIEW_DECISION_ROLES.includes(role))) {
    throw new ForbiddenError("Recording intern review outcomes is restricted to HR and administrators.");
  }
  await assertPermission(user, "canEmployees");
}

const reviewBoardSelect = {
  id: true,
  reviewPeriodMonths: true,
  scheduledFor: true,
  status: true,
  outcome: true,
  decidedAt: true,
  internalNotes: true,
  sharedSummary: true,
  proposedDesignation: true,
  proposedDepartment: true,
  proposedEffectiveDate: true,
  proposedInitialStatus: true,
  offerStatus: true,
  offerRespondedAt: true,
  convertedAt: true,
  reviewer: { select: { name: true } },
  period: { select: { startDate: true } },
  employee: {
    select: {
      id: true,
      employeeCode: true,
      designation: true,
      department: true,
      status: true,
      employmentType: true,
      user: { select: { name: true, email: true } },
    },
  },
} satisfies Prisma.ConversionReviewSelect;

type ReviewBoardRow = Prisma.ConversionReviewGetPayload<{ select: typeof reviewBoardSelect }>;

function toReviewItem(row: ReviewBoardRow, now: Date, includeInternalNotes: boolean): InternReviewItem {
  return {
    id: row.id,
    employeeId: row.employee.id,
    employeeCode: row.employee.employeeCode,
    internName: row.employee.user.name,
    internEmail: row.employee.user.email,
    designation: row.employee.designation,
    department: row.employee.department,
    employeeStatus: row.employee.status,
    employmentType: row.employee.employmentType,
    periodStartDate: row.period?.startDate ?? null,
    reviewPeriodMonths: row.reviewPeriodMonths,
    scheduledFor: row.scheduledFor,
    status: row.status,
    dueState: row.status === ConversionReviewStatus.SCHEDULED ? classifyReviewDue(row.scheduledFor, now) : null,
    outcome: row.outcome,
    decidedAt: row.decidedAt,
    reviewerName: row.reviewer?.name ?? null,
    sharedSummary: row.sharedSummary,
    internalNotes: includeInternalNotes ? row.internalNotes : null,
    proposedDesignation: row.proposedDesignation,
    proposedDepartment: row.proposedDepartment,
    proposedEffectiveDate: row.proposedEffectiveDate,
    proposedInitialStatus: row.proposedInitialStatus,
    offerStatus: row.offerStatus,
    offerRespondedAt: row.offerRespondedAt,
    convertedAt: row.convertedAt,
  };
}

export type ConversionApplyStatus =
  | "CONVERTED"
  | "ALREADY_CONVERTED"
  | "NOT_YET_EFFECTIVE"
  | "NOT_APPLICABLE";

export interface ConversionApplyResult {
  status: ConversionApplyStatus;
  employeeId: string | null;
}

/**
 * Applies an accepted intern-to-full-time conversion inside the caller's transaction.
 * Idempotent: an already converted review, a withdrawn/declined offer or an exited record is a
 * no-op, and the `convertedAt` claim is a conditional write so concurrent runs convert once.
 * The conversion sets employment type FULL_TIME with the offered designation, department and
 * status, closes the intern period and opens the full-time period (both CONVERTED), grants the
 * EMPLOYEE role with a fresh `assignedAt`, removes the INTERN role, writes history and audit
 * rows and queues the CONVERSION_COMPLETED email.
 */
export async function applyAcceptedConversion(
  tx: Tx,
  reviewId: string,
  options: { now: Date; actorId: string | null; actorRole: string }
): Promise<ConversionApplyResult> {
  const review = await tx.conversionReview.findUnique({
    where: { id: reviewId },
    select: {
      id: true,
      outcome: true,
      offerStatus: true,
      convertedAt: true,
      proposedDesignation: true,
      proposedDepartment: true,
      proposedEffectiveDate: true,
      proposedInitialStatus: true,
      employee: {
        select: {
          id: true,
          userId: true,
          status: true,
          employmentType: true,
          designation: true,
          department: true,
          user: { select: { name: true, email: true } },
        },
      },
    },
  });

  if (!review) {
    return { status: "NOT_APPLICABLE", employeeId: null };
  }
  const employee = review.employee;
  if (review.convertedAt) {
    return { status: "ALREADY_CONVERTED", employeeId: employee.id };
  }
  const designation = review.proposedDesignation;
  const department = review.proposedDepartment;
  const effectiveDate = review.proposedEffectiveDate;
  const initialStatus = review.proposedInitialStatus;
  if (
    review.outcome !== ConversionReviewOutcome.CONVERT ||
    review.offerStatus !== ConversionOfferStatus.ACCEPTED ||
    !designation ||
    !department ||
    !effectiveDate ||
    !initialStatus ||
    employee.status === EmployeeStatus.EXITED ||
    employee.employmentType !== EmploymentType.INTERN
  ) {
    return { status: "NOT_APPLICABLE", employeeId: employee.id };
  }
  if (!isCalendarDayReached(calendarDayKey(effectiveDate), options.now)) {
    return { status: "NOT_YET_EFFECTIVE", employeeId: employee.id };
  }

  // Claim the conversion: only one run may set convertedAt.
  const claimed = await tx.conversionReview.updateMany({
    where: { id: review.id, convertedAt: null, offerStatus: ConversionOfferStatus.ACCEPTED },
    data: { convertedAt: options.now },
  });
  if (claimed.count !== 1) {
    return { status: "ALREADY_CONVERTED", employeeId: employee.id };
  }

  const updated = await tx.employee.updateMany({
    where: { id: employee.id, employmentType: EmploymentType.INTERN, status: { not: EmployeeStatus.EXITED } },
    data: {
      employmentType: EmploymentType.FULL_TIME,
      designation,
      department,
      status: initialStatus,
    },
  });
  if (updated.count !== 1) {
    // Rolls the claim back with the transaction.
    throw new ConflictError("The employee record changed while the conversion was applied. Please try again.");
  }

  await closeCurrentPeriods(tx, employee.id, effectiveDate, EmploymentPeriodEndReason.CONVERTED);
  const period = await openEmploymentPeriod(tx, {
    employeeId: employee.id,
    employmentType: EmploymentType.FULL_TIME,
    designation,
    department,
    startDate: effectiveDate,
    startReason: EmploymentPeriodStartReason.CONVERTED,
    applicationId: null,
    createdById: options.actorId,
  });

  await grantJoiningRole(tx, employee.userId, Role.EMPLOYEE, options.actorId, options.now);
  await revokeJoiningRole(tx, employee.userId, Role.INTERN);

  await tx.employmentHistory.create({
    data: {
      employeeId: employee.id,
      changeType: "CONVERTED_TO_FULL_TIME",
      previousValue: `Intern · ${employee.designation} (${employee.department}) · ${employee.status}`,
      newValue: `Full time · ${designation} (${department}) · ${initialStatus}`,
      effectiveDate,
      remarks: "Intern-to-full-time conversion accepted by the intern took effect.",
      changedById: options.actorId,
    },
  });

  await tx.auditLog.create({
    data: {
      actorId: options.actorId,
      actorRole: options.actorRole,
      action: "CONVERSION_COMPLETED",
      resourceType: "EMPLOYEE",
      resourceId: employee.id,
      diffPayload: {
        reviewId: review.id,
        fromEmploymentType: EmploymentType.INTERN,
        toEmploymentType: EmploymentType.FULL_TIME,
        fromDesignation: employee.designation,
        toDesignation: designation,
        fromDepartment: employee.department,
        toDepartment: department,
        fromStatus: employee.status,
        toStatus: initialStatus,
        effectiveDate: effectiveDate.toISOString(),
        periodId: period.id,
        roleGranted: Role.EMPLOYEE,
        roleRemoved: Role.INTERN,
      },
    },
  });

  await tx.notificationOutbox.create({
    data: {
      recipientEmail: employee.user.email,
      templateName: "CONVERSION_COMPLETED",
      payload: {
        recipientName: employee.user.name,
        designation,
        department,
        effectiveDate: effectiveDate.toISOString(),
      },
      status: "PENDING",
    },
  });

  return { status: "CONVERTED", employeeId: employee.id };
}

export class ConversionService {
  /**
   * Staff review board: scheduled reviews split into overdue / due this week / upcoming, plus
   * recent decisions. Requires canEmployees (ADMIN always passes). Internal notes are included
   * only for staff who may record outcomes; staff never see their own internship reviews.
   */
  async listReviewBoard(user: AuthenticatedUser, now: Date = new Date()): Promise<InternReviewBoard> {
    await assertPermission(user, "canEmployees");
    const canRecord = await canDecideReviews(user);

    const [scheduled, decided] = await Promise.all([
      prisma.conversionReview.findMany({
        where: {
          status: ConversionReviewStatus.SCHEDULED,
          employee: { userId: { not: user.id }, status: { not: EmployeeStatus.EXITED } },
        },
        select: reviewBoardSelect,
        orderBy: { scheduledFor: "asc" },
      }),
      prisma.conversionReview.findMany({
        where: {
          status: ConversionReviewStatus.COMPLETED,
          employee: { userId: { not: user.id } },
        },
        select: reviewBoardSelect,
        orderBy: { decidedAt: "desc" },
        take: RECENT_DECISIONS_LIMIT,
      }),
    ]);

    const scheduledItems = scheduled.map((row) => toReviewItem(row, now, canRecord));
    return {
      overdue: scheduledItems.filter((item) => item.dueState === "OVERDUE"),
      dueThisWeek: scheduledItems.filter((item) => item.dueState === "DUE_THIS_WEEK"),
      upcoming: scheduledItems.filter((item) => item.dueState === "UPCOMING"),
      recentDecisions: decided.map((row) => toReviewItem(row, now, canRecord)),
      canRecord,
    };
  }

  /**
   * Records the outcome of a scheduled progress review. ADMIN, or HR with canEmployees; never
   * for one's own internship. Conditional update on status SCHEDULED, audit and history rows,
   * and the matching email in the same transaction.
   */
  async recordReviewOutcome(
    user: AuthenticatedUser,
    input: RecordReviewOutcomeInput,
    now: Date = new Date()
  ): Promise<ReviewOutcomeResult> {
    await assertReviewDecisionAuthority(user);

    if (input.outcome === "CONVERT") {
      if (!(JOINING_INITIAL_STATUSES as readonly EmployeeStatus[]).includes(input.initialStatus)) {
        throw new ValidationError("The initial employment status must be ACTIVE or PROBATION.");
      }
      if (isCalendarDayPast(input.effectiveDate, now)) {
        throw new ValidationError("The effective date cannot be in the past.");
      }
    }
    if (input.outcome === "EXTEND" && !isReviewPeriodMonths(input.nextReviewAfterMonths)) {
      throw new ValidationError("Choose when the next review takes place (after 3 or 6 months).");
    }

    const internalNotes = input.internalNotes?.trim() || null;
    const sharedSummary = input.sharedSummary?.trim() || null;

    return prisma.$transaction(async (tx) => {
      const review = await tx.conversionReview.findUnique({
        where: { id: input.reviewId },
        select: {
          id: true,
          status: true,
          periodId: true,
          period: { select: { endDate: true } },
          employee: {
            select: {
              id: true,
              userId: true,
              status: true,
              employmentType: true,
              user: { select: { name: true, email: true } },
            },
          },
        },
      });

      if (!review) {
        throw new NotFoundError("Progress review not found.");
      }
      const employee = review.employee;
      // Separation of duties: staff never decide on their own internship.
      if (employee.userId === user.id) {
        throw new ForbiddenError("You cannot record the outcome of your own progress review.");
      }
      if (review.status !== ConversionReviewStatus.SCHEDULED) {
        throw new ConflictError("An outcome has already been recorded for this review. Reload to see it.");
      }
      if (employee.status === EmployeeStatus.EXITED || employee.employmentType !== EmploymentType.INTERN) {
        throw new ValidationError("Progress reviews can only be recorded for current interns.");
      }
      if (review.period?.endDate) {
        throw new ValidationError("This review belongs to an internship period that has ended.");
      }

      const data: Prisma.ConversionReviewUncheckedUpdateManyInput = {
        status: ConversionReviewStatus.COMPLETED,
        outcome: input.outcome,
        reviewerId: user.id,
        internalNotes,
        sharedSummary,
        decidedAt: now,
      };
      let effectiveDate: Date | null = null;
      if (input.outcome === "CONVERT") {
        effectiveDate = parseCalendarDay(input.effectiveDate);
        data.proposedDesignation = input.proposedDesignation.trim();
        data.proposedDepartment = input.proposedDepartment.trim();
        data.proposedEffectiveDate = effectiveDate;
        data.proposedInitialStatus = input.initialStatus;
        data.offerStatus = ConversionOfferStatus.PENDING;
      }

      const decided = await tx.conversionReview.updateMany({
        where: { id: review.id, status: ConversionReviewStatus.SCHEDULED },
        data,
      });
      if (decided.count !== 1) {
        throw new ConflictError("An outcome was recorded for this review at the same time. Reload to see it.");
      }

      let nextReview: { id: string; scheduledFor: Date } | null = null;
      if (input.outcome === "EXTEND") {
        nextReview = await tx.conversionReview.create({
          data: {
            employeeId: employee.id,
            periodId: review.periodId,
            reviewPeriodMonths: input.nextReviewAfterMonths,
            scheduledFor: nextReviewDate(now, input.nextReviewAfterMonths),
            status: ConversionReviewStatus.SCHEDULED,
            createdById: user.id,
          },
          select: { id: true, scheduledFor: true },
        });
      }

      const remarks =
        input.outcome === "CONVERT"
          ? `Progress review: full-time role offered as ${input.proposedDesignation.trim()} (${input.proposedDepartment.trim()}), effective ${input.effectiveDate}. Awaiting the intern's answer.`
          : input.outcome === "EXTEND"
            ? `Progress review: internship extended; next review on ${nextReview ? calendarDayKey(nextReview.scheduledFor) : "—"}.`
            : "Progress review: internship to end. The exit is processed separately.";
      await tx.employmentHistory.create({
        data: {
          employeeId: employee.id,
          changeType: "INTERN_REVIEW",
          previousValue: null,
          newValue: REVIEW_OUTCOME_LABELS[input.outcome],
          remarks,
          changedById: user.id,
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: user.id,
          actorRole: user.roles[0] ?? "HR",
          action: "RECORD_INTERN_REVIEW_OUTCOME",
          resourceType: "CONVERSION_REVIEW",
          resourceId: review.id,
          diffPayload: {
            employeeId: employee.id,
            fromStatus: ConversionReviewStatus.SCHEDULED,
            toStatus: ConversionReviewStatus.COMPLETED,
            outcome: input.outcome,
            internalNotes,
            sharedSummary,
            ...(input.outcome === "CONVERT"
              ? {
                  proposedDesignation: input.proposedDesignation.trim(),
                  proposedDepartment: input.proposedDepartment.trim(),
                  proposedEffectiveDate: input.effectiveDate,
                  proposedInitialStatus: input.initialStatus,
                }
              : {}),
            ...(nextReview
              ? { nextReviewId: nextReview.id, nextReviewDate: nextReview.scheduledFor.toISOString() }
              : {}),
          },
        },
      });

      const recipientName = employee.user.name;
      const summaryField = sharedSummary ? { sharedSummary } : {};
      if (input.outcome === "CONVERT" && effectiveDate) {
        await tx.notificationOutbox.create({
          data: {
            recipientEmail: employee.user.email,
            templateName: "CONVERSION_OFFER_EXTENDED",
            payload: {
              recipientName,
              proposedDesignation: input.proposedDesignation.trim(),
              proposedDepartment: input.proposedDepartment.trim(),
              effectiveDate: effectiveDate.toISOString(),
              ...summaryField,
            },
            status: "PENDING",
          },
        });
      } else if (input.outcome === "EXTEND" && nextReview) {
        await tx.notificationOutbox.create({
          data: {
            recipientEmail: employee.user.email,
            templateName: "INTERNSHIP_REVIEW_EXTENDED",
            payload: { recipientName, nextReviewDate: nextReview.scheduledFor.toISOString(), ...summaryField },
            status: "PENDING",
          },
        });
      } else if (input.outcome === "END_INTERNSHIP") {
        await tx.notificationOutbox.create({
          data: {
            recipientEmail: employee.user.email,
            templateName: "INTERNSHIP_ENDING",
            payload: { recipientName, ...summaryField },
            status: "PENDING",
          },
        });
      }

      return {
        reviewId: review.id,
        employeeId: employee.id,
        outcome: input.outcome,
        nextReviewId: nextReview?.id ?? null,
        nextReviewDate: nextReview?.scheduledFor ?? null,
      };
    });
  }

  /**
   * The intern accepts or declines their own full-time conversion offer. Scoped to the
   * signed-in user's own review; conditional update on offerStatus PENDING. On acceptance the
   * conversion takes effect now when the effective date has been reached, otherwise a
   * CONVERSION_EFFECTIVE job applies it on that date (00:05 business time).
   */
  async respondToOffer(
    user: AuthenticatedUser,
    input: ConversionOfferResponseInput,
    now: Date = new Date()
  ): Promise<ConversionResponseResult> {
    return prisma.$transaction(async (tx) => {
      const review = await tx.conversionReview.findUnique({
        where: { id: input.reviewId },
        select: {
          id: true,
          outcome: true,
          offerStatus: true,
          proposedEffectiveDate: true,
          employee: { select: { id: true, userId: true, status: true, employmentType: true } },
        },
      });

      // Another person's review is reported exactly like a missing one.
      if (!review || review.employee.userId !== user.id) {
        throw new NotFoundError("We couldn't find this offer.");
      }
      if (
        review.outcome !== ConversionReviewOutcome.CONVERT ||
        review.offerStatus !== ConversionOfferStatus.PENDING ||
        !review.proposedEffectiveDate
      ) {
        throw new ConflictError("This offer is no longer open. Please refresh the page.");
      }
      if (
        review.employee.status === EmployeeStatus.EXITED ||
        review.employee.employmentType !== EmploymentType.INTERN
      ) {
        throw new ConflictError("This offer is no longer available.");
      }

      const accepted = input.decision === "ACCEPT";
      const answered = await tx.conversionReview.updateMany({
        where: {
          id: review.id,
          offerStatus: ConversionOfferStatus.PENDING,
          employee: { userId: user.id },
        },
        data: {
          offerStatus: accepted ? ConversionOfferStatus.ACCEPTED : ConversionOfferStatus.DECLINED,
          offerRespondedAt: now,
        },
      });
      if (answered.count !== 1) {
        throw new ConflictError("This offer is no longer open. Please refresh the page.");
      }

      await tx.employmentHistory.create({
        data: {
          employeeId: review.employee.id,
          changeType: "CONVERSION_OFFER_RESPONSE",
          previousValue: ConversionOfferStatus.PENDING,
          newValue: accepted ? ConversionOfferStatus.ACCEPTED : ConversionOfferStatus.DECLINED,
          remarks: accepted
            ? "The intern accepted the full-time conversion offer."
            : "The intern declined the full-time conversion offer.",
          changedById: user.id,
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: user.id,
          actorRole: Role.INTERN,
          action: accepted ? "CONVERSION_OFFER_ACCEPTED" : "CONVERSION_OFFER_DECLINED",
          resourceType: "CONVERSION_REVIEW",
          resourceId: review.id,
          diffPayload: {
            employeeId: review.employee.id,
            fromOfferStatus: ConversionOfferStatus.PENDING,
            toOfferStatus: accepted ? ConversionOfferStatus.ACCEPTED : ConversionOfferStatus.DECLINED,
            effectiveDate: review.proposedEffectiveDate.toISOString(),
          },
        },
      });

      if (!accepted) {
        return { decision: input.decision, converted: false, scheduled: false, effectiveDate: review.proposedEffectiveDate };
      }

      const effectiveKey = calendarDayKey(review.proposedEffectiveDate);
      if (isCalendarDayReached(effectiveKey, now)) {
        const applied = await applyAcceptedConversion(tx, review.id, {
          now,
          actorId: user.id,
          actorRole: Role.INTERN,
        });
        if (applied.status !== "CONVERTED" && applied.status !== "ALREADY_CONVERTED") {
          throw new ConflictError("We couldn't complete the change to your new role. Please try again.");
        }
        return { decision: input.decision, converted: true, scheduled: false, effectiveDate: review.proposedEffectiveDate };
      }

      await enqueueJob(
        {
          type: JOB_TYPES.CONVERSION_EFFECTIVE,
          runAt: atBusinessTime(effectiveKey, 0, 5),
          dedupeKey: conversionEffectiveDedupeKey(review.id),
          payload: { reviewId: review.id },
        },
        tx
      );
      return { decision: input.decision, converted: false, scheduled: true, effectiveDate: review.proposedEffectiveDate };
    });
  }
}

export const conversionService = new ConversionService();
