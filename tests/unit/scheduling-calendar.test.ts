import { describe, it, expect, vi, beforeEach } from "vitest";
import { ApplicationStatus, InterviewStatus, Role } from "@prisma/client";

const { db, state } = vi.hoisted(() => {
  const fn = () => vi.fn();
  const state = {
    session: null as null | { user: { id: string; email: string; name: string } },
    users: {} as Record<string, { roles: string[] }>,
    capabilities: ["applications"] as string[],
  };
  const db = {
    user: { findUnique: fn(), findMany: fn() },
    subAdminPermission: { findUnique: fn() },
    application: { findUnique: fn() },
    interviewSchedule: { findUnique: fn(), findMany: fn(), create: fn(), updateMany: fn() },
    interviewBookingRequest: {
      findUnique: fn(),
      findFirst: fn(),
      findMany: fn(),
      count: fn(),
      create: fn(),
      update: fn(),
      updateMany: fn(),
    },
    interviewSlotOption: { updateMany: fn() },
    notificationOutbox: { create: fn(), findUnique: fn(), updateMany: fn(), update: fn() },
    auditLog: { create: fn() },
    $transaction: fn(),
  };
  return { db, state };
});

vi.mock("@/lib/db", () => ({ prisma: db }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/auth", () => ({
  auth: { api: { getSession: vi.fn(async () => state.session) } },
}));
vi.mock("@/infrastructure/email/outbox-dispatch", () => ({ scheduleOutboxFlush: vi.fn() }));
vi.mock("@/infrastructure/jobs/job-queue", () => ({ enqueueJob: vi.fn(), cancelJobsByKeyPrefix: vi.fn() }));
vi.mock("@/features/lifecycle/services/lifecycle-service", () => ({
  isStaffUser: (user: { roles: string[] }) =>
    user.roles.some((role) => ["ADMIN", "HR", "MANAGER", "INTERVIEWER", "MENTOR"].includes(role)),
  getLifecycleForUser: vi.fn(async () => ({ capabilities: state.capabilities })),
}));

import {
  buildInterviewEventText,
  buildInterviewIcs,
  escapeIcsText,
  foldIcsLine,
  formatIcsDateTime,
  icsHttpsUrl,
  interviewEventUid,
  parseMailbox,
} from "@/infrastructure/email/ics";
import { OutboxProcessorService, type OutboundEmailMessage } from "@/infrastructure/email/outbox-processor";
import {
  buildInterviewBookingCancelledEmail,
  buildInterviewBookingRequestEmail,
  buildInterviewCancelledEmail,
  buildInterviewInvitationEmail,
  buildInterviewRescheduledEmail,
} from "@/infrastructure/email/email-templates";
import { recruitmentService } from "@/features/recruitment/services/recruitment-service";
import {
  BOOKING_NOT_FOUND_MESSAGE,
  SLOT_UNAVAILABLE_MESSAGE,
  interviewBookingService,
} from "@/features/recruitment/services/interview-booking-service";
import { CreateBookingRequestSchema, validateBookingSlotTimes } from "@/features/recruitment/schemas";
import {
  bookInterviewSlotAction,
  cancelInterviewBookingRequestAction,
  createInterviewBookingRequestAction,
} from "@/features/recruitment/booking-actions";
import {
  getOwnInterviewBooking,
  getOwnPendingInterviewBookings,
} from "@/features/lifecycle/services/self-service-dashboard-service";
import { scheduleOutboxFlush } from "@/infrastructure/email/outbox-dispatch";
import { enqueueJob } from "@/infrastructure/jobs/job-queue";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import type { AuthenticatedUser } from "@/lib/auth/guards";

const HR_ID = "11111111-1111-4111-8111-111111111111";
const INTERVIEWER_ID = "22222222-2222-4222-8222-222222222222";
const OTHER_INTERVIEWER_ID = "33333333-3333-4333-8333-333333333333";
const CANDIDATE_ID = "44444444-4444-4444-8444-444444444444";
const APP_ID = "55555555-5555-4555-8555-555555555555";
const SCHEDULE_ID = "66666666-6666-4666-8666-666666666666";
const MANAGER_ID = "77777777-7777-4777-8777-777777777777";
const REQUEST_ID = "88888888-8888-4888-8888-888888888888";
const SLOT_ID = "99999999-9999-4999-8999-999999999999";
const OTHER_CANDIDATE_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const NOW = new Date("2030-01-01T00:00:00.000Z");
const SLOT_A = "2030-01-15T10:00:00.000Z";
const SLOT_B = "2030-01-16T09:30:00.000Z";
const SLOT_C = "2030-01-15T12:00:00.000Z";

const hrUser: AuthenticatedUser = { id: HR_ID, name: "Hema HR", email: "hr@gara.test", roles: [Role.HR] };
const managerUser: AuthenticatedUser = { id: MANAGER_ID, name: "Mo", email: "mgr@gara.test", roles: [Role.MANAGER] };
const interviewerUser: AuthenticatedUser = {
  id: INTERVIEWER_ID,
  name: "Ivan",
  email: "int@gara.test",
  roles: [Role.INTERVIEWER],
};
const candidateUser: AuthenticatedUser = {
  id: CANDIDATE_ID,
  name: "Cara",
  email: "cand@gara.test",
  roles: [Role.CANDIDATE],
};

/** Physical lines joined back into logical content lines (RFC 5545 unfolding). */
function unfold(ics: string): string[] {
  return ics.replace(/\r\n /g, "").split("\r\n").filter((line) => line !== "");
}

function signInAs(userId: string, roles: Role[]) {
  state.session = { user: { id: userId, email: `${userId}@gara.test`, name: "Tester" } };
  state.users[userId] = { roles };
}

function denyInterviews() {
  db.subAdminPermission.findUnique.mockResolvedValue({
    id: "perm",
    userId: "x",
    canApplications: true,
    canOpenings: true,
    canInterviews: false,
    canEvaluations: true,
    canEmployees: true,
    canAttendance: true,
    canLeave: true,
    canPayroll: true,
    canReports: true,
  });
}

function outboxRows(): Array<{ recipientEmail: string; templateName: string; payload: Record<string, unknown> }> {
  return db.notificationOutbox.create.mock.calls.map(
    (call) =>
      (call[0] as { data: { recipientEmail: string; templateName: string; payload: Record<string, unknown> } }).data
  );
}

function auditActions(): string[] {
  return db.auditLog.create.mock.calls.map((call) => (call[0] as { data: { action: string } }).data.action);
}

async function sendThroughOutbox(templateName: string, payload: Record<string, unknown>): Promise<OutboundEmailMessage> {
  const sendEmail = vi.fn().mockResolvedValue(undefined);
  db.notificationOutbox.findUnique.mockResolvedValue({
    id: "outbox-1",
    recipientEmail: "person@gara.test",
    templateName,
    payload,
    status: "PENDING",
    attempts: 0,
    maxAttempts: 5,
    sentAt: null,
    claimedAt: null,
  });
  db.notificationOutbox.updateMany.mockResolvedValue({ count: 1 });
  db.notificationOutbox.update.mockResolvedValue({});
  await expect(new OutboxProcessorService({ sendEmail }).processSingleRecord("outbox-1")).resolves.toBe("SENT");
  return sendEmail.mock.calls[0][0] as OutboundEmailMessage;
}

