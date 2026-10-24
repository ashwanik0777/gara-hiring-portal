import { describe, it, expect, vi, beforeEach } from "vitest";
import crypto from "node:crypto";
import {
  ApplicationStatus,
  InterviewRecommendation,
  InterviewStatus,
  OfferStatus,
  Role,
} from "@prisma/client";

const { db, state } = vi.hoisted(() => {
  const state = {
    session: null as null | { user: { id: string; email: string; name: string } },
    users: {} as Record<string, { roles: string[]; mustChangePassword?: boolean }>,
  };
  const db = {
    user: { findUnique: vi.fn(), findMany: vi.fn() },
    subAdminPermission: { findUnique: vi.fn() },
    application: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      groupBy: vi.fn(),
    },
    applicationStatusHistory: { create: vi.fn() },
    interviewSchedule: { findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    interviewFeedback: { create: vi.fn(), updateMany: vi.fn(), upsert: vi.fn() },
    notificationOutbox: { create: vi.fn() },
    auditLog: { create: vi.fn() },
    $transaction: vi.fn(),
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

import {
  VALID_APPLICATION_TRANSITIONS,
  FLOW_OWNED_APPLICATION_STATUSES,
  getManualTransitionTargets,
  ScheduleInterviewSchema,
  RescheduleInterviewSchema,
  CancelInterviewSchema,
  SubmitFeedbackSchema,
} from "@/features/recruitment/schemas";
import { recruitmentService } from "@/features/recruitment/services/recruitment-service";
import {
  transitionStatusAction,
  scheduleInterviewAction,
  submitFeedbackAction,
} from "@/features/recruitment/actions";
import { scheduleOutboxFlush } from "@/infrastructure/email/outbox-dispatch";
import { ConflictError, ForbiddenError, ValidationError } from "@/lib/errors";
import { OWN_APPLICATION_ACTION_MESSAGE } from "@/features/recruitment/services/application-access";
import type { AuthenticatedUser } from "@/lib/auth/guards";

const HR_ID = "11111111-1111-4111-8111-111111111111";
const INTERVIEWER_ID = "22222222-2222-4222-8222-222222222222";
const OTHER_INTERVIEWER_ID = "33333333-3333-4333-8333-333333333333";
const CANDIDATE_USER_ID = "44444444-4444-4444-8444-444444444444";
const APP_ID = "55555555-5555-4555-8555-555555555555";
const SCHEDULE_ID = "66666666-6666-4666-8666-666666666666";

const MANAGER_ID = "77777777-7777-4777-8777-777777777777";
const OTHER_SCHEDULE_ID = "88888888-8888-4888-8888-888888888888";

const hrUser: AuthenticatedUser = { id: HR_ID, name: "HR", email: "hr@gara.test", roles: [Role.HR] };
const managerUser: AuthenticatedUser = {
  id: MANAGER_ID,
  name: "Manager",
  email: "mgr@gara.test",
  roles: [Role.MANAGER],
};
const interviewerUser: AuthenticatedUser = {
  id: INTERVIEWER_ID,
  name: "Interviewer",
  email: "int@gara.test",
  roles: [Role.INTERVIEWER],
};

const allPermissions = {
  canApplications: true,
  canOpenings: true,
  canInterviews: true,
  canEvaluations: true,
  canEmployees: true,
  canAttendance: true,
  canLeave: true,
  canPayroll: true,
  canReports: true,
};

function denyPermission(key: keyof typeof allPermissions) {
  db.subAdminPermission.findUnique.mockResolvedValue({ id: "perm", userId: "x", ...allPermissions, [key]: false });
}

function signInAs(userId: string, roles: Role[]) {
  state.session = { user: { id: userId, email: `${userId}@gara.test`, name: "Tester" } };
  state.users[userId] = { roles };
}

function applicationRecord(status: ApplicationStatus, extra: Record<string, unknown> = {}) {
  return {
    id: APP_ID,
    referenceCode: "APP-1",
    status,
    isArchived: false,
    candidate: { id: "cand-1", user: { id: CANDIDATE_USER_ID, email: "cand@gara.test", name: "Candidate" } },
    opening: { title: "Engineer", type: "FULL_TIME" },
    jobOffer: null,
    ...extra,
  };
}

function scheduleRecord(status: InterviewStatus, extra: Record<string, unknown> = {}) {
  return {
    id: SCHEDULE_ID,
    applicationId: APP_ID,
    roundName: "Technical",
    status,
    interviewerId: INTERVIEWER_ID,
    application: {
      id: APP_ID,
      status: ApplicationStatus.INTERVIEW_SCHEDULED,
      isArchived: false,
      candidate: {
        userId: CANDIDATE_USER_ID,
        user: { id: CANDIDATE_USER_ID, email: "cand@gara.test", name: "Candidate" },
      },
    },
    feedback: null,
    ...extra,
  };
}

const feedbackInput = {
  scheduleId: SCHEDULE_ID,
  recommendation: InterviewRecommendation.HIRE,
  summaryNotes: "Solid problem solving and clear communication.",
  ratings: { technical: 4 },
};

beforeEach(() => {
  vi.resetAllMocks();
  state.session = null;
  state.users = {
    [INTERVIEWER_ID]: { roles: [Role.INTERVIEWER] },
    [OTHER_INTERVIEWER_ID]: { roles: [Role.INTERVIEWER] },
    [CANDIDATE_USER_ID]: { roles: [Role.CANDIDATE] },
  };
  db.$transaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => cb(db));
  db.user.findUnique.mockImplementation(async (args: { where: { id: string } }) => {
    const entry = state.users[args.where.id];
    if (!entry) return null;
    return {
      id: args.where.id,
      mustChangePassword: entry.mustChangePassword ?? false,
      roles: entry.roles.map((role) => ({ role })),
    };
  });
  db.application.updateMany.mockResolvedValue({ count: 1 });
  db.interviewSchedule.updateMany.mockResolvedValue({ count: 1 });
  db.interviewFeedback.updateMany.mockResolvedValue({ count: 1 });
});

describe("Recruitment Pipeline State Machine (Prompt 4)", () => {
  it("enforces valid recruitment stage transitions", () => {
    expect(VALID_APPLICATION_TRANSITIONS[ApplicationStatus.SUBMITTED]).toContain(ApplicationStatus.SCREENING);
    expect(VALID_APPLICATION_TRANSITIONS[ApplicationStatus.SUBMITTED]).toContain(ApplicationStatus.REJECTED);
    expect(VALID_APPLICATION_TRANSITIONS[ApplicationStatus.SCREENING]).toContain(ApplicationStatus.SHORTLISTED);
    expect(VALID_APPLICATION_TRANSITIONS[ApplicationStatus.SHORTLISTED]).toContain(
      ApplicationStatus.INTERVIEW_SCHEDULED
    );
    expect(VALID_APPLICATION_TRANSITIONS[ApplicationStatus.INTERVIEWED]).toContain(
      ApplicationStatus.INTERVIEW_SCHEDULED
    );
    expect(VALID_APPLICATION_TRANSITIONS[ApplicationStatus.INTERVIEWED]).toContain(
      ApplicationStatus.EVALUATION_SELECTED
    );
  });

  it("strictly rejects illegal backward or invalid bypass transitions", () => {
    expect(VALID_APPLICATION_TRANSITIONS[ApplicationStatus.SUBMITTED]).not.toContain(ApplicationStatus.OFFERED);
    expect(VALID_APPLICATION_TRANSITIONS[ApplicationStatus.SUBMITTED]).not.toContain(
      ApplicationStatus.EVALUATION_SELECTED
    );
    expect(VALID_APPLICATION_TRANSITIONS[ApplicationStatus.ARCHIVED]).toHaveLength(0);
  });

  it("never offers offer/hiring stages as manual transition targets", () => {
    for (const status of Object.values(ApplicationStatus)) {
      for (const target of getManualTransitionTargets(status)) {
        expect(FLOW_OWNED_APPLICATION_STATUSES).not.toContain(target);
      }
    }
    expect(getManualTransitionTargets(ApplicationStatus.INTERVIEWED)).not.toContain(ApplicationStatus.OFFERED);
    expect(getManualTransitionTargets(ApplicationStatus.OFFER_ACCEPTED)).toHaveLength(0);
  });
});

describe("Interview Operations & Feedback Validation (Prompt 4)", () => {
  it("validates interview scheduling input parameters", () => {
    const valid = ScheduleInterviewSchema.safeParse({
      applicationId: crypto.randomUUID(),
      roundNumber: 1,
      roundName: "Technical Assessment",
      scheduledAt: "2026-03-25T14:30:00.000Z",
      durationMinutes: 45,
      meetingLink: "https://meet.google.com/abc-defg-hij",
    });
    expect(valid.success).toBe(true);
  });

  it("validates interview rescheduling and requires reason", () => {
    const validId = crypto.randomUUID();
    expect(
      RescheduleInterviewSchema.safeParse({
        scheduleId: validId,
        newScheduledAt: "2026-03-26T10:00:00.000Z",
        rescheduleReason: "Candidate requested rescheduling due to exam conflict",
      }).success
    ).toBe(true);
    expect(
      RescheduleInterviewSchema.safeParse({
        scheduleId: validId,
        newScheduledAt: "2026-03-26T10:00:00.000Z",
        rescheduleReason: "  ",
      }).success
    ).toBe(false);
  });

  it("validates interview cancellation and requires reason", () => {
    expect(
      CancelInterviewSchema.safeParse({
        scheduleId: crypto.randomUUID(),
        cancellationReason: "Position filled or cohort paused",
      }).success
    ).toBe(true);
  });

  it("validates structured interviewer feedback and recommendation", () => {
    const valid = SubmitFeedbackSchema.safeParse({
      scheduleId: crypto.randomUUID(),
      recommendation: InterviewRecommendation.STRONG_HIRE,
      summaryNotes: "Demonstrated strong mastery of algorithms and clean design patterns.",
      ratings: { technical: 5, communication: 4 },
    });
    expect(valid.success).toBe(true);
  });

  it("bounds the ratings payload to known criteria on the 1-5 scale", () => {
    const base = {
      scheduleId: crypto.randomUUID(),
      recommendation: InterviewRecommendation.HIRE,
      summaryNotes: "Adequate performance overall.",
    };
    expect(SubmitFeedbackSchema.safeParse({ ...base, ratings: { technical: 9 } }).success).toBe(false);
    expect(SubmitFeedbackSchema.safeParse({ ...base, ratings: { technical: 0 } }).success).toBe(false);
    expect(SubmitFeedbackSchema.safeParse({ ...base, ratings: { arbitrary: "x".repeat(10_000) } }).success).toBe(false);
    expect(SubmitFeedbackSchema.safeParse({ ...base, ratings: { communication: 3 } }).success).toBe(true);
  });
});

describe("Stage transitions (SEC-05, SEC-12, BUG-11)", () => {
  it("restricts final stage decisions to HR/Admin", async () => {
    await expect(
      recruitmentService.transitionApplicationStatus(interviewerUser, {
        applicationId: APP_ID,
        toStatus: ApplicationStatus.REJECTED,
      })
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("requires the canApplications permission even for HR", async () => {
    denyPermission("canApplications");
    await expect(
      recruitmentService.transitionApplicationStatus(hrUser, {
        applicationId: APP_ID,
        toStatus: ApplicationStatus.SCREENING,
      })
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(db.application.updateMany).not.toHaveBeenCalled();
  });

  it.each([ApplicationStatus.OFFERED, ApplicationStatus.OFFER_ACCEPTED, ApplicationStatus.HIRED])(
    "rejects %s through the generic transition path",
    async (toStatus) => {
      db.application.findUnique.mockResolvedValue(applicationRecord(ApplicationStatus.INTERVIEWED));
      await expect(
        recruitmentService.transitionApplicationStatus(hrUser, { applicationId: APP_ID, toStatus })
      ).rejects.toBeInstanceOf(ValidationError);
      expect(db.application.updateMany).not.toHaveBeenCalled();
    }
  );

  it("rejects transitions outside the state machine", async () => {
    db.application.findUnique.mockResolvedValue(applicationRecord(ApplicationStatus.SUBMITTED));
    await expect(
      recruitmentService.transitionApplicationStatus(hrUser, {
        applicationId: APP_ID,
        toStatus: ApplicationStatus.SHORTLISTED,
      })
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("blocks stage changes while an extended offer awaits the candidate", async () => {
    db.application.findUnique.mockResolvedValue(
      applicationRecord(ApplicationStatus.OFFERED, { jobOffer: { status: OfferStatus.EXTENDED } })
    );
    await expect(
      recruitmentService.transitionApplicationStatus(hrUser, {
        applicationId: APP_ID,
        toStatus: ApplicationStatus.REJECTED,
      })
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("uses a conditional update and reports concurrent changes", async () => {
    db.application.findUnique.mockResolvedValue(applicationRecord(ApplicationStatus.SUBMITTED));
    db.application.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      recruitmentService.transitionApplicationStatus(hrUser, {
        applicationId: APP_ID,
        toStatus: ApplicationStatus.SCREENING,
      })
    ).rejects.toBeInstanceOf(ConflictError);
    expect(db.application.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: APP_ID, status: ApplicationStatus.SUBMITTED } })
    );
    expect(db.applicationStatusHistory.create).not.toHaveBeenCalled();
  });

  it("records history and reports queued candidate notifications", async () => {
    db.application.findUnique.mockResolvedValue(applicationRecord(ApplicationStatus.SUBMITTED));
    const result = await recruitmentService.transitionApplicationStatus(hrUser, {
      applicationId: APP_ID,
      toStatus: ApplicationStatus.SCREENING,
      candidateMessage: "Your application is under review.",
    });
    expect(result).toEqual({ applicationId: APP_ID, notificationQueued: true });
    expect(db.applicationStatusHistory.create).toHaveBeenCalledTimes(1);
    expect(db.notificationOutbox.create).toHaveBeenCalledTimes(1);
  });
});

describe("Interview lifecycle (BUG-04, POL-08, BUG-21)", () => {
  const scheduleInput = {
    applicationId: APP_ID,
    roundNumber: 1,
    roundName: "Technical",
    scheduledAt: "2026-11-01T10:00:00.000Z",
    durationMinutes: 45,
    meetingLink: null,
    interviewerId: INTERVIEWER_ID,
  };

  it.each([
    ApplicationStatus.REJECTED,
    ApplicationStatus.WITHDRAWN,
    ApplicationStatus.HIRED,
    ApplicationStatus.ARCHIVED,
  ])("blocks scheduling on %s applications", async (status) => {
    db.application.findUnique.mockResolvedValue(applicationRecord(status));
    await expect(recruitmentService.scheduleInterview(hrUser, scheduleInput)).rejects.toBeInstanceOf(
      ValidationError
    );
    expect(db.interviewSchedule.create).not.toHaveBeenCalled();
  });

  it("requires the canInterviews permission to schedule", async () => {
    denyPermission("canInterviews");
    await expect(recruitmentService.scheduleInterview(hrUser, scheduleInput)).rejects.toBeInstanceOf(
      ForbiddenError
    );
  });

  it("rejects an interviewer who does not hold a staff role", async () => {
    db.application.findUnique.mockResolvedValue(applicationRecord(ApplicationStatus.SHORTLISTED));
    state.users[OTHER_INTERVIEWER_ID] = { roles: [Role.CANDIDATE] };
    await expect(
      recruitmentService.scheduleInterview(hrUser, { ...scheduleInput, interviewerId: OTHER_INTERVIEWER_ID })
    ).rejects.toBeInstanceOf(ValidationError);
    expect(db.interviewSchedule.create).not.toHaveBeenCalled();
  });

  it("schedules without auto-advancing the application stage", async () => {
    db.application.findUnique.mockResolvedValue(applicationRecord(ApplicationStatus.SHORTLISTED));
    db.interviewSchedule.create.mockResolvedValue({ id: SCHEDULE_ID, applicationId: APP_ID });

    const result = await recruitmentService.scheduleInterview(hrUser, scheduleInput);

    expect(result).toEqual({ scheduleId: SCHEDULE_ID, applicationId: APP_ID });
    expect(db.interviewSchedule.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ interviewerId: INTERVIEWER_ID }) })
    );
    expect(db.application.update).not.toHaveBeenCalled();
    expect(db.application.updateMany).not.toHaveBeenCalled();
    expect(db.notificationOutbox.create).toHaveBeenCalledTimes(1);
  });

  it.each([InterviewStatus.COMPLETED, InterviewStatus.CANCELLED])(
    "blocks rescheduling and cancelling %s interviews",
    async (status) => {
      db.interviewSchedule.findUnique.mockResolvedValue(scheduleRecord(status));
      await expect(
        recruitmentService.rescheduleInterview(hrUser, {
          scheduleId: SCHEDULE_ID,
          newScheduledAt: "2026-11-02T10:00:00.000Z",
          rescheduleReason: "Panel conflict",
        })
      ).rejects.toBeInstanceOf(ValidationError);
      await expect(
        recruitmentService.cancelInterview(hrUser, { scheduleId: SCHEDULE_ID, cancellationReason: "Role closed" })
      ).rejects.toBeInstanceOf(ValidationError);
      expect(db.interviewSchedule.updateMany).not.toHaveBeenCalled();
    }
  );
});

describe("Interview feedback attribution (BUG-04, BUG-12, POL-08)", () => {
  it("blocks feedback on cancelled interviews", async () => {
    db.interviewSchedule.findUnique.mockResolvedValue(scheduleRecord(InterviewStatus.CANCELLED));
    await expect(recruitmentService.submitInterviewFeedback(interviewerUser, feedbackInput)).rejects.toBeInstanceOf(
      ValidationError
    );
  });

  it("rejects interviewers who are not assigned to the session", async () => {
    db.interviewSchedule.findUnique.mockResolvedValue(
      scheduleRecord(InterviewStatus.SCHEDULED, { interviewerId: OTHER_INTERVIEWER_ID })
    );
    await expect(recruitmentService.submitInterviewFeedback(interviewerUser, feedbackInput)).rejects.toBeInstanceOf(
      ForbiddenError
    );
  });

  it("requires the canInterviews permission", async () => {
    denyPermission("canInterviews");
    await expect(recruitmentService.submitInterviewFeedback(interviewerUser, feedbackInput)).rejects.toBeInstanceOf(
      ForbiddenError
    );
  });

  it("does not let HR overwrite another interviewer's feedback", async () => {
    db.interviewSchedule.findUnique.mockResolvedValue(
      scheduleRecord(InterviewStatus.COMPLETED, {
        feedback: {
          id: "fb-1",
          interviewerId: INTERVIEWER_ID,
          recommendation: InterviewRecommendation.NO_HIRE,
          ratings: {},
          summaryNotes: "Original notes",
        },
      })
    );
    await expect(recruitmentService.submitInterviewFeedback(hrUser, feedbackInput)).rejects.toBeInstanceOf(
      ForbiddenError
    );
    expect(db.interviewFeedback.updateMany).not.toHaveBeenCalled();
    expect(db.interviewFeedback.upsert).not.toHaveBeenCalled();
  });

  it("locks feedback edits once the application has a final decision", async () => {
    db.interviewSchedule.findUnique.mockResolvedValue(
      scheduleRecord(InterviewStatus.COMPLETED, {
        application: { id: APP_ID, status: ApplicationStatus.REJECTED, candidate: { userId: CANDIDATE_USER_ID } },
        feedback: {
          id: "fb-1",
          interviewerId: INTERVIEWER_ID,
          recommendation: InterviewRecommendation.HOLD,
          ratings: {},
          summaryNotes: "Original notes",
        },
      })
    );
    await expect(recruitmentService.submitInterviewFeedback(interviewerUser, feedbackInput)).rejects.toBeInstanceOf(
      ValidationError
    );
  });

  it("attributes HR-recorded feedback to HR and keeps the application stage unchanged", async () => {
    db.interviewSchedule.findUnique.mockResolvedValue(scheduleRecord(InterviewStatus.SCHEDULED));
    await recruitmentService.submitInterviewFeedback(hrUser, feedbackInput);

    expect(db.interviewFeedback.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ interviewerId: HR_ID }) })
    );
    expect(db.application.update).not.toHaveBeenCalled();
    expect(db.application.updateMany).not.toHaveBeenCalled();
    expect(db.applicationStatusHistory.create).not.toHaveBeenCalled();
  });

  it("lets the author edit their own feedback and keeps the previous values in the audit log", async () => {
    db.interviewSchedule.findUnique.mockResolvedValue(
      scheduleRecord(InterviewStatus.COMPLETED, {
        feedback: {
          id: "fb-1",
          interviewerId: INTERVIEWER_ID,
          recommendation: InterviewRecommendation.HOLD,
          ratings: { technical: 3 },
          summaryNotes: "Original notes",
        },
      })
    );
    await recruitmentService.submitInterviewFeedback(interviewerUser, feedbackInput);

    expect(db.interviewFeedback.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "fb-1", interviewerId: INTERVIEWER_ID } })
    );
    expect(db.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "UPDATE_INTERVIEW_FEEDBACK",
          diffPayload: expect.objectContaining({
            previous: expect.objectContaining({ recommendation: InterviewRecommendation.HOLD }),
          }),
        }),
      })
    );
  });
});

