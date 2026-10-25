/**
 * Offer letter e-signature emails. Builders return the same `{ subject, text, html }` shape as
 * the templates in email-templates.ts; every interpolated value is HTML-escaped.
 *
 * Wiring (outbox-processor `renderTemplate`):
 *   case OFFER_ACCEPTED_CONFIRMATION_TEMPLATE:
 *     return renderOfferAcceptedConfirmationEmail(data);
 * Until it is wired, the generic template renders the payload.
 */

import {
  buildAppUrl,
  escapeHtml,
  formatBusinessDateTime,
  formatCalendarDate,
  renderEmailShell,
} from "../email-templates";

export const OFFER_ACCEPTED_CONFIRMATION_TEMPLATE = "OFFER_ACCEPTED_CONFIRMATION";

/** NotificationOutbox payload of OFFER_ACCEPTED_CONFIRMATION. */
export interface OfferAcceptedConfirmationPayload {
  recipientName: string;
  designation: string;
  department: string;
  /** ISO instant of the expected joining day (stored at UTC midnight). */
  expectedJoiningDate: string;
  /** The name the candidate typed as their signature. */
  signedName: string;
  /** ISO instant of the acceptance. */
  signedAt: string;
  /** First 16 hex characters of the SHA-256 of the accepted letter. */
  documentHashPrefix: string;
  applicationReference: string;
  /** App-relative portal path where the signed letter can be downloaded. */
  portalPath: string;
}

type EmailContent = { subject: string; text: string; html: string };

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

/**
 * Confirmation sent to the candidate after they accept an offer electronically.
 */
export function buildOfferAcceptedConfirmationEmail(params: OfferAcceptedConfirmationPayload): EmailContent {
  const portalUrl = buildAppUrl(params.portalPath, "/candidate/applications");
  const joiningDate = formatCalendarDate(params.expectedJoiningDate);
  const acceptedAt = formatBusinessDateTime(params.signedAt);
  const rows: Array<[string, string]> = [
    ["Position", params.designation],
    ["Department", params.department],
  ];
  if (joiningDate) rows.push(["Expected Joining Date", joiningDate]);
  rows.push(
    ["Signed As", params.signedName],
    ["Accepted On", acceptedAt],
    ["Document Hash", params.documentHashPrefix],
    ["Application Ref", params.applicationReference]
  );

  const subject = `[GARA Innovation] Offer accepted: ${params.designation}`;
  const text = `Hello ${params.recipientName},\n\nThis email confirms that you accepted the offer for ${params.designation} (${params.department}) electronically.\n\n${rows
    .map(([label, value]) => `${label}: ${value}`)
    .join("\n")}\n\nYou can download your signed offer letter in your portal: ${portalUrl}\n\nIf you did not accept this offer, please contact the GARA Innovation HR team immediately.\n\n— GARA Innovation`;

  const html = renderEmailShell({
    categoryBadge: { text: "Offer Accepted", bgColor: "#ecfdf5", textColor: "#047857", borderColor: "#a7f3d0" },
    title: "Your offer acceptance is confirmed",
    salutation: `Hello ${params.recipientName},`,
    leadParagraph: `This email confirms that you accepted the offer for <strong>${escapeHtml(params.designation)}</strong> (${escapeHtml(params.department)}) electronically.`,
    contentHtml: renderRows(rows),
    ctaButton: { text: "Download signed offer letter", url: portalUrl },
    secondaryNote: {
      title: "Didn't accept this offer?",
      text: "If you did not accept this offer, please contact the GARA Innovation HR team immediately.",
      bgColor: "#fffbeb",
      borderColor: "#f59e0b",
      textColor: "#92400e",
    },
  });

  return { subject, text, html };
}

function text(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

/** Renders the confirmation from a raw outbox payload (unknown JSON). */
export function renderOfferAcceptedConfirmationEmail(payload: unknown): EmailContent {
  const data = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  const hashPrefix = text(data.documentHashPrefix, "");
  return buildOfferAcceptedConfirmationEmail({
    recipientName: text(data.recipientName, "Candidate"),
    designation: text(data.designation, "the offered position"),
    department: text(data.department, "To be confirmed"),
    expectedJoiningDate: text(data.expectedJoiningDate, ""),
    signedName: text(data.signedName, "Not recorded"),
    signedAt: text(data.signedAt, ""),
    documentHashPrefix: /^[0-9a-f]{1,64}$/.test(hashPrefix) ? hashPrefix : "Not recorded",
    applicationReference: text(data.applicationReference, "Not recorded"),
    portalPath: text(data.portalPath, "/candidate/applications"),
  });
}