function scheduleRecord(extra: Record<string, unknown> = {}) {
  return {
    id: SCHEDULE_ID,
    applicationId: APP_ID,
    roundNumber: 1,
    roundName: "Technical",
    status: InterviewStatus.SCHEDULED,
    scheduledAt: new Date(SLOT_A),
    durationMinutes: 45,
    meetingLink: "https://meet.example.test/abc",
    icsSequence: 2,
    interviewerId: INTERVIEWER_ID,
    interviewer: { id: INTERVIEWER_ID, name: "Ivan", email: "int@gara.test", roles: [{ role: Role.INTERVIEWER }] },
    application: {
      id: APP_ID,
      referenceCode: "APP-1",
      status: ApplicationStatus.INTERVIEW_SCHEDULED,
      isArchived: false,
      opening: { title: "Engineer" },
      candidate: { user: { id: CANDIDATE_ID, email: "cand@gara.test", name: "Cara" } },
    },
    ...extra,
  };
}

function scheduleApplication(status: ApplicationStatus = ApplicationStatus.SHORTLISTED) {
  return {
    id: APP_ID,
    referenceCode: "APP-1",
    status,
    isArchived: false,
    candidate: { id: "cand-1", user: { id: CANDIDATE_ID, email: "cand@gara.test", name: "Cara" } },
    opening: { title: "Engineer" },
  };
}

function bookingApplication(extra: Record<string, unknown> = {}) {
  return {
    id: APP_ID,
    referenceCode: "APP-1",
    status: ApplicationStatus.SHORTLISTED,
    isArchived: false,
    assignedRecruiterId: null,
    candidate: { user: { id: CANDIDATE_ID, name: "Cara", email: "cand@gara.test" } },
    opening: { title: "Engineer" },
    interviewSchedules: [],
    ...extra,
  };
}

const createInput = {
  applicationId: APP_ID,
  roundNumber: 1,
  roundName: "Technical",
  durationMinutes: 45,
  interviewerId: null,
  meetingLink: "https://meet.example.test/abc",
  slots: [SLOT_B, SLOT_A, SLOT_C],
};

function bookingRequestRecord(extra: Record<string, unknown> = {}) {
  return {
    id: REQUEST_ID,
    applicationId: APP_ID,
    roundNumber: 1,
    roundName: "Technical",
    durationMinutes: 45,
    interviewerId: INTERVIEWER_ID,
    meetingLink: "https://meet.example.test/abc",
    status: "PENDING",
    createdById: HR_ID,
    slots: [{ id: SLOT_ID, startsAt: new Date(SLOT_A), status: "OPEN" }],
    application: {
      id: APP_ID,
      referenceCode: "APP-1",
      status: ApplicationStatus.SHORTLISTED,
      isArchived: false,
      candidate: { user: { id: CANDIDATE_ID, name: "Cara", email: "cand@gara.test" } },
      opening: { title: "Engineer" },
    },
    ...extra,
  };
}

function cancelRecord(extra: Record<string, unknown> = {}) {
  return {
    id: REQUEST_ID,
    applicationId: APP_ID,
    roundNumber: 1,
    roundName: "Technical",
    status: "PENDING",
    createdById: HR_ID,
    interviewerId: null,
    application: {
      referenceCode: "APP-1",
      candidate: { user: { id: CANDIDATE_ID, name: "Cara", email: "cand@gara.test" } },
      opening: { title: "Engineer" },
    },
    ...extra,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  state.session = null;
  state.capabilities = ["applications"];
  state.users = {
    [HR_ID]: { roles: [Role.HR] },
    [MANAGER_ID]: { roles: [Role.MANAGER] },
    [INTERVIEWER_ID]: { roles: [Role.INTERVIEWER] },
    [OTHER_INTERVIEWER_ID]: { roles: [Role.INTERVIEWER] },
    [CANDIDATE_ID]: { roles: [Role.CANDIDATE] },
  };
  db.$transaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => cb(db));
  db.user.findUnique.mockImplementation(async (args: { where: { id: string } }) => {
    const entry = state.users[args.where.id];
    if (!entry) return null;
    return {
      id: args.where.id,
      name: args.where.id === INTERVIEWER_ID ? "Ivan" : "Staff",
      email: args.where.id === INTERVIEWER_ID ? "int@gara.test" : `${args.where.id}@gara.test`,
      mustChangePassword: false,
      roles: entry.roles.map((role) => ({ role })),
    };
  });
  db.interviewSchedule.create.mockResolvedValue({ id: SCHEDULE_ID, applicationId: APP_ID });
  db.interviewSchedule.updateMany.mockResolvedValue({ count: 1 });
  db.interviewBookingRequest.updateMany.mockResolvedValue({ count: 1 });
  db.interviewBookingRequest.count.mockResolvedValue(0);
  db.interviewBookingRequest.create.mockResolvedValue({ id: REQUEST_ID });
  db.interviewSlotOption.updateMany.mockResolvedValue({ count: 1 });
});

// -----------------------------------------------------------------------------
// RFC 5545 generator
// -----------------------------------------------------------------------------

