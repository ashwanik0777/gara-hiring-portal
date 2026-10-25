/**
 * Centralized, enterprise-grade HTML Email Templates for GARA Innovation.
 * 
 * DESIGN PRINCIPLES:
 * 1. Clean, modern typography with system fallbacks (-apple-system, Segoe UI, Roboto).
 * 2. STRICTLY NO GRADIENTS: Solid brand colors (#2563eb royal blue, #0f172a dark slate, #f8fafc slate background).
 * 3. High-contrast, accessibility-compliant color ratios.
 * 4. Crisp official logo integration with public CDN/Vercel URL.
 * 5. Structured key-value data cards for high readability without visual clutter.
 * 6. Responsive layout (max-width 580px) tested across web, desktop, and mobile email clients.
 */

import { BUSINESS_TIME_ZONE } from "@/lib/time/business-time";

/**
 * Escapes a value for safe interpolation into HTML text or a quoted attribute.
 */
export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Returns the URL only when it is an absolute http(s) URL, otherwise null.
 * Prevents javascript:, data: and other schemes from reaching email links.
 */
export function safeHttpUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.trim() === "") {
    return null;
  }
  try {
    const parsed = new URL(value.trim());
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function getAppBaseUrl(): string {
  if (process.env.BETTER_AUTH_URL && !process.env.BETTER_AUTH_URL.includes("localhost")) {
    return process.env.BETTER_AUTH_URL.replace(/\/$/, "");
  }
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`.replace(/\/$/, "");
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`.replace(/\/$/, "");
  }
  return "https://gara-hiring-portal.vercel.app";
}

/**
 * Absolute portal URL for an app-relative path (e.g. "/admin/leave"). Anything that is not a
 * plain app path (absolute URLs, protocol-relative "//host" links) falls back to the given
 * path, so payload data can never point an email link at another site.
 */
export function buildAppUrl(path: unknown, fallbackPath = "/dashboard"): string {
  const isAppPath =
    typeof path === "string" && path.startsWith("/") && !path.startsWith("//") && !path.includes("\\");
  return `${getAppBaseUrl()}${isAppPath ? path : fallbackPath}`;
}

export interface EmailShellOptions {
  categoryBadge?: {
    text: string;
    bgColor: string;
    textColor: string;
    borderColor?: string;
  };
  /** Plain text; escaped by the shell. */
  title: string;
  /** Plain text; escaped by the shell. */
  salutation?: string;
  /** Trusted HTML; callers must escape every interpolated value. */
  leadParagraph?: string;
  /** Trusted HTML; callers must escape every interpolated value. */
  contentHtml: string;
  ctaButton?: {
    text: string;
    url: string;
  };
  secondaryNote?: {
    title?: string;
    text: string;
    bgColor?: string;
    borderColor?: string;
    textColor?: string;
  };
  footerNotice?: string;
}

/**
 * Renders the master HTML container for GARA Innovation emails.
 * Zero CSS gradients — uses solid, crisp, professional palette.
 */
