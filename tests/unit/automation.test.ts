import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen } from "@testing-library/react";
import { ApplicationStatus, InterviewStatus, Role } from "@prisma/client";

const { db } = vi.hoisted(() => {
  const fn = () => vi.fn();
  const db = {
    scheduledJob: { findUnique: fn(), findMany: fn(), create: fn(), update: fn(), updateMany: fn() },
    interviewSchedule: { findUnique: fn(), count: fn(), findMany: fn() },
    notificationOutbox: { findMany: fn(), createMany: fn(), findUnique: fn(), updateMany: fn(), update: fn() },
    internshipEnrollment: { findMany: fn(), count: fn() },
    evaluationCheckpoint: { findMany: fn(), count: fn() },
    user: { findMany: fn(), findUnique: fn() },
    subAdminPermission: { findUnique: fn() },
    conversionReview: { findMany: fn(), count: fn() },
    application: { findMany: fn(), count: fn() },
    jobOffer: { findMany: fn(), count: fn() },
    leaveRequest: { findMany: fn(), count: fn() },
    attendanceRegularization: { findMany: fn(), count: fn() },
    $transaction: fn(),
  };
  return { db };
});

vi.mock("@/lib/db", () => ({ prisma: db }));

import {
  cancelInterviewReminders,
  interviewReminderDedupeKey,
  scheduleInterviewReminders,
} from "@/features/automation/interview-reminder-jobs";
import { handleInterviewReminder } from "@/features/automation/interview-reminders";
import { evaluationDayNumberOn, runCheckpointReminders } from "@/features/automation/checkpoint-reminders";
import {
  conversionReviewState,
  runConversionReviewReminders,
} from "@/features/automation/conversion-review-reminders";
import { runStaffDailyDigest } from "@/features/automation/staff-digest";
import { automationHandlers, ensureRecurringJobs } from "@/features/automation/registry";
import { getActionCenter } from "@/features/automation/services/action-center-service";
import { ActionCenterSkeleton, ActionCenterView } from "@/features/automation/components/action-center-panel";
import { JOB_TYPES } from "@/features/automation/job-types";
import {
  buildAppUrl,
  buildCheckpointReminderEmail,
  buildCheckpointReviewReminderEmail,
  buildConversionCompletedEmail,
  buildConversionOfferExtendedEmail,
  buildConversionReviewReminderEmail,
  buildEvaluationSupervisorChangedEmail,
  buildInternshipEndingEmail,
  buildInternshipReviewExtendedEmail,
  buildInterviewReminderEmail,
  buildStaffDailyDigestEmail,
} from "@/infrastructure/email/email-templates";
import { OutboxProcessorService } from "@/infrastructure/email/outbox-processor";
import type { AuthenticatedUser } from "@/lib/auth/guards";
import type { ActionCenterResult } from "@/features/automation/types";

// -----------------------------------------------------------------------------
// Fixtures
// -----------------------------------------------------------------------------

const SCHEDULE_ID = "sched-1";
const APP_ID = "app-1";
const FUTURE = "2030-01-15T10:00:00.000Z";
const HOUR = 60 * 60 * 1000;

const noPermissions = {
  canApplications: false,
  canOpenings: false,
  canInterviews: false,
  canEvaluations: false,
  canEmployees: false,
  canAttendance: false,
  canLeave: false,
  canPayroll: false,
  canReports: false,
};

function staff(id: string, roles: Role[]): AuthenticatedUser {
  return { id, name: `User ${id}`, email: `${id}@gara.test`, roles };
}

const customPermissions = new Map<string, Partial<typeof noPermissions>>();

type OutboxRow = { recipientEmail: string; templateName: string; payload: Record<string, unknown>; dedupeKey: string };

/** Dedupe keys already present in the outbox (simulates the unique column). */
const existingOutboxKeys = new Set<string>();
/** Rows actually inserted (createMany with skipDuplicates drops existing keys). */
let insertedOutboxRows: OutboxRow[] = [];

function queuedEmails(): OutboxRow[] {
  return insertedOutboxRows;
}

const SECTION_MODELS = [
  db.interviewSchedule,
  db.internshipEnrollment,
  db.evaluationCheckpoint,
  db.conversionReview,
  db.application,
  db.jobOffer,
  db.leaveRequest,
  db.attendanceRegularization,
];

beforeEach(() => {
  vi.resetAllMocks();
  customPermissions.clear();
  db.subAdminPermission.findUnique.mockImplementation(async (args: { where: { userId: string } }) => {
    const custom = customPermissions.get(args.where.userId);
    return custom ? { id: "perm", userId: args.where.userId, ...noPermissions, ...custom } : null;
  });
  existingOutboxKeys.clear();
  insertedOutboxRows = [];
  db.notificationOutbox.createMany.mockImplementation(
    async (args: { data: OutboxRow[]; skipDuplicates?: boolean }) => {
      const fresh = args.data.filter((row) => !(args.skipDuplicates && existingOutboxKeys.has(row.dedupeKey)));
      fresh.forEach((row) => existingOutboxKeys.add(row.dedupeKey));
      insertedOutboxRows.push(...fresh);
      return { count: fresh.length };
    }
  );
  db.scheduledJob.findMany.mockResolvedValue([]);
  db.scheduledJob.findUnique.mockResolvedValue(null);
  db.scheduledJob.create.mockResolvedValue({});
  db.scheduledJob.updateMany.mockResolvedValue({ count: 0 });
  for (const model of SECTION_MODELS) {
    model.count.mockResolvedValue(0);
    model.findMany.mockResolvedValue([]);
  }
  db.user.findMany.mockResolvedValue([]);
});

