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

export interface EmailShellOptions {
  categoryBadge?: {
    text: string;
    bgColor: string;
    textColor: string;
    borderColor?: string;
  };
  title: string;
  salutation?: string;
  leadParagraph?: string;
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
          ${options.categoryBadge.text}
        </span>
      </div>
    `
    : "";

  const ctaHtml = options.ctaButton
    ? `
      <table cellpadding="0" cellspacing="0" border="0" style="margin: 32px 0 28px 0; width: 100%;">
        <tr>
          <td align="center">
            <a href="${options.ctaButton.url}" target="_blank" style="display: inline-block; padding: 13px 36px; background-color: #2563eb; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 14px; line-height: 1; letter-spacing: -0.01em;">
              ${options.ctaButton.text}
            </a>
          </td>
        </tr>
      </table>
    `
    : "";

  const secondaryNoteHtml = options.secondaryNote
    ? `
      <div style="margin-top: 24px; padding: 14px 18px; background-color: ${options.secondaryNote.bgColor || "#f8fafc"}; border-left: 3px solid ${options.secondaryNote.borderColor || "#2563eb"}; border-radius: 0 8px 8px 0;">
        ${options.secondaryNote.title ? `<p style="margin: 0 0 4px 0; font-size: 13px; font-weight: 700; color: ${options.secondaryNote.textColor || "#0f172a"};">${options.secondaryNote.title}</p>` : ""}
        <p style="margin: 0; font-size: 12px; color: ${options.secondaryNote.textColor || "#475569"}; line-height: 1.5;">
          ${options.secondaryNote.text}
        </p>
      </div>
    `
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${options.title}</title>
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
                ${options.title}
              </h1>

              ${options.salutation ? `<p style="margin: 0 0 16px 0; font-size: 14px; font-weight: 600; color: #0f172a;">${options.salutation}</p>` : ""}

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
                ${options.footerNotice || "This is an automated notification from the GARA Innovation Talent Portal. Please do not reply directly to this email."}
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
          <td style="color: #0f172a; font-weight: 700;">${params.role}</td>
        </tr>
        <tr>
          <td style="color: #64748b; font-weight: 600; text-transform: uppercase; font-size: 11px; letter-spacing: 0.04em;">Login Email</td>
          <td style="color: #0f172a; font-family: monospace; font-size: 13px;">${params.email}</td>
        </tr>
        <tr>
          <td style="color: #64748b; font-weight: 600; text-transform: uppercase; font-size: 11px; letter-spacing: 0.04em;">Temporary Password</td>
          <td>
            <span style="display: inline-block; padding: 6px 12px; background-color: #eff6ff; border: 1px solid #bfdbfe; border-radius: 6px; font-family: monospace; font-size: 14px; font-weight: 700; color: #1d4ed8; letter-spacing: 0.5px;">
              ${params.temporaryPassword}
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
 * 2. Temporary Password / Forgot Password Email
 */
export function buildForgotPasswordEmail(params: {
  name: string;
  email: string;
  temporaryPassword: string;
  loginUrl?: string;
}): { subject: string; text: string; html: string } {
  const loginUrl = params.loginUrl || `${getAppBaseUrl()}/login`;

  const subject = `[GARA Innovation] Temporary Access Password`;
  const text = `Hello ${params.name},\n\nA temporary password was generated for your GARA Innovation account.\n\nTemporary Password: ${params.temporaryPassword}\nLogin Portal: ${loginUrl}\n\nPlease sign in with this temporary password and update your permanent password immediately.\n\n— GARA Innovation Security`;

  const contentHtml = `
    <div style="margin: 24px 0; padding: 24px; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; text-align: center;">
      <div style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 8px;">
        Temporary Access Password
      </div>
      <div style="font-family: monospace; font-size: 22px; font-weight: 800; color: #0f172a; letter-spacing: 2px;">
        ${params.temporaryPassword}
      </div>
    </div>
  `;

  const html = renderEmailShell({
    categoryBadge: {
      text: "Account Security",
      bgColor: "#fef2f2",
      textColor: "#991b1b",
      borderColor: "#fecaca",
    },
    title: "Temporary Sign-In Credentials",
    salutation: `Hello ${params.name},`,
    leadParagraph: "A request was received to access your GARA Innovation account. Use the temporary password below to log in.",
    contentHtml,
    ctaButton: {
      text: "Sign In & Set New Password",
      url: loginUrl,
    },
    secondaryNote: {
      title: "Security Notice",
      text: "You will be prompted to create your own permanent password right after signing in. If you did not request this reset, please contact your administrator immediately.",
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
          <td style="color: #0f172a; font-weight: 700;">${params.openingTitle}</td>
        </tr>
        <tr>
          <td style="color: #64748b; font-weight: 600; text-transform: uppercase; font-size: 11px; letter-spacing: 0.04em;">Reference Code</td>
          <td style="color: #0f172a; font-family: monospace; font-weight: 700;">${params.referenceCode}</td>
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
    leadParagraph: `Thank you for your interest in joining GARA Innovation. Your application for <strong>${params.openingTitle}</strong> has been logged into our hiring pipeline.`,
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

/**
 * 4. Interview Invitation
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
}): { subject: string; text: string; html: string } {
  const portalUrl = params.portalUrl || `${getAppBaseUrl()}/candidate/dashboard`;
  const formattedDate = new Date(params.scheduledAt).toLocaleString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const subject = `[GARA Innovation] Interview Scheduled: ${params.roundName} (${params.openingTitle})`;
  const text = `Hello ${params.candidateName},\n\nYou have been shortlisted for an interview round for the position of ${params.openingTitle}.\n\nInterview Round: ${params.roundName}\nDate & Time: ${formattedDate}\nDuration: ${params.durationMinutes} minutes\n${params.meetingLink ? `Meeting Link: ${params.meetingLink}\n` : ""}Candidate Portal: ${portalUrl}\n\nPlease be prepared 5 minutes prior to the scheduled time.\n\n— GARA Innovation Talent Acquisition`;

  const contentHtml = `
    <div style="margin: 20px 0; padding: 20px; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px;">
      <table width="100%" cellpadding="6" cellspacing="0" border="0" style="font-size: 13px;">
        <tr>
          <td width="35%" style="color: #64748b; font-weight: 600; text-transform: uppercase; font-size: 11px; letter-spacing: 0.04em;">Position</td>
          <td style="color: #0f172a; font-weight: 700;">${params.openingTitle}</td>
        </tr>
        <tr>
          <td style="color: #64748b; font-weight: 600; text-transform: uppercase; font-size: 11px; letter-spacing: 0.04em;">Interview Round</td>
          <td style="color: #0f172a; font-weight: 600;">${params.roundName}</td>
        </tr>
        <tr>
          <td style="color: #64748b; font-weight: 600; text-transform: uppercase; font-size: 11px; letter-spacing: 0.04em;">Date & Time</td>
          <td style="color: #1d4ed8; font-weight: 700;">${formattedDate}</td>
        </tr>
        <tr>
          <td style="color: #64748b; font-weight: 600; text-transform: uppercase; font-size: 11px; letter-spacing: 0.04em;">Duration</td>
          <td style="color: #334155;">${params.durationMinutes} minutes</td>
        </tr>
        ${
          params.meetingLink
            ? `
          <tr>
            <td style="color: #64748b; font-weight: 600; text-transform: uppercase; font-size: 11px; letter-spacing: 0.04em;">Meeting Link</td>
            <td>
              <a href="${params.meetingLink}" target="_blank" style="color: #2563eb; text-decoration: underline; font-weight: 600; word-break: break-all;">
                ${params.meetingLink}
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
    leadParagraph: `Congratulations! We were impressed by your profile and are pleased to invite you to the <strong>${params.roundName}</strong> for <strong>${params.openingTitle}</strong>.`,
    contentHtml,
    ctaButton: {
      text: params.meetingLink ? "Join Meeting / View Portal" : "View Interview Details",
      url: params.meetingLink || portalUrl,
    },
    secondaryNote: {
      title: "Preparation Guidelines",
      text: "Please ensure a stable internet connection, a quiet environment, and have your camera enabled. Please join 5 minutes ahead of schedule.",
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
          <td style="color: #0f172a; font-weight: 700;">${params.openingTitle}</td>
        </tr>
        <tr>
          <td style="color: #64748b; font-weight: 600; text-transform: uppercase; font-size: 11px; letter-spacing: 0.04em;">Reference</td>
          <td style="color: #0f172a; font-family: monospace;">${params.referenceCode}</td>
        </tr>
        <tr>
          <td style="color: #64748b; font-weight: 600; text-transform: uppercase; font-size: 11px; letter-spacing: 0.04em;">Updated Status</td>
          <td style="color: #0f172a; font-weight: 700;">${params.newStatus.replace(/_/g, " ")}</td>
        </tr>
      </table>
    </div>
    ${
      params.message
        ? `
      <div style="margin: 16px 0; padding: 14px 18px; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px;">
        <div style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; margin-bottom: 6px;">Message from Hiring Team</div>
        <div style="font-size: 13px; color: #334155; line-height: 1.5;">${params.message}</div>
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
    leadParagraph: `Your application for <strong>${params.openingTitle}</strong> has progressed in our evaluation process.`,
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
          <td style="color: #0f172a; font-weight: 700;">${params.openingTitle}</td>
        </tr>
        <tr>
          <td style="color: #64748b; font-weight: 600; text-transform: uppercase; font-size: 11px; letter-spacing: 0.04em;">Program Duration</td>
          <td style="color: #15803d; font-weight: 700;">${days} Working Days</td>
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
    leadParagraph: `We are pleased to inform you that you have been selected for the GARA Innovation <strong>${days}-working-day supervised evaluation period</strong> for <strong>${params.openingTitle}</strong>.`,
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
          <td style="color: #0f172a; font-weight: 700;">${params.designation}</td>
        </tr>
        <tr>
          <td style="color: #64748b; font-weight: 600; text-transform: uppercase; font-size: 11px; letter-spacing: 0.04em;">Department</td>
          <td style="color: #0f172a;">${params.department}</td>
        </tr>
        <tr>
          <td style="color: #64748b; font-weight: 600; text-transform: uppercase; font-size: 11px; letter-spacing: 0.04em;">Joining Date</td>
          <td style="color: #1d4ed8; font-weight: 700;">${joiningDateFormatted}</td>
        </tr>
        ${
          params.applicationReference
            ? `
          <tr>
            <td style="color: #64748b; font-weight: 600; text-transform: uppercase; font-size: 11px; letter-spacing: 0.04em;">Application Ref</td>
            <td style="color: #0f172a; font-family: monospace;">${params.applicationReference}</td>
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
    leadParagraph: `Following your successful evaluation, GARA Innovation is delighted to extend a formal offer of employment for the position of <strong>${params.designation}</strong>.`,
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

/**
 * 8. Fallback / Generic Outbox Notification Builder
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
        <td width="35%" style="color: #64748b; font-weight: 600; text-transform: uppercase; font-size: 11px; letter-spacing: 0.04em;">${k.replace(/([A-Z])/g, " $1")}</td>
        <td style="color: #0f172a; font-weight: 500;">${String(p[k])}</td>
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
