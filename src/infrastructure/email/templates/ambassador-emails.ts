/**
 * Campus Ambassador emails (Phase 4): status changes and payouts. Every interpolated value is
 * escaped; amounts arrive formatted.
 */

import { buildAppUrl, escapeHtml, renderEmailShell } from "../email-templates";

export const AMBASSADOR_STATUS_TEMPLATE = "AMBASSADOR_STATUS";
export const AMBASSADOR_PAYOUT_TEMPLATE = "AMBASSADOR_PAYOUT";

type EmailContent = { subject: string; text: string; html: string };
const PORTAL_PATH = "/candidate/ambassador";

function text(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function record(payload: unknown): Record<string, unknown> {
  return payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
}

function rowsHtml(rows: ReadonlyArray<readonly [string, string]>): string {
  return `<div style="margin: 20px 0; padding: 20px; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px;"><table width="100%" cellpadding="6" cellspacing="0" border="0" style="font-size: 13px;">${rows
    .map(
      ([label, value]) =>
        `<tr><td width="35%" style="color: #64748b; font-weight: 600; text-transform: uppercase; font-size: 11px;">${escapeHtml(label)}</td><td style="color: #0f172a; font-weight: 600; word-break: break-word;">${escapeHtml(value)}</td></tr>`
    )
    .join("")}</table></div>`;
}

export function renderAmbassadorStatusEmail(payload: unknown): EmailContent {
  const data = record(payload);
  const name = text(data.recipientName, "there");
  const status = text(data.status, "PENDING");
  const portalUrl = buildAppUrl(PORTAL_PATH, PORTAL_PATH);
  const code = typeof data.referralCode === "string" && /^GARA-[A-Z2-9]{7}$/.test(data.referralCode) ? data.referralCode : null;
  const link = typeof data.referralLink === "string" && /^https?:\/\//.test(data.referralLink) ? data.referralLink : null;
  const note = typeof data.note === "string" && data.note.trim() ? data.note.trim() : null;

  let subject: string;
  let lead: string;
  const rows: Array<[string, string]> = [];
  if (status === "APPROVED") {
    subject = "[GARA Innovation] You are a Campus Ambassador";
    lead = "Your Campus Ambassador application is approved. Share your referral link; students who enrol in Industrial Training with your code get a discount and you earn a commission once their refund window closes.";
    rows.push(["Role", data.role === "LEAD" ? "Lead" : "Associate"]);
    if (code) rows.push(["Referral code", code]);
    if (link) rows.push(["Referral link", link]);
  } else if (status === "REJECTED") {
    subject = "[GARA Innovation] Your Campus Ambassador application";
    lead = "Thank you for applying. Your Campus Ambassador application was not approved this time.";
    if (note) rows.push(["Reason", note]);
  } else {
    subject = "[GARA Innovation] Your Campus Ambassador role was deactivated";
    lead = "Your Campus Ambassador role has been deactivated. Your referral code no longer works; commissions you already earned stay in your dashboard.";
    if (note) rows.push(["Reason", note]);
  }
  const plain = `Hello ${name},\n\n${lead}\n\n${rows.map(([label, value]) => `${label}: ${value}`).join("\n")}\n\nYour dashboard: ${portalUrl}\n\n— GARA Innovation`;
  const html = renderEmailShell({
    title: subject.replace("[GARA Innovation] ", ""),
    salutation: `Hello ${name},`,
    leadParagraph: escapeHtml(lead),
    contentHtml: rows.length ? rowsHtml(rows) : "",
    ctaButton: { text: "Open my ambassador dashboard", url: portalUrl },
  });
  return { subject, text: plain, html };
}

export function renderAmbassadorPayoutEmail(payload: unknown): EmailContent {
  const data = record(payload);
  const name = text(data.recipientName, "there");
  const portalUrl = buildAppUrl(PORTAL_PATH, PORTAL_PATH);
  const rows: Array<[string, string]> = [
    ["Commission", text(data.gross, "—")],
    ["TDS deducted", text(data.tds, "—")],
    ["Amount paid", text(data.net, "—")],
    ["Bank reference (UTR)", text(data.utr, "Shown in your dashboard")],
  ];
  const lead = "Your Campus Ambassador commission has been paid.";
  const subject = "[GARA Innovation] Commission paid";
  const plain = `Hello ${name},\n\n${lead}\n\n${rows.map(([label, value]) => `${label}: ${value}`).join("\n")}\n\nYour dashboard: ${portalUrl}\n\n— GARA Innovation`;
  const html = renderEmailShell({
    categoryBadge: { text: "Commission Paid", bgColor: "#ecfdf5", textColor: "#047857", borderColor: "#a7f3d0" },
    title: "Your commission has been paid",
    salutation: `Hello ${name},`,
    leadParagraph: escapeHtml(lead),
    contentHtml: rowsHtml(rows),
    ctaButton: { text: "Open my ambassador dashboard", url: portalUrl },
  });
  return { subject, text: plain, html };
}