describe("iCalendar generator (RFC 5545)", () => {
  const base = {
    scheduleId: SCHEDULE_ID,
    host: "https://careers.example.com",
    sequence: 2,
    method: "REQUEST" as const,
    startsAt: "2030-11-15T10:00:00.000Z",
    durationMinutes: 45,
    summary: "Interview: Technical - Engineer",
    description: "Interview round: Technical",
    organizer: { email: "hiring@gara.test", name: "GARA Hiring" },
    attendees: [
      { email: "cand@gara.test", name: "Cara" },
      { email: "int@gara.test", name: "Ivan" },
    ],
    now: new Date("2030-11-01T08:30:15.123Z"),
  };

  it("uses CRLF line endings and UTC date-times", () => {
    const ics = buildInterviewIcs(base);
    expect(ics.endsWith("\r\n")).toBe(true);
    expect(ics.replace(/\r\n/g, "")).not.toMatch(/[\r\n]/);

    const lines = unfold(ics);
    expect(lines[0]).toBe("BEGIN:VCALENDAR");
    expect(lines[lines.length - 1]).toBe("END:VCALENDAR");
    expect(lines).toEqual(
      expect.arrayContaining([
        "VERSION:2.0",
        "METHOD:REQUEST",
        "STATUS:CONFIRMED",
        "SEQUENCE:2",
        "DTSTART:20301115T100000Z",
        "DTEND:20301115T104500Z",
        "DTSTAMP:20301101T083015Z",
        `UID:interview-${SCHEDULE_ID}@careers.example.com`,
        'ORGANIZER;CN="GARA Hiring":mailto:hiring@gara.test',
        'ATTENDEE;CN="Cara";ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:cand@gara.test',
        'ATTENDEE;CN="Ivan";ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:int@gara.test',
      ])
    );
    expect(formatIcsDateTime(new Date("2026-01-02T03:04:05.678Z"))).toBe("20260102T030405Z");
  });

  it("folds long lines at 75 octets without splitting multi-byte characters", () => {
    const summary = `Entretien technique — équipe données 📅 ${"très long titre ".repeat(12)}`;
    const ics = buildInterviewIcs({ ...base, summary });
    const physical = ics.split("\r\n").filter((line) => line !== "");

    for (const line of physical) {
      expect(Buffer.byteLength(line, "utf8")).toBeLessThanOrEqual(75);
      // A split surrogate pair or UTF-8 sequence would not survive a round trip.
      expect(Buffer.from(line, "utf8").toString("utf8")).toBe(line);
    }
    const summaryIndex = physical.findIndex((line) => line.startsWith("SUMMARY:"));
    expect(physical[summaryIndex + 1].startsWith(" ")).toBe(true);
    expect(unfold(ics)).toContain(`SUMMARY:${escapeIcsText(summary)}`);

    expect(foldIcsLine("A".repeat(75))).toBe("A".repeat(75));
    expect(foldIcsLine("A".repeat(76))).toBe(`${"A".repeat(75)}\r\n A`);
  });

  it("escapes TEXT values and never lets input inject properties", () => {
    expect(escapeIcsText("a\\b;c,d\ne\r\nf\u0007")).toBe("a\\\\b\\;c\\,d\\ne\\nf");

    const ics = buildInterviewIcs({
      ...base,
      summary: "Hi\r\nATTENDEE:mailto:evil@attacker.test",
      description: "<script>alert(1)</script>; see, here",
      attendees: [
        { email: "cand@gara.test", name: 'Eve "the boss"; ROLE=CHAIR' },
        { email: "evil@attacker.test\r\nORGANIZER:mailto:x@attacker.test", name: "Evil" },
      ],
    });
    const lines = unfold(ics);
    expect(lines.some((line) => line.startsWith("ATTENDEE:mailto:evil"))).toBe(false);
    expect(lines.filter((line) => line.startsWith("ORGANIZER"))).toHaveLength(1);
    expect(lines).toContain("SUMMARY:Hi\\nATTENDEE:mailto:evil@attacker.test");
    // Plain text only: HTML is kept as literal (escaped) text, no HTML description property.
    expect(lines).toContain("DESCRIPTION:<script>alert(1)</script>\\; see\\, here");
    expect(ics).not.toContain("X-ALT-DESC");
    // Quotes are removed from the CN parameter, so it cannot break out of its quoted value.
    expect(lines).toContain('ATTENDEE;CN="Eve the boss ; ROLE=CHAIR";ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:cand@gara.test');
    expect(lines.filter((line) => line.startsWith("ATTENDEE"))).toHaveLength(1);
  });

  it("keeps the UID stable for one interview across hosts formats, methods and sequences", () => {
    const uid = `interview-${SCHEDULE_ID}@careers.example.com`;
    expect(interviewEventUid(SCHEDULE_ID, "https://Careers.Example.com:8443/jobs")).toBe(uid);
    expect(interviewEventUid(SCHEDULE_ID, "careers.example.com")).toBe(uid);

    const request = unfold(buildInterviewIcs({ ...base, sequence: 0 }));
    const update = unfold(buildInterviewIcs({ ...base, sequence: 1, startsAt: "2030-11-16T10:00:00.000Z" }));
    const cancel = unfold(buildInterviewIcs({ ...base, sequence: 2, method: "CANCEL" }));
    for (const lines of [request, update, cancel]) {
      expect(lines).toContain(`UID:${uid}`);
    }
    expect(request).toContain("SEQUENCE:0");
    expect(update).toContain("SEQUENCE:1");
    expect(update).toContain("DTSTART:20301116T100000Z");
    expect(cancel).toContain("SEQUENCE:2");
  });

  it("builds CANCEL invites with STATUS:CANCELLED and no RSVP request", () => {
    const lines = unfold(buildInterviewIcs({ ...base, method: "CANCEL", sequence: 3 }));
    expect(lines).toContain("METHOD:CANCEL");
    expect(lines).toContain("STATUS:CANCELLED");
    expect(lines).toContain('ATTENDEE;CN="Cara";ROLE=REQ-PARTICIPANT:mailto:cand@gara.test');
    expect(lines.join("\n")).not.toContain("RSVP");
  });

  it("adds LOCATION and URL only for https meeting links", () => {
    const https = unfold(buildInterviewIcs({ ...base, meetingLink: "https://meet.example.test/a,b" }));
    expect(https).toContain("LOCATION:https://meet.example.test/a\\,b");
    expect(https).toContain("URL:https://meet.example.test/a,b");

    for (const link of ["http://meet.example.test/abc", "javascript:alert(1)", "not a url", null]) {
      const lines = unfold(buildInterviewIcs({ ...base, meetingLink: link }));
      expect(lines.some((line) => line.startsWith("LOCATION") || line.startsWith("URL"))).toBe(false);
    }
    expect(icsHttpsUrl("http://meet.example.test")).toBeNull();
    expect(icsHttpsUrl(" https://meet.example.test/x ")).toBe("https://meet.example.test/x");
  });

  it("builds a plain PUBLISH file without organizer or attendees for downloads", () => {
    const lines = unfold(buildInterviewIcs({ ...base, method: "PUBLISH" }));
    expect(lines).toContain("METHOD:PUBLISH");
    expect(lines.some((line) => line.startsWith("ORGANIZER") || line.startsWith("ATTENDEE"))).toBe(false);
  });

  it("parses the SMTP_FROM mailbox for the organizer", () => {
    expect(parseMailbox('"GARA Hiring" <hiring@gara.test>')).toEqual({ email: "hiring@gara.test", name: "GARA Hiring" });
    expect(parseMailbox("no-reply@gara.test")).toEqual({ email: "no-reply@gara.test", name: null });
    expect(parseMailbox("not an address")).toBeNull();
  });

  it("describes the event per recipient", () => {
    const candidate = buildInterviewEventText({
      recipientRole: "CANDIDATE",
      roundName: "Technical",
      openingTitle: "Engineer",
      candidateName: "Cara",
      durationMinutes: 45,
      meetingLink: "http://insecure.example.test",
      detailsUrl: "https://careers.example.com/candidate/applications/1",
    });
    expect(candidate.summary).toBe("Interview: Technical - Engineer (GARA Innovation)");
    expect(candidate.description).not.toContain("Candidate:");
    expect(candidate.description).not.toContain("insecure");

    const interviewer = buildInterviewEventText({
      recipientRole: "INTERVIEWER",
      roundName: "Technical",
      openingTitle: "Engineer",
      candidateName: "Cara",
      durationMinutes: 45,
      cancelled: true,
    });
    expect(interviewer.summary).toBe("Interview with Cara: Technical - Engineer");
    expect(interviewer.description.split("\n")[0]).toBe("This interview has been cancelled.");
  });
});

// -----------------------------------------------------------------------------
// Invites on interview emails (scheduling, reschedule, cancellation)
// -----------------------------------------------------------------------------