export function renderEmailShell(options: EmailShellOptions): string {
  const baseUrl = getAppBaseUrl();
  const logoUrl = `${baseUrl}/brand/gara-logo.png`;
  const year = new Date().getFullYear();

  const badgeHtml = options.categoryBadge
    ? `
      <div style="margin-bottom: 16px;">
        <span style="display: inline-block; padding: 4px 12px; background-color: ${options.categoryBadge.bgColor}; color: ${options.categoryBadge.textColor}; border: 1px solid ${options.categoryBadge.borderColor || options.categoryBadge.bgColor}; border-radius: 9999px; font-size: 11px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase;">
          ${escapeHtml(options.categoryBadge.text)}
        </span>
      </div>
    `
    : "";

  const ctaUrl = options.ctaButton ? safeHttpUrl(options.ctaButton.url) : null;
  const ctaHtml = options.ctaButton && ctaUrl
    ? `
      <table cellpadding="0" cellspacing="0" border="0" style="margin: 32px 0 28px 0; width: 100%;">
        <tr>
          <td align="center">
            <a href="${escapeHtml(ctaUrl)}" target="_blank" rel="noopener noreferrer" style="display: inline-block; padding: 13px 36px; background-color: #2563eb; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 14px; line-height: 1; letter-spacing: -0.01em;">
              ${escapeHtml(options.ctaButton.text)}
            </a>
          </td>
        </tr>
      </table>
    `
    : "";

  const secondaryNoteHtml = options.secondaryNote
    ? `
      <div style="margin-top: 24px; padding: 14px 18px; background-color: ${options.secondaryNote.bgColor || "#f8fafc"}; border-left: 3px solid ${options.secondaryNote.borderColor || "#2563eb"}; border-radius: 0 8px 8px 0;">
        ${options.secondaryNote.title ? `<p style="margin: 0 0 4px 0; font-size: 13px; font-weight: 700; color: ${options.secondaryNote.textColor || "#0f172a"};">${escapeHtml(options.secondaryNote.title)}</p>` : ""}
        <p style="margin: 0; font-size: 12px; color: ${options.secondaryNote.textColor || "#475569"}; line-height: 1.5;">
          ${escapeHtml(options.secondaryNote.text)}
        </p>
      </div>
    `
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(options.title)}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased; color: #1e293b;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f1f5f9; padding: 40px 16px;">
    <tr>
      <td align="center">
        <!-- Main Card Container -->
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width: 580px; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);">
          
          <!-- Top Accent Bar (Solid Brand Color) -->
          <tr>
            <td style="height: 4px; background-color: #2563eb; line-height: 4px; font-size: 4px;">&nbsp;</td>
          </tr>

          <!-- Header Section with Brand Logo -->
          <tr>
            <td style="padding: 32px 32px 24px 32px; border-bottom: 1px solid #f1f5f9;">
              <table cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="vertical-align: middle; padding-right: 14px;">
                    <img src="${logoUrl}" alt="GARA Innovation" width="42" height="42" style="display: block; border-radius: 8px; border: 0; outline: none;" />
                  </td>
                  <td style="vertical-align: middle;">
                    <div style="font-size: 18px; font-weight: 800; color: #0f172a; letter-spacing: -0.02em; line-height: 1.2;">
                      GARA INNOVATION
                    </div>
                    <div style="font-size: 11px; font-weight: 600; color: #64748b; letter-spacing: 0.06em; text-transform: uppercase; margin-top: 2px;">
                      Talent & Workforce Operations
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body Content Area -->
          <tr>
            <td style="padding: 32px 32px 36px 32px;">
              ${badgeHtml}
              
              <h1 style="margin: 0 0 16px 0; font-size: 22px; font-weight: 700; color: #0f172a; line-height: 1.3; letter-spacing: -0.01em;">
                ${escapeHtml(options.title)}
              </h1>

              ${options.salutation ? `<p style="margin: 0 0 16px 0; font-size: 14px; font-weight: 600; color: #0f172a;">${escapeHtml(options.salutation)}</p>` : ""}

              ${options.leadParagraph ? `<p style="margin: 0 0 20px 0; font-size: 14px; color: #334155; line-height: 1.6;">${options.leadParagraph}</p>` : ""}

              ${options.contentHtml}

              ${ctaHtml}

              ${secondaryNoteHtml}
            </td>
          </tr>

          <!-- Footer Area -->
          <tr>
            <td style="padding: 24px 32px; background-color: #f8fafc; border-top: 1px solid #e2e8f0; font-size: 12px; color: #64748b; line-height: 1.5;">
              <p style="margin: 0 0 8px 0;">
                ${escapeHtml(options.footerNotice || "This is an automated notification from the GARA Innovation Talent Portal. Please do not reply directly to this email.")}
              </p>
              <div style="border-top: 1px solid #e2e8f0; margin-top: 12px; padding-top: 12px; display: flex; justify-content: space-between;">
                <span style="font-size: 11px; color: #94a3b8;">&copy; ${year} GARA Innovation. All rights reserved.</span>
              </div>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * 1. Sub-Admin Welcome Credentials Email
 */
export function buildSubAdminWelcomeEmail(params: {
  name: string;
  email: string;
  role: string;
  temporaryPassword: string;
  loginUrl?: string;
}): { subject: string; text: string; html: string } {
  const loginUrl = params.loginUrl || `${getAppBaseUrl()}/login`;

  const subject = `[GARA Innovation] Sub-Admin Account Credentials & First-Time Access`;
  const text = `Hello ${params.name},\n\nYour Sub-Admin account (${params.role}) has been provisioned on GARA Innovation.\n\nLogin Credentials:\nEmail: ${params.email}\nTemporary Password: ${params.temporaryPassword}\nLogin Portal: ${loginUrl}\n\nPlease sign in with this temporary password. Upon your first login, you will be prompted to set your own permanent password.\n\n— GARA Innovation Administration`;

  const contentHtml = `
    <div style="margin: 20px 0; padding: 20px; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px;">
      <table width="100%" cellpadding="6" cellspacing="0" border="0" style="font-size: 13px;">
        <tr>
          <td width="35%" style="color: #64748b; font-weight: 600; text-transform: uppercase; font-size: 11px; letter-spacing: 0.04em;">Assigned Role</td>
          <td style="color: #0f172a; font-weight: 700;">${escapeHtml(params.role)}</td>
        </tr>
        <tr>
          <td style="color: #64748b; font-weight: 600; text-transform: uppercase; font-size: 11px; letter-spacing: 0.04em;">Login Email</td>
          <td style="color: #0f172a; font-family: monospace; font-size: 13px;">${escapeHtml(params.email)}</td>
        </tr>
        <tr>
          <td style="color: #64748b; font-weight: 600; text-transform: uppercase; font-size: 11px; letter-spacing: 0.04em;">Temporary Password</td>
          <td>
            <span style="display: inline-block; padding: 6px 12px; background-color: #eff6ff; border: 1px solid #bfdbfe; border-radius: 6px; font-family: monospace; font-size: 14px; font-weight: 700; color: #1d4ed8; letter-spacing: 0.5px;">
              ${escapeHtml(params.temporaryPassword)}
            </span>
          </td>
        </tr>
      </table>
    </div>
  `;

  const html = renderEmailShell({
    categoryBadge: {
      text: "Staff Access",
      bgColor: "#eff6ff",
      textColor: "#1d4ed8",
      borderColor: "#bfdbfe",
    },
    title: "Your Sub-Admin Account Has Been Created",
    salutation: `Hello ${params.name},`,
    leadParagraph: "An administrative staff profile has been provisioned for you on the GARA Innovation platform with designated operational permissions.",
    contentHtml,
    ctaButton: {
      text: "Sign In & Set Permanent Password",
      url: loginUrl,
    },
    secondaryNote: {
      title: "First-Time Login Security Requirement",
      text: "For account security, you are required to establish your own strong permanent password immediately after your first sign-in.",
      bgColor: "#eff6ff",
      borderColor: "#2563eb",
      textColor: "#1e3a8a",
    },
  });

  return { subject, text, html };
}

/**
 * 2. Password Reset Link Email
 */
export function buildPasswordResetEmail(params: {
  name: string;
  resetUrl: string;
  expiresInMinutes: number;
}): { subject: string; text: string; html: string } {
  const subject = `[GARA Innovation] Reset Your Password`;
  const text = `Hello ${params.name},\n\nA password reset was requested for your GARA Innovation account.\n\nReset your password using this link (valid for ${params.expiresInMinutes} minutes, single use):\n${params.resetUrl}\n\nIf you did not request this, you can ignore this email — your current password stays unchanged.\n\n— GARA Innovation Security`;

  const contentHtml = `
    <p style="margin: 0 0 12px 0; font-size: 13px; color: #334155; line-height: 1.6;">
      This link is valid for <strong>${escapeHtml(params.expiresInMinutes)} minutes</strong> and can be used once.
      Your current password keeps working until you choose a new one.
    </p>
  `;

  const html = renderEmailShell({
    categoryBadge: {
      text: "Account Security",
      bgColor: "#fef2f2",
      textColor: "#991b1b",
      borderColor: "#fecaca",
    },
    title: "Password Reset Request",
    salutation: `Hello ${params.name},`,
    leadParagraph: "We received a request to reset the password for your GARA Innovation account.",
    contentHtml,
    ctaButton: {
      text: "Choose a New Password",
      url: params.resetUrl,
    },
    secondaryNote: {
      title: "Didn't request this?",
      text: "You can safely ignore this email. Nobody can change your password without this link.",
      bgColor: "#fef2f2",
      borderColor: "#dc2626",
      textColor: "#991b1b",
    },
  });

  return { subject, text, html };
}

/**
 * 3. Application Submission Confirmation
 */
export function buildApplicationConfirmationEmail(params: {
  candidateName: string;
  openingTitle: string;
  referenceCode: string;
  submittedAt?: string;
  portalUrl?: string;
}): { subject: string; text: string; html: string } {
  const portalUrl = params.portalUrl || `${getAppBaseUrl()}/candidate/dashboard`;

  const subject = `[GARA Innovation] Application Received: ${params.openingTitle} (${params.referenceCode})`;
  const text = `Hello ${params.candidateName},\n\nThank you for applying for the position of ${params.openingTitle} at GARA Innovation.\n\nApplication Reference Code: ${params.referenceCode}\n\nOur recruitment team is reviewing your profile and credentials. You can monitor your application status anytime via the Candidate Portal: ${portalUrl}\n\n— GARA Innovation Recruitment Team`;

  const contentHtml = `
    <div style="margin: 20px 0; padding: 20px; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px;">
      <table width="100%" cellpadding="6" cellspacing="0" border="0" style="font-size: 13px;">
        <tr>
          <td width="35%" style="color: #64748b; font-weight: 600; text-transform: uppercase; font-size: 11px; letter-spacing: 0.04em;">Position Applied</td>
          <td style="color: #0f172a; font-weight: 700;">${escapeHtml(params.openingTitle)}</td>
        </tr>
        <tr>
          <td style="color: #64748b; font-weight: 600; text-transform: uppercase; font-size: 11px; letter-spacing: 0.04em;">Reference Code</td>
          <td style="color: #0f172a; font-family: monospace; font-weight: 700;">${escapeHtml(params.referenceCode)}</td>
        </tr>
        <tr>
          <td style="color: #64748b; font-weight: 600; text-transform: uppercase; font-size: 11px; letter-spacing: 0.04em;">Submission Date</td>
          <td style="color: #334155;">${params.submittedAt ? new Date(params.submittedAt).toLocaleDateString() : new Date().toLocaleDateString()}</td>
        </tr>
      </table>
    </div>
  `;

  const html = renderEmailShell({
    categoryBadge: {
      text: "Recruitment",
      bgColor: "#f0fdf4",
      textColor: "#166534",
      borderColor: "#bbf7d0",
    },
    title: "Application Received Successfully",
    salutation: `Dear ${params.candidateName},`,
    leadParagraph: `Thank you for your interest in joining GARA Innovation. Your application for <strong>${escapeHtml(params.openingTitle)}</strong> has been logged into our hiring pipeline.`,
    contentHtml,
    ctaButton: {
      text: "Track Application Status",
      url: portalUrl,
    },
    secondaryNote: {
      title: "What Happens Next?",
      text: "Our hiring team will carefully evaluate your qualifications. If shortlisted, you will receive an interview invitation via email and in your portal.",
      bgColor: "#f0fdf4",
      borderColor: "#16a34a",
      textColor: "#14532d",
    },
  });

  return { subject, text, html };
}

/** Who an interview email is addressed to. */
export type InterviewRecipientRole = "CANDIDATE" | "INTERVIEWER";

const CALENDAR_INVITE_NOTE = "A calendar invitation is attached so you can add it to your calendar.";

/**
 * 4. Interview Invitation (candidate), or interview assignment (interviewer)
 */
export function buildInterviewInvitationEmail(params: {
  candidateName: string;
  openingTitle: string;
  roundName: string;
  scheduledAt: string;
  durationMinutes: number;
  meetingLink?: string | null;
  referenceCode?: string;
  portalUrl?: string;
  /** Defaults to the candidate. */
  recipientRole?: InterviewRecipientRole;
  /** Interviewer's name (interviewer emails); the candidate's name is used otherwise. */
  recipientName?: string;
  /** App-relative page for the recipient (e.g. the application or the interview board). */
  href?: string;
  /** Mentions the attached .ics invite. */
  hasCalendarInvite?: boolean;
}): { subject: string; text: string; html: string } {
  const isInterviewer = params.recipientRole === "INTERVIEWER";
  const portalUrl =
    params.portalUrl || buildAppUrl(params.href, isInterviewer ? "/dashboard" : "/candidate/dashboard");
  const formattedDate = formatBusinessDateTime(params.scheduledAt);
  const meetingLink = safeHttpUrl(params.meetingLink);
  const calendarNote = params.hasCalendarInvite ? `${CALENDAR_INVITE_NOTE}\n\n` : "";

  if (isInterviewer) {
    const recipientName = params.recipientName || "there";
    const rows: Array<[string, string]> = [
      ["Candidate", params.candidateName],
      ["Position", params.openingTitle],
      ["Interview Round", params.roundName],
      ["Date & Time", formattedDate],
      ["Duration", `${params.durationMinutes} minutes`],
    ];
    if (meetingLink) rows.push(["Meeting Link", meetingLink]);
    const lead = `You have been assigned to interview ${params.candidateName} (${params.roundName}, ${params.openingTitle}).`;

    const subject = `[GARA Innovation] Interview assigned: ${params.candidateName} (${params.roundName})`;
    const text = `Hello ${recipientName},\n\n${lead}\n\n${detailLines(rows)}\n\n${calendarNote}Interview details: ${portalUrl}\n\n— GARA Innovation`;
    const html = renderEmailShell({
      categoryBadge: { text: "Interview Assigned", bgColor: "#eff6ff", textColor: "#1d4ed8", borderColor: "#bfdbfe" },
      title: "You have an interview to conduct",
      salutation: `Hello ${recipientName},`,
      leadParagraph: escapeHtml(lead),
      contentHtml: renderDetailCard(rows),
      ctaButton: { text: "View Interview Details", url: portalUrl },
      ...(params.hasCalendarInvite ? { secondaryNote: { text: CALENDAR_INVITE_NOTE } } : {}),
    });
    return { subject, text, html };
  }

  const subject = `[GARA Innovation] Interview Scheduled: ${params.roundName} (${params.openingTitle})`;
  const text = `Hello ${params.candidateName},\n\nYou have been shortlisted for an interview round for the position of ${params.openingTitle}.\n\nInterview Round: ${params.roundName}\nDate & Time: ${formattedDate}\nDuration: ${params.durationMinutes} minutes\n${meetingLink ? `Meeting Link: ${meetingLink}\n` : ""}Candidate Portal: ${portalUrl}\n\n${calendarNote}Please be prepared 5 minutes prior to the scheduled time.\n\n— GARA Innovation Talent Acquisition`;

  const contentHtml = `
    <div style="margin: 20px 0; padding: 20px; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px;">
      <table width="100%" cellpadding="6" cellspacing="0" border="0" style="font-size: 13px;">
        <tr>
          <td width="35%" style="color: #64748b; font-weight: 600; text-transform: uppercase; font-size: 11px; letter-spacing: 0.04em;">Position</td>
          <td style="color: #0f172a; font-weight: 700;">${escapeHtml(params.openingTitle)}</td>
        </tr>
        <tr>
          <td style="color: #64748b; font-weight: 600; text-transform: uppercase; font-size: 11px; letter-spacing: 0.04em;">Interview Round</td>
          <td style="color: #0f172a; font-weight: 600;">${escapeHtml(params.roundName)}</td>
        </tr>
        <tr>
          <td style="color: #64748b; font-weight: 600; text-transform: uppercase; font-size: 11px; letter-spacing: 0.04em;">Date & Time</td>
          <td style="color: #1d4ed8; font-weight: 700;">${escapeHtml(formattedDate)}</td>
        </tr>
        <tr>
          <td style="color: #64748b; font-weight: 600; text-transform: uppercase; font-size: 11px; letter-spacing: 0.04em;">Duration</td>
          <td style="color: #334155;">${escapeHtml(params.durationMinutes)} minutes</td>
        </tr>
        ${
          meetingLink
            ? `
          <tr>
            <td style="color: #64748b; font-weight: 600; text-transform: uppercase; font-size: 11px; letter-spacing: 0.04em;">Meeting Link</td>
            <td>
              <a href="${escapeHtml(meetingLink)}" target="_blank" rel="noopener noreferrer" style="color: #2563eb; text-decoration: underline; font-weight: 600; word-break: break-all;">
                ${escapeHtml(meetingLink)}
              </a>
            </td>
          </tr>
        `
            : ""
        }
      </table>
    </div>
  `;

  const html = renderEmailShell({
    categoryBadge: {
      text: "Interview Invitation",
      bgColor: "#eff6ff",
      textColor: "#1d4ed8",
      borderColor: "#bfdbfe",
    },
    title: "Interview Round Scheduled",
    salutation: `Dear ${params.candidateName},`,
    leadParagraph: `Congratulations! We were impressed by your profile and are pleased to invite you to the <strong>${escapeHtml(params.roundName)}</strong> for <strong>${escapeHtml(params.openingTitle)}</strong>.`,
    contentHtml,
    ctaButton: {
      text: meetingLink ? "Join Meeting / View Portal" : "View Interview Details",
      url: meetingLink || portalUrl,
    },
    secondaryNote: {
      title: "Preparation Guidelines",
      text: `Please ensure a stable internet connection, a quiet environment, and have your camera enabled. Please join 5 minutes ahead of schedule.${params.hasCalendarInvite ? ` ${CALENDAR_INVITE_NOTE}` : ""}`,
      bgColor: "#eff6ff",
      borderColor: "#2563eb",
      textColor: "#1e3a8a",
    },
  });

  return { subject, text, html };
}

/**
 * 5. Application Stage Update / Status Change
 */
export function buildApplicationStageUpdateEmail(params: {
  candidateName: string;
  openingTitle: string;
  referenceCode: string;
  newStatus: string;
  message?: string;
  portalUrl?: string;
}): { subject: string; text: string; html: string } {
  const portalUrl = params.portalUrl || `${getAppBaseUrl()}/candidate/dashboard`;

  const subject = `[GARA Innovation] Update on Application (${params.referenceCode}): ${params.openingTitle}`;
  const text = `Hello ${params.candidateName},\n\nThere is an update on your application for ${params.openingTitle} (Ref: ${params.referenceCode}).\n\nCurrent Status: ${params.newStatus}\n${params.message ? `Details: ${params.message}\n` : ""}Check your full application progress at: ${portalUrl}\n\n— GARA Innovation Recruitment`;

  const contentHtml = `
    <div style="margin: 20px 0; padding: 20px; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px;">
      <table width="100%" cellpadding="6" cellspacing="0" border="0" style="font-size: 13px;">
        <tr>
          <td width="35%" style="color: #64748b; font-weight: 600; text-transform: uppercase; font-size: 11px; letter-spacing: 0.04em;">Role</td>
          <td style="color: #0f172a; font-weight: 700;">${escapeHtml(params.openingTitle)}</td>
        </tr>
        <tr>
          <td style="color: #64748b; font-weight: 600; text-transform: uppercase; font-size: 11px; letter-spacing: 0.04em;">Reference</td>
          <td style="color: #0f172a; font-family: monospace;">${escapeHtml(params.referenceCode)}</td>
        </tr>
        <tr>
          <td style="color: #64748b; font-weight: 600; text-transform: uppercase; font-size: 11px; letter-spacing: 0.04em;">Updated Status</td>
          <td style="color: #0f172a; font-weight: 700;">${escapeHtml(params.newStatus.replace(/_/g, " "))}</td>
        </tr>
      </table>
    </div>
    ${
      params.message
        ? `
      <div style="margin: 16px 0; padding: 14px 18px; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px;">
        <div style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; margin-bottom: 6px;">Message from Hiring Team</div>
        <div style="font-size: 13px; color: #334155; line-height: 1.5; white-space: pre-line;">${escapeHtml(params.message)}</div>
      </div>
    `
        : ""
    }
  `;

  const html = renderEmailShell({
    categoryBadge: {
      text: "Pipeline Update",
      bgColor: "#f1f5f9",
      textColor: "#334155",
      borderColor: "#cbd5e1",
    },
    title: "Application Status Update",
    salutation: `Hello ${params.candidateName},`,
    leadParagraph: `Your application for <strong>${escapeHtml(params.openingTitle)}</strong> has progressed in our evaluation process.`,
    contentHtml,
    ctaButton: {
      text: "View in Candidate Portal",
      url: portalUrl,
    },
  });

  return { subject, text, html };
}

/**
 * 6. Supervised Evaluation Selection Notification
 */
export function buildEvaluationSelectionEmail(params: {
  candidateName: string;
  openingTitle: string;
  workingDays?: number;
  portalUrl?: string;
}): { subject: string; text: string; html: string } {
  const portalUrl = params.portalUrl || `${getAppBaseUrl()}/candidate/dashboard`;
  const days = params.workingDays || 7;

  const subject = `[GARA Innovation] Selected for ${days}-Working-Day Supervised Evaluation`;
  const text = `Congratulations ${params.candidateName}!\n\nYou have been selected for the GARA Innovation ${days}-working-day supervised evaluation period for ${params.openingTitle}.\n\nPlease access your evaluation cockpit at: ${portalUrl}\n\n— GARA Innovation`;

  const contentHtml = `
    <div style="margin: 20px 0; padding: 20px; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px;">
      <table width="100%" cellpadding="6" cellspacing="0" border="0" style="font-size: 13px;">
        <tr>
          <td width="35%" style="color: #64748b; font-weight: 600; text-transform: uppercase; font-size: 11px; letter-spacing: 0.04em;">Selected Position</td>
          <td style="color: #0f172a; font-weight: 700;">${escapeHtml(params.openingTitle)}</td>
        </tr>
        <tr>
          <td style="color: #64748b; font-weight: 600; text-transform: uppercase; font-size: 11px; letter-spacing: 0.04em;">Program Duration</td>
          <td style="color: #15803d; font-weight: 700;">${escapeHtml(days)} Working Days</td>
        </tr>
      </table>
    </div>
  `;

  const html = renderEmailShell({
    categoryBadge: {
      text: "Evaluation Milestone",
      bgColor: "#f0fdf4",
      textColor: "#166534",
      borderColor: "#bbf7d0",
    },
    title: "Selected for Supervised Evaluation",
    salutation: `Congratulations ${params.candidateName}!`,
    leadParagraph: `We are pleased to inform you that you have been selected for the GARA Innovation <strong>${escapeHtml(days)}-working-day supervised evaluation period</strong> for <strong>${escapeHtml(params.openingTitle)}</strong>.`,
    contentHtml,
    ctaButton: {
      text: "Open Evaluation Cockpit",
      url: portalUrl,
    },
    secondaryNote: {
      title: "Next Steps",
      text: "Log in to your candidate portal to complete your onboarding checklist and review your assigned mentor and evaluation tasks.",
      bgColor: "#f0fdf4",
      borderColor: "#16a34a",
      textColor: "#14532d",
    },
  });

  return { subject, text, html };
}

/**
 * 7. Job Offer Extended Email
 */
export function buildJobOfferEmail(params: {
  candidateName: string;
  designation: string;
  department: string;
  expectedJoiningDate: string;
  applicationReference?: string;
  portalUrl?: string;
}): { subject: string; text: string; html: string } {
  const portalUrl = params.portalUrl || `${getAppBaseUrl()}/candidate/dashboard`;
  const joiningDateFormatted = new Date(params.expectedJoiningDate).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const subject = `[GARA Innovation] Formal Job Offer: ${params.designation}`;
  const text = `Congratulations ${params.candidateName}!\n\nGARA Innovation is pleased to extend a formal offer for the position of ${params.designation} (${params.department}).\n\nExpected Joining Date: ${joiningDateFormatted}\nReview your offer in the portal: ${portalUrl}\n\n— GARA Innovation Leadership`;

  const contentHtml = `
    <div style="margin: 20px 0; padding: 20px; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px;">
      <table width="100%" cellpadding="6" cellspacing="0" border="0" style="font-size: 13px;">
        <tr>
          <td width="35%" style="color: #64748b; font-weight: 600; text-transform: uppercase; font-size: 11px; letter-spacing: 0.04em;">Offered Role</td>
          <td style="color: #0f172a; font-weight: 700;">${escapeHtml(params.designation)}</td>
        </tr>
        <tr>
          <td style="color: #64748b; font-weight: 600; text-transform: uppercase; font-size: 11px; letter-spacing: 0.04em;">Department</td>
          <td style="color: #0f172a;">${escapeHtml(params.department)}</td>
        </tr>
        <tr>
          <td style="color: #64748b; font-weight: 600; text-transform: uppercase; font-size: 11px; letter-spacing: 0.04em;">Joining Date</td>
          <td style="color: #1d4ed8; font-weight: 700;">${escapeHtml(joiningDateFormatted)}</td>
        </tr>
        ${
          params.applicationReference
            ? `
          <tr>
            <td style="color: #64748b; font-weight: 600; text-transform: uppercase; font-size: 11px; letter-spacing: 0.04em;">Application Ref</td>
            <td style="color: #0f172a; font-family: monospace;">${escapeHtml(params.applicationReference)}</td>
          </tr>
        `
            : ""
        }
      </table>
    </div>
  `;

  const html = renderEmailShell({
    categoryBadge: {
      text: "Offer Extended",
      bgColor: "#ecfdf5",
      textColor: "#047857",
      borderColor: "#a7f3d0",
    },
    title: "Formal Offer of Employment",
    salutation: `Dear ${params.candidateName},`,
    leadParagraph: `Following your successful evaluation, GARA Innovation is delighted to extend a formal offer of employment for the position of <strong>${escapeHtml(params.designation)}</strong>.`,
    contentHtml,
    ctaButton: {
      text: "Review & Accept Offer",
      url: portalUrl,
    },
    secondaryNote: {
      title: "Action Required",
      text: "Please sign in to your candidate portal to inspect your detailed offer letter, compensation structure, and confirm your acceptance.",
      bgColor: "#ecfdf5",
      borderColor: "#10b981",
      textColor: "#065f46",
    },
  });

  return { subject, text, html };
}

/** Formats a stored joining date (a calendar day at UTC midnight) without shifting the day. */
function formatJoiningDate(value: string | undefined): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleDateString("en-GB", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

interface JoinedEmailParams {
  recipientName: string;
  employeeCode?: string;
  department?: string;
  designation?: string;
  joiningDate?: string;
  portalUrl?: string;
  /** The person exited earlier and re-joined with the same account ("Welcome back"). */
  isRejoin?: boolean;
}

/** Shared escaped detail card and feature list for the joining welcome emails. */
function renderJoinedEmailContent(params: JoinedEmailParams, features: readonly string[]): string {
  const joiningDate = formatJoiningDate(params.joiningDate);
  const rows: Array<[string, string]> = [];
  if (params.designation) rows.push(["Designation", params.designation]);
  if (params.department) rows.push(["Department", params.department]);
  if (params.employeeCode) rows.push(["Employee Code", params.employeeCode]);
  if (joiningDate) rows.push(["Joining Date", joiningDate]);

  const rowsHtml = rows
    .map(
      ([label, value]) => `
        <tr>
          <td width="35%" style="color: #64748b; font-weight: 600; text-transform: uppercase; font-size: 11px; letter-spacing: 0.04em;">${escapeHtml(label)}</td>
          <td style="color: #0f172a; font-weight: 600;">${escapeHtml(value)}</td>
        </tr>`
    )
    .join("");

  const featuresHtml = features
    .map(
      (feature) =>
        `<li style="margin: 0 0 6px 0; font-size: 13px; color: #334155;">${escapeHtml(feature)}</li>`
    )
    .join("");

  return `
    ${
      rowsHtml
        ? `<div style="margin: 20px 0; padding: 20px; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px;">
      <table width="100%" cellpadding="6" cellspacing="0" border="0" style="font-size: 13px;">${rowsHtml}
      </table>
    </div>`
        : ""
    }
    <p style="margin: 0 0 8px 0; font-size: 13px; font-weight: 700; color: #0f172a;">Now available in your portal</p>
    <ul style="margin: 0 0 4px 0; padding-left: 20px;">${featuresHtml}</ul>
  `;
}

function joinedEmailText(
  greeting: string,
  intro: string,
  params: JoinedEmailParams,
  features: readonly string[],
  portalUrl: string
): string {
  const joiningDate = formatJoiningDate(params.joiningDate);
  const details = [
    params.designation ? `Designation: ${params.designation}` : null,
    params.department ? `Department: ${params.department}` : null,
    params.employeeCode ? `Employee Code: ${params.employeeCode}` : null,
    joiningDate ? `Joining Date: ${joiningDate}` : null,
  ].filter((line): line is string => line !== null);
  return `${greeting}\n\n${intro}\n\n${details.length > 0 ? `${details.join("\n")}\n\n` : ""}Now available in your portal:\n${features.map((f) => `- ${f}`).join("\n")}\n\nOpen your portal: ${portalUrl}\n\n— GARA Innovation`;
}

/** Features unlocked by joining as an intern (mirrors the INTERN portal stage). */
export const INTERN_JOINED_FEATURES = [
  "Intern workspace",
  "Attendance",
  "Leave requests",
  "Payslips",
  "ID card & certificate",
] as const;

/** Features unlocked by joining as an employee (mirrors the EMPLOYEE portal stage). */
export const EMPLOYEE_JOINED_FEATURES = ["Employee home", "Attendance", "Leave requests", "Payslips"] as const;

/**
 * 8. Intern Joined Welcome Email (evaluation passed + HR "Mark as joined")
 */
export function buildInternJoinedEmail(
  params: JoinedEmailParams & { openingTitle?: string }
): { subject: string; text: string; html: string } {
  const portalUrl = params.portalUrl || `${getAppBaseUrl()}/intern/dashboard`;
  const programme = params.openingTitle ? ` for ${params.openingTitle}` : "";
  const rejoin = params.isRejoin === true;
  const greeting = rejoin ? `Welcome back ${params.recipientName}!` : `Welcome ${params.recipientName}!`;
  const joinedVerb = rejoin ? "re-joined" : "officially joined";

  const subject = rejoin
    ? "[GARA Innovation] Welcome back: you have re-joined as an intern"
    : "[GARA Innovation] Welcome aboard: you have joined as an intern";
  const text = joinedEmailText(
    greeting,
    `You have ${joinedVerb} GARA Innovation as an intern${programme}.`,
    params,
    INTERN_JOINED_FEATURES,
    portalUrl
  );

  const html = renderEmailShell({
    categoryBadge: {
      text: rejoin ? "Re-joined as Intern" : "Joined as Intern",
      bgColor: "#f0fdf4",
      textColor: "#166534",
      borderColor: "#bbf7d0",
    },
    title: rejoin ? "Welcome back to GARA Innovation" : "Welcome to GARA Innovation",
    salutation: greeting,
    leadParagraph: `You have ${joinedVerb} GARA Innovation as an intern${
      params.openingTitle ? ` for <strong>${escapeHtml(params.openingTitle)}</strong>` : ""
    }. Your intern workspace is ready.`,
    contentHtml: renderJoinedEmailContent(params, INTERN_JOINED_FEATURES),
    ctaButton: {
      text: "Open Intern Workspace",
      url: portalUrl,
    },
  });

  return { subject, text, html };
}

/**
 * 9. Employee Joined Welcome Email (accepted offer + HR "Mark as joined")
 */
export function buildEmployeeJoinedEmail(
  params: JoinedEmailParams
): { subject: string; text: string; html: string } {
  const portalUrl = params.portalUrl || `${getAppBaseUrl()}/hrms`;
  const rejoin = params.isRejoin === true;
  const greeting = rejoin ? `Welcome back ${params.recipientName}!` : `Welcome ${params.recipientName}!`;
  const joinedVerb = rejoin ? "re-joined" : "officially joined";

  const subject = rejoin
    ? "[GARA Innovation] Welcome back: you have re-joined the team"
    : "[GARA Innovation] Welcome aboard: you have joined the team";
  const text = joinedEmailText(
    greeting,
    `You have ${joinedVerb} GARA Innovation as an employee.`,
    params,
    EMPLOYEE_JOINED_FEATURES,
    portalUrl
  );

  const html = renderEmailShell({
    categoryBadge: {
      text: rejoin ? "Re-joined as Employee" : "Joined as Employee",
      bgColor: "#eff6ff",
      textColor: "#1d4ed8",
      borderColor: "#bfdbfe",
    },
    title: rejoin ? "Welcome back to GARA Innovation" : "Welcome to GARA Innovation",
    salutation: greeting,
    leadParagraph: `You have ${joinedVerb} GARA Innovation${
      params.designation ? ` as <strong>${escapeHtml(params.designation)}</strong>` : ""
    }. Your employee home is ready.`,
    contentHtml: renderJoinedEmailContent(params, EMPLOYEE_JOINED_FEATURES),
    ctaButton: {
      text: "Open Employee Home",
      url: portalUrl,
    },
  });

  return { subject, text, html };
}

// -----------------------------------------------------------------------------
// Round 3: conversion, re-joining, reminders and the staff daily digest
// -----------------------------------------------------------------------------

type EmailContent = { subject: string; text: string; html: string };

const LABEL_CELL_STYLE =
  "color: #64748b; font-weight: 600; text-transform: uppercase; font-size: 11px; letter-spacing: 0.04em;";

/** Escaped key-value detail card shared by the templates below. */
function renderDetailCard(rows: ReadonlyArray<readonly [string, string]>): string {
  if (rows.length === 0) return "";
  const rowsHtml = rows
    .map(
      ([label, value]) => `
        <tr>
          <td width="35%" style="${LABEL_CELL_STYLE}">${escapeHtml(label)}</td>
          <td style="color: #0f172a; font-weight: 600;">${escapeHtml(value)}</td>
        </tr>`
    )
    .join("");
  return `
    <div style="margin: 20px 0; padding: 20px; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px;">
      <table width="100%" cellpadding="6" cellspacing="0" border="0" style="font-size: 13px;">${rowsHtml}
      </table>
    </div>`;
}

/** Escaped "message from HR" block for a review summary that staff chose to share. */
function renderSharedSummary(summary: string | undefined): string {
  if (!summary) return "";
  return `
    <div style="margin: 16px 0; padding: 14px 18px; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px;">
      <div style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; margin-bottom: 6px;">Summary from your review</div>
      <div style="font-size: 13px; color: #334155; line-height: 1.5; white-space: pre-line;">${escapeHtml(summary)}</div>
    </div>`;
}

/** Plain-text detail lines, skipping empty values. */
function detailLines(rows: ReadonlyArray<readonly [string, string]>): string {
  return rows.map(([label, value]) => `${label}: ${value}`).join("\n");
}

/** Formats a calendar day stored at UTC midnight (e.g. an effective date) without shifting it. */
export function formatCalendarDate(value: string | undefined): string | null {
  return formatJoiningDate(value);
}

/** Formats an instant (e.g. an interview start) in the business time zone, with the zone shown. */
export function formatBusinessDateTime(value: string, timeZone = BUSINESS_TIME_ZONE): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "To be confirmed";
  return parsed.toLocaleString("en-GB", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
    timeZoneName: "short",
  });
}

/** Shows at most `limit` list entries in an email and says how many more there are. */
const EMAIL_LIST_LIMIT = 20;

function renderItemList(lines: readonly string[]): string {
  const shown = lines.slice(0, EMAIL_LIST_LIMIT);
  const more = lines.length - shown.length;
  return `
    <ul style="margin: 0 0 8px 0; padding-left: 20px;">${shown
      .map((line) => `<li style="margin: 0 0 6px 0; font-size: 13px; color: #334155;">${escapeHtml(line)}</li>`)
      .join("")}</ul>
    ${more > 0 ? `<p style="margin: 0; font-size: 12px; color: #64748b;">and ${escapeHtml(more)} more</p>` : ""}`;
}

function textItemList(lines: readonly string[]): string {
  const shown = lines.slice(0, EMAIL_LIST_LIMIT);
  const more = lines.length - shown.length;
  return `${shown.map((line) => `- ${line}`).join("\n")}${more > 0 ? `\nand ${more} more` : ""}`;
}

/**
 * 10. Intern → full-time offer after a CONVERT progress-review outcome
 */
export function buildConversionOfferExtendedEmail(params: {
  recipientName: string;
  proposedDesignation: string;
  proposedDepartment: string;
  effectiveDate?: string;
  sharedSummary?: string;
}): EmailContent {
  const portalUrl = buildAppUrl("/intern/dashboard");
  const effectiveDate = formatCalendarDate(params.effectiveDate);
  const rows: Array<[string, string]> = [
    ["Offered Role", params.proposedDesignation],
    ["Department", params.proposedDepartment],
  ];
  if (effectiveDate) rows.push(["Effective Date", effectiveDate]);

  const subject = `[GARA Innovation] Full-time offer: ${params.proposedDesignation}`;
  const text = `Hello ${params.recipientName},\n\nFollowing your internship progress review, GARA Innovation is offering you a full-time position.\n\n${detailLines(rows)}\n${params.sharedSummary ? `\nSummary from your review:\n${params.sharedSummary}\n` : ""}\nPlease accept or decline the offer in your intern workspace: ${portalUrl}\n\n— GARA Innovation`;

  const html = renderEmailShell({
    categoryBadge: { text: "Full-time Offer", bgColor: "#ecfdf5", textColor: "#047857", borderColor: "#a7f3d0" },
    title: "You have a full-time offer",
    salutation: `Hello ${params.recipientName},`,
    leadParagraph: `Following your internship progress review, GARA Innovation is offering you the full-time position of <strong>${escapeHtml(params.proposedDesignation)}</strong>.`,
    contentHtml: `${renderDetailCard(rows)}${renderSharedSummary(params.sharedSummary)}`,
    ctaButton: { text: "Review the offer", url: portalUrl },
    secondaryNote: {
      title: "Action required",
      text: "Please accept or decline the offer in your intern workspace. Once accepted, the change takes effect on the effective date.",
      bgColor: "#ecfdf5",
      borderColor: "#10b981",
      textColor: "#065f46",
    },
  });

  return { subject, text, html };
}

/**
 * 11. Intern → full-time conversion took effect
 */
export function buildConversionCompletedEmail(params: {
  recipientName: string;
  designation: string;
  department: string;
  effectiveDate?: string;
}): EmailContent {
  const portalUrl = buildAppUrl("/hrms");
  const effectiveDate = formatCalendarDate(params.effectiveDate);
  const rows: Array<[string, string]> = [
    ["Designation", params.designation],
    ["Department", params.department],
  ];
  if (effectiveDate) rows.push(["Effective Date", effectiveDate]);

  const subject = "[GARA Innovation] You are now a full-time employee";
  const text = `Congratulations ${params.recipientName}!\n\nYour move from intern to full-time employee has taken effect.\n\n${detailLines(rows)}\n\nNow available in your portal:\n${textItemList(EMPLOYEE_JOINED_FEATURES)}\n\nOpen your employee home: ${portalUrl}\n\n— GARA Innovation`;

  const html = renderEmailShell({
    categoryBadge: { text: "Now Full-time", bgColor: "#eff6ff", textColor: "#1d4ed8", borderColor: "#bfdbfe" },
    title: "Welcome to the full-time team",
    salutation: `Congratulations ${params.recipientName}!`,
    leadParagraph: `Your move from intern to full-time employee as <strong>${escapeHtml(params.designation)}</strong> has taken effect.`,
    contentHtml: `${renderDetailCard(rows)}
      <p style="margin: 0 0 8px 0; font-size: 13px; font-weight: 700; color: #0f172a;">Now available in your portal</p>
      ${renderItemList(EMPLOYEE_JOINED_FEATURES)}`,
    ctaButton: { text: "Open Employee Home", url: portalUrl },
  });

  return { subject, text, html };
}

/**
 * 12. Internship continues after an EXTEND progress-review outcome
 */
export function buildInternshipReviewExtendedEmail(params: {
  recipientName: string;
  nextReviewDate?: string;
  sharedSummary?: string;
}): EmailContent {
  const portalUrl = buildAppUrl("/intern/dashboard");
  const nextReview = formatCalendarDate(params.nextReviewDate);
  const rows: Array<[string, string]> = nextReview ? [["Next Progress Review", nextReview]] : [];

  const subject = "[GARA Innovation] Your internship continues";
  const text = `Hello ${params.recipientName},\n\nYour internship progress review is complete and your internship continues.\n${rows.length > 0 ? `\n${detailLines(rows)}\n` : ""}${params.sharedSummary ? `\nSummary from your review:\n${params.sharedSummary}\n` : ""}\nOpen your intern workspace: ${portalUrl}\n\n— GARA Innovation`;

  const html = renderEmailShell({
    categoryBadge: { text: "Progress Review", bgColor: "#eff6ff", textColor: "#1d4ed8", borderColor: "#bfdbfe" },
    title: "Your internship continues",
    salutation: `Hello ${params.recipientName},`,
    leadParagraph: "Your internship progress review is complete and your internship continues.",
    contentHtml: `${renderDetailCard(rows)}${renderSharedSummary(params.sharedSummary)}`,
    ctaButton: { text: "Open Intern Workspace", url: portalUrl },
  });

  return { subject, text, html };
}

/**
 * 13. Internship ends after an END_INTERNSHIP progress-review outcome
 */
export function buildInternshipEndingEmail(params: {
  recipientName: string;
  sharedSummary?: string;
}): EmailContent {
  const portalUrl = buildAppUrl("/dashboard");

  const subject = "[GARA Innovation] Outcome of your internship progress review";
  const text = `Hello ${params.recipientName},\n\nYour internship progress review is complete. The outcome is that your internship with GARA Innovation will end.\n${params.sharedSummary ? `\nSummary from your review:\n${params.sharedSummary}\n` : ""}\nIf you have any questions, please contact the HR team.\n\nOpen your portal: ${portalUrl}\n\n— GARA Innovation`;

  const html = renderEmailShell({
    categoryBadge: { text: "Progress Review", bgColor: "#f1f5f9", textColor: "#334155", borderColor: "#cbd5e1" },
    title: "Outcome of your progress review",
    salutation: `Hello ${params.recipientName},`,
    leadParagraph:
      "Your internship progress review is complete. The outcome is that your internship with GARA Innovation will end. Thank you for your contributions.",
    contentHtml: renderSharedSummary(params.sharedSummary),
    ctaButton: { text: "Open Your Portal", url: portalUrl },
    secondaryNote: { text: "If you have any questions about this outcome, please contact the HR team." },
  });

  return { subject, text, html };
}

/**
 * 14. Evaluation supervisor changed (sent to the intern and to supervisors)
 */
export function buildEvaluationSupervisorChangedEmail(params: {
  recipientName: string;
  recipientRole: "INTERN" | "SUPERVISOR";
  internName: string;
  openingTitle: string;
  newSupervisorName: string;
}): EmailContent {
  const isIntern = params.recipientRole === "INTERN";
  const portalUrl = buildAppUrl(isIntern ? "/intern/dashboard" : "/dashboard");
  const rows: Array<[string, string]> = [
    ["Intern", params.internName],
    ["Programme", params.openingTitle],
    ["Supervisor", params.newSupervisorName],
  ];
  const lead = isIntern
    ? `Your evaluation for ${params.openingTitle} now has a new supervisor: ${params.newSupervisorName}.`
    : `The supervisor for ${params.internName}'s evaluation (${params.openingTitle}) is now ${params.newSupervisorName}.`;

  const subject = "[GARA Innovation] Evaluation supervisor updated";
  const text = `Hello ${params.recipientName},\n\n${lead}\n\n${detailLines(rows)}\n\nOpen your portal: ${portalUrl}\n\n— GARA Innovation`;

  const html = renderEmailShell({
    categoryBadge: { text: "Evaluation", bgColor: "#f0fdf4", textColor: "#166534", borderColor: "#bbf7d0" },
    title: "Evaluation supervisor updated",
    salutation: `Hello ${params.recipientName},`,
    leadParagraph: escapeHtml(lead),
    contentHtml: renderDetailCard(rows),
    ctaButton: { text: isIntern ? "Open Evaluation Workspace" : "Open Your Portal", url: portalUrl },
  });

  return { subject, text, html };
}

