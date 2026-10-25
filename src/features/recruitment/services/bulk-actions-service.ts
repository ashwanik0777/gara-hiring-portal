import crypto from "node:crypto";
import { z } from "zod";
import { ApplicationStatus, Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { assertPermission, type AuthenticatedUser } from "@/lib/auth/guards";
import {
  AppError,
  ConflictError,
  NotFoundError,
  ValidationError,
} from "@/lib/errors";
import { logger } from "@/lib/logging/logger";
import { buildApplicationStageUpdateEmail } from "@/infrastructure/email/email-templates";
import { describeApplicationStage } from "@/features/applications/stage-labels";
import { FLOW_OWNED_APPLICATION_STATUSES, getManualTransitionTargets } from "../schemas";
import { recruitmentService } from "./recruitment-service";
import { OWN_APPLICATION_ACTION_MESSAGE, staffApplicationVisibility } from "./application-access";

/** Largest number of applications one bulk action may touch. */
export const MAX_BULK_APPLICATIONS = 100;
const MAX_MESSAGE_LENGTH = 2000;

/** Same decision roles as the single stage-transition action (ADMIN always passes). */
export const BULK_DECISION_ROLES: Role[] = [Role.ADMIN, Role.HR];

export const BULK_SKIP_REASONS = {
  NOT_FOUND: "This application could not be found, or you can't access it.",
  OWN_APPLICATION: OWN_APPLICATION_ACTION_MESSAGE,
  CHANGED: "Someone else changed this application just now. Reload the list and try again.",
  FAILED: "We couldn't update this application. Please try again.",
} as const;

const optionalText = z
  .string()
  .trim()
  .max(MAX_MESSAGE_LENGTH, `Keep the text under ${MAX_MESSAGE_LENGTH} characters.`)
  .optional()
  .nullable()
  .transform((value) => (value ? value : null));

export const BulkTransitionSchema = z
  .object({
    applicationIds: z
      .array(z.string().uuid("Invalid application reference."))
      .min(1, "Select at least one application.")
      .max(MAX_BULK_APPLICATIONS, `You can update up to ${MAX_BULK_APPLICATIONS} applications at a time.`),
    toStatus: z.nativeEnum(ApplicationStatus),
    sendEmail: z.boolean().default(false),
    candidateMessage: optionalText,
    internalNotes: optionalText,
  })
  .refine((input) => !input.sendEmail || Boolean(input.candidateMessage), {
    message: "Write the message to send to candidates, or turn off the email.",
    path: ["candidateMessage"],
  });

export type BulkTransitionInput = z.input<typeof BulkTransitionSchema>;

export const BulkEmailPreviewSchema = z.object({
  applicationId: z.string().uuid("Invalid application reference."),
  toStatus: z.nativeEnum(ApplicationStatus),
  candidateMessage: z.string().trim().min(1, "Write a message to preview.").max(MAX_MESSAGE_LENGTH),
});

export type BulkEmailPreviewInput = z.input<typeof BulkEmailPreviewSchema>;

export interface BulkItemOutcome {
  applicationId: string;
  referenceCode: string | null;
  candidateName: string | null;
  outcome: "MOVED" | "SKIPPED";
  /** Friendly reason shown for skipped applications. */
  reason?: string;
  emailQueued?: boolean;
}

export interface BulkTransitionSummary {
  toStatus: ApplicationStatus;
  requested: number;
  moved: number;
  skipped: number;
  emailsQueued: number;
  items: BulkItemOutcome[];
}

function firstIssueMessage(error: z.ZodError, fallback: string): string {
  return error.issues[0]?.message ?? fallback;
}

/** Friendly per-item message for an error raised by the single-application transition. */
function describeTransitionFailure(error: unknown, toStatus: ApplicationStatus): string {
  if (error instanceof ConflictError) {
    return BULK_SKIP_REASONS.CHANGED;
  }
  if (error instanceof NotFoundError) {
    return BULK_SKIP_REASONS.NOT_FOUND;
  }
  if (error instanceof ValidationError && error.message.startsWith("Invalid status transition")) {
    return `This application's stage changed, so it can't move to ${describeApplicationStage(toStatus)} anymore. Reload the list and try again.`;
  }
  if (error instanceof AppError && error.isOperational) {
    return error.message;
  }
  logger.error("Bulk stage transition failed for one application", error);
  return BULK_SKIP_REASONS.FAILED;
}

export class BulkActionsService {
  /**
   * Moves (or rejects) up to 100 applications. Each application goes through
   * `recruitmentService.transitionApplicationStatus`, so every guard of the single action
   * still applies (decision role + `canApplications`, self-dealing block, allowed
   * transitions, conditional write, history, audit log and the optional candidate email).
   * Items are processed independently: one failure never blocks the others, and every
   * item is reported as moved or skipped with a friendly reason.
   */
  async transitionApplications(
    user: AuthenticatedUser,
    rawInput: BulkTransitionInput
  ): Promise<BulkTransitionSummary> {
    await assertPermission(user, "canApplications", { roles: BULK_DECISION_ROLES });

    const parsed = BulkTransitionSchema.safeParse(rawInput);
    if (!parsed.success) {
      throw new ValidationError(firstIssueMessage(parsed.error, "Check the bulk action and try again."));
    }
    const input = parsed.data;

    if (FLOW_OWNED_APPLICATION_STATUSES.includes(input.toStatus)) {
      throw new ValidationError(
        `${describeApplicationStage(input.toStatus)} has its own workflow on the application page and can't be set in bulk.`
      );
    }

    const applicationIds = Array.from(new Set(input.applicationIds));
    const candidateMessage = input.sendEmail ? input.candidateMessage : null;

    // One query for every selected record, limited to what this user may see in the queue.
    const records = await prisma.application.findMany({
      where: { id: { in: applicationIds }, AND: [staffApplicationVisibility(user)] },
      select: {
        id: true,
        referenceCode: true,
        status: true,
        candidate: { select: { user: { select: { id: true, name: true } } } },
      },
    });
    const byId = new Map(records.map((record) => [record.id, record]));

    const items: BulkItemOutcome[] = [];
    for (const applicationId of applicationIds) {
      const record = byId.get(applicationId);
      if (!record) {
        items.push({
          applicationId,
          referenceCode: null,
          candidateName: null,
          outcome: "SKIPPED",
          reason: BULK_SKIP_REASONS.NOT_FOUND,
        });
        continue;
      }

      const base = {
        applicationId,
        referenceCode: record.referenceCode,
        candidateName: record.candidate.user.name,
      };

      if (record.candidate.user.id === user.id) {
        items.push({ ...base, outcome: "SKIPPED", reason: BULK_SKIP_REASONS.OWN_APPLICATION });
        continue;
      }
      if (record.status === input.toStatus) {
        items.push({
          ...base,
          outcome: "SKIPPED",
          reason: `Already in ${describeApplicationStage(input.toStatus)}.`,
        });
        continue;
      }
      if (!getManualTransitionTargets(record.status).includes(input.toStatus)) {
        items.push({
          ...base,
          outcome: "SKIPPED",
          reason: `Can't move from ${describeApplicationStage(record.status)} to ${describeApplicationStage(input.toStatus)}.`,
        });
        continue;
      }

      try {
        const result = await recruitmentService.transitionApplicationStatus(user, {
          applicationId,
          toStatus: input.toStatus,
          internalNotes: input.internalNotes,
          candidateMessage,
        });
        items.push({ ...base, outcome: "MOVED", emailQueued: result.notificationQueued });
      } catch (error) {
        items.push({
          ...base,
          outcome: "SKIPPED",
          reason: describeTransitionFailure(error, input.toStatus),
        });
      }
    }

    const moved = items.filter((item) => item.outcome === "MOVED");
    const summary: BulkTransitionSummary = {
      toStatus: input.toStatus,
      requested: applicationIds.length,
      moved: moved.length,
      skipped: items.length - moved.length,
      emailsQueued: moved.filter((item) => item.emailQueued).length,
      items,
    };

    // One summary row for the batch; every moved application also has its own audit row
    // (written inside its transition), so a failure here must not hide the per-item result.
    await prisma.auditLog
      .create({
        data: {
          actorId: user.id,
          actorRole: user.roles[0] ?? "STAFF",
          action: "BULK_TRANSITION_APPLICATION_STAGE",
          resourceType: "APPLICATION_BULK_ACTION",
          resourceId: crypto.randomUUID(),
          diffPayload: {
            toStatus: input.toStatus,
            requested: summary.requested,
            movedIds: moved.map((item) => item.applicationId),
            skipped: items
              .filter((item) => item.outcome === "SKIPPED")
              .map((item) => ({ applicationId: item.applicationId, reason: item.reason ?? null })),
            emailRequested: input.sendEmail,
            hasInternalNotes: Boolean(input.internalNotes),
          },
        },
      })
      .catch((error: unknown) => {
        logger.error("Failed to record the bulk stage transition audit summary", error, {
          moved: summary.moved,
        });
      });

    return summary;
  }

  /**
   * Renders the APPLICATION_STAGE_UPDATE email exactly as a candidate would receive it,
   * for one application the user may act on (used for the bulk dialog preview).
   */
  async previewStageUpdateEmail(
    user: AuthenticatedUser,
    rawInput: BulkEmailPreviewInput
  ): Promise<{ subject: string; text: string }> {
    await assertPermission(user, "canApplications", { roles: BULK_DECISION_ROLES });

    const parsed = BulkEmailPreviewSchema.safeParse(rawInput);
    if (!parsed.success) {
      throw new ValidationError(firstIssueMessage(parsed.error, "Write a message to preview."));
    }

    const application = await prisma.application.findFirst({
      where: { id: parsed.data.applicationId, AND: [staffApplicationVisibility(user)] },
      select: {
        referenceCode: true,
        opening: { select: { title: true } },
        candidate: { select: { user: { select: { name: true } } } },
      },
    });
    if (!application) {
      throw new NotFoundError(BULK_SKIP_REASONS.NOT_FOUND);
    }

    const email = buildApplicationStageUpdateEmail({
      candidateName: application.candidate.user.name,
      openingTitle: application.opening.title,
      referenceCode: application.referenceCode,
      newStatus: parsed.data.toStatus,
      message: parsed.data.candidateMessage,
    });
    return { subject: email.subject, text: email.text };
  }
}

export const bulkActionsService = new BulkActionsService();
