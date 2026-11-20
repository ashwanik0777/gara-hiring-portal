/**
 * Printed certificate order emails (Phase 3C): paid, shipped and delivered. Values escaped.
 */

import { buildAppUrl, escapeHtml, renderEmailShell } from "../email-templates";

export const PRINT_ORDER_UPDATE_TEMPLATE = "PRINT_ORDER_UPDATE";

type EmailContent = { subject: string; text: string; html: string };

function text(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

export function renderPrintOrderUpdateEmail(payload: unknown): EmailContent {
  const data = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  const name = text(data.recipientName, "there");
  const status = text(data.status, "PAID");
  const portalUrl = buildAppUrl("/candidate/training", "/candidate/training");
  const rows: Array<[string, string]> = [["Delivery", text(data.delivery, "—")]];
  let subject: string;
  let lead: string;
  if (status === "SHIPPED") {
    subject = "[GARA Innovation] Your printed certificate is on its way";
    lead = "Your printed certificate has been sent.";
    if (typeof data.courierName === "string" && data.courierName) rows.push(["Courier", data.courierName]);
    if (typeof data.trackingNo === "string" && data.trackingNo) rows.push(["Tracking number", data.trackingNo]);
  } else if (status === "DELIVERED") {
    subject = "[GARA Innovation] Your printed certificate was delivered";
    lead = "Your printed certificate has been marked as delivered. If it has not reached you, reply with your order details.";
  } else {
    subject = "[GARA Innovation] Printed certificate ordered";
    lead = "We received your payment for a printed copy of your certificate. We will email you when it is sent.";
    rows.push(["Amount paid", text(data.amount, "—")]);
    if (typeof data.receiptNo === "string" && data.receiptNo) rows.push(["Receipt number", data.receiptNo]);
  }
  const plain = `Hello ${name},\n\n${lead}\n\n${rows.map(([label, value]) => `${label}: ${value}`).join("\n")}\n\nYour training page: ${portalUrl}\n\n— GARA Innovation`;
  const html = renderEmailShell({
    title: subject.replace("[GARA Innovation] ", ""),
    salutation: `Hello ${name},`,
    leadParagraph: escapeHtml(lead),
    contentHtml: `<div style="margin: 20px 0; padding: 20px; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px;"><table width="100%" cellpadding="6" cellspacing="0" border="0" style="font-size: 13px;">${rows
      .map(([label, value]) => `<tr><td width="35%" style="color: #64748b; font-weight: 600; font-size: 11px; text-transform: uppercase;">${escapeHtml(label)}</td><td style="color: #0f172a; font-weight: 600;">${escapeHtml(value)}</td></tr>`)
      .join("")}</table></div>`,
    ctaButton: { text: "Open my training page", url: portalUrl },
  });
  return { subject, text: plain, html };
}