/**
 * 15. Interview reminder (24 hours and 1 hour before; candidate and interviewer)
 */
export function buildInterviewReminderEmail(params: {
  recipientName: string;
  recipientRole: "CANDIDATE" | "INTERVIEWER";
  candidateName: string;
  openingTitle: string;
  roundName: string;
  scheduledAt: string;
  durationMinutes: number;
  meetingLink?: string | null;
  leadTime: "24h" | "1h";
  /** App-relative page for the recipient (defaults to the candidate dashboard / staff home). */
  href?: string;
}): EmailContent {
  const isCandidate = params.recipientRole === "CANDIDATE";
  const portalUrl = buildAppUrl(params.href, isCandidate ? "/candidate/dashboard" : "/dashboard");
  const meetingLink = safeHttpUrl(params.meetingLink);
  const when = formatBusinessDateTime(params.scheduledAt);
  const inWords = params.leadTime === "1h" ? "in 1 hour" : "in 24 hours";
  const rows: Array<[string, string]> = [
    ...(isCandidate ? [] : ([["Candidate", params.candidateName]] as Array<[string, string]>)),
    ["Position", params.openingTitle],
    ["Interview Round", params.roundName],
    ["Date & Time", when],
    ["Duration", `${params.durationMinutes} minutes`],
  ];
  if (meetingLink) rows.push(["Meeting Link", meetingLink]);

  const subject = isCandidate
    ? `[GARA Innovation] Reminder: your ${params.roundName} interview starts ${inWords}`
    : `[GARA Innovation] Reminder: you are interviewing ${params.candidateName} ${inWords}`;
  const lead = isCandidate
    ? `This is a reminder that your ${params.roundName} interview for ${params.openingTitle} starts ${inWords}.`
    : `This is a reminder that you are interviewing ${params.candidateName} (${params.roundName}, ${params.openingTitle}) ${inWords}.`;
  const text = `Hello ${params.recipientName},\n\n${lead}\n\n${detailLines(rows)}\n\nDetails: ${portalUrl}\n\n— GARA Innovation`;

  const html = renderEmailShell({
    categoryBadge: { text: "Interview Reminder", bgColor: "#eff6ff", textColor: "#1d4ed8", borderColor: "#bfdbfe" },
    title: isCandidate ? "Your interview is coming up" : "Upcoming interview",
    salutation: `Hello ${params.recipientName},`,
    leadParagraph: escapeHtml(lead),
    contentHtml: renderDetailCard(rows),
    ctaButton: {
      text: meetingLink ? "Join Meeting" : "View Interview Details",
      url: meetingLink || portalUrl,
    },
  });

  return { subject, text, html };
}

