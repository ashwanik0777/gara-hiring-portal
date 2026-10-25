/**
 * RFC 5545 (iCalendar) generator for interview calendar invites.
 *
 * Pure module: no server-only imports, so the same code builds the invitation attached to
 * emails (outbox processor) and the "Add to calendar" file generated in the browser. Every
 * TEXT value is escaped plain text; nothing is ever interpreted as HTML.
 */

/** REQUEST/CANCEL are iTIP invitations (RFC 5546); PUBLISH is a plain downloadable event. */
export type IcsMethod = "REQUEST" | "CANCEL" | "PUBLISH";

export interface IcsPerson {
  email: string;
  name?: string | null;
}

export interface InterviewIcsInput {
  scheduleId: string;
  /** Site host used in the UID (e.g. "careers.example.com"); see `interviewEventUid`. */
  host: string;
  /** iCalendar SEQUENCE (InterviewSchedule.icsSequence). */
  sequence: number;
  method: IcsMethod;
  startsAt: Date | string;
  durationMinutes: number;
  summary: string;
  description?: string | null;
  /** Added as LOCATION and URL only when it is an https URL. */
  meetingLink?: string | null;
  /** Required by mail clients for REQUEST/CANCEL; omitted for PUBLISH. */
  organizer?: IcsPerson | null;
  attendees?: ReadonlyArray<IcsPerson>;
  /** DTSTAMP (defaults to the current time). */
  now?: Date;
}

const CRLF = "\r\n";
/** RFC 5545 §3.1: content lines SHOULD NOT exceed 75 octets (excluding the line break). */
const MAX_LINE_OCTETS = 75;
const MAX_NAME_LENGTH = 200;
const MAX_TEXT_LENGTH = 4000;
const PRODID = "-//GARA Innovation//Hiring Portal//EN";
const FALLBACK_HOST = "gara-hiring.local";

const encoder = new TextEncoder();

/**
 * Removes control characters (U+0000-U+001F, U+007F). TAB, LF and CR are kept only when
 * `keepLineBreaks` is set (iCalendar TEXT allows them; parameter values do not).
 */
function stripControlChars(value: string, keepLineBreaks: boolean): string {
  let result = "";
  for (const char of value) {
    const code = char.charCodeAt(0);
    const isControl = code < 0x20 || code === 0x7f;
    const isAllowedBreak = keepLineBreaks && (code === 0x09 || code === 0x0a || code === 0x0d);
    if (!isControl || isAllowedBreak) {
      result += char;
    }
  }
  return result;
}