// -----------------------------------------------------------------------------
// 1. Interview reminder jobs
// -----------------------------------------------------------------------------

describe("Interview reminder jobs", () => {
  const scheduledAt = new Date(FUTURE);
  const tx = db as unknown as Parameters<typeof scheduleInterviewReminders>[0];

  it("queues 24h and 1h reminders with time-specific dedupe keys", async () => {
    const queued = await scheduleInterviewReminders(tx, {
      scheduleId: SCHEDULE_ID,
      scheduledAt,
      now: new Date("2030-01-01T00:00:00.000Z"),
    });

    expect(queued).toBe(2);
    expect(db.scheduledJob.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: JOB_TYPES.INTERVIEW_REMINDER,
        runAt: new Date(scheduledAt.getTime() - 24 * HOUR),
        dedupeKey: `interview-reminder:${SCHEDULE_ID}:${FUTURE}:24h`,
        payload: { scheduleId: SCHEDULE_ID, scheduledAt: FUTURE, leadTime: "24h" },
      }),
    });
    expect(db.scheduledJob.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        runAt: new Date(scheduledAt.getTime() - HOUR),
        dedupeKey: `interview-reminder:${SCHEDULE_ID}:${FUTURE}:1h`,
      }),
    });
  });

  it("skips reminder times that are already past", async () => {
    const queued = await scheduleInterviewReminders(tx, {
      scheduleId: SCHEDULE_ID,
      scheduledAt,
      now: new Date(scheduledAt.getTime() - 3 * HOUR),
    });
    expect(queued).toBe(1);
    expect(db.scheduledJob.create).toHaveBeenCalledTimes(1);
    expect(db.scheduledJob.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ dedupeKey: interviewReminderDedupeKey(SCHEDULE_ID, scheduledAt, "1h") }),
    });
  });

  it("does not re-run a reminder that was already sent for the same time", async () => {
    db.scheduledJob.findUnique.mockResolvedValue({ id: "job-1", status: "DONE" });
    await scheduleInterviewReminders(tx, { scheduleId: SCHEDULE_ID, scheduledAt, now: new Date("2030-01-01") });
    expect(db.scheduledJob.create).not.toHaveBeenCalled();
    expect(db.scheduledJob.update).not.toHaveBeenCalled();
  });

  it("cancels every pending reminder of the interview by key prefix", async () => {
    await cancelInterviewReminders(tx, SCHEDULE_ID);
    expect(db.scheduledJob.updateMany).toHaveBeenCalledWith({
      where: {
        dedupeKey: { startsWith: `interview-reminder:${SCHEDULE_ID}:` },
        status: { in: ["PENDING", "FAILED"] },
      },
      data: { status: "CANCELLED", lockedAt: null },
    });
  });
});

// -----------------------------------------------------------------------------
// 2. Interview reminder handler
// -----------------------------------------------------------------------------

describe("INTERVIEW_REMINDER handler", () => {
  const payload = { scheduleId: SCHEDULE_ID, scheduledAt: FUTURE, leadTime: "24h" };
  const context = { jobId: "job-1", now: new Date(new Date(FUTURE).getTime() - 24 * HOUR), attempt: 1 };
  const baseKey = `interview-reminder:${SCHEDULE_ID}:${FUTURE}:24h`;

  function interview(extra: Record<string, unknown> = {}) {
    return {
      id: SCHEDULE_ID,
      status: InterviewStatus.SCHEDULED,
      scheduledAt: new Date(FUTURE),
      roundName: "Technical",
      durationMinutes: 45,
      meetingLink: "https://meet.example/abc",
      applicationId: APP_ID,
      interviewer: { id: "int-1", name: "Ivan", email: "ivan@gara.test", roles: [{ role: Role.INTERVIEWER }] },
      application: {
        status: ApplicationStatus.INTERVIEW_SCHEDULED,
        isArchived: false,
        opening: { title: "Engineer" },
        candidate: { user: { id: "cand-1", name: "Cara", email: "cara@gara.test" } },
      },
      ...extra,
    };
  }

  it("emails the candidate and the assigned interviewer", async () => {
    db.interviewSchedule.findUnique.mockResolvedValue(interview());
    await handleInterviewReminder(payload, context);

    const emails = queuedEmails();
    expect(emails).toHaveLength(2);
    expect(emails[0]).toMatchObject({
      recipientEmail: "cara@gara.test",
      templateName: "INTERVIEW_REMINDER",
      payload: {
        recipientName: "Cara",
        recipientRole: "CANDIDATE",
        candidateName: "Cara",
        openingTitle: "Engineer",
        roundName: "Technical",
        scheduledAt: FUTURE,
        durationMinutes: 45,
        leadTime: "24h",
        href: `/candidate/applications/${APP_ID}`,
        dedupeKey: `${baseKey}:CANDIDATE`,
      },
    });
    expect(emails[1]).toMatchObject({
      recipientEmail: "ivan@gara.test",
      payload: { recipientRole: "INTERVIEWER", href: "/subadmin/interviews", dedupeKey: `${baseKey}:INTERVIEWER` },
    });
  });

  it("still sends for a rescheduled interview at the queued time", async () => {
    db.interviewSchedule.findUnique.mockResolvedValue(interview({ status: InterviewStatus.RESCHEDULED }));
    await handleInterviewReminder(payload, context);
    expect(queuedEmails()).toHaveLength(2);
  });

  it.each([
    ["moved to another time", { scheduledAt: new Date("2030-01-16T10:00:00.000Z") }],
    ["cancelled", { status: InterviewStatus.CANCELLED }],
    ["completed", { status: InterviewStatus.COMPLETED }],
    ["for a rejected application", { application: { ...interview().application, status: ApplicationStatus.REJECTED } }],
    ["for an archived application", { application: { ...interview().application, isArchived: true } }],
  ])("does nothing when the interview was %s", async (_label, extra) => {
    db.interviewSchedule.findUnique.mockResolvedValue(interview(extra));
    await handleInterviewReminder(payload, context);
    expect(db.notificationOutbox.createMany).not.toHaveBeenCalled();
  });

  it("does nothing when the interview no longer exists or has already started", async () => {
    db.interviewSchedule.findUnique.mockResolvedValue(null);
    await handleInterviewReminder(payload, context);
    db.interviewSchedule.findUnique.mockResolvedValue(interview());
    await handleInterviewReminder(payload, { ...context, now: new Date(new Date(FUTURE).getTime() + 60_000) });
    expect(db.notificationOutbox.createMany).not.toHaveBeenCalled();
  });

  it("does not email an interviewer who no longer holds a staff role", async () => {
    db.interviewSchedule.findUnique.mockResolvedValue(
      interview({ interviewer: { id: "int-1", name: "Ivan", email: "ivan@gara.test", roles: [{ role: Role.CANDIDATE }] } })
    );
    await handleInterviewReminder(payload, context);
    expect(queuedEmails().map((e) => e.recipientEmail)).toEqual(["cara@gara.test"]);
  });

  it("does not double-send when the job is retried after a partial run", async () => {
    db.interviewSchedule.findUnique.mockResolvedValue(interview());
    existingOutboxKeys.add(`${baseKey}:CANDIDATE`);
    await handleInterviewReminder(payload, context);
    expect(db.notificationOutbox.createMany).toHaveBeenCalledWith(expect.objectContaining({ skipDuplicates: true }));
    expect(queuedEmails().map((e) => e.payload.recipientRole)).toEqual(["INTERVIEWER"]);
  });

  it("ignores malformed payloads without touching the database", async () => {
    await handleInterviewReminder({ scheduleId: SCHEDULE_ID }, context);
    await handleInterviewReminder(null, context);
    expect(db.interviewSchedule.findUnique).not.toHaveBeenCalled();
  });
});