/**
 * 16. Intern reminder: today's evaluation checkpoint is still open
 */
export function buildCheckpointReminderEmail(params: {
  recipientName: string;
  openingTitle: string;
  dayNumber: number;
  checkpointTitle: string;
}): EmailContent {
  const portalUrl = buildAppUrl("/intern/dashboard");
  const rows: Array<[string, string]> = [
    ["Programme", params.openingTitle],
    ["Checkpoint", `Day ${params.dayNumber}: ${params.checkpointTitle}`],
  ];

  const subject = `[GARA Innovation] Reminder: Day ${params.dayNumber} evaluation checkpoint`;
  const text = `Hello ${params.recipientName},\n\nToday's evaluation checkpoint is still open. Please add your notes in your evaluation workspace.\n\n${detailLines(rows)}\n\nOpen your evaluation workspace: ${portalUrl}\n\n— GARA Innovation`;

  const html = renderEmailShell({
    categoryBadge: { text: "Evaluation", bgColor: "#f0fdf4", textColor: "#166534", borderColor: "#bbf7d0" },
    title: "Today's checkpoint is open",
    salutation: `Hello ${params.recipientName},`,
    leadParagraph: "Today's evaluation checkpoint is still open. Please add your notes in your evaluation workspace.",
    contentHtml: renderDetailCard(rows),
    ctaButton: { text: "Open Evaluation Workspace", url: portalUrl },
  });

  return { subject, text, html };
}