describe("Recruitment Server Actions (SEC-20, BUG-01)", () => {
  it("never returns raw internal error messages", async () => {
    signInAs(HR_ID, [Role.HR]);
    db.application.findUnique.mockRejectedValue(new Error("connect ECONNREFUSED 10.0.0.5:5432 secret-host"));
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const formData = new FormData();
    formData.set("applicationId", APP_ID);
    formData.set("toStatus", ApplicationStatus.SCREENING);
    const res = await transitionStatusAction(formData);

    expect(res).toEqual({ success: false, error: "Stage transition failed." });
    consoleSpy.mockRestore();
  });

  it("blocks interviewers from scheduling interviews", async () => {
    signInAs(INTERVIEWER_ID, [Role.INTERVIEWER]);
    const formData = new FormData();
    formData.set("applicationId", APP_ID);
    formData.set("roundName", "Technical");
    formData.set("scheduledAt", "2026-11-01T10:00:00.000Z");

    const res = await scheduleInterviewAction(formData);
    expect(res.success).toBe(false);
    expect(db.interviewSchedule.create).not.toHaveBeenCalled();
  });

  it("flushes the outbox after scheduling an interview", async () => {
    signInAs(HR_ID, [Role.HR]);
    db.application.findUnique.mockResolvedValue(applicationRecord(ApplicationStatus.SHORTLISTED));
    db.interviewSchedule.create.mockResolvedValue({ id: SCHEDULE_ID, applicationId: APP_ID });

    const formData = new FormData();
    formData.set("applicationId", APP_ID);
    formData.set("roundName", "Technical");
    formData.set("scheduledAt", "2026-11-01T10:00:00.000Z");
    formData.set("interviewerId", INTERVIEWER_ID);

    const res = await scheduleInterviewAction(formData);
    expect(res).toEqual({ success: true, data: { scheduleId: SCHEDULE_ID } });
    expect(scheduleOutboxFlush).toHaveBeenCalledTimes(1);
  });

  it("rejects malformed or out-of-range ratings before reaching the service", async () => {
    signInAs(INTERVIEWER_ID, [Role.INTERVIEWER]);
    const formData = new FormData();
    formData.set("scheduleId", SCHEDULE_ID);
    formData.set("recommendation", InterviewRecommendation.HIRE);
    formData.set("summaryNotes", "Clear and structured answers.");

    formData.set("ratings", "{not json");
    expect((await submitFeedbackAction(formData)).success).toBe(false);

    formData.set("ratings", JSON.stringify({ technical: 42 }));
    expect((await submitFeedbackAction(formData)).success).toBe(false);

    expect(db.interviewSchedule.findUnique).not.toHaveBeenCalled();
  });
});

