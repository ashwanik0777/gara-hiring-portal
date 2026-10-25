import nodemailer from "nodemailer";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { logger } from "@/lib/logging/logger";
import { getSiteUrl } from "@/lib/site-url";
import { buildInterviewEventText, buildInterviewIcs, icsHttpsUrl, parseMailbox } from "./ics";
import {
  OFFER_ACCEPTED_CONFIRMATION_TEMPLATE,
  renderOfferAcceptedConfirmationEmail,
} from "./templates/offer-letter-emails";

/** iCalendar invitation sent as a text/calendar part ("Add to calendar" in mail clients). */
export interface CalendarInvite {
  method: "REQUEST" | "CANCEL";
  /** Full VCALENDAR document (see src/infrastructure/email/ics.ts). */
  content: string;
  filename?: string;
}

export interface OutboundEmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
  icalEvent?: CalendarInvite;
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
      ...(message.icalEvent
        ? {
            icalEvent: {
              method: message.icalEvent.method,
              content: message.icalEvent.content,
              filename: message.icalEvent.filename ?? "invite.ics",
            },
          }
        : {}),
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
  buildConversionOfferExtendedEmail,
  buildConversionCompletedEmail,
  buildInternshipReviewExtendedEmail,
  buildInternshipEndingEmail,
  buildEvaluationSupervisorChangedEmail,
  buildInterviewReminderEmail,
  buildCheckpointReminderEmail,
  buildCheckpointReviewReminderEmail,
  buildConversionReviewReminderEmail,
  buildStaffDailyDigestEmail,
  buildInterviewRescheduledEmail,
  buildInterviewCancelledEmail,
  buildInterviewBookingRequestEmail,
  buildInterviewBookingCancelledEmail,
  buildAppUrl,
  type InterviewRecipientRole,
} from "./email-templates";

/** Reads an optional non-empty string from an outbox payload. */
function optionalText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

/** Reads a finite number from an outbox payload. */
function numberOr(value: unknown, fallback: number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** Reads an array of objects from an outbox payload, ignoring malformed entries. */
function recordList(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (entry): entry is Record<string, unknown> => typeof entry === "object" && entry !== null && !Array.isArray(entry)
  );
}

const REVIEW_STATES = ["UPCOMING", "DUE", "OVERDUE"] as const;
type ReviewState = (typeof REVIEW_STATES)[number];

function reviewState(value: unknown): ReviewState {
  return REVIEW_STATES.find((state) => state === value) ?? "UPCOMING";
}

function recipientRole(value: unknown): InterviewRecipientRole {
  return value === "INTERVIEWER" ? "INTERVIEWER" : "CANDIDATE";
}

/** Reads a list of strings from an outbox payload, ignoring other entries. */
function textList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

/**
 * Structured calendar data queued with interview emails (see recruitment/services/interview-scheduling.ts).
 * The invite is rendered at send time; the method comes from the template, never the payload.
 */
const CalendarPayloadSchema = z.object({
  scheduleId: z.string().min(1).max(64),
  sequence: z.number().int().min(0).max(1_000_000),
  startsAt: z.string().max(64).refine((value) => !Number.isNaN(Date.parse(value))),
  durationMinutes: z.number().int().min(1).max(24 * 60),
  attendees: z
    .array(z.object({ email: z.string().max(254), name: z.string().max(200).nullish() }))
    .max(10)
    .default([]),
});

const DEFAULT_ORGANIZER_NAME = "GARA Innovation";

/**
 * Builds the .ics attachment for an interview email, or undefined when the payload has no
 * (valid) calendar data. Every value goes through the escaping RFC 5545 generator.
 */
