/**
 * Industrial Training emails (payment received, refund outcome). Builders return the same
 * `{ subject, text, html }` shape as email-templates.ts; every interpolated value is escaped.
 * Amounts arrive pre-formatted ("Rs. 4,999") so the email shows exactly what the receipt shows.
 */

import { buildAppUrl, escapeHtml, formatBusinessDateTime, renderEmailShell } from "../email-templates";

export const TRAINING_PAYMENT_RECEIVED_TEMPLATE = "TRAINING_PAYMENT_RECEIVED";
export const TRAINING_REFUND_UPDATE_TEMPLATE = "TRAINING_REFUND_UPDATE";
export const TRAINING_RESULT_TEMPLATE = "TRAINING_RESULT";
export const TRAINING_FIRST_CLASS_REMINDER_TEMPLATE = "TRAINING_FIRST_CLASS_REMINDER";

/** Reminder 24 hours before the first live class (Phase 6). */
export function renderTrainingFirstClassReminderEmail(payload: unknown): EmailContent {
  const data = record(payload);
  const name = text(data.recipientName, "there");
  const programTitle = text(data.programTitle, "your Industrial Training programme");
  const startsAt = formatBusinessDateTime(text(data.firstClassAt, ""));
  const enrollmentPath = typeof data.enrollmentId === "string" && /^[0-9a-f-]{36}$/.test(data.enrollmentId) ? `${PORTAL_PATH}/${data.enrollmentId}` : PORTAL_PATH;
  const portalUrl = buildAppUrl(enrollmentPath, PORTAL_PATH);
  const rows: Array<[string, string]> = [
    ["Programme", programTitle],
    ["Batch", text(data.batchName, "your batch")],
    ["First live class", startsAt],
  ];
  const lead = "Your first live class is in about 24 hours. The joining link is in your learning area.";
  const subject = `[GARA Innovation] First class tomorrow: ${programTitle}`;
  const plain = `Hello ${name},\n\n${lead}\n\n${rowsText(rows)}\n\nLearning area: ${portalUrl}\n\n— GARA Innovation`;
  const html = renderEmailShell({
    categoryBadge: { text: "Class Reminder", bgColor: "#eff6ff", textColor: "#1d4ed8", borderColor: "#bfdbfe" },
    title: "Your first class is tomorrow",
    salutation: `Hello ${name},`,
    leadParagraph: escapeHtml(lead),
    contentHtml: renderRows(rows),
    ctaButton: { text: "Open my learning area", url: portalUrl },
  });
  return { subject, text: plain, html };
}

export interface TrainingResultPayload {
  recipientName: string;
  programTitle: string;
  batchName: string;
  outcome: "PASSED" | "FAILED";
  /** Certificate ID for a pass. */
  verificationCode: string | null;
  /** The mentor's note for a fail. */
  note: string | null;
  /** Whether the free re-attempt is still available (fail). */
  canReattempt: boolean;
}

export type TrainingRefundOutcome = "PROCESSED" | "REJECTED" | "FAILED";

export interface TrainingPaymentReceivedPayload {
  recipientName: string;
  programTitle: string;
  batchName: string;
  amount: string;
  receiptNo: string;
  /** ISO instant of the payment. */
  paidAt: string;
  /** ISO instant until which a refund can be requested. */
  refundWindowClosesAt: string;
}

export interface TrainingRefundUpdatePayload {
  recipientName: string;
  programTitle: string;
  batchName: string;
  amount: string;
  outcome: TrainingRefundOutcome;
  /** The administrator's note (shown for a rejection). */
  note: string | null;
  contactEmail: string;
}

type EmailContent = { subject: string; text: string; html: string };

const PORTAL_PATH = "/candidate/training";
const LABEL_CELL_STYLE =
  "color: #64748b; font-weight: 600; text-transform: uppercase; font-size: 11px; letter-spacing: 0.04em;";

function renderRows(rows: ReadonlyArray<readonly [string, string]>): string {
  const rowsHtml = rows
    .map(
      ([label, value]) => `
        <tr>
          <td width="35%" style="${LABEL_CELL_STYLE}">${escapeHtml(label)}</td>
          <td style="color: #0f172a; font-weight: 600; word-break: break-word;">${escapeHtml(value)}</td>
        </tr>`
    )
    .join("");
  return `
    <div style="margin: 20px 0; padding: 20px; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px;">
      <table width="100%" cellpadding="6" cellspacing="0" border="0" style="font-size: 13px;">${rowsHtml}
      </table>
    </div>`;
}

