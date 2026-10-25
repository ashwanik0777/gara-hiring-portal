import nodemailer from "nodemailer";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";

export interface OutboundEmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface EmailTransportAdapter {
  sendEmail(message: OutboundEmailMessage): Promise<void>;
}

export class NodemailerEmailAdapter implements EmailTransportAdapter {
  public async sendEmail(message: OutboundEmailMessage): Promise<void> {
    const transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465,
      auth:
        env.SMTP_USER && env.SMTP_PASS
          ? {
              user: env.SMTP_USER,
              pass: env.SMTP_PASS,
            }
          : undefined,
    });

    await transporter.sendMail({
      from: env.SMTP_FROM,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
  }
}

import {
  buildApplicationConfirmationEmail,
  buildApplicationStageUpdateEmail,
  buildInterviewInvitationEmail,
  buildEvaluationSelectionEmail,
  buildJobOfferEmail,
  buildInternJoinedEmail,
  buildEmployeeJoinedEmail,
  buildGenericNotificationEmail,
} from "./email-templates";

/** Reads an optional non-empty string from an outbox payload. */
function optionalText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

export interface OutboxProcessingSummary {
  processed: number;
  sent: number;
  failed: number;
  skippedAlreadySent: number;
  exhaustedMaxAttempts: number;
}

/** Claims older than this are treated as abandoned by a crashed worker. */
export const STALE_CLAIM_MS = 10 * 60 * 1000;

export type OutboxRecordOutcome =
  | "SENT"
  | "FAILED"
  | "SKIPPED_SENT"
  | "SKIPPED_CLAIMED"
  | "EXHAUSTED";

/**
 * Durable NotificationOutbox processor with idempotent email delivery and bounded retries.
 */
export class OutboxProcessorService {
  private readonly transport: EmailTransportAdapter;

  constructor(transport: EmailTransportAdapter = new NodemailerEmailAdapter()) {
    this.transport = transport;
  }

  private renderTemplate(
    templateName: string,
    payload: unknown
  ): { subject: string; text: string; html?: string } {
    const data =
      payload && typeof payload === "object"
        ? (payload as Record<string, unknown>)
        : {};

    switch (templateName) {
      case "APPLICATION_CONFIRMATION":
      case "APPLICATION_SUBMITTED":
        return buildApplicationConfirmationEmail({
          candidateName: String(data.candidateName || "Candidate"),
          openingTitle: String(data.openingTitle || "Internship / Job Opening"),
          referenceCode: String(data.referenceCode || "N/A"),
          submittedAt: typeof data.submittedAt === "string" ? data.submittedAt : undefined,
        });

      case "APPLICATION_STAGE_UPDATE":
        return buildApplicationStageUpdateEmail({
          candidateName: String(data.candidateName || "Candidate"),
          openingTitle: String(data.openingTitle || "Position"),
          referenceCode: String(data.referenceCode || "N/A"),
          newStatus: String(data.newStatus || "IN_REVIEW"),
          message: typeof data.message === "string" ? data.message : undefined,
        });

      case "INTERVIEW_INVITATION":
      case "INTERVIEW_SCHEDULED":
        return buildInterviewInvitationEmail({
          candidateName: String(data.candidateName || "Candidate"),
          openingTitle: String(data.openingTitle || "Position"),
          roundName: String(data.roundName || "Interview Round"),
          scheduledAt: String(data.scheduledAt || new Date().toISOString()),
          durationMinutes: Number(data.durationMinutes) || 45,
          meetingLink: typeof data.meetingLink === "string" ? data.meetingLink : null,
          referenceCode: typeof data.referenceCode === "string" ? data.referenceCode : undefined,
        });

      case "EVALUATION_SELECTION_NOTIFICATION":
        return buildEvaluationSelectionEmail({
          candidateName: String(data.candidateName || "Candidate"),
          openingTitle: String(data.openingTitle || "Internship Position"),
          workingDays: Number(data.workingDays) || 7,
        });

      case "JOB_OFFER_EXTENDED":
      case "OFFER_EXTENDED":
        return buildJobOfferEmail({
          candidateName: String(data.candidateName || "Candidate"),
          designation: String(data.designation || "Associate Engineer"),
          department: String(data.department || "Engineering"),
          expectedJoiningDate: String(data.expectedJoiningDate || new Date().toISOString()),
          applicationReference: typeof data.applicationReference === "string" ? data.applicationReference : undefined,
        });

      case "INTERN_JOINED":
        return buildInternJoinedEmail({
          recipientName: optionalText(data.recipientName) ?? "Intern",
          employeeCode: optionalText(data.employeeCode),
          department: optionalText(data.department),
          designation: optionalText(data.designation),
          openingTitle: optionalText(data.openingTitle),
          joiningDate: optionalText(data.joiningDate),
        });

      case "EMPLOYEE_JOINED":
      case "EMPLOYEE_ONBOARDING_WELCOME":
        return buildEmployeeJoinedEmail({
          recipientName: optionalText(data.employeeName) ?? "Team Member",
          employeeCode: optionalText(data.employeeCode),
          department: optionalText(data.department),
          designation: optionalText(data.designation),
          joiningDate: optionalText(data.joiningDate),
        });

      default:
        return buildGenericNotificationEmail({
          templateName,
          payload: data,
        });
    }
  }