// -----------------------------------------------------------------------------
// 3. Daily checkpoint reminders
// -----------------------------------------------------------------------------

describe("CHECKPOINT_REMINDERS_DAILY", () => {
  const TUESDAY = "2026-10-27";
  const now = new Date("2026-10-27T03:30:00.000Z"); // 09:00 IST

  function enrollment(id: string, startDate: string, pendingDays: number[]) {
    return {
      id,
      startDate: new Date(`${startDate}T00:00:00.000Z`),
      workingDaysTarget: 7,
      user: { name: `Intern ${id}`, email: `${id}@gara.test` },
      application: { opening: { title: "Data Intern" } },
      checkpoints: pendingDays.map((day) => ({ dayNumber: day, title: `Task ${day}` })),
    };
  }

  it("maps business dates to working-day numbers, skipping weekends", () => {
    const monday = new Date("2026-10-26T00:00:00.000Z");
    expect(evaluationDayNumberOn(monday, 7, "2026-10-26")).toBe(1);
    expect(evaluationDayNumberOn(monday, 7, TUESDAY)).toBe(2);
    expect(evaluationDayNumberOn(monday, 7, "2026-10-31")).toBeNull(); // Saturday
    expect(evaluationDayNumberOn(new Date("2026-10-21T00:00:00.000Z"), 7, TUESDAY)).toBe(5);
    expect(evaluationDayNumberOn(monday, 7, "2026-11-10")).toBeNull(); // after the window
  });

  it("reminds interns whose checkpoint for today is still pending and supervisors with submitted checkpoints", async () => {
    db.internshipEnrollment.findMany.mockResolvedValue([
      enrollment("enr-1", "2026-10-26", [2, 3]),
      enrollment("enr-2", "2026-10-26", [3]), // today's (day 2) checkpoint already submitted
      enrollment("enr-3", "2026-10-21", [5]), // Wed start: today is day 5
    ]);
    db.evaluationCheckpoint.findMany.mockResolvedValue([
      { dayNumber: 1, enrollment: { userId: "i-1", supervisorId: "mentor-1", user: { name: "Asha" } } },
      { dayNumber: 2, enrollment: { userId: "i-1", supervisorId: "mentor-1", user: { name: "Asha" } } },
      { dayNumber: 1, enrollment: { userId: "i-2", supervisorId: "mentor-2", user: { name: "Ravi" } } },
    ]);
    db.user.findMany.mockResolvedValue([
      { id: "mentor-1", name: "Meera", email: "meera@gara.test", roles: [{ role: Role.MENTOR }] },
      { id: "mentor-2", name: "Mohan", email: "mohan@gara.test", roles: [{ role: Role.MENTOR }] },
    ]);
    customPermissions.set("mentor-2", { canEvaluations: false });

    await runCheckpointReminders(TUESDAY, now);

    const emails = queuedEmails();
    expect(emails.filter((e) => e.templateName === "CHECKPOINT_REMINDER").map((e) => e.payload)).toEqual([
      expect.objectContaining({ dayNumber: 2, checkpointTitle: "Task 2", dedupeKey: `CHECKPOINT_REMINDERS_DAILY:${TUESDAY}:intern:enr-1` }),
      expect.objectContaining({ dayNumber: 5, checkpointTitle: "Task 5", dedupeKey: `CHECKPOINT_REMINDERS_DAILY:${TUESDAY}:intern:enr-3` }),
    ]);
    const supervisorEmails = emails.filter((e) => e.templateName === "CHECKPOINT_REVIEW_REMINDER");
    expect(supervisorEmails).toHaveLength(1);
    expect(supervisorEmails[0]).toMatchObject({
      recipientEmail: "meera@gara.test",
      payload: {
        pendingCount: 2,
        items: [
          { internName: "Asha", dayNumber: 1 },
          { internName: "Asha", dayNumber: 2 },
        ],
        href: "/subadmin/evaluations",
        dedupeKey: `CHECKPOINT_REMINDERS_DAILY:${TUESDAY}:supervisor:mentor-1`,
      },
    });
    expect(db.internshipEnrollment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: "IN_PROGRESS" }) })
    );
  });

  it("sends nothing to interns on a weekend", async () => {
    db.internshipEnrollment.findMany.mockResolvedValue([enrollment("enr-1", "2026-10-26", [1, 2, 3, 4, 5, 6, 7])]);
    await runCheckpointReminders("2026-10-31", new Date("2026-10-31T03:30:00.000Z"));
    expect(db.notificationOutbox.createMany).not.toHaveBeenCalled();
  });

  it("is idempotent per day: a retried run does not re-queue reminders already queued", async () => {
    db.internshipEnrollment.findMany.mockResolvedValue([enrollment("enr-1", "2026-10-26", [2])]);
    existingOutboxKeys.add(`CHECKPOINT_REMINDERS_DAILY:${TUESDAY}:intern:enr-1`);
    await runCheckpointReminders(TUESDAY, now);
    expect(queuedEmails()).toEqual([]);
  });

  it("runs from the registry only on its own business day", async () => {
    const handler = automationHandlers[JOB_TYPES.CHECKPOINT_REMINDERS_DAILY];
    await handler({ dateKey: TUESDAY }, { jobId: "j", now: new Date("2026-10-28T03:30:00.000Z"), attempt: 1 });
    await handler({ dateKey: "not-a-date" }, { jobId: "j", now, attempt: 1 });
    expect(db.internshipEnrollment.findMany).not.toHaveBeenCalled();

    await handler({ dateKey: TUESDAY }, { jobId: "j", now, attempt: 1 });
    expect(db.internshipEnrollment.findMany).toHaveBeenCalledTimes(1);
  });
});