describe("Calendar invites on interview emails", () => {
  const uidLine = `UID:interview-${SCHEDULE_ID}@localhost`;

  it("attaches a REQUEST invite to the invitation for the candidate and the interviewer", async () => {
    db.application.findUnique.mockResolvedValue(scheduleApplication());
    await recruitmentService.scheduleInterview(hrUser, {
      applicationId: APP_ID,
      roundNumber: 1,
      roundName: "Technical",
      scheduledAt: SLOT_A,
      durationMinutes: 45,
      meetingLink: "https://meet.example.test/abc",
      interviewerId: INTERVIEWER_ID,
    });

    const rows = outboxRows();
    expect(rows.map((row) => [row.templateName, row.recipientEmail, row.payload.recipientRole])).toEqual([
      ["INTERVIEW_INVITATION", "cand@gara.test", "CANDIDATE"],
      ["INTERVIEW_INVITATION", "int@gara.test", "INTERVIEWER"],
    ]);
    expect(rows[0].payload.calendar).toEqual({
      scheduleId: SCHEDULE_ID,
      sequence: 0,
      startsAt: SLOT_A,
      durationMinutes: 45,
      attendees: [
        { email: "cand@gara.test", name: "Cara" },
        { email: "int@gara.test", name: "Ivan" },
      ],
    });

    for (const row of rows) {
      const message = await sendThroughOutbox(row.templateName, row.payload);
      expect(message.icalEvent?.method).toBe("REQUEST");
      const lines = unfold(message.icalEvent?.content ?? "");
      expect(lines).toEqual(
        expect.arrayContaining([
          uidLine,
          "METHOD:REQUEST",
          "SEQUENCE:0",
          "DTSTART:20300115T100000Z",
          "DTEND:20300115T104500Z",
          "LOCATION:https://meet.example.test/abc",
          "ORGANIZER;CN=\"GARA Innovation\":mailto:no-reply@garainnovation.com",
        ])
      );
      expect(lines.filter((line) => line.startsWith("ATTENDEE"))).toHaveLength(2);
      expect(message.text).toContain("calendar invitation is attached");
    }
    const interviewerMessage = await sendThroughOutbox(rows[1].templateName, rows[1].payload);
    expect(interviewerMessage.subject).toContain("Interview assigned: Cara");
    expect(unfold(interviewerMessage.icalEvent?.content ?? "")).toContain(
      "SUMMARY:Interview with Cara: Technical - Engineer"
    );
  });

  it("omits LOCATION/URL from the invite when the meeting link is not https", async () => {
    db.application.findUnique.mockResolvedValue(scheduleApplication());
    await recruitmentService.scheduleInterview(hrUser, {
      applicationId: APP_ID,
      roundNumber: 1,
      roundName: "Technical",
      scheduledAt: SLOT_A,
      durationMinutes: 45,
      meetingLink: "http://meet.example.test/abc",
      interviewerId: null,
    });
    const rows = outboxRows();
    expect(rows).toHaveLength(1);
    const message = await sendThroughOutbox(rows[0].templateName, rows[0].payload);
    const lines = unfold(message.icalEvent?.content ?? "");
    expect(lines.some((line) => line.startsWith("LOCATION") || line.startsWith("URL"))).toBe(false);
    expect(lines.filter((line) => line.startsWith("ATTENDEE"))).toHaveLength(1);
  });

  it("increments SEQUENCE on reschedule and sends the updated invite (same UID) to both", async () => {
    db.interviewSchedule.findUnique.mockResolvedValue(scheduleRecord({ icsSequence: 2 }));
    await recruitmentService.rescheduleInterview(hrUser, {
      scheduleId: SCHEDULE_ID,
      newScheduledAt: SLOT_B,
      rescheduleReason: "Panel conflict",
    });

    expect(db.interviewSchedule.updateMany).toHaveBeenCalledWith({
      where: { id: SCHEDULE_ID, status: { in: [InterviewStatus.SCHEDULED, InterviewStatus.RESCHEDULED] }, icsSequence: 2 },
      data: expect.objectContaining({ icsSequence: { increment: 1 }, status: InterviewStatus.RESCHEDULED }),
    });
    const rows = outboxRows();
    expect(rows.map((row) => [row.templateName, row.recipientEmail])).toEqual([
      ["INTERVIEW_RESCHEDULED", "cand@gara.test"],
      ["INTERVIEW_RESCHEDULED", "int@gara.test"],
    ]);
    for (const row of rows) {
      expect(row.payload).toEqual(
        expect.objectContaining({ previousScheduledAt: SLOT_A, scheduledAt: SLOT_B, reason: "Panel conflict" })
      );
      const message = await sendThroughOutbox(row.templateName, row.payload);
      expect(message.icalEvent?.method).toBe("REQUEST");
      const lines = unfold(message.icalEvent?.content ?? "");
      expect(lines).toEqual(expect.arrayContaining([uidLine, "SEQUENCE:3", "DTSTART:20300116T093000Z"]));
      expect(message.subject).toContain("Interview rescheduled");
    }
  });

  it("sends a CANCEL invite with a higher SEQUENCE to both on cancellation", async () => {
    db.interviewSchedule.findUnique.mockResolvedValue(scheduleRecord({ icsSequence: 3, status: InterviewStatus.RESCHEDULED }));
    await recruitmentService.cancelInterview(hrUser, { scheduleId: SCHEDULE_ID, cancellationReason: "Role closed" });

    expect(db.interviewSchedule.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({ icsSequence: 3 }),
      data: expect.objectContaining({ status: InterviewStatus.CANCELLED, icsSequence: { increment: 1 } }),
    });
    const rows = outboxRows();
    expect(rows.map((row) => [row.templateName, row.recipientEmail])).toEqual([
      ["INTERVIEW_CANCELLED", "cand@gara.test"],
      ["INTERVIEW_CANCELLED", "int@gara.test"],
    ]);
    for (const row of rows) {
      const message = await sendThroughOutbox(row.templateName, row.payload);
      expect(message.icalEvent).toEqual(expect.objectContaining({ method: "CANCEL", filename: "interview-cancelled.ics" }));
      const lines = unfold(message.icalEvent?.content ?? "");
      expect(lines).toEqual(expect.arrayContaining([uidLine, "METHOD:CANCEL", "STATUS:CANCELLED", "SEQUENCE:4"]));
    }
  });

  it("reports a conflict and sends nothing when the interview changed concurrently", async () => {
    db.interviewSchedule.findUnique.mockResolvedValue(scheduleRecord());
    db.interviewSchedule.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      recruitmentService.rescheduleInterview(hrUser, {
        scheduleId: SCHEDULE_ID,
        newScheduledAt: SLOT_B,
        rescheduleReason: "Panel conflict",
      })
    ).rejects.toBeInstanceOf(ConflictError);
    await expect(
      recruitmentService.cancelInterview(hrUser, { scheduleId: SCHEDULE_ID, cancellationReason: "Role closed" })
    ).rejects.toBeInstanceOf(ConflictError);
    expect(db.notificationOutbox.create).not.toHaveBeenCalled();
  });

  it("does not email an interviewer who no longer holds a staff role", async () => {
    db.interviewSchedule.findUnique.mockResolvedValue(
      scheduleRecord({ interviewer: { id: INTERVIEWER_ID, name: "Ivan", email: "int@gara.test", roles: [] } })
    );
    await recruitmentService.cancelInterview(hrUser, { scheduleId: SCHEDULE_ID, cancellationReason: "Role closed" });
    expect(outboxRows().map((row) => row.recipientEmail)).toEqual(["cand@gara.test"]);
  });

  it("sends older queued rows without calendar data as plain emails", async () => {
    const message = await sendThroughOutbox("INTERVIEW_RESCHEDULED", {
      candidateName: "Cara",
      roundName: "Technical",
      newScheduledAt: SLOT_B,
      reason: "Panel conflict",
    });
    expect(message.icalEvent).toBeUndefined();
    expect(message.subject).toContain("Interview rescheduled");
    expect(message.text).toContain("16 January 2030");
  });

  it("ignores malformed calendar payloads instead of failing the email", async () => {
    const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const message = await sendThroughOutbox("INTERVIEW_INVITATION", {
      candidateName: "Cara",
      openingTitle: "Engineer",
      roundName: "Technical",
      scheduledAt: SLOT_A,
      durationMinutes: 45,
      calendar: { scheduleId: SCHEDULE_ID, sequence: -1, startsAt: "nope", durationMinutes: 45 },
    });
    expect(message.icalEvent).toBeUndefined();
    expect(message.subject).toContain("Interview Scheduled");
    consoleSpy.mockRestore();
  });
});