/**
 * 17. Supervisor reminder: submitted checkpoints are waiting for review
 */
export function buildCheckpointReviewReminderEmail(params: {
  recipientName: string;
  pendingCount: number;
  items: ReadonlyArray<{ internName: string; dayNumber: number }>;
  href?: string;
}): EmailContent {
  const portalUrl = buildAppUrl(params.href);
  const lines = params.items.map((item) => `${item.internName}: Day ${item.dayNumber}`);
  const noun = params.pendingCount === 1 ? "checkpoint is" : "checkpoints are";

  const subject = `[GARA Innovation] ${params.pendingCount} evaluation ${params.pendingCount === 1 ? "checkpoint" : "checkpoints"} to review`;
  const text = `Hello ${params.recipientName},\n\n${params.pendingCount} submitted evaluation ${noun} waiting for your review:\n${textItemList(lines)}\n\nReview them here: ${portalUrl}\n\n— GARA Innovation`;

  const html = renderEmailShell({
    categoryBadge: { text: "Evaluation Review", bgColor: "#f0fdf4", textColor: "#166534", borderColor: "#bbf7d0" },
    title: "Checkpoints waiting for your review",
    salutation: `Hello ${params.recipientName},`,
    leadParagraph: `<strong>${escapeHtml(params.pendingCount)}</strong> submitted evaluation ${noun} waiting for your review.`,
    contentHtml: renderItemList(lines),
    ctaButton: { text: "Review Checkpoints", url: portalUrl },
  });

  return { subject, text, html };
}