// -----------------------------------------------------------------------------
// 4. Daily conversion-review reminders
// -----------------------------------------------------------------------------

describe("CONVERSION_REVIEW_REMINDERS_DAILY", () => {
  const TODAY = "2026-10-26";
  const now = new Date("2026-10-26T03:30:00.000Z");
  const manager = { id: "mgr-1", name: "Manju", email: "manju@gara.test" };

  function review(id: string, day: string, internUserId: string, withManager: boolean) {
    return {
      id,
      scheduledFor: new Date(`${day}T00:00:00.000Z`),
      employee: {
        userId: internUserId,
        user: { name: `Intern ${internUserId}` },
        manager: withManager ? { user: manager } : null,
      },
    };
  }

  it("labels reviews as upcoming, due or overdue", () => {
    expect(conversionReviewState(new Date("2026-10-20T00:00:00.000Z"), TODAY)).toBe("OVERDUE");
    expect(conversionReviewState(new Date("2026-10-26T00:00:00.000Z"), TODAY)).toBe("DUE");
    expect(conversionReviewState(new Date("2026-11-02T00:00:00.000Z"), TODAY)).toBe("UPCOMING");
  });

  it("queries scheduled reviews up to 7 days ahead and reminds permitted staff and reporting managers", async () => {
    db.conversionReview.findMany.mockResolvedValue([
      review("r-1", "2026-10-20", "i-1", true),
      review("r-2", "2026-10-26", "hr-1", false), // an HR user's own review
      review("r-3", "2026-11-02", "i-3", true),
    ]);
    db.user.findMany.mockResolvedValue([
      { id: "admin-1", name: "Ada", email: "ada@gara.test", roles: [{ role: Role.ADMIN }] },
      { id: "hr-1", name: "Hari", email: "hari@gara.test", roles: [{ role: Role.HR }] },
      { id: "hr-2", name: "Hema", email: "hema@gara.test", roles: [{ role: Role.HR }] },
    ]);
    customPermissions.set("hr-2", { canEmployees: false });

    await runConversionReviewReminders(TODAY, now);

    expect(db.conversionReview.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: "SCHEDULED", scheduledFor: { lt: new Date("2026-11-03T00:00:00.000Z") } },
      })
    );
    const byEmail = new Map(queuedEmails().map((e) => [e.recipientEmail, e.payload]));
    expect([...byEmail.keys()].sort()).toEqual(["ada@gara.test", "hari@gara.test", "manju@gara.test"]);
    expect(byEmail.get("ada@gara.test")).toMatchObject({
      href: "/admin/intern-reviews",
      dedupeKey: `CONVERSION_REVIEW_REMINDERS_DAILY:${TODAY}:admin-1`,
      items: [
        { internName: "Intern i-1", state: "OVERDUE" },
        { internName: "Intern hr-1", state: "DUE" },
        { internName: "Intern i-3", state: "UPCOMING" },
      ],
    });
    // HR never gets their own review; the reporting manager only gets their reports.
    expect((byEmail.get("hari@gara.test")?.items as unknown[]).length).toBe(2);
    expect(byEmail.get("hari@gara.test")).toMatchObject({ href: "/subadmin/intern-reviews" });
    expect(byEmail.get("manju@gara.test")).toMatchObject({
      href: "/dashboard",
      items: [{ internName: "Intern i-1" }, { internName: "Intern i-3" }],
    });
    for (const email of queuedEmails()) expect(email.templateName).toBe("CONVERSION_REVIEW_REMINDER");
  });

  it("sends nothing when no review is due", async () => {
    await runConversionReviewReminders(TODAY, now);
    expect(db.user.findMany).not.toHaveBeenCalled();
    expect(db.notificationOutbox.createMany).not.toHaveBeenCalled();
  });
});