// -----------------------------------------------------------------------------
// Email templates
// -----------------------------------------------------------------------------

describe("Interview and self-scheduling email templates", () => {
  const evil = `<script>alert("x")</script>`;

  it.each([
    [
      "booking request",
      () =>
        buildInterviewBookingRequestEmail({
          candidateName: evil,
          openingTitle: evil,
          roundName: evil,
          durationMinutes: 45,
          options: [SLOT_A, SLOT_B],
          href: `/candidate/interviews/${REQUEST_ID}`,
        }),
      `/candidate/interviews/${REQUEST_ID}`,
    ],
    [
      "booking cancelled",
      () =>
        buildInterviewBookingCancelledEmail({ candidateName: evil, openingTitle: evil, roundName: evil, reason: evil }),
      "/candidate/dashboard",
    ],
    [
      "interview rescheduled",
      () =>
        buildInterviewRescheduledEmail({
          recipientName: evil,
          recipientRole: "INTERVIEWER",
          candidateName: evil,
          openingTitle: evil,
          roundName: evil,
          scheduledAt: SLOT_B,
          durationMinutes: 45,
          meetingLink: "javascript:alert(1)",
          reason: evil,
          href: "/subadmin/interviews",
        }),
      "/subadmin/interviews",
    ],
    [
      "interview cancelled",
      () =>
        buildInterviewCancelledEmail({
          recipientName: evil,
          recipientRole: "CANDIDATE",
          candidateName: evil,
          openingTitle: evil,
          roundName: evil,
          reason: evil,
          href: `/candidate/applications/${APP_ID}`,
        }),
      `/candidate/applications/${APP_ID}`,
    ],
    [
      "interviewer invitation",
      () =>
        buildInterviewInvitationEmail({
          recipientRole: "INTERVIEWER",
          recipientName: evil,
          candidateName: evil,
          openingTitle: evil,
          roundName: evil,
          scheduledAt: SLOT_A,
          durationMinutes: 45,
          href: "/admin/interviews",
        }),
      "/admin/interviews",
    ],
  ])("escapes every value in the %s email and links to the right page", (_name, build, link) => {
    const email = build();
    expect(email.html).not.toContain("<script>");
    expect(email.html).toContain("&lt;script&gt;");
    expect(email.html).not.toContain("javascript:");
    expect(email.html).toContain(`${link}"`);
  });

  it("lists the offered times in business time", () => {
    const email = buildInterviewBookingRequestEmail({
      candidateName: "Cara",
      openingTitle: "Engineer",
      roundName: "Technical",
      durationMinutes: 45,
      options: [SLOT_A],
    });
    expect(email.subject).toContain("Choose your interview time");
    expect(email.text).toContain("15 January 2030");
    expect(email.text).toContain("15:30");
  });
});

// -----------------------------------------------------------------------------
// Booking request validation and permissions
// -----------------------------------------------------------------------------

describe("Booking request validation", () => {
  it("accepts 2-8 future options at least 15 minutes apart and sorts them", () => {
    const result = validateBookingSlotTimes([SLOT_B, SLOT_A, "2030-01-15T10:15:00.000Z"], NOW);
    expect(result).toEqual({
      ok: true,
      slots: [new Date(SLOT_A), new Date("2030-01-15T10:15:00.000Z"), new Date(SLOT_B)],
    });
  });

  it.each([
    [[SLOT_A], "between 2 and 8"],
    [Array.from({ length: 9 }, (_, i) => `2030-02-0${(i % 9) + 1}T10:00:00.000Z`), "between 2 and 8"],
    [["2029-12-31T10:00:00.000Z", SLOT_A], "future"],
    [[SLOT_A, SLOT_A], "different"],
    [[SLOT_A, "2030-01-15T10:10:00.000Z"], "15 minutes apart"],
    [["not a date", SLOT_A], "valid date"],
  ])("rejects %j", (slots, message) => {
    const result = validateBookingSlotTimes(slots, NOW);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain(message);
  });

  it("accepts only https meeting links and 2-8 options in the schema", () => {
    expect(CreateBookingRequestSchema.safeParse(createInput).success).toBe(true);
    expect(CreateBookingRequestSchema.safeParse({ ...createInput, meetingLink: "" }).success).toBe(true);
    expect(CreateBookingRequestSchema.safeParse({ ...createInput, meetingLink: "http://meet.example.test" }).success).toBe(false);
    expect(CreateBookingRequestSchema.safeParse({ ...createInput, meetingLink: "javascript:alert(1)" }).success).toBe(false);
    expect(CreateBookingRequestSchema.safeParse({ ...createInput, slots: [SLOT_A] }).success).toBe(false);
    expect(CreateBookingRequestSchema.safeParse({ ...createInput, slots: Array(9).fill(SLOT_A) }).success).toBe(false);
    expect(CreateBookingRequestSchema.safeParse({ ...createInput, applicationId: "x" }).success).toBe(false);
  });
});