function buildInterviewCalendarInvite(
  data: Record<string, unknown>,
  method: CalendarInvite["method"]
): CalendarInvite | undefined {
  if (data.calendar === undefined) return undefined;
  const parsed = CalendarPayloadSchema.safeParse(data.calendar);
  if (!parsed.success) {
    logger.warn("Interview email has invalid calendar data; sending it without an invite");
    return undefined;
  }
  const organizer = parseMailbox(env.SMTP_FROM);
  if (!organizer) {
    logger.warn("SMTP_FROM has no usable address; sending the interview email without an invite");
    return undefined;
  }

  const calendar = parsed.data;
  const role = recipientRole(data.recipientRole);
  const roundName = optionalText(data.roundName) ?? "Interview";
  const openingTitle = optionalText(data.openingTitle) ?? "Position";
  const candidateName = optionalText(data.candidateName) ?? null;
  const meetingLink = icsHttpsUrl(data.meetingLink);
  const portalUrl = buildAppUrl(
    optionalText(data.href),
    role === "INTERVIEWER" ? "/dashboard" : "/candidate/dashboard"
  );

  const { summary, description } = buildInterviewEventText({
    recipientRole: role,
    roundName,
    openingTitle,
    candidateName,
    durationMinutes: calendar.durationMinutes,
    meetingLink,
    detailsUrl: portalUrl,
    cancelled: method === "CANCEL",
  });

  try {
    const content = buildInterviewIcs({
      scheduleId: calendar.scheduleId,
      host: getSiteUrl(),
      sequence: calendar.sequence,
      method,
      startsAt: calendar.startsAt,
      durationMinutes: calendar.durationMinutes,
      summary,
      description,
      meetingLink,
      organizer: { email: organizer.email, name: organizer.name ?? DEFAULT_ORGANIZER_NAME },
      attendees: calendar.attendees.map((attendee) => ({ email: attendee.email, name: attendee.name ?? null })),
    });
    return { method, content, filename: method === "CANCEL" ? "interview-cancelled.ics" : "interview.ics" };
  } catch {
    logger.warn("Interview calendar invite could not be built; sending the email without it");
    return undefined;
  }
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
  ): { subject: string; text: string; html?: string; icalEvent?: CalendarInvite } {
    const data =
      payload && typeof payload === "object"
        ? (payload as Record<string, unknown>)
        : {};

    switch (templateName) {
      case OFFER_ACCEPTED_CONFIRMATION_TEMPLATE:
        return renderOfferAcceptedConfirmationEmail(data);

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
      case "INTERVIEW_SCHEDULED": {
        const icalEvent = buildInterviewCalendarInvite(data, "REQUEST");
        return {
          ...buildInterviewInvitationEmail({
            candidateName: String(data.candidateName || "Candidate"),
            openingTitle: String(data.openingTitle || "Position"),
            roundName: String(data.roundName || "Interview Round"),
            scheduledAt: String(data.scheduledAt || new Date().toISOString()),
            durationMinutes: Number(data.durationMinutes) || 45,
            meetingLink: typeof data.meetingLink === "string" ? data.meetingLink : null,
            referenceCode: typeof data.referenceCode === "string" ? data.referenceCode : undefined,
            recipientRole: recipientRole(data.recipientRole),
            recipientName: optionalText(data.recipientName),
            href: optionalText(data.href),
            hasCalendarInvite: Boolean(icalEvent),
          }),
          icalEvent,
        };
      }

      case "INTERVIEW_RESCHEDULED": {
        const icalEvent = buildInterviewCalendarInvite(data, "REQUEST");
        const candidateName = optionalText(data.candidateName) ?? "Candidate";
        return {
          ...buildInterviewRescheduledEmail({
            recipientName: optionalText(data.recipientName) ?? candidateName,
            recipientRole: recipientRole(data.recipientRole),
            candidateName,
            openingTitle: optionalText(data.openingTitle) ?? "Position",
            roundName: optionalText(data.roundName) ?? "Interview",
            // Rows queued before round 4 carried `newScheduledAt`.
            scheduledAt: optionalText(data.scheduledAt) ?? optionalText(data.newScheduledAt) ?? "",
            previousScheduledAt: optionalText(data.previousScheduledAt),
            durationMinutes: numberOr(data.durationMinutes, 45),
            meetingLink: optionalText(data.meetingLink) ?? null,
            reason: optionalText(data.reason),
            href: optionalText(data.href),
            hasCalendarInvite: Boolean(icalEvent),
          }),
          icalEvent,
        };
      }

      case "INTERVIEW_CANCELLED": {
        const icalEvent = buildInterviewCalendarInvite(data, "CANCEL");
        const candidateName = optionalText(data.candidateName) ?? "Candidate";
        return {
          ...buildInterviewCancelledEmail({
            recipientName: optionalText(data.recipientName) ?? candidateName,
            recipientRole: recipientRole(data.recipientRole),
            candidateName,
            openingTitle: optionalText(data.openingTitle) ?? "Position",
            roundName: optionalText(data.roundName) ?? "Interview",
            scheduledAt: optionalText(data.scheduledAt),
            reason: optionalText(data.reason),
            href: optionalText(data.href),
            hasCalendarInvite: Boolean(icalEvent),
          }),
          icalEvent,
        };
      }

      case "INTERVIEW_BOOKING_REQUEST":
        return buildInterviewBookingRequestEmail({
          candidateName: optionalText(data.candidateName) ?? "Candidate",
          openingTitle: optionalText(data.openingTitle) ?? "Position",
          roundName: optionalText(data.roundName) ?? "Interview",
          durationMinutes: numberOr(data.durationMinutes, 45),
          options: textList(data.options),
          href: optionalText(data.href),
        });

      case "INTERVIEW_BOOKING_CANCELLED":
        return buildInterviewBookingCancelledEmail({
          candidateName: optionalText(data.candidateName) ?? "Candidate",
          openingTitle: optionalText(data.openingTitle) ?? "Position",
          roundName: optionalText(data.roundName) ?? "Interview",
          reason: optionalText(data.reason),
          href: optionalText(data.href),
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
          isRejoin: data.isRejoin === true,
        });

      case "EMPLOYEE_JOINED":
      case "EMPLOYEE_ONBOARDING_WELCOME":
        return buildEmployeeJoinedEmail({
          recipientName: optionalText(data.employeeName) ?? optionalText(data.recipientName) ?? "Team Member",
          employeeCode: optionalText(data.employeeCode),
          department: optionalText(data.department),
          designation: optionalText(data.designation),
          joiningDate: optionalText(data.joiningDate),
          isRejoin: data.isRejoin === true,
        });

      case "CONVERSION_OFFER_EXTENDED":
        return buildConversionOfferExtendedEmail({
          recipientName: optionalText(data.recipientName) ?? "Intern",
          proposedDesignation: optionalText(data.proposedDesignation) ?? "Full-time role",
          proposedDepartment: optionalText(data.proposedDepartment) ?? "To be confirmed",
          effectiveDate: optionalText(data.effectiveDate),
          sharedSummary: optionalText(data.sharedSummary),
        });

      case "CONVERSION_COMPLETED":
        return buildConversionCompletedEmail({
          recipientName: optionalText(data.recipientName) ?? "Team Member",
          designation: optionalText(data.designation) ?? "Full-time employee",
          department: optionalText(data.department) ?? "To be confirmed",
          effectiveDate: optionalText(data.effectiveDate),
        });

      case "INTERNSHIP_REVIEW_EXTENDED":
        return buildInternshipReviewExtendedEmail({
          recipientName: optionalText(data.recipientName) ?? "Intern",
          nextReviewDate: optionalText(data.nextReviewDate),
          sharedSummary: optionalText(data.sharedSummary),
        });

      case "INTERNSHIP_ENDING":
        return buildInternshipEndingEmail({
          recipientName: optionalText(data.recipientName) ?? "Intern",
          sharedSummary: optionalText(data.sharedSummary),
        });

      case "EVALUATION_SUPERVISOR_CHANGED":
        return buildEvaluationSupervisorChangedEmail({
          recipientName: optionalText(data.recipientName) ?? "Team Member",
          recipientRole: data.recipientRole === "INTERN" ? "INTERN" : "SUPERVISOR",
          internName: optionalText(data.internName) ?? "the intern",
          openingTitle: optionalText(data.openingTitle) ?? "Internship",
          newSupervisorName: optionalText(data.newSupervisorName) ?? "a new supervisor",
        });

      case "INTERVIEW_REMINDER":
        return buildInterviewReminderEmail({
          recipientName: optionalText(data.recipientName) ?? "there",
          recipientRole: data.recipientRole === "INTERVIEWER" ? "INTERVIEWER" : "CANDIDATE",
          candidateName: optionalText(data.candidateName) ?? "the candidate",
          openingTitle: optionalText(data.openingTitle) ?? "Position",
          roundName: optionalText(data.roundName) ?? "Interview",
          scheduledAt: optionalText(data.scheduledAt) ?? "",
          durationMinutes: numberOr(data.durationMinutes, 45),
          meetingLink: optionalText(data.meetingLink) ?? null,
          leadTime: data.leadTime === "1h" ? "1h" : "24h",
          href: optionalText(data.href),
        });

      case "CHECKPOINT_REMINDER":
        return buildCheckpointReminderEmail({
          recipientName: optionalText(data.recipientName) ?? "there",
          openingTitle: optionalText(data.openingTitle) ?? "Internship evaluation",
          dayNumber: numberOr(data.dayNumber, 1),
          checkpointTitle: optionalText(data.checkpointTitle) ?? "Daily checkpoint",
        });

      case "CHECKPOINT_REVIEW_REMINDER": {
        const items = recordList(data.items).map((item) => ({
          internName: optionalText(item.internName) ?? "Intern",
          dayNumber: numberOr(item.dayNumber, 1),
        }));
        return buildCheckpointReviewReminderEmail({
          recipientName: optionalText(data.recipientName) ?? "there",
          pendingCount: numberOr(data.pendingCount, items.length),
          items,
          href: optionalText(data.href),
        });
      }

      case "CONVERSION_REVIEW_REMINDER":
        return buildConversionReviewReminderEmail({
          recipientName: optionalText(data.recipientName) ?? "there",
          items: recordList(data.items).map((item) => ({
            internName: optionalText(item.internName) ?? "Intern",
            scheduledFor: optionalText(item.scheduledFor) ?? "",
            state: reviewState(item.state),
          })),
          href: optionalText(data.href),
        });

      case "STAFF_DAILY_DIGEST":
        return buildStaffDailyDigestEmail({
          recipientName: optionalText(data.recipientName) ?? "there",
          dateLabel: optionalText(data.dateLabel) ?? "today",
          sections: recordList(data.sections).map((section) => ({
            title: optionalText(section.title) ?? "Pending items",
            count: numberOr(section.count, 0),
            href: optionalText(section.href) ?? "/dashboard",
          })),
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
        icalEvent: rendered.icalEvent,
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