// -----------------------------------------------------------------------------
// 5. Action Center scoping
// -----------------------------------------------------------------------------

describe("Action Center", () => {
  const now = new Date("2026-10-26T06:00:00.000Z");
  const keys = async (user: AuthenticatedUser) =>
    (await getActionCenter(user, { now })).sections.map((section) => section.key);

  it("shows HR and administrators every section", async () => {
    const all = [
      "applicationsAwaitingScreening",
      "interviewsAwaitingFeedback",
      "checkpointsAwaitingReview",
      "evaluationsAwaitingDecision",
      "passedAwaitingJoining",
      "offersAwaitingResponse",
      "acceptedOffersAwaitingJoining",
      "internReviewsDue",
      "conversionsPendingEffectiveDate",
      "leaveRequestsPending",
      "regularizationsPending",
    ];
    expect(await keys(staff("hr-1", [Role.HR]))).toEqual(all);
    const admin = await getActionCenter(staff("admin-1", [Role.ADMIN]), { now });
    expect(admin.sections.map((s) => s.key)).toEqual(all);
    expect(admin.sections[0].href).toBe("/admin/applications?status=SUBMITTED");
  });

  it("scopes interviewers and mentors to their own work", async () => {
    expect(await keys(staff("int-1", [Role.INTERVIEWER]))).toEqual([
      "interviewsAwaitingFeedback",
      "checkpointsAwaitingReview",
    ]);
    expect(db.interviewSchedule.count).toHaveBeenCalledWith({
      where: expect.objectContaining({ interviewerId: "int-1", feedback: { is: null }, scheduledAt: { lte: now } }),
    });
    expect(db.evaluationCheckpoint.count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        enrollment: expect.objectContaining({ supervisorId: "int-1", userId: { not: "int-1" } }),
      }),
    });

    expect(await keys(staff("mentor-1", [Role.MENTOR]))).toEqual(["checkpointsAwaitingReview"]);
  });

  it("gives managers only the modules their permissions allow, scoped to themselves", async () => {
    expect(await keys(staff("mgr-1", [Role.MANAGER]))).toEqual([
      "interviewsAwaitingFeedback",
      "checkpointsAwaitingReview",
      "leaveRequestsPending",
      "regularizationsPending",
    ]);
    expect(db.leaveRequest.count).toHaveBeenCalledWith({
      where: { status: "PENDING", employee: { userId: { not: "mgr-1" } } },
    });
  });

  it("respects custom sub-admin permissions", async () => {
    customPermissions.set("hr-2", { canApplications: true, canInterviews: true });
    expect(await keys(staff("hr-2", [Role.HR]))).toEqual([
      "applicationsAwaitingScreening",
      "interviewsAwaitingFeedback",
    ]);
  });

  it("returns nothing for non-staff users without querying", async () => {
    expect(await keys(staff("cand-1", [Role.CANDIDATE]))).toEqual([]);
    expect(await keys(staff("intern-1", [Role.INTERN]))).toEqual([]);
    expect(db.subAdminPermission.findUnique).not.toHaveBeenCalled();
    expect(db.application.count).not.toHaveBeenCalled();
  });

  it("excludes the viewer's own application from the screening queue and builds item links", async () => {
    db.application.count.mockResolvedValue(4);
    db.application.findMany.mockResolvedValue([
      {
        id: "app-9",
        createdAt: new Date("2026-10-24T10:00:00.000Z"),
        opening: { title: "Engineer" },
        candidate: { user: { name: "Cara" } },
        jobOffer: null,
      },
    ]);
    const center = await getActionCenter(staff("hr-1", [Role.HR]), { now });
    const screening = center.sections[0];
    expect(db.application.count).toHaveBeenCalledWith({
      where: { status: "SUBMITTED", isArchived: false, candidate: { userId: { not: "hr-1" } } },
    });
    expect(screening).toMatchObject({ status: "ok", count: 4 });
    expect(screening.status === "ok" && screening.items[0]).toMatchObject({
      label: "Cara",
      href: "/subadmin/applications/app-9",
      detail: expect.stringContaining("Engineer"),
    });
    expect(db.application.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 3 }));
  });

  it("flags overdue intern reviews", async () => {
    db.conversionReview.findMany.mockImplementation(async (args: { where: { status?: string } }) =>
      args.where.status === "SCHEDULED"
        ? [{ id: "r-1", scheduledFor: new Date("2026-10-20T00:00:00.000Z"), employee: { user: { name: "Ira" } } }]
        : []
    );
    db.conversionReview.count.mockResolvedValue(1);
    const center = await getActionCenter(staff("hr-1", [Role.HR]), { now });
    const reviews = center.sections.find((s) => s.key === "internReviewsDue");
    expect(reviews?.status === "ok" && reviews.items[0]).toMatchObject({ overdue: true, label: "Ira" });
    expect(db.conversionReview.count).toHaveBeenCalledWith({
      where: expect.objectContaining({ status: "SCHEDULED", scheduledFor: { lt: new Date("2026-10-27T00:00:00.000Z") } }),
    });
  });

  it("reports a failed section as unavailable instead of zero", async () => {
    db.leaveRequest.count.mockRejectedValue(new Error("connection reset"));
    db.application.count.mockResolvedValue(2);
    const center = await getActionCenter(staff("mgr-1", [Role.MANAGER]), { now });
    expect(center.sections.find((s) => s.key === "leaveRequestsPending")?.status).toBe("unavailable");
    expect(center.sections.find((s) => s.key === "regularizationsPending")?.status).toBe("ok");
  });

  it("skips the item queries when only counts are needed", async () => {
    await getActionCenter(staff("hr-1", [Role.HR]), { now, includeItems: false });
    for (const model of SECTION_MODELS) expect(model.findMany).not.toHaveBeenCalled();
  });

  it("renders an accessible panel with an empty state and a skeleton", () => {
    const empty: ActionCenterResult = { sections: [], totalCount: 0 };
    const { unmount } = render(React.createElement(ActionCenterView, { center: empty }));
    expect(screen.getByRole("heading", { name: "Needs your attention" })).toBeTruthy();
    expect(screen.getByText("You're all caught up")).toBeTruthy();
    unmount();

    const loaded: ActionCenterResult = {
      totalCount: 2,
      sections: [
        {
          key: "leaveRequestsPending",
          title: "Leave requests pending",
          description: "Leave requests waiting for a review.",
          href: "/subadmin/leave",
          status: "ok",
          count: 2,
          items: [{ id: "l-1", label: "<b>Asha</b>", detail: "Casual · 26 Oct 2026", href: "/subadmin/leave" }],
        },
        {
          key: "regularizationsPending",
          title: "Attendance corrections pending",
          description: "x",
          href: "/subadmin/attendance",
          status: "unavailable",
        },
      ],
    };
    const view = render(React.createElement(ActionCenterView, { center: loaded }));
    expect(screen.getByText("<b>Asha</b>")).toBeTruthy(); // rendered as text, never as markup
    expect(screen.getByRole("link", { name: /View all: Leave requests pending/ }).getAttribute("href")).toBe(
      "/subadmin/leave"
    );
    expect(screen.getByRole("status").textContent).toContain("couldn't load some items");
    expect(screen.queryByText("You're all caught up")).toBeNull();
    view.unmount();

    render(React.createElement(ActionCenterSkeleton));
    expect(screen.getByRole("status").textContent).toContain("Loading items that need your attention");
  });
});