describe("Creating booking requests (staff)", () => {
  it("offers the times, emails the candidate a booking link and audits the request", async () => {
    db.application.findUnique.mockResolvedValue(bookingApplication());
    const result = await interviewBookingService.createBookingRequest(hrUser, createInput, NOW);

    expect(result).toEqual({ requestId: REQUEST_ID, applicationId: APP_ID });
    expect(db.interviewBookingRequest.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        applicationId: APP_ID,
        status: "PENDING",
        createdById: HR_ID,
        meetingLink: "https://meet.example.test/abc",
        slots: { create: [{ startsAt: new Date(SLOT_A) }, { startsAt: new Date(SLOT_C) }, { startsAt: new Date(SLOT_B) }] },
      }),
      select: { id: true },
    });
    expect(outboxRows()).toEqual([
      expect.objectContaining({
        recipientEmail: "cand@gara.test",
        templateName: "INTERVIEW_BOOKING_REQUEST",
        payload: expect.objectContaining({ href: `/candidate/interviews/${REQUEST_ID}`, options: [SLOT_A, SLOT_C, SLOT_B] }),
      }),
    ]);
    expect(auditActions()).toEqual(["CREATE_INTERVIEW_BOOKING_REQUEST"]);
  });

  it("rejects non-staff users and staff without the interviews permission", async () => {
    await expect(interviewBookingService.createBookingRequest(candidateUser, createInput, NOW)).rejects.toBeInstanceOf(
      ForbiddenError
    );
    denyInterviews();
    await expect(interviewBookingService.createBookingRequest(hrUser, createInput, NOW)).rejects.toBeInstanceOf(
      ForbiddenError
    );
    expect(db.interviewBookingRequest.create).not.toHaveBeenCalled();
  });

  it("never lets staff offer times on their own application", async () => {
    db.application.findUnique.mockResolvedValue(
      bookingApplication({ candidate: { user: { id: HR_ID, name: "Hema", email: "hr@gara.test" } } })
    );
    await expect(interviewBookingService.createBookingRequest(hrUser, createInput, NOW)).rejects.toBeInstanceOf(
      ForbiddenError
    );
    expect(db.interviewBookingRequest.create).not.toHaveBeenCalled();
  });

  it("limits interviewers to applications they are assigned to", async () => {
    db.application.findUnique.mockResolvedValue(bookingApplication());
    await expect(interviewBookingService.createBookingRequest(interviewerUser, createInput, NOW)).rejects.toBeInstanceOf(
      ForbiddenError
    );

    db.application.findUnique.mockResolvedValue(bookingApplication({ interviewSchedules: [{ interviewerId: INTERVIEWER_ID }] }));
    await expect(
      interviewBookingService.createBookingRequest(interviewerUser, { ...createInput, interviewerId: INTERVIEWER_ID }, NOW)
    ).resolves.toEqual({ requestId: REQUEST_ID, applicationId: APP_ID });
  });

  it("lets managers and interviewers assign only themselves", async () => {
    db.application.findUnique.mockResolvedValue(bookingApplication());
    await expect(
      interviewBookingService.createBookingRequest(managerUser, { ...createInput, interviewerId: INTERVIEWER_ID }, NOW)
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      interviewBookingService.createBookingRequest(managerUser, { ...createInput, interviewerId: MANAGER_ID }, NOW)
    ).resolves.toEqual({ requestId: REQUEST_ID, applicationId: APP_ID });

    const options = await interviewBookingService.listInterviewerOptions(managerUser);
    expect(options).toEqual([{ id: MANAGER_ID, name: "Mo", email: "mgr@gara.test", roles: [Role.MANAGER] }]);
    expect(db.user.findMany).not.toHaveBeenCalled();
  });

  it("rejects candidates as interviewers and non-staff interviewers", async () => {
    db.application.findUnique.mockResolvedValue(bookingApplication());
    await expect(
      interviewBookingService.createBookingRequest(hrUser, { ...createInput, interviewerId: CANDIDATE_ID }, NOW)
    ).rejects.toBeInstanceOf(ValidationError);
    state.users[OTHER_INTERVIEWER_ID] = { roles: [Role.CANDIDATE] };
    await expect(
      interviewBookingService.createBookingRequest(hrUser, { ...createInput, interviewerId: OTHER_INTERVIEWER_ID }, NOW)
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it.each([ApplicationStatus.REJECTED, ApplicationStatus.WITHDRAWN, ApplicationStatus.HIRED, ApplicationStatus.ARCHIVED])(
    "blocks offering times on %s applications",
    async (status) => {
      db.application.findUnique.mockResolvedValue(bookingApplication({ status }));
      await expect(interviewBookingService.createBookingRequest(hrUser, createInput, NOW)).rejects.toBeInstanceOf(
        ValidationError
      );
      expect(db.interviewBookingRequest.create).not.toHaveBeenCalled();
    }
  );

  it("rejects a second pending request for the same round and invalid times", async () => {
    db.application.findUnique.mockResolvedValue(bookingApplication());
    db.interviewBookingRequest.count.mockResolvedValue(1);
    await expect(interviewBookingService.createBookingRequest(hrUser, createInput, NOW)).rejects.toBeInstanceOf(
      ConflictError
    );

    await expect(
      interviewBookingService.createBookingRequest(hrUser, { ...createInput, slots: ["2029-12-01T10:00:00.000Z", SLOT_A] }, NOW)
    ).rejects.toBeInstanceOf(ValidationError);
    expect(db.interviewBookingRequest.create).not.toHaveBeenCalled();
  });

  it("validates input in the Server Action and flushes the outbox after success", async () => {
    signInAs(CANDIDATE_ID, [Role.CANDIDATE]);
    expect((await createInterviewBookingRequestAction(createInput)).success).toBe(false);
    expect(db.$transaction).not.toHaveBeenCalled();

    signInAs(HR_ID, [Role.HR]);
    const invalid = await createInterviewBookingRequestAction({ ...createInput, slots: [SLOT_A] });
    expect(invalid).toEqual(expect.objectContaining({ success: false, fieldErrors: expect.objectContaining({ slots: expect.any(String) }) }));
    expect(db.$transaction).not.toHaveBeenCalled();

    db.application.findUnique.mockResolvedValue(bookingApplication());
    const ok = await createInterviewBookingRequestAction(createInput);
    expect(ok).toEqual({ success: true, data: { requestId: REQUEST_ID } });
    expect(scheduleOutboxFlush).toHaveBeenCalledTimes(1);
  });
});

// -----------------------------------------------------------------------------
// Candidate booking
// -----------------------------------------------------------------------------

describe("Candidate booking", () => {
  const input = { requestId: REQUEST_ID, slotId: SLOT_ID };

  it("books the slot, releases the others and creates the interview with reminders and invites", async () => {
    db.interviewBookingRequest.findUnique.mockResolvedValue(bookingRequestRecord());
    const result = await interviewBookingService.bookSlot(candidateUser, input, NOW);

    expect(result).toEqual({ requestId: REQUEST_ID, applicationId: APP_ID, scheduleId: SCHEDULE_ID });
    expect(db.interviewBookingRequest.updateMany).toHaveBeenCalledWith({
      where: { id: REQUEST_ID, status: "PENDING" },
      data: { status: "BOOKED" },
    });
    expect(db.interviewSlotOption.updateMany).toHaveBeenNthCalledWith(1, {
      where: { id: SLOT_ID, requestId: REQUEST_ID, status: "OPEN", startsAt: { gt: NOW } },
      data: { status: "BOOKED" },
    });
    expect(db.interviewSlotOption.updateMany).toHaveBeenNthCalledWith(2, {
      where: { requestId: REQUEST_ID, id: { not: SLOT_ID }, status: "OPEN" },
      data: { status: "RELEASED" },
    });
    expect(db.interviewSchedule.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          applicationId: APP_ID,
          scheduledAt: new Date(SLOT_A),
          durationMinutes: 45,
          interviewerId: INTERVIEWER_ID,
          meetingLink: "https://meet.example.test/abc",
          scheduledById: HR_ID,
          status: InterviewStatus.SCHEDULED,
        }),
      })
    );
    // 24-hour and 1-hour reminders, exactly like staff scheduling.
    expect(enqueueJob).toHaveBeenCalledTimes(2);
    expect(enqueueJob).toHaveBeenCalledWith(
      expect.objectContaining({ type: "INTERVIEW_REMINDER", runAt: new Date("2030-01-14T10:00:00.000Z") }),
      db
    );
    expect(outboxRows().map((row) => [row.templateName, row.recipientEmail])).toEqual([
      ["INTERVIEW_INVITATION", "cand@gara.test"],
      ["INTERVIEW_INVITATION", "int@gara.test"],
    ]);
    expect(db.interviewBookingRequest.update).toHaveBeenCalledWith({
      where: { id: REQUEST_ID },
      data: { bookedScheduleId: SCHEDULE_ID },
    });
    expect(auditActions()).toEqual(["BOOK_INTERVIEW_SLOT", "SCHEDULE_INTERVIEW"]);
    expect(db.auditLog.create.mock.calls[1][0].data.diffPayload).toEqual(
      expect.objectContaining({ source: "CANDIDATE_SELF_SCHEDULING", bookingRequestId: REQUEST_ID })
    );
  });

  it("only lets candidates book their own request (others are not found)", async () => {
    db.interviewBookingRequest.findUnique.mockResolvedValue(bookingRequestRecord());
    const otherCandidate = { ...candidateUser, id: OTHER_CANDIDATE_ID };
    await expect(interviewBookingService.bookSlot(otherCandidate, input, NOW)).rejects.toThrow(BOOKING_NOT_FOUND_MESSAGE);

    db.interviewBookingRequest.findUnique.mockResolvedValue(null);
    await expect(interviewBookingService.bookSlot(candidateUser, input, NOW)).rejects.toBeInstanceOf(NotFoundError);
    expect(db.interviewBookingRequest.updateMany).not.toHaveBeenCalled();
    expect(db.interviewSchedule.create).not.toHaveBeenCalled();
  });

  it.each([
    ["taken", { slots: [{ id: SLOT_ID, startsAt: new Date(SLOT_A), status: "BOOKED" }] }],
    ["released", { slots: [{ id: SLOT_ID, startsAt: new Date(SLOT_A), status: "RELEASED" }] }],
    ["past", { slots: [{ id: SLOT_ID, startsAt: new Date("2029-12-31T10:00:00.000Z"), status: "OPEN" }] }],
    ["already booked", { status: "BOOKED" }],
    ["withdrawn", { status: "CANCELLED" }],
  ])("reports a friendly conflict when the request or slot is %s", async (_label, extra) => {
    db.interviewBookingRequest.findUnique.mockResolvedValue(bookingRequestRecord(extra));
    await expect(interviewBookingService.bookSlot(candidateUser, input, NOW)).rejects.toBeInstanceOf(ConflictError);
    expect(db.interviewBookingRequest.updateMany).not.toHaveBeenCalled();
    expect(db.interviewSchedule.create).not.toHaveBeenCalled();
  });

  it("detects concurrent bookings through the conditional writes", async () => {
    // Both attempts read the request while it was still pending; only the first claim wins.
    db.interviewBookingRequest.findUnique.mockResolvedValue(bookingRequestRecord());
    db.interviewBookingRequest.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });

    await expect(interviewBookingService.bookSlot(candidateUser, input, NOW)).resolves.toEqual(
      expect.objectContaining({ scheduleId: SCHEDULE_ID })
    );
    await expect(interviewBookingService.bookSlot(candidateUser, input, NOW)).rejects.toBeInstanceOf(ConflictError);
    expect(db.interviewSchedule.create).toHaveBeenCalledTimes(1);
  });

  it("rolls back when the slot was claimed concurrently", async () => {
    db.interviewBookingRequest.findUnique.mockResolvedValue(bookingRequestRecord());
    db.interviewSlotOption.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(interviewBookingService.bookSlot(candidateUser, input, NOW)).rejects.toThrow(SLOT_UNAVAILABLE_MESSAGE);
    expect(db.interviewSchedule.create).not.toHaveBeenCalled();
    expect(db.notificationOutbox.create).not.toHaveBeenCalled();
  });

  it("applies the scheduling validations: closed applications and non-staff interviewers", async () => {
    db.interviewBookingRequest.findUnique.mockResolvedValue(
      bookingRequestRecord({ application: { ...bookingRequestRecord().application, status: ApplicationStatus.REJECTED } })
    );
    await expect(interviewBookingService.bookSlot(candidateUser, input, NOW)).rejects.toBeInstanceOf(ValidationError);

    db.interviewBookingRequest.findUnique.mockResolvedValue(bookingRequestRecord());
    state.users[INTERVIEWER_ID] = { roles: [Role.CANDIDATE] };
    await expect(interviewBookingService.bookSlot(candidateUser, input, NOW)).rejects.toBeInstanceOf(ValidationError);
    expect(db.interviewBookingRequest.updateMany).not.toHaveBeenCalled();
  });

  it("guards the Server Action: staff, missing capability, invalid input, conflicts", async () => {
    signInAs(HR_ID, [Role.HR]);
    expect((await bookInterviewSlotAction(input)).success).toBe(false);

    signInAs(CANDIDATE_ID, [Role.CANDIDATE]);
    state.capabilities = ["journey"];
    expect((await bookInterviewSlotAction(input)).success).toBe(false);
    expect(db.interviewBookingRequest.findUnique).not.toHaveBeenCalled();

    state.capabilities = ["applications"];
    expect(await bookInterviewSlotAction({ requestId: REQUEST_ID, slotId: "nope" })).toEqual(
      expect.objectContaining({ success: false, conflict: true })
    );
    expect(db.interviewBookingRequest.findUnique).not.toHaveBeenCalled();

    db.interviewBookingRequest.findUnique.mockResolvedValue(
      bookingRequestRecord({ slots: [{ id: SLOT_ID, startsAt: new Date(SLOT_A), status: "BOOKED" }] })
    );
    expect(await bookInterviewSlotAction(input)).toEqual({
      success: false,
      error: SLOT_UNAVAILABLE_MESSAGE,
      conflict: true,
    });

    db.interviewBookingRequest.findUnique.mockResolvedValue(bookingRequestRecord());
    expect(await bookInterviewSlotAction(input)).toEqual({
      success: true,
      data: { requestId: REQUEST_ID, applicationId: APP_ID },
    });
    expect(scheduleOutboxFlush).toHaveBeenCalledTimes(1);
  });
});