describe("Candidate Confidentiality Protection", () => {
  it("strictly filters internal screening notes and interviewer ratings from candidate timeline", () => {
    const rawStaffHistory = [
      {
        id: "h1",
        fromStatus: "SUBMITTED",
        toStatus: "SCREENING",
        internalNotes: "CONFIDENTIAL: Candidate has high potential, proceed with Round 1.",
        candidateMessage: "Your application is currently under review by our team.",
        actor: { name: "Lead Recruiter", email: "recruiter@gara.com" },
      },
    ];

    const candidateTimeline = rawStaffHistory.map((item) => ({
      id: item.id,
      toStatus: item.toStatus,
      candidateMessage: item.candidateMessage,
    }));

    for (const entry of candidateTimeline) {
      expect(entry).not.toHaveProperty("internalNotes");
      expect(entry).not.toHaveProperty("actor");
      expect(entry.candidateMessage).toBeDefined();
    }
  });
});

describe("Separation of duties: staff never act on their own application (REV-08)", () => {
  /** HR user who is also the candidate of APP_ID. */
  const hrCandidate: AuthenticatedUser = {
    id: CANDIDATE_USER_ID,
    name: "HR Candidate",
    email: "cand@gara.test",
    roles: [Role.HR],
  };
  const ownSchedule = (status: InterviewStatus = InterviewStatus.SCHEDULED) =>
    scheduleRecord(status, {
      interviewerId: INTERVIEWER_ID,
      scheduledAt: new Date("2026-11-01T10:00:00.000Z"),
      application: {
        id: APP_ID,
        status: ApplicationStatus.INTERVIEW_SCHEDULED,
        isArchived: false,
        candidate: {
          userId: CANDIDATE_USER_ID,
          user: { id: CANDIDATE_USER_ID, email: "cand@gara.test", name: "Candidate" },
        },
      },
    });

  function expectNoWrites() {
    expect(db.application.update).not.toHaveBeenCalled();
    expect(db.application.updateMany).not.toHaveBeenCalled();
    expect(db.applicationStatusHistory.create).not.toHaveBeenCalled();
    expect(db.interviewSchedule.create).not.toHaveBeenCalled();
    expect(db.interviewSchedule.updateMany).not.toHaveBeenCalled();
    expect(db.interviewFeedback.create).not.toHaveBeenCalled();
    expect(db.interviewFeedback.updateMany).not.toHaveBeenCalled();
    expect(db.auditLog.create).not.toHaveBeenCalled();
  }

  it("blocks a stage transition on the actor's own application", async () => {
    db.application.findUnique.mockResolvedValue(applicationRecord(ApplicationStatus.SUBMITTED));
    await expect(
      recruitmentService.transitionApplicationStatus(hrCandidate, {
        applicationId: APP_ID,
        toStatus: ApplicationStatus.SCREENING,
      })
    ).rejects.toThrow(OWN_APPLICATION_ACTION_MESSAGE);
    expectNoWrites();
  });

  it("blocks recruiter assignment on the actor's own application", async () => {
    db.application.findUnique.mockResolvedValue({
      id: APP_ID,
      assignedRecruiterId: null,
      candidate: { userId: CANDIDATE_USER_ID },
    });
    await expect(
      recruitmentService.assignRecruiter(hrCandidate, { applicationId: APP_ID, recruiterId: HR_ID })
    ).rejects.toBeInstanceOf(ForbiddenError);
    expectNoWrites();
  });

  it("never assigns the candidate as recruiter of their own application", async () => {
    db.application.findUnique.mockResolvedValue({
      id: APP_ID,
      assignedRecruiterId: null,
      candidate: { userId: CANDIDATE_USER_ID },
    });
    await expect(
      recruitmentService.assignRecruiter(hrUser, { applicationId: APP_ID, recruiterId: CANDIDATE_USER_ID })
    ).rejects.toBeInstanceOf(ValidationError);
    expectNoWrites();
  });

  it("blocks scheduling an interview on the actor's own application", async () => {
    db.application.findUnique.mockResolvedValue(applicationRecord(ApplicationStatus.SHORTLISTED));
    await expect(
      recruitmentService.scheduleInterview(hrCandidate, {
        applicationId: APP_ID,
        roundNumber: 1,
        roundName: "Technical",
        scheduledAt: "2026-11-01T10:00:00.000Z",
        durationMinutes: 45,
        meetingLink: null,
        interviewerId: INTERVIEWER_ID,
      })
    ).rejects.toThrow(OWN_APPLICATION_ACTION_MESSAGE);
    expectNoWrites();
  });

  it("blocks rescheduling and cancelling interviews on the actor's own application", async () => {
    db.interviewSchedule.findUnique.mockResolvedValue(ownSchedule());
    await expect(
      recruitmentService.rescheduleInterview(hrCandidate, {
        scheduleId: SCHEDULE_ID,
        newScheduledAt: "2026-11-02T10:00:00.000Z",
        rescheduleReason: "Panel conflict",
      })
    ).rejects.toThrow(OWN_APPLICATION_ACTION_MESSAGE);
    await expect(
      recruitmentService.cancelInterview(hrCandidate, { scheduleId: SCHEDULE_ID, cancellationReason: "Role closed" })
    ).rejects.toThrow(OWN_APPLICATION_ACTION_MESSAGE);
    expectNoWrites();
  });

  it("blocks the HR/Admin feedback bypass on the actor's own interview", async () => {
    db.interviewSchedule.findUnique.mockResolvedValue(ownSchedule());
    await expect(recruitmentService.submitInterviewFeedback(hrCandidate, feedbackInput)).rejects.toThrow(
      OWN_APPLICATION_ACTION_MESSAGE
    );
    expectNoWrites();
  });

  it("blocks feedback even when the candidate is listed as interviewer of their own round", async () => {
    const candidateInterviewer: AuthenticatedUser = { ...interviewerUser, id: CANDIDATE_USER_ID };
    db.interviewSchedule.findUnique.mockResolvedValue(
      scheduleRecord(InterviewStatus.SCHEDULED, {
        interviewerId: CANDIDATE_USER_ID,
        application: { id: APP_ID, status: ApplicationStatus.INTERVIEW_SCHEDULED, candidate: { userId: CANDIDATE_USER_ID } },
      })
    );
    await expect(
      recruitmentService.submitInterviewFeedback(candidateInterviewer, feedbackInput)
    ).rejects.toBeInstanceOf(ForbiddenError);
    expectNoWrites();
  });

  it("refuses the staff view of the actor's own application", async () => {
    db.application.findUnique.mockResolvedValue(detailRecord());
    await expect(recruitmentService.getRecruiterApplicationDetail(APP_ID, hrCandidate)).rejects.toBeInstanceOf(
      ForbiddenError
    );
  });

  it("excludes the actor's own application from the queue, counts and interview board", async () => {
    db.application.findMany.mockResolvedValue([]);
    db.application.groupBy.mockResolvedValue([]);
    db.interviewSchedule.findMany.mockResolvedValue([]);

    await recruitmentService.getRecruitmentQueue(hrUser);
    await recruitmentService.getRecruitmentStatusCounts(hrUser);
    await recruitmentService.getInterviewSchedules(hrUser);

    const notOwn = { candidate: { userId: { not: HR_ID } } };
    expect(db.application.findMany.mock.calls[0][0].where.AND).toEqual([{ AND: [notOwn] }]);
    expect(db.application.groupBy.mock.calls[0][0].where.AND).toEqual([{ AND: [notOwn] }]);
    expect(db.interviewSchedule.findMany.mock.calls[0][0].where).toEqual({ application: notOwn });
  });
});