// -----------------------------------------------------------------------------
// 6. Staff daily digest
// -----------------------------------------------------------------------------

describe("STAFF_DAILY_DIGEST", () => {
  const TODAY = "2026-10-26";
  const now = new Date("2026-10-26T04:00:00.000Z");

  function staffRow(id: string, role: Role) {
    return { id, name: `User ${id}`, email: `${id}@gara.test`, mustChangePassword: false, roles: [{ role }] };
  }

  it("sends one permission-scoped digest per staff member and skips people with nothing pending", async () => {
    db.user.findMany.mockResolvedValue([
      staffRow("admin-1", Role.ADMIN),
      staffRow("int-1", Role.INTERVIEWER),
      staffRow("mentor-1", Role.MENTOR),
    ]);
    db.application.count.mockImplementation(async (args: { where: { status: string } }) =>
      args.where.status === "SUBMITTED" ? 2 : 0
    );
    db.interviewSchedule.count.mockImplementation(async (args: { where: { interviewerId?: string } }) =>
      args.where.interviewerId === "int-1" ? 1 : 0
    );
    db.leaveRequest.count.mockResolvedValue(5);

    await runStaffDailyDigest(TODAY, now);

    const emails = queuedEmails();
    expect(emails.map((e) => e.recipientEmail)).toEqual(["admin-1@gara.test", "int-1@gara.test"]);
    expect(emails[0].payload).toMatchObject({
      recipientName: "User admin-1",
      dateLabel: "Monday, 26 October 2026",
      dedupeKey: `STAFF_DAILY_DIGEST:${TODAY}:admin-1`,
      sections: [
        { title: "Applications awaiting screening", count: 2, href: "/admin/applications?status=SUBMITTED" },
        { title: "Leave requests pending", count: 5, href: "/admin/leave" },
      ],
    });
    // The interviewer has no leave permission, so the leave count never reaches them.
    expect(emails[1].payload.sections).toEqual([
      { title: "Interviews awaiting feedback", count: 1, href: "/subadmin/interviews" },
    ]);
    expect(emails.every((e) => e.templateName === "STAFF_DAILY_DIGEST")).toBe(true);
    // Counts only: the digest never loads item details.
    expect(db.application.findMany).not.toHaveBeenCalled();
  });

  it("fails (and retries later) instead of sending an incomplete digest", async () => {
    db.user.findMany.mockResolvedValue([staffRow("hr-1", Role.HR)]);
    db.jobOffer.count.mockRejectedValue(new Error("timeout"));
    await expect(runStaffDailyDigest(TODAY, now)).rejects.toThrow(/unavailable/);
    expect(db.notificationOutbox.createMany).not.toHaveBeenCalled();
  });

  it("does not double-send a digest already queued today", async () => {
    db.user.findMany.mockResolvedValue([staffRow("hr-1", Role.HR)]);
    db.leaveRequest.count.mockResolvedValue(1);
    existingOutboxKeys.add(`STAFF_DAILY_DIGEST:${TODAY}:hr-1`);
    await automationHandlers[JOB_TYPES.STAFF_DAILY_DIGEST]({ dateKey: TODAY }, { jobId: "j", now, attempt: 2 });
    expect(queuedEmails()).toEqual([]);
  });
});

// -----------------------------------------------------------------------------
// 7. Recurring job seeding
// -----------------------------------------------------------------------------

