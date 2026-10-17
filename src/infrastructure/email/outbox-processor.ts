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
  buildGenericNotificationEmail,
} from "./email-templates";

export interface OutboxProcessingSummary {
  processed: number;
  sent: number;
  failed: number;
  skippedAlreadySent: number;
  exhaustedMaxAttempts: number;
}

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
   */
  public async processSingleRecord(outboxId: string): Promise<"SENT" | "FAILED" | "SKIPPED_SENT" | "EXHAUSTED"> {
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

    // Bounded retry guard
    if (record.attempts >= record.maxAttempts) {
      return "EXHAUSTED";
    }

    const nextAttemptCount = record.attempts + 1;

    await prisma.notificationOutbox.update({
      where: { id: record.id },
      data: {
        status: "PROCESSING",
        attempts: nextAttemptCount,
      },
    });

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
          status: "FAILED",
          lastError: errorMessage.slice(0, 500),
        },
      });

      return "FAILED";
    }
  }

  public async processPendingBatch(
    batchSize = 20
  ): Promise<OutboxProcessingSummary> {
    const candidates = await prisma.notificationOutbox.findMany({
      where: {
        status: { in: ["PENDING", "FAILED"] },
      },
      orderBy: { createdAt: "asc" },
      take: batchSize,
    });

    const summary: OutboxProcessingSummary = {
      processed: 0,
      sent: 0,
      failed: 0,
      skippedAlreadySent: 0,
      exhaustedMaxAttempts: 0,
    };

    for (const item of candidates) {
      const outcome = await this.processSingleRecord(item.id);
      summary.processed += 1;
      if (outcome === "SENT") summary.sent += 1;
      else if (outcome === "FAILED") summary.failed += 1;
      else if (outcome === "SKIPPED_SENT") summary.skippedAlreadySent += 1;
      else if (outcome === "EXHAUSTED") summary.exhaustedMaxAttempts += 1;
    }

    return summary;
  }
}

export const outboxProcessorService = new OutboxProcessorService();