const REVIEW_STATE_LABELS: Record<"UPCOMING" | "DUE" | "OVERDUE", string> = {
  UPCOMING: "coming up",
  DUE: "due today",
  OVERDUE: "overdue",
};

/**
 * 18. Staff reminder: intern progress reviews coming up, due today or overdue
 */
export function buildConversionReviewReminderEmail(params: {
  recipientName: string;
  items: ReadonlyArray<{ internName: string; scheduledFor: string; state: "UPCOMING" | "DUE" | "OVERDUE" }>;
  href?: string;
}): EmailContent {
  const portalUrl = buildAppUrl(params.href);
  const lines = params.items.map(
    (item) =>
      `${item.internName}: ${formatCalendarDate(item.scheduledFor) ?? "date not set"} (${REVIEW_STATE_LABELS[item.state]})`
  );
  const count = params.items.length;

  const subject = `[GARA Innovation] ${count} intern progress ${count === 1 ? "review needs" : "reviews need"} attention`;
  const text = `Hello ${params.recipientName},\n\nThese intern progress reviews are coming up within 7 days, due today or overdue:\n${textItemList(lines)}\n\nOpen intern reviews: ${portalUrl}\n\n— GARA Innovation`;

  const html = renderEmailShell({
    categoryBadge: { text: "Intern Reviews", bgColor: "#fffbeb", textColor: "#92400e", borderColor: "#fde68a" },
    title: "Intern progress reviews",
    salutation: `Hello ${params.recipientName},`,
    leadParagraph: "These intern progress reviews are coming up within 7 days, due today or overdue.",
    contentHtml: renderItemList(lines),
    ctaButton: { text: "Open Intern Reviews", url: portalUrl },
  });

  return { subject, text, html };
}