describe("ensureRecurringJobs", () => {
  it("registers a handler for every job type", () => {
    for (const type of Object.values(JOB_TYPES)) {
      expect(typeof automationHandlers[type]).toBe("function");
    }
  });

  function createdJobs() {
    return db.scheduledJob.create.mock.calls.map(
      (call) => (call[0] as { data: { type: string; runAt: Date; dedupeKey: string; payload: unknown } }).data
    );
  }

  it("queues today's occurrences at 09:00 and 09:30 business time", async () => {
    await ensureRecurringJobs(new Date("2026-10-26T02:00:00.000Z")); // 07:30 IST
    expect(createdJobs()).toEqual([
      expect.objectContaining({
        type: "CHECKPOINT_REMINDERS_DAILY",
        runAt: new Date("2026-10-26T03:30:00.000Z"),
        dedupeKey: "CHECKPOINT_REMINDERS_DAILY:2026-10-26",
        payload: { dateKey: "2026-10-26" },
      }),
      expect.objectContaining({
        type: "CONVERSION_REVIEW_REMINDERS_DAILY",
        runAt: new Date("2026-10-26T03:30:00.000Z"),
        dedupeKey: "CONVERSION_REVIEW_REMINDERS_DAILY:2026-10-26",
      }),
      expect.objectContaining({
        type: "STAFF_DAILY_DIGEST",
        runAt: new Date("2026-10-26T04:00:00.000Z"),
        dedupeKey: "STAFF_DAILY_DIGEST:2026-10-26",
      }),
    ]);
  });

  it("moves to the next day once today's time has passed", async () => {
    await ensureRecurringJobs(new Date("2026-10-26T03:45:00.000Z")); // 09:15 IST
    const jobs = createdJobs();
    expect(jobs[0]).toMatchObject({ runAt: new Date("2026-10-27T03:30:00.000Z"), dedupeKey: "CHECKPOINT_REMINDERS_DAILY:2026-10-27" });
    expect(jobs[2]).toMatchObject({ runAt: new Date("2026-10-26T04:00:00.000Z"), dedupeKey: "STAFF_DAILY_DIGEST:2026-10-26" });
  });

  it("is idempotent: existing occurrences are left untouched (keeping retry backoff)", async () => {
    db.scheduledJob.findMany.mockResolvedValue([
      { dedupeKey: "CHECKPOINT_REMINDERS_DAILY:2026-10-26" },
      { dedupeKey: "CONVERSION_REVIEW_REMINDERS_DAILY:2026-10-26" },
      { dedupeKey: "STAFF_DAILY_DIGEST:2026-10-26" },
    ]);
    await ensureRecurringJobs(new Date("2026-10-26T02:00:00.000Z"));
    await ensureRecurringJobs(new Date("2026-10-26T02:01:00.000Z"));
    expect(db.scheduledJob.create).not.toHaveBeenCalled();
    expect(db.scheduledJob.update).not.toHaveBeenCalled();
  });

  it("tolerates a concurrent tick creating the same occurrence", async () => {
    db.scheduledJob.create.mockRejectedValue(Object.assign(new Error("Unique constraint"), { code: "P2002" }));
    await expect(ensureRecurringJobs(new Date("2026-10-26T02:00:00.000Z"))).resolves.toBeUndefined();
    db.scheduledJob.create.mockRejectedValue(new Error("connection lost"));
    await expect(ensureRecurringJobs(new Date("2026-10-26T02:00:00.000Z"))).rejects.toThrow("connection lost");
  });
});

// -----------------------------------------------------------------------------
// 8. Email templates
// -----------------------------------------------------------------------------