// -----------------------------------------------------------------------------
// Cancelling booking requests
// -----------------------------------------------------------------------------

describe("Cancelling booking requests", () => {
  const input = { requestId: REQUEST_ID, reason: "The role was put on hold" };

  it("withdraws a pending request, releases its times, emails the candidate and audits", async () => {
    db.interviewBookingRequest.findUnique.mockResolvedValue(cancelRecord());
    await interviewBookingService.cancelBookingRequest(hrUser, input);

    expect(db.interviewBookingRequest.updateMany).toHaveBeenCalledWith({
      where: { id: REQUEST_ID, status: "PENDING" },
      data: { status: "CANCELLED" },
    });
    expect(db.interviewSlotOption.updateMany).toHaveBeenCalledWith({
      where: { requestId: REQUEST_ID, status: "OPEN" },
      data: { status: "RELEASED" },
    });
    expect(outboxRows()).toEqual([
      expect.objectContaining({
        recipientEmail: "cand@gara.test",
        templateName: "INTERVIEW_BOOKING_CANCELLED",
        payload: expect.objectContaining({ reason: "The role was put on hold" }),
      }),
    ]);
    expect(auditActions()).toEqual(["CANCEL_INTERVIEW_BOOKING_REQUEST"]);
  });

  it("rejects requests that are no longer pending and lost races", async () => {
    db.interviewBookingRequest.findUnique.mockResolvedValue(cancelRecord({ status: "BOOKED" }));
    await expect(interviewBookingService.cancelBookingRequest(hrUser, input)).rejects.toBeInstanceOf(ValidationError);
    expect(db.interviewBookingRequest.updateMany).not.toHaveBeenCalled();

    db.interviewBookingRequest.findUnique.mockResolvedValue(cancelRecord());
    db.interviewBookingRequest.updateMany.mockResolvedValue({ count: 0 });
    await expect(interviewBookingService.cancelBookingRequest(hrUser, input)).rejects.toBeInstanceOf(ConflictError);
    expect(db.notificationOutbox.create).not.toHaveBeenCalled();
  });

  it("limits interviewers to requests they offered and blocks the actor's own application", async () => {
    db.interviewBookingRequest.findUnique.mockResolvedValue(cancelRecord());
    await expect(interviewBookingService.cancelBookingRequest(interviewerUser, input)).rejects.toBeInstanceOf(
      ForbiddenError
    );
    db.interviewBookingRequest.findUnique.mockResolvedValue(cancelRecord({ createdById: INTERVIEWER_ID }));
    await expect(interviewBookingService.cancelBookingRequest(interviewerUser, input)).resolves.toEqual({
      requestId: REQUEST_ID,
      applicationId: APP_ID,
    });

    db.interviewBookingRequest.findUnique.mockResolvedValue(
      cancelRecord({
        application: { ...cancelRecord().application, candidate: { user: { id: HR_ID, name: "Hema", email: "hr@gara.test" } } },
      })
    );
    await expect(interviewBookingService.cancelBookingRequest(hrUser, input)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("requires a reason and a staff role in the Server Action", async () => {
    signInAs(CANDIDATE_ID, [Role.CANDIDATE]);
    expect((await cancelInterviewBookingRequestAction(input)).success).toBe(false);

    signInAs(HR_ID, [Role.HR]);
    const res = await cancelInterviewBookingRequestAction({ requestId: REQUEST_ID, reason: "" });
    expect(res).toEqual(expect.objectContaining({ success: false, fieldErrors: expect.objectContaining({ reason: expect.any(String) }) }));
    expect(db.$transaction).not.toHaveBeenCalled();
  });
});

// -----------------------------------------------------------------------------
// Read projections
// -----------------------------------------------------------------------------

describe("Booking request read projections", () => {
  function staffRow(extra: Record<string, unknown> = {}) {
    return {
      id: REQUEST_ID,
      applicationId: APP_ID,
      roundNumber: 1,
      roundName: "Technical",
      durationMinutes: 45,
      meetingLink: null,
      status: "PENDING",
      createdAt: new Date("2029-12-20T10:00:00.000Z"),
      createdById: HR_ID,
      interviewerId: null,
      interviewer: null,
      bookedSchedule: null,
      slots: [
        { id: SLOT_ID, startsAt: new Date("2029-12-30T10:00:00.000Z"), status: "OPEN" },
        { id: "slot-2", startsAt: new Date("2029-12-30T11:00:00.000Z"), status: "OPEN" },
      ],
      ...extra,
    };
  }

  it("flags pending requests whose times have all passed as 'no times left'", async () => {
    db.interviewBookingRequest.findMany.mockResolvedValue([staffRow()]);
    const [view] = await interviewBookingService.listRequestsForApplication(hrUser, APP_ID, NOW);
    expect(view).toEqual(expect.objectContaining({ status: "PENDING", openSlotCount: 0, noTimesLeft: true, canCancel: true }));
    expect(view.slots.every((slot) => slot.isPast)).toBe(true);
  });

  it("scopes interviewers to requests they offered or conduct, and hides the viewer's own application", async () => {
    db.interviewBookingRequest.findMany.mockResolvedValue([]);
    await interviewBookingService.listRequestsForApplication(interviewerUser, APP_ID, NOW);
    expect(db.interviewBookingRequest.findMany.mock.calls[0][0].where).toEqual({
      applicationId: APP_ID,
      AND: [
        {
          AND: [
            { application: { candidate: { userId: { not: INTERVIEWER_ID } } } },
            { OR: [{ createdById: INTERVIEWER_ID }, { interviewerId: INTERVIEWER_ID }] },
          ],
        },
      ],
    });
  });

  it("loads only the candidate's own request and hides options on closed applications", async () => {
    db.interviewBookingRequest.findFirst.mockResolvedValue({
      id: REQUEST_ID,
      status: "PENDING",
      roundNumber: 1,
      roundName: "Technical",
      durationMinutes: 45,
      application: { id: APP_ID, referenceCode: "APP-1", status: "REJECTED", isArchived: false, opening: { title: "Engineer" } },
      slots: [{ id: SLOT_ID, startsAt: new Date(SLOT_A) }],
      bookedSchedule: null,
    });
    const booking = await getOwnInterviewBooking(CANDIDATE_ID, REQUEST_ID, NOW);
    expect(db.interviewBookingRequest.findFirst.mock.calls[0][0].where).toEqual({
      id: REQUEST_ID,
      application: { candidate: { userId: CANDIDATE_ID } },
    });
    expect(db.interviewBookingRequest.findFirst.mock.calls[0][0].select.slots.where).toEqual({
      status: "OPEN",
      startsAt: { gt: NOW },
    });
    expect(booking).toEqual(expect.objectContaining({ applicationActive: false, availableSlots: [] }));

    db.interviewBookingRequest.findFirst.mockResolvedValue(null);
    await expect(getOwnInterviewBooking(CANDIDATE_ID, REQUEST_ID, NOW)).resolves.toBeNull();
  });

  it("lists pending requests for the dashboard card on open applications only", async () => {
    db.interviewBookingRequest.findMany.mockResolvedValue([]);
    await getOwnPendingInterviewBookings(CANDIDATE_ID, NOW);
    expect(db.interviewBookingRequest.findMany.mock.calls[0][0].where).toEqual({
      status: "PENDING",
      application: {
        candidate: { userId: CANDIDATE_ID },
        isArchived: false,
        status: { notIn: [ApplicationStatus.REJECTED, ApplicationStatus.WITHDRAWN, ApplicationStatus.HIRED, ApplicationStatus.ARCHIVED] },
      },
    });
  });

  it("bounds the staff interview board's pending requests to one page and scopes them", async () => {
    db.interviewBookingRequest.findMany.mockResolvedValue([
      staffRow({
        application: { candidate: { user: { name: "Cara" } }, opening: { title: "Engineer", department: "Eng" } },
      }),
    ]);
    const [item] = await interviewBookingService.listPendingRequestsForBoard(hrUser, NOW);

    const args = db.interviewBookingRequest.findMany.mock.calls[0][0];
    expect(args.where).toEqual({
      status: "PENDING",
      AND: [{ AND: [{ application: { candidate: { userId: { not: HR_ID } } } }] }],
    });
    // Never more than one page of rows leaves the database, and relations are narrowed.
    expect(args).toMatchObject({ take: 50, orderBy: { createdAt: "asc" } });
    expect(args.include).toBeUndefined();
    expect(item).toEqual(
      expect.objectContaining({
        candidateName: "Cara",
        openingTitle: "Engineer",
        openingDepartment: "Eng",
        noTimesLeft: true,
      })
    );
  });

  it("scopes the board to the interviewer's own requests and guards role and permission", async () => {
    db.interviewBookingRequest.findMany.mockResolvedValue([]);
    await interviewBookingService.listPendingRequestsForBoard(interviewerUser, NOW);
    expect(db.interviewBookingRequest.findMany.mock.calls[0][0].where.AND).toEqual([
      {
        AND: [
          { application: { candidate: { userId: { not: INTERVIEWER_ID } } } },
          { OR: [{ createdById: INTERVIEWER_ID }, { interviewerId: INTERVIEWER_ID }] },
        ],
      },
    ]);

    await expect(interviewBookingService.listPendingRequestsForBoard(candidateUser, NOW)).rejects.toBeInstanceOf(
      ForbiddenError
    );
    denyInterviews();
    await expect(interviewBookingService.listPendingRequestsForBoard(hrUser, NOW)).rejects.toBeInstanceOf(
      ForbiddenError
    );
    expect(db.interviewBookingRequest.findMany).toHaveBeenCalledTimes(1);
  });
});