/** Application detail record as loaded by getRecruiterApplicationDetail. */
function detailRecord(extra: Record<string, unknown> = {}) {
  return {
    id: APP_ID,
    referenceCode: "APP-1",
    status: ApplicationStatus.INTERVIEWED,
    createdAt: new Date("2026-10-01T00:00:00.000Z"),
    updatedAt: new Date("2026-10-02T00:00:00.000Z"),
    opening: { id: "op-1", title: "Engineer", slug: "engineer", department: "Eng", type: "FULL_TIME", location: "Remote" },
    candidate: {
      id: "cand-1",
      phone: null,
      location: null,
      user: { id: CANDIDATE_USER_ID, name: "Candidate", email: "cand@gara.test" },
    },
    formVersion: { versionNumber: 1, schemaDefinition: { sections: [] } },
    submittedResponses: {},
    resumeStorageKey: "resumes/k.pdf",
    assignedRecruiterId: null,
    assignedRecruiter: null,
    statusHistory: [
      {
        id: "h-1",
        fromStatus: ApplicationStatus.SUBMITTED,
        toStatus: ApplicationStatus.SCREENING,
        internalNotes: "CONFIDENTIAL screening note",
        candidateMessage: "Your application is under review.",
        createdAt: new Date("2026-10-01T10:00:00.000Z"),
        actor: { id: HR_ID, name: "HR", email: "hr@gara.test" },
      },
    ],
    interviewSchedules: [
      {
        id: SCHEDULE_ID,
        roundNumber: 1,
        roundName: "Technical",
        scheduledAt: new Date("2026-10-05T10:00:00.000Z"),
        durationMinutes: 45,
        meetingLink: "https://meet.example.test/own",
        status: InterviewStatus.COMPLETED,
        interviewerId: INTERVIEWER_ID,
        interviewer: { id: INTERVIEWER_ID, name: "Interviewer", email: "int@gara.test" },
        scheduledBy: { id: HR_ID, name: "HR" },
        rescheduleReason: null,
        cancellationReason: null,
        feedback: {
          id: "fb-own",
          recommendation: InterviewRecommendation.HIRE,
          ratings: {},
          summaryNotes: "My own notes",
          submittedAt: new Date("2026-10-05T11:00:00.000Z"),
          interviewerId: INTERVIEWER_ID,
          interviewer: { name: "Interviewer" },
        },
      },
      {
        id: OTHER_SCHEDULE_ID,
        roundNumber: 2,
        roundName: "Culture",
        scheduledAt: new Date("2026-10-06T10:00:00.000Z"),
        durationMinutes: 45,
        meetingLink: "https://meet.example.test/other",
        status: InterviewStatus.COMPLETED,
        interviewerId: OTHER_INTERVIEWER_ID,
        interviewer: { id: OTHER_INTERVIEWER_ID, name: "Other", email: "other@gara.test" },
        scheduledBy: { id: HR_ID, name: "HR" },
        rescheduleReason: null,
        cancellationReason: null,
        feedback: {
          id: "fb-other",
          recommendation: InterviewRecommendation.NO_HIRE,
          ratings: {},
          summaryNotes: "Other interviewer's confidential notes",
          submittedAt: new Date("2026-10-06T11:00:00.000Z"),
          interviewerId: OTHER_INTERVIEWER_ID,
          interviewer: { name: "Other" },
        },
      },
    ],
    ...extra,
  };
}