/**
 * 19. Staff daily digest of the actions waiting for the recipient
 */
export function buildStaffDailyDigestEmail(params: {
  recipientName: string;
  dateLabel: string;
  sections: ReadonlyArray<{ title: string; count: number; href: string }>;
}): EmailContent {
  const total = params.sections.reduce((sum, section) => sum + section.count, 0);
  const homeUrl = buildAppUrl("/dashboard");

  const rowsHtml = params.sections
    .map(
      (section) => `
        <tr>
          <td style="padding: 10px 0; border-bottom: 1px solid #e2e8f0; font-size: 13px; color: #0f172a;">
            <a href="${escapeHtml(buildAppUrl(section.href))}" target="_blank" rel="noopener noreferrer" style="color: #1d4ed8; text-decoration: underline; font-weight: 600;">${escapeHtml(section.title)}</a>
          </td>
          <td align="right" style="padding: 10px 0; border-bottom: 1px solid #e2e8f0; font-size: 15px; font-weight: 700; color: #0f172a;">${escapeHtml(section.count)}</td>
        </tr>`
    )
    .join("");

  const subject = `[GARA Innovation] Your daily summary: ${total} ${total === 1 ? "item needs" : "items need"} your attention`;
  const text = `Hello ${params.recipientName},\n\nHere is what needs your attention (${params.dateLabel}):\n${params.sections
    .map((section) => `- ${section.title}: ${section.count} (${buildAppUrl(section.href)})`)
    .join("\n")}\n\nOpen your portal: ${homeUrl}\n\n— GARA Innovation`;

  const html = renderEmailShell({
    categoryBadge: { text: "Daily Summary", bgColor: "#eff6ff", textColor: "#1d4ed8", borderColor: "#bfdbfe" },
    title: "Needs your attention",
    salutation: `Hello ${params.recipientName},`,
    leadParagraph: `Here is what needs your attention today, ${escapeHtml(params.dateLabel)}.`,
    contentHtml: `
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin: 8px 0 4px 0;">${rowsHtml}
      </table>`,
    ctaButton: { text: "Open Your Portal", url: homeUrl },
    footerNotice:
      "You receive this summary because you are a staff member with pending items. It only lists items your permissions allow you to act on.",
  });

  return { subject, text, html };
}

// -----------------------------------------------------------------------------
// Round 4: interview changes and candidate self-scheduling
// -----------------------------------------------------------------------------

interface InterviewChangeEmailParams {
  recipientName: string;
  recipientRole: InterviewRecipientRole;
  candidateName: string;
  openingTitle: string;
  roundName: string;
  /** App-relative page for the recipient. */
  href?: string;
  /** Plain-text reason entered by staff (shown to the recipient). */
  reason?: string;
  hasCalendarInvite?: boolean;
}

function interviewPortalUrl(role: InterviewRecipientRole, href: string | undefined): string {
  return buildAppUrl(href, role === "INTERVIEWER" ? "/dashboard" : "/candidate/dashboard");
}

/** Escaped, labelled block for a staff-entered reason. */
function renderReason(label: string, reason: string | undefined): string {
  if (!reason) return "";
  return `
    <div style="margin: 16px 0; padding: 14px 18px; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px;">
      <div style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; margin-bottom: 6px;">${escapeHtml(label)}</div>
      <div style="font-size: 13px; color: #334155; line-height: 1.5; white-space: pre-line;">${escapeHtml(reason)}</div>
    </div>`;
}

/**
 * 21. Interview rescheduled (candidate and interviewer; carries an updated calendar invite)
 */
export function buildInterviewRescheduledEmail(
  params: InterviewChangeEmailParams & {
    scheduledAt: string;
    previousScheduledAt?: string;
    durationMinutes: number;
    meetingLink?: string | null;
  }
): EmailContent {
  const isInterviewer = params.recipientRole === "INTERVIEWER";
  const portalUrl = interviewPortalUrl(params.recipientRole, params.href);
  const meetingLink = safeHttpUrl(params.meetingLink);
  const rows: Array<[string, string]> = [
    ...(isInterviewer ? ([["Candidate", params.candidateName]] as Array<[string, string]>) : []),
    ["Position", params.openingTitle],
    ["Interview Round", params.roundName],
    ["New Date & Time", formatBusinessDateTime(params.scheduledAt)],
  ];
  if (params.previousScheduledAt) {
    rows.push(["Previously", formatBusinessDateTime(params.previousScheduledAt)]);
  }
  rows.push(["Duration", `${params.durationMinutes} minutes`]);
  if (meetingLink) rows.push(["Meeting Link", meetingLink]);

  const lead = isInterviewer
    ? `Your interview with ${params.candidateName} (${params.roundName}, ${params.openingTitle}) has moved to a new time.`
    : `Your ${params.roundName} interview for ${params.openingTitle} has moved to a new time.`;
  const calendarNote = params.hasCalendarInvite ? `\n${CALENDAR_INVITE_NOTE}\n` : "";

  const subject = isInterviewer
    ? `[GARA Innovation] Interview rescheduled: ${params.candidateName} (${params.roundName})`
    : `[GARA Innovation] Interview rescheduled: ${params.roundName} (${params.openingTitle})`;
  const text = `Hello ${params.recipientName},\n\n${lead}\n\n${detailLines(rows)}\n${params.reason ? `\nReason: ${params.reason}\n` : ""}${calendarNote}\nDetails: ${portalUrl}\n\n— GARA Innovation`;

  const html = renderEmailShell({
    categoryBadge: { text: "Interview Rescheduled", bgColor: "#fffbeb", textColor: "#92400e", borderColor: "#fde68a" },
    title: "Interview time changed",
    salutation: `Hello ${params.recipientName},`,
    leadParagraph: escapeHtml(lead),
    contentHtml: `${renderDetailCard(rows)}${renderReason("Reason", params.reason)}`,
    ctaButton: { text: meetingLink ? "Join Meeting" : "View Interview Details", url: meetingLink || portalUrl },
    ...(params.hasCalendarInvite
      ? { secondaryNote: { text: `${CALENDAR_INVITE_NOTE} It replaces the earlier calendar entry.` } }
      : {}),
  });

  return { subject, text, html };
}