function rowsText(rows: ReadonlyArray<readonly [string, string]>): string {
  return rows.map(([label, value]) => `${label}: ${value}`).join("\n");
}

export function buildTrainingPaymentReceivedEmail(params: TrainingPaymentReceivedPayload): EmailContent {
  const portalUrl = buildAppUrl(PORTAL_PATH, PORTAL_PATH);
  const rows: Array<[string, string]> = [
    ["Programme", params.programTitle],
    ["Batch", params.batchName],
    ["Amount paid", params.amount],
    ["Receipt number", params.receiptNo],
    ["Paid on", formatBusinessDateTime(params.paidAt)],
  ];
  const refundUntil = formatBusinessDateTime(params.refundWindowClosesAt);
  const subject = `[GARA Innovation] Payment received: ${params.programTitle}`;
  const text = `Hello ${params.recipientName},\n\nWe received your payment and your seat in ${params.programTitle} (${params.batchName}) is confirmed.\n\n${rowsText(
    rows
  )}\n\nDownload your payment receipt from your training page: ${portalUrl}\n\nYou can ask for a refund (the amount paid minus Razorpay's fee and GST) until ${refundUntil} from the same page.\n\n— GARA Innovation`;

  const html = renderEmailShell({
    categoryBadge: { text: "Payment Received", bgColor: "#ecfdf5", textColor: "#047857", borderColor: "#a7f3d0" },
    title: "Your seat is confirmed",
    salutation: `Hello ${params.recipientName},`,
    leadParagraph: `We received your payment and your seat in <strong>${escapeHtml(params.programTitle)}</strong> (${escapeHtml(
      params.batchName
    )}) is confirmed.`,
    contentHtml: renderRows(rows),
    ctaButton: { text: "Download payment receipt", url: portalUrl },
    secondaryNote: {
      title: "Changed your mind?",
      text: `You can ask for a refund (the amount paid minus Razorpay's fee and GST) until ${refundUntil} from your training page.`,
      bgColor: "#f8fafc",
      borderColor: "#cbd5e1",
      textColor: "#334155",
    },
  });
  return { subject, text, html };
}

const REFUND_COPY: Record<TrainingRefundOutcome, { badge: string; title: string; lead: (amount: string) => string; colors: [string, string, string] }> = {
  PROCESSED: {
    badge: "Refund Processed",
    title: "Your refund has been processed",
    lead: (amount) => `Your refund of ${amount} was processed to the card, UPI account or bank account you paid with. Banks usually take 5–7 working days to show it in your account.`,
    colors: ["#ecfdf5", "#047857", "#a7f3d0"],
  },
  REJECTED: {
    badge: "Refund Not Approved",
    title: "Your refund request was not approved",
    lead: () => "Your refund request was reviewed and not approved. Your enrollment stays active.",
    colors: ["#fffbeb", "#92400e", "#fde68a"],
  },
  FAILED: {
    badge: "Refund Delayed",
    title: "Your refund could not be completed yet",
    lead: () => "The bank could not complete your refund. Our team will contact you to finish it.",
    colors: ["#fef2f2", "#b91c1c", "#fecaca"],
  },
};

export function buildTrainingRefundUpdateEmail(params: TrainingRefundUpdatePayload): EmailContent {
  const portalUrl = buildAppUrl(PORTAL_PATH, PORTAL_PATH);
  const copy = REFUND_COPY[params.outcome];
  const rows: Array<[string, string]> = [
    ["Programme", params.programTitle],
    ["Batch", params.batchName],
    ["Amount", params.amount],
  ];
  if (params.outcome === "REJECTED" && params.note) rows.push(["Reason", params.note]);
  const lead = copy.lead(params.amount);
  const subject = `[GARA Innovation] ${copy.badge}: ${params.programTitle}`;
  const text = `Hello ${params.recipientName},\n\n${lead}\n\n${rowsText(rows)}\n\nDetails are on your training page: ${portalUrl}\n\nQuestions? Write to ${params.contactEmail}.\n\n— GARA Innovation`;

  const [bgColor, textColor, borderColor] = copy.colors;
  const html = renderEmailShell({
    categoryBadge: { text: copy.badge, bgColor, textColor, borderColor },
    title: copy.title,
    salutation: `Hello ${params.recipientName},`,
    leadParagraph: escapeHtml(lead),
    contentHtml: renderRows(rows),
    ctaButton: { text: "Open my training page", url: portalUrl },
    secondaryNote: {
      title: "Questions?",
      text: `Write to ${params.contactEmail}.`,
      bgColor: "#f8fafc",
      borderColor: "#cbd5e1",
      textColor: "#334155",
    },
  });
  return { subject, text, html };
}