describe("Automation and round-3 email templates", () => {
  const evil = `<script>alert("x")</script>`;

  it("only links to app paths", () => {
    expect(buildAppUrl("/admin/leave")).toMatch(/^https?:\/\/[^/]+\/admin\/leave$/);
    expect(buildAppUrl("https://evil.example/phish")).toMatch(/\/dashboard$/);
    expect(buildAppUrl("//evil.example")).toMatch(/\/dashboard$/);
    expect(buildAppUrl("javascript:alert(1)", "/hrms")).toMatch(/\/hrms$/);
  });

  it.each([
    [
      "conversion offer",
      () =>
        buildConversionOfferExtendedEmail({
          recipientName: evil,
          proposedDesignation: evil,
          proposedDepartment: evil,
          effectiveDate: "2026-12-01T00:00:00.000Z",
          sharedSummary: evil,
        }),
      "/intern/dashboard",
    ],
    [
      "conversion completed",
      () => buildConversionCompletedEmail({ recipientName: evil, designation: evil, department: evil }),
      "/hrms",
    ],
    [
      "review extended",
      () => buildInternshipReviewExtendedEmail({ recipientName: evil, nextReviewDate: "2027-03-01T00:00:00.000Z", sharedSummary: evil }),
      "/intern/dashboard",
    ],
    ["internship ending", () => buildInternshipEndingEmail({ recipientName: evil, sharedSummary: evil }), "/dashboard"],
    [
      "supervisor changed",
      () =>
        buildEvaluationSupervisorChangedEmail({
          recipientName: evil,
          recipientRole: "INTERN",
          internName: evil,
          openingTitle: evil,
          newSupervisorName: evil,
        }),
      "/intern/dashboard",
    ],
    [
      "interview reminder",
      () =>
        buildInterviewReminderEmail({
          recipientName: evil,
          recipientRole: "INTERVIEWER",
          candidateName: evil,
          openingTitle: evil,
          roundName: evil,
          scheduledAt: FUTURE,
          durationMinutes: 45,
          meetingLink: "javascript:alert(1)",
          leadTime: "1h",
          href: "/subadmin/interviews",
        }),
      "/subadmin/interviews",
    ],
    [
      "checkpoint reminder",
      () => buildCheckpointReminderEmail({ recipientName: evil, openingTitle: evil, dayNumber: 3, checkpointTitle: evil }),
      "/intern/dashboard",
    ],
    [
      "checkpoint review reminder",
      () =>
        buildCheckpointReviewReminderEmail({
          recipientName: evil,
          pendingCount: 1,
          items: [{ internName: evil, dayNumber: 2 }],
          href: "/admin/evaluations",
        }),
      "/admin/evaluations",
    ],
    [
      "conversion review reminder",
      () =>
        buildConversionReviewReminderEmail({
          recipientName: evil,
          items: [{ internName: evil, scheduledFor: "2026-10-20T00:00:00.000Z", state: "OVERDUE" }],
          href: "/admin/intern-reviews",
        }),
      "/admin/intern-reviews",
    ],
    [
      "staff digest",
      () =>
        buildStaffDailyDigestEmail({
          recipientName: evil,
          dateLabel: evil,
          sections: [{ title: evil, count: 3, href: "javascript:alert(1)" }],
        }),
      "/dashboard",
    ],
  ])("escapes every value in the %s email and links to the right page", (_name, build, link) => {
    const email = build();
    expect(email.html).not.toContain("<script>");
    expect(email.html).toContain("&lt;script&gt;");
    expect(email.html).not.toContain("javascript:");
    expect(email.html).toContain(`${link}"`);
  });

  it("shows interview times in business time and lists overdue reviews", () => {
    const reminder = buildInterviewReminderEmail({
      recipientName: "Cara",
      recipientRole: "CANDIDATE",
      candidateName: "Cara",
      openingTitle: "Engineer",
      roundName: "Technical",
      scheduledAt: FUTURE,
      durationMinutes: 45,
      leadTime: "24h",
    });
    expect(reminder.subject).toContain("in 24 hours");
    expect(reminder.text).toContain("15 January 2030");
    expect(reminder.text).toContain("15:30");

    const review = buildConversionReviewReminderEmail({
      recipientName: "Ada",
      items: [{ internName: "Ira", scheduledFor: "2026-10-20T00:00:00.000Z", state: "OVERDUE" }],
    });
    expect(review.text).toContain("Ira: 20 October 2026 (overdue)");
  });

  async function renderThroughOutbox(templateName: string, payload: Record<string, unknown>) {
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
    return sendEmail.mock.calls[0][0] as { subject: string; html: string; text: string };
  }

  it.each([
    ["CONVERSION_OFFER_EXTENDED", { recipientName: "Ira", proposedDesignation: "Engineer", proposedDepartment: "R&D", effectiveDate: "2026-12-01T00:00:00.000Z" }, "Full-time offer"],
    ["CONVERSION_COMPLETED", { recipientName: "Ira", designation: "Engineer", department: "R&D", effectiveDate: "2026-12-01T00:00:00.000Z" }, "full-time employee"],
    ["INTERNSHIP_REVIEW_EXTENDED", { recipientName: "Ira", nextReviewDate: "2027-03-01T00:00:00.000Z" }, "internship continues"],
    ["INTERNSHIP_ENDING", { recipientName: "Ira" }, "progress review"],
    ["EVALUATION_SUPERVISOR_CHANGED", { recipientName: "Meera", recipientRole: "SUPERVISOR", internName: "Ira", openingTitle: "Data", newSupervisorName: "Meera" }, "supervisor updated"],
    ["INTERVIEW_REMINDER", { recipientName: "Cara", recipientRole: "CANDIDATE", candidateName: "Cara", openingTitle: "Engineer", roundName: "Technical", scheduledAt: FUTURE, durationMinutes: 45, leadTime: "1h" }, "in 1 hour"],
    ["CHECKPOINT_REMINDER", { recipientName: "Ira", openingTitle: "Data", dayNumber: 2, checkpointTitle: "API" }, "Day 2"],
    ["CHECKPOINT_REVIEW_REMINDER", { recipientName: "Meera", pendingCount: 2, items: [{ internName: "Ira", dayNumber: 1 }, "bad"] }, "2 evaluation checkpoints"],
    ["CONVERSION_REVIEW_REMINDER", { recipientName: "Ada", items: [{ internName: "Ira", scheduledFor: "2026-10-26T00:00:00.000Z", state: "DUE" }] }, "progress review"],
    ["STAFF_DAILY_DIGEST", { recipientName: "Ada", dateLabel: "Monday, 26 October 2026", sections: [{ title: "Leave requests pending", count: 2, href: "/admin/leave" }] }, "2 items need"],
  ])("renders %s with its dedicated template", async (templateName, payload, subjectPart) => {
    const message = await renderThroughOutbox(templateName, payload);
    expect(message.subject).toContain(subjectPart);
    expect(message.subject).not.toContain(templateName.replace(/_/g, " "));
    expect(message.html).not.toContain("System Notification");
  });

  it.each([
    ["INTERN_JOINED", { recipientName: "Asha", isRejoin: true }, "/intern/dashboard"],
    ["EMPLOYEE_JOINED", { employeeName: "Ravi", isRejoin: true }, "/hrms"],
  ])("says 'Welcome back' when %s is a re-join", async (templateName, payload, link) => {
    const message = await renderThroughOutbox(templateName, payload);
    expect(message.subject).toContain("Welcome back");
    expect(message.html).toContain("Welcome back");
    expect(message.html).toContain(link);
  });

  it("keeps the first-join wording without isRejoin", async () => {
    const message = await renderThroughOutbox("INTERN_JOINED", { recipientName: "Asha" });
    expect(message.subject).toContain("Welcome aboard");
    expect(message.html).not.toContain("Welcome back");
  });
});