/**
 * 22. Interview cancelled (candidate and interviewer; carries a calendar cancellation)
 */
export function buildInterviewCancelledEmail(
  params: InterviewChangeEmailParams & { scheduledAt?: string }
): EmailContent {
  const isInterviewer = params.recipientRole === "INTERVIEWER";
  const portalUrl = interviewPortalUrl(params.recipientRole, params.href);
  const rows: Array<[string, string]> = [
    ...(isInterviewer ? ([["Candidate", params.candidateName]] as Array<[string, string]>) : []),
    ["Position", params.openingTitle],
    ["Interview Round", params.roundName],
  ];
  if (params.scheduledAt) rows.push(["Was Scheduled For", formatBusinessDateTime(params.scheduledAt)]);

  const lead = isInterviewer
    ? `The interview with ${params.candidateName} (${params.roundName}, ${params.openingTitle}) has been cancelled.`
    : `Your ${params.roundName} interview for ${params.openingTitle} has been cancelled. The hiring team will contact you about next steps.`;
  const calendarNote = params.hasCalendarInvite
    ? "\nYour calendar app can remove the event using the attached cancellation.\n"
    : "";

  const subject = isInterviewer
    ? `[GARA Innovation] Interview cancelled: ${params.candidateName} (${params.roundName})`
    : `[GARA Innovation] Interview cancelled: ${params.roundName} (${params.openingTitle})`;
  const text = `Hello ${params.recipientName},\n\n${lead}\n\n${detailLines(rows)}\n${params.reason ? `\nReason: ${params.reason}\n` : ""}${calendarNote}\nDetails: ${portalUrl}\n\n— GARA Innovation`;

  const html = renderEmailShell({
    categoryBadge: { text: "Interview Cancelled", bgColor: "#f1f5f9", textColor: "#334155", borderColor: "#cbd5e1" },
    title: "Interview cancelled",
    salutation: `Hello ${params.recipientName},`,
    leadParagraph: escapeHtml(lead),
    contentHtml: `${renderDetailCard(rows)}${renderReason("Reason", params.reason)}`,
    ctaButton: { text: isInterviewer ? "Open Interview Board" : "Open Candidate Portal", url: portalUrl },
    ...(params.hasCalendarInvite
      ? { secondaryNote: { text: "Your calendar app can remove the event using the attached cancellation." } }
      : {}),
  });

  return { subject, text, html };
}

/** Time options listed in a booking email (in business time). */
const BOOKING_OPTIONS_LIMIT = 8;

/**
 * 23. Candidate self-scheduling: choose your interview time
 */
export function buildInterviewBookingRequestEmail(params: {
  candidateName: string;
  openingTitle: string;
  roundName: string;
  durationMinutes: number;
  /** ISO start times offered by the hiring team. */
  options: readonly string[];
  /** App-relative booking page (e.g. /candidate/interviews/<id>). */
  href?: string;
}): EmailContent {
  const portalUrl = buildAppUrl(params.href, "/candidate/dashboard");
  const optionLines = params.options.slice(0, BOOKING_OPTIONS_LIMIT).map((iso) => formatBusinessDateTime(iso));
  const rows: Array<[string, string]> = [
    ["Position", params.openingTitle],
    ["Interview Round", params.roundName],
    ["Duration", `${params.durationMinutes} minutes`],
  ];

  const subject = `[GARA Innovation] Choose your interview time: ${params.roundName} (${params.openingTitle})`;
  const text = `Hello ${params.candidateName},\n\nThe hiring team has offered times for your ${params.roundName} interview for ${params.openingTitle}. Please choose the time that suits you in your candidate portal.\n\n${detailLines(rows)}\n${optionLines.length > 0 ? `\nTimes offered:\n${textItemList(optionLines)}\n` : ""}\nChoose your time: ${portalUrl}\n\nTimes are booked first come, first served; if a time is no longer available the portal shows the remaining ones.\n\n— GARA Innovation`;

  const html = renderEmailShell({
    categoryBadge: { text: "Choose a Time", bgColor: "#eff6ff", textColor: "#1d4ed8", borderColor: "#bfdbfe" },
    title: "Choose your interview time",
    salutation: `Hello ${params.candidateName},`,
    leadParagraph: `The hiring team has offered times for your <strong>${escapeHtml(params.roundName)}</strong> interview for <strong>${escapeHtml(params.openingTitle)}</strong>. Please choose the time that suits you.`,
    contentHtml: `${renderDetailCard(rows)}${
      optionLines.length > 0
        ? `<p style="margin: 0 0 8px 0; font-size: 13px; font-weight: 700; color: #0f172a;">Times offered</p>${renderItemList(optionLines)}`
        : ""
    }`,
    ctaButton: { text: "Choose Your Interview Time", url: portalUrl },
    secondaryNote: {
      text: "Times are booked first come, first served. If a time is no longer available, the portal shows the remaining ones.",
    },
  });

  return { subject, text, html };
}

/**
 * 24. Candidate self-scheduling: the hiring team withdrew the offered times
 */
export function buildInterviewBookingCancelledEmail(params: {
  candidateName: string;
  openingTitle: string;
  roundName: string;
  reason?: string;
  href?: string;
}): EmailContent {
  const portalUrl = buildAppUrl(params.href, "/candidate/dashboard");
  const rows: Array<[string, string]> = [
    ["Position", params.openingTitle],
    ["Interview Round", params.roundName],
  ];
  const lead = `The interview times offered for your ${params.roundName} interview (${params.openingTitle}) have been withdrawn. The hiring team will contact you about next steps.`;

  const subject = `[GARA Innovation] Interview times withdrawn: ${params.roundName} (${params.openingTitle})`;
  const text = `Hello ${params.candidateName},\n\n${lead}\n\n${detailLines(rows)}\n${params.reason ? `\nMessage from the hiring team: ${params.reason}\n` : ""}\nOpen your portal: ${portalUrl}\n\n— GARA Innovation`;

  const html = renderEmailShell({
    categoryBadge: { text: "Interview Update", bgColor: "#f1f5f9", textColor: "#334155", borderColor: "#cbd5e1" },
    title: "Interview times withdrawn",
    salutation: `Hello ${params.candidateName},`,
    leadParagraph: escapeHtml(lead),
    contentHtml: `${renderDetailCard(rows)}${renderReason("Message from the hiring team", params.reason)}`,
    ctaButton: { text: "Open Candidate Portal", url: portalUrl },
  });

  return { subject, text, html };
}

/**
 * 20. Fallback / Generic Outbox Notification Builder
 */
export function buildGenericNotificationEmail(params: {
  templateName: string;
  payload: Record<string, unknown>;
  portalUrl?: string;
}): { subject: string; text: string; html: string } {
  const p = params.payload;
  const portalUrl = params.portalUrl || `${getAppBaseUrl()}/dashboard`;
  const readableTitle = params.templateName.replace(/_/g, " ");

  const recipientName =
    typeof p.candidateName === "string"
      ? p.candidateName
      : typeof p.employeeName === "string"
      ? p.employeeName
      : typeof p.recipientName === "string"
      ? p.recipientName
      : "Valued Team Member";

  const referenceCode = typeof p.referenceCode === "string" ? p.referenceCode : "";
  const subject = `[GARA Innovation] ${readableTitle}${referenceCode ? ` (${referenceCode})` : ""}`;
  const text = `Hello ${recipientName},\n\nNotification: ${readableTitle}\nDetails: ${JSON.stringify(p, null, 2)}\n\nVisit your portal: ${portalUrl}\n\n— GARA Innovation`;

  // Render structured key-value pairs
  const keys = Object.keys(p).filter((k) => k !== "candidateName" && k !== "employeeName" && k !== "recipientName");
  const rowsHtml = keys
    .map(
      (k) => `
      <tr>
        <td width="35%" style="color: #64748b; font-weight: 600; text-transform: uppercase; font-size: 11px; letter-spacing: 0.04em;">${escapeHtml(k.replace(/([A-Z])/g, " $1"))}</td>
        <td style="color: #0f172a; font-weight: 500;">${escapeHtml(typeof p[k] === "object" && p[k] !== null ? JSON.stringify(p[k]) : p[k])}</td>
      </tr>
    `
    )
    .join("");

  const contentHtml = `
    <div style="margin: 20px 0; padding: 20px; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px;">
      <table width="100%" cellpadding="6" cellspacing="0" border="0" style="font-size: 13px;">
        ${rowsHtml}
      </table>
    </div>
  `;

  const html = renderEmailShell({
    categoryBadge: {
      text: "System Notification",
      bgColor: "#f1f5f9",
      textColor: "#475569",
      borderColor: "#cbd5e1",
    },
    title: readableTitle,
    salutation: `Hello ${recipientName},`,
    leadParagraph: "Please find details regarding your latest platform notification below:",
    contentHtml,
    ctaButton: {
      text: "Access GARA Portal",
      url: portalUrl,
    },
  });

  return { subject, text, html };
}