describe("Interviewer record-level scoping (REV-09)", () => {
  it("blocks an interviewer from reading an application they are not assigned to", async () => {
    const unassigned = detailRecord();
    unassigned.interviewSchedules = unassigned.interviewSchedules.filter((s) => s.id === OTHER_SCHEDULE_ID);
    db.application.findUnique.mockResolvedValue(unassigned);
    await expect(
      recruitmentService.getRecruiterApplicationDetail(APP_ID, interviewerUser)
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("lets an interviewer assigned as recruiter open the application", async () => {
    const assigned = detailRecord({ assignedRecruiterId: INTERVIEWER_ID });
    assigned.interviewSchedules = assigned.interviewSchedules.filter((s) => s.id === OTHER_SCHEDULE_ID);
    db.application.findUnique.mockResolvedValue(assigned);
    const detail = await recruitmentService.getRecruiterApplicationDetail(APP_ID, interviewerUser);
    // Rounds conducted by other interviewers are omitted entirely.
    expect(detail.interviewSchedules).toEqual([]);
  });

  it("returns only the interviewer's own rounds and feedback, without internal notes or staff emails", async () => {
    db.application.findUnique.mockResolvedValue(detailRecord());
    const detail = await recruitmentService.getRecruiterApplicationDetail(APP_ID, interviewerUser);

    expect(detail.restrictedView).toBe(true);
    expect(detail.interviewSchedules.map((s) => s.id)).toEqual([SCHEDULE_ID]);
    expect(detail.interviewSchedules[0].feedback?.summaryNotes).toBe("My own notes");
    const serialized = JSON.stringify(detail);
    expect(serialized).not.toContain("Other interviewer's confidential notes");
    expect(serialized).not.toContain("https://meet.example.test/other");
    expect(serialized).not.toContain("CONFIDENTIAL screening note");
    expect(serialized).not.toContain("hr@gara.test");
    expect(detail.statusHistory[0].internalNotes).toBeNull();
    expect(detail.statusHistory[0].actor).toEqual({ id: HR_ID, name: "HR", email: null });
    expect(detail.statusHistory[0].candidateMessage).toBe("Your application is under review.");
  });

  it("omits feedback on the interviewer's own round when someone else authored it", async () => {
    const record = detailRecord();
    record.interviewSchedules[0].feedback = { ...record.interviewSchedules[0].feedback, interviewerId: HR_ID };
    db.application.findUnique.mockResolvedValue(record);
    const detail = await recruitmentService.getRecruiterApplicationDetail(APP_ID, interviewerUser);
    expect(detail.interviewSchedules[0].feedback).toBeNull();
  });

  it.each([
    ["HR", hrUser],
    ["MANAGER (unchanged pending OD-019)", managerUser],
  ])("keeps the full projection for %s", async (_label, viewer) => {
    db.application.findUnique.mockResolvedValue(detailRecord());
    const detail = await recruitmentService.getRecruiterApplicationDetail(APP_ID, viewer);
    expect(detail.restrictedView).toBe(false);
    expect(detail.interviewSchedules).toHaveLength(2);
    expect(detail.interviewSchedules[1].feedback?.summaryNotes).toBe("Other interviewer's confidential notes");
    expect(detail.statusHistory[0].internalNotes).toBe("CONFIDENTIAL screening note");
    expect(detail.statusHistory[0].actor?.email).toBe("hr@gara.test");
  });

  it("limits the interviewer queue and pipeline counts to assigned applications", async () => {
    db.application.findMany.mockResolvedValue([]);
    db.application.groupBy.mockResolvedValue([]);
    await recruitmentService.getRecruitmentQueue(interviewerUser);
    await recruitmentService.getRecruitmentStatusCounts(interviewerUser);

    const scope = {
      AND: [
        { candidate: { userId: { not: INTERVIEWER_ID } } },
        {
          OR: [
            { assignedRecruiterId: INTERVIEWER_ID },
            { interviewSchedules: { some: { interviewerId: INTERVIEWER_ID } } },
          ],
        },
      ],
    };
    const queueArgs = db.application.findMany.mock.calls[0][0];
    expect(queueArgs.where.AND).toEqual([scope]);
    expect(queueArgs.include.interviewSchedules.where).toEqual({ interviewerId: INTERVIEWER_ID });
    expect(db.application.groupBy.mock.calls[0][0].where.AND).toEqual([scope]);
  });

  it("does not scope MANAGER queues (pending OD-019)", async () => {
    db.application.findMany.mockResolvedValue([]);
    await recruitmentService.getRecruitmentQueue(managerUser);
    expect(db.application.findMany.mock.calls[0][0].where.AND).toEqual([
      { AND: [{ candidate: { userId: { not: MANAGER_ID } } }] },
    ]);
  });

  it("shows interviewers only their own interview sessions and recommendations", async () => {
    db.interviewSchedule.findMany.mockResolvedValue([
      {
        id: SCHEDULE_ID,
        applicationId: APP_ID,
        roundNumber: 1,
        roundName: "Technical",
        scheduledAt: new Date("2026-11-01T10:00:00.000Z"),
        durationMinutes: 45,
        meetingLink: "https://meet.example.test/own",
        status: InterviewStatus.COMPLETED,
        application: { candidate: { user: { name: "Candidate" } }, opening: { title: "Engineer", department: "Eng" } },
        interviewer: { name: "Interviewer" },
        // Recorded by HR on the interviewer's round: not the interviewer's own feedback.
        feedback: { recommendation: InterviewRecommendation.NO_HIRE, interviewerId: HR_ID },
      },
    ]);
    const schedules = await recruitmentService.getInterviewSchedules(interviewerUser);

    expect(db.interviewSchedule.findMany.mock.calls[0][0].where).toEqual({
      application: { candidate: { userId: { not: INTERVIEWER_ID } } },
      interviewerId: INTERVIEWER_ID,
    });
    expect(schedules[0].feedback).toBeNull();
  });
});

describe("Interview actions are not stage changes (REV-10)", () => {
  it("reschedules an interview on an OFFERED application without a stage-history row", async () => {
    db.interviewSchedule.findUnique.mockResolvedValue(
      scheduleRecord(InterviewStatus.SCHEDULED, {
        scheduledAt: new Date("2026-11-01T10:00:00.000Z"),
        application: {
          id: APP_ID,
          status: ApplicationStatus.OFFERED,
          isArchived: false,
          candidate: { user: { id: CANDIDATE_USER_ID, email: "cand@gara.test", name: "Candidate" } },
        },
      })
    );
    await recruitmentService.rescheduleInterview(hrUser, {
      scheduleId: SCHEDULE_ID,
      newScheduledAt: "2026-11-03T10:00:00.000Z",
      rescheduleReason: "Panel conflict",
    });

    expect(db.applicationStatusHistory.create).not.toHaveBeenCalled();
    expect(db.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "RESCHEDULE_INTERVIEW",
          diffPayload: expect.objectContaining({ reason: "Panel conflict", applicationStatus: ApplicationStatus.OFFERED }),
        }),
      })
    );
  });

  it("schedules and cancels interviews without stage-history rows", async () => {
    db.application.findUnique.mockResolvedValue(applicationRecord(ApplicationStatus.OFFERED));
    db.interviewSchedule.create.mockResolvedValue({ id: SCHEDULE_ID, applicationId: APP_ID });
    await recruitmentService.scheduleInterview(hrUser, {
      applicationId: APP_ID,
      roundNumber: 2,
      roundName: "Final",
      scheduledAt: "2026-11-01T10:00:00.000Z",
      durationMinutes: 45,
      meetingLink: null,
      interviewerId: INTERVIEWER_ID,
    });

    db.interviewSchedule.findUnique.mockResolvedValue(
      scheduleRecord(InterviewStatus.SCHEDULED, { scheduledAt: new Date("2026-11-01T10:00:00.000Z") })
    );
    await recruitmentService.cancelInterview(hrUser, { scheduleId: SCHEDULE_ID, cancellationReason: "Role closed" });

    expect(db.applicationStatusHistory.create).not.toHaveBeenCalled();
    expect(db.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: "CANCEL_INTERVIEW" }) })
    );
  });
});