  /**
   * Processes a single outbox record idempotently.
   * Never re-sends a notification that is already marked SENT or has exhausted maxAttempts.
   * The row is claimed with a conditional update, so two concurrent workers can never
   * both send the same notification.
   */
  public async processSingleRecord(
    outboxId: string,
    nowMs = Date.now()
  ): Promise<OutboxRecordOutcome> {
    const record = await prisma.notificationOutbox.findUnique({
      where: { id: outboxId },
    });

    if (!record) {
      return "SKIPPED_SENT";
    }

    // Strict idempotency guard: never re-send a delivered notification
    if (record.status === "SENT" || record.sentAt !== null) {
      return "SKIPPED_SENT";
    }

    // Bounded retry guard: park exhausted rows so they stop blocking the queue
    if (record.attempts >= record.maxAttempts) {
      if (record.status !== "DEAD_LETTER") {
        await prisma.notificationOutbox.updateMany({
          where: { id: record.id, status: record.status },
          data: { status: "DEAD_LETTER" },
        });
      }
      return "EXHAUSTED";
    }

    const isStaleClaim =
      record.status === "PROCESSING" &&
      (record.claimedAt === null || nowMs - record.claimedAt.getTime() > STALE_CLAIM_MS);
    if (record.status === "PROCESSING" && !isStaleClaim) {
      return "SKIPPED_CLAIMED";
    }

    const nextAttemptCount = record.attempts + 1;

    const claim = await prisma.notificationOutbox.updateMany({
      where: {
        id: record.id,
        status: record.status,
        attempts: record.attempts,
      },
      data: {
        status: "PROCESSING",
        attempts: nextAttemptCount,
        claimedAt: new Date(nowMs),
      },
    });

    if (claim.count === 0) {
      return "SKIPPED_CLAIMED";
    }

    const rendered = this.renderTemplate(record.templateName, record.payload);

    try {
      await this.transport.sendEmail({
        to: record.recipientEmail,
        subject: rendered.subject,
        text: rendered.text,
        html: rendered.html,
      });

      await prisma.notificationOutbox.update({
        where: { id: record.id },
        data: {
          status: "SENT",
          sentAt: new Date(),
          lastError: null,
        },
      });

      return "SENT";
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown SMTP transport error";

      await prisma.notificationOutbox.update({
        where: { id: record.id },
        data: {
          status: nextAttemptCount >= record.maxAttempts ? "DEAD_LETTER" : "FAILED",
          lastError: errorMessage.slice(0, 500),
        },
      });

      return "FAILED";
    }
  }

  public async processPendingBatch(
    batchSize = 20,
    nowMs = Date.now()
  ): Promise<OutboxProcessingSummary> {
    const candidates = await prisma.notificationOutbox.findMany({
      where: {
        OR: [
          { status: { in: ["PENDING", "FAILED"] } },
          {
            status: "PROCESSING",
            claimedAt: { lt: new Date(nowMs - STALE_CLAIM_MS) },
          },
        ],
      },
      orderBy: { createdAt: "asc" },
      take: batchSize,
      select: { id: true },
    });

    const summary: OutboxProcessingSummary = {
      processed: 0,
      sent: 0,
      failed: 0,
      skippedAlreadySent: 0,
      exhaustedMaxAttempts: 0,
    };

    for (const item of candidates) {
      const outcome = await this.processSingleRecord(item.id, nowMs);
      summary.processed += 1;
      if (outcome === "SENT") summary.sent += 1;
      else if (outcome === "FAILED") summary.failed += 1;
      else if (outcome === "SKIPPED_SENT" || outcome === "SKIPPED_CLAIMED") summary.skippedAlreadySent += 1;
      else if (outcome === "EXHAUSTED") summary.exhaustedMaxAttempts += 1;
    }

    return summary;
  }
}

export const outboxProcessorService = new OutboxProcessorService();