export function buildTrainingResultEmail(params: TrainingResultPayload): EmailContent {
  const portalUrl = buildAppUrl(PORTAL_PATH, PORTAL_PATH);
  const passed = params.outcome === "PASSED";
  const rows: Array<[string, string]> = [
    ["Programme", params.programTitle],
    ["Batch", params.batchName],
    ["Result", passed ? "Passed" : "Not passed"],
  ];
  if (passed && params.verificationCode) rows.push(["Certificate ID", params.verificationCode]);
  if (!passed && params.note) rows.push(["Mentor's note", params.note]);
  const lead = passed
    ? `Congratulations! You met every pass criterion of ${params.programTitle}. Your digital certificate is ready to download, and anyone can verify it with its ID.`
    : `You did not meet every pass criterion of ${params.programTitle} in this batch.${params.canReattempt ? " You can re-attempt in a later batch free of charge, once: choose the batch on your training page." : ""}`;
  const subject = passed
    ? `[GARA Innovation] Certificate issued: ${params.programTitle}`
    : `[GARA Innovation] Result: ${params.programTitle}`;
  const text = `Hello ${params.recipientName},\n\n${lead}\n\n${rowsText(rows)}\n\nYour training page: ${portalUrl}\n\n— GARA Innovation`;
  const html = renderEmailShell({
    categoryBadge: passed
      ? { text: "Certificate Issued", bgColor: "#ecfdf5", textColor: "#047857", borderColor: "#a7f3d0" }
      : { text: "Result", bgColor: "#f8fafc", textColor: "#334155", borderColor: "#cbd5e1" },
    title: passed ? "You passed — your certificate is ready" : "Your Industrial Training result",
    salutation: `Hello ${params.recipientName},`,
    leadParagraph: escapeHtml(lead),
    contentHtml: renderRows(rows),
    ctaButton: { text: passed ? "Download my certificate" : "Open my training page", url: portalUrl },
  });
  return { subject, text, html };
}

function text(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function record(payload: unknown): Record<string, unknown> {
  return payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
}

/** Renders the payment email from a raw outbox payload (unknown JSON). */
export function renderTrainingPaymentReceivedEmail(payload: unknown): EmailContent {
  const data = record(payload);
  return buildTrainingPaymentReceivedEmail({
    recipientName: text(data.recipientName, "Student"),
    programTitle: text(data.programTitle, "Industrial Training"),
    batchName: text(data.batchName, "your batch"),
    amount: text(data.amount, "the programme fee"),
    receiptNo: text(data.receiptNo, "Shown on your training page"),
    paidAt: text(data.paidAt, ""),
    refundWindowClosesAt: text(data.refundWindowClosesAt, ""),
  });
}

/** Renders the result email from a raw outbox payload (unknown JSON). */
export function renderTrainingResultEmail(payload: unknown): EmailContent {
  const data = record(payload);
  return buildTrainingResultEmail({
    recipientName: text(data.recipientName, "Student"),
    programTitle: text(data.programTitle, "Industrial Training"),
    batchName: text(data.batchName, "your batch"),
    outcome: data.outcome === "PASSED" ? "PASSED" : "FAILED",
    verificationCode: typeof data.verificationCode === "string" && /^[A-Z0-9-]{4,40}$/.test(data.verificationCode) ? data.verificationCode : null,
    note: typeof data.note === "string" && data.note.trim() ? data.note.trim() : null,
    canReattempt: data.canReattempt === true,
  });
}

/** Renders the refund email from a raw outbox payload (unknown JSON). */
export function renderTrainingRefundUpdateEmail(payload: unknown): EmailContent {
  const data = record(payload);
  const outcome = data.outcome === "PROCESSED" || data.outcome === "REJECTED" || data.outcome === "FAILED" ? data.outcome : "FAILED";
  return buildTrainingRefundUpdateEmail({
    recipientName: text(data.recipientName, "Student"),
    programTitle: text(data.programTitle, "Industrial Training"),
    batchName: text(data.batchName, "your batch"),
    amount: text(data.amount, "your payment"),
    outcome,
    note: typeof data.note === "string" && data.note.trim() ? data.note.trim() : null,
    contactEmail: text(data.contactEmail, "the GARA Innovation team"),
  });
}