/** Conservative address check: anything else could break the mailto: property value. */
const SAFE_EMAIL_PATTERN = /^[A-Za-z0-9._+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/;

/**
 * Escapes a value for an iCalendar TEXT property (RFC 5545 §3.3.11): backslash, semicolon,
 * comma and line breaks are escaped; other control characters are removed.
 */
export function escapeIcsText(value: unknown): string {
  return stripControlChars(String(value ?? "").slice(0, MAX_TEXT_LENGTH), true)
    .replace(/\r\n?/g, "\n")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

/**
 * Folds a content line to at most 75 octets per physical line (RFC 5545 §3.1): each
 * continuation starts with a single space, which counts towards its 75 octets. Lines are
 * split on code-point boundaries, so multi-byte UTF-8 characters are never cut in half.
 */
export function foldIcsLine(line: string): string {
  if (encoder.encode(line).length <= MAX_LINE_OCTETS) {
    return line;
  }
  const segments: string[] = [];
  let current = "";
  let currentOctets = 0;
  let limit = MAX_LINE_OCTETS;
  for (const char of line) {
    const octets = encoder.encode(char).length;
    if (currentOctets + octets > limit) {
      segments.push(current);
      current = char;
      currentOctets = octets;
      limit = MAX_LINE_OCTETS - 1;
    } else {
      current += char;
      currentOctets += octets;
    }
  }
  segments.push(current);
  return segments.join(`${CRLF} `);
}

/** UTC DATE-TIME in the iCalendar basic format, e.g. 20261101T100000Z. */
export function formatIcsDateTime(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, "Z").replace(/[-:]/g, "");
}

/** Host part of a site URL or host string, lower-cased and without port or path. */
function normalizeHost(host: string): string {
  let candidate = host.trim().toLowerCase();
  try {
    candidate = new URL(candidate.includes("://") ? candidate : `https://${candidate}`).hostname;
  } catch {
    // Fall through to the character filter below.
  }
  const cleaned = candidate.replace(/[^a-z0-9.-]/g, "");
  return cleaned || FALLBACK_HOST;
}

/**
 * Stable event UID shared by every invite of one interview (invitation, reschedules and the
 * cancellation), so calendar apps update or remove the same event.
 */
export function interviewEventUid(scheduleId: string, host: string): string {
  const id = scheduleId.replace(/[^A-Za-z0-9-]/g, "");
  return `interview-${id}@${normalizeHost(host)}`;
}

/** Returns the URL only when it is an absolute https URL (normalized), otherwise null. */
export function icsHttpsUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

/** True when the address can be used safely in a mailto: calendar address. */
export function isIcsSafeEmail(email: unknown): email is string {
  return typeof email === "string" && email.length <= 254 && SAFE_EMAIL_PATTERN.test(email);
}

/**
 * Parses a mailbox such as `GARA Hiring <no-reply@example.com>` or a bare address.
 * Returns null when no safe address is found.
 */
export function parseMailbox(value: string): IcsPerson | null {
  const trimmed = value.trim();
  const angle = /^(.*)<([^<>]+)>\s*$/.exec(trimmed);
  const email = (angle ? angle[2] : trimmed).trim();
  if (!isIcsSafeEmail(email)) return null;
  const name = angle ? angle[1].trim().replace(/^"|"$/g, "").trim() : "";
  return { email, name: name || null };
}

/** Quoted CN parameter value: DQUOTE and control characters are not allowed inside. */
function commonNameParam(name: string | null | undefined): string {
  const cleaned = stripControlChars((name ?? "").replace(/[\t\r\n"]/g, " "), false)
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_NAME_LENGTH);
  return cleaned ? `;CN="${cleaned}"` : "";
}

function toDate(value: Date | string): Date {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new RangeError("Invalid interview start time for calendar invite.");
  }
  return date;
}

export interface InterviewEventTextInput {
  /** Whose calendar the event is for: the candidate or the interviewer. */
  recipientRole: "CANDIDATE" | "INTERVIEWER";
  roundName: string;
  openingTitle: string;
  candidateName?: string | null;
  durationMinutes: number;
  meetingLink?: string | null;
  /** Absolute portal URL with the interview details. */
  detailsUrl?: string | null;
  cancelled?: boolean;
}

/**
 * SUMMARY and DESCRIPTION (plain text, escaped later by `buildInterviewIcs`) shared by the
 * emailed invites and the "Add to calendar" download, so both describe the event the same way.
 */
export function buildInterviewEventText(input: InterviewEventTextInput): { summary: string; description: string } {
  const isInterviewer = input.recipientRole === "INTERVIEWER";
  const candidateName = input.candidateName?.trim() || "the candidate";
  const meetingLink = icsHttpsUrl(input.meetingLink);
  const summary = isInterviewer
    ? `Interview with ${candidateName}: ${input.roundName} - ${input.openingTitle}`
    : `Interview: ${input.roundName} - ${input.openingTitle} (GARA Innovation)`;
  const description = [
    input.cancelled ? "This interview has been cancelled." : null,
    `Interview round: ${input.roundName}`,
    `Position: ${input.openingTitle}`,
    isInterviewer ? `Candidate: ${candidateName}` : null,
    `Duration: ${Math.round(input.durationMinutes)} minutes`,
    meetingLink ? `Join: ${meetingLink}` : null,
    input.detailsUrl ? `Details: ${input.detailsUrl}` : null,
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
  return { summary, description };
}

/**
 * Builds a complete VCALENDAR document (CRLF line endings, folded lines) for one interview.
 */
export function buildInterviewIcs(input: InterviewIcsInput): string {
  const start = toDate(input.startsAt);
  const durationMinutes = Math.max(1, Math.round(input.durationMinutes));
  const end = new Date(start.getTime() + durationMinutes * 60 * 1000);
  const stamp = input.now ?? new Date();
  const sequence = Math.max(0, Math.trunc(input.sequence));
  const isCancel = input.method === "CANCEL";
  const isInvitation = input.method !== "PUBLISH";
  const meetingLink = icsHttpsUrl(input.meetingLink);

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    `PRODID:${PRODID}`,
    "VERSION:2.0",
    "CALSCALE:GREGORIAN",
    `METHOD:${input.method}`,
    "BEGIN:VEVENT",
    `UID:${escapeIcsText(interviewEventUid(input.scheduleId, input.host))}`,
    `SEQUENCE:${sequence}`,
    `DTSTAMP:${formatIcsDateTime(stamp)}`,
    `DTSTART:${formatIcsDateTime(start)}`,
    `DTEND:${formatIcsDateTime(end)}`,
    `SUMMARY:${escapeIcsText(input.summary)}`,
  ];

  if (input.description) {
    lines.push(`DESCRIPTION:${escapeIcsText(input.description)}`);
  }
  if (meetingLink) {
    lines.push(`LOCATION:${escapeIcsText(meetingLink)}`);
    lines.push(`URL:${meetingLink}`);
  }
  lines.push(`STATUS:${isCancel ? "CANCELLED" : "CONFIRMED"}`);
  lines.push("TRANSP:OPAQUE");

  if (isInvitation) {
    const organizer = input.organizer && isIcsSafeEmail(input.organizer.email) ? input.organizer : null;
    if (organizer) {
      lines.push(`ORGANIZER${commonNameParam(organizer.name)}:mailto:${organizer.email}`);
    }
    const seen = new Set<string>();
    for (const attendee of input.attendees ?? []) {
      const key = attendee.email.toLowerCase();
      if (!isIcsSafeEmail(attendee.email) || seen.has(key)) continue;
      seen.add(key);
      const participation = isCancel ? "" : ";PARTSTAT=NEEDS-ACTION;RSVP=TRUE";
      lines.push(
        `ATTENDEE${commonNameParam(attendee.name)};ROLE=REQ-PARTICIPANT${participation}:mailto:${attendee.email}`
      );
    }
  }

  lines.push("END:VEVENT", "END:VCALENDAR");
  return `${lines.map(foldIcsLine).join(CRLF)}${CRLF}`;
}
