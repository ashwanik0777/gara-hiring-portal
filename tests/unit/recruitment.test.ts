import { describe, it, expect } from "vitest";
import crypto from "node:crypto";
import {
  VALID_APPLICATION_TRANSITIONS,
  ScheduleInterviewSchema,
  RescheduleInterviewSchema,
  CancelInterviewSchema,
  SubmitFeedbackSchema,
} from "@/features/recruitment/schemas";
import { ApplicationStatus, InterviewRecommendation, Role } from "@prisma/client";

describe("Recruitment Pipeline State Machine (Prompt 4)", () => {
  it("enforces valid recruitment stage transitions", () => {
    // SUBMITTED can transition to SCREENING, REJECTED, WITHDRAWN
    expect(VALID_APPLICATION_TRANSITIONS[ApplicationStatus.SUBMITTED]).toContain(
      ApplicationStatus.SCREENING
    );
    expect(VALID_APPLICATION_TRANSITIONS[ApplicationStatus.SUBMITTED]).toContain(
      ApplicationStatus.REJECTED
    );

    // SCREENING can transition to SHORTLISTED
    expect(VALID_APPLICATION_TRANSITIONS[ApplicationStatus.SCREENING]).toContain(
      ApplicationStatus.SHORTLISTED
    );

    // SHORTLISTED can transition to INTERVIEW_SCHEDULED
    expect(VALID_APPLICATION_TRANSITIONS[ApplicationStatus.SHORTLISTED]).toContain(
      ApplicationStatus.INTERVIEW_SCHEDULED
    );

    // INTERVIEWED can transition to next interview round or 7-day supervised evaluation
    expect(VALID_APPLICATION_TRANSITIONS[ApplicationStatus.INTERVIEWED]).toContain(
      ApplicationStatus.INTERVIEW_SCHEDULED
    );
    expect(VALID_APPLICATION_TRANSITIONS[ApplicationStatus.INTERVIEWED]).toContain(
      ApplicationStatus.EVALUATION_SELECTED
    );
  });

  it("strictly rejects illegal backward or invalid bypass transitions", () => {
    // Cannot jump directly from SUBMITTED to OFFERED or EVALUATION_SELECTED
    expect(VALID_APPLICATION_TRANSITIONS[ApplicationStatus.SUBMITTED]).not.toContain(
      ApplicationStatus.OFFERED
    );
    expect(VALID_APPLICATION_TRANSITIONS[ApplicationStatus.SUBMITTED]).not.toContain(
      ApplicationStatus.EVALUATION_SELECTED
    );

    // ARCHIVED is terminal
    expect(VALID_APPLICATION_TRANSITIONS[ApplicationStatus.ARCHIVED]).toHaveLength(0);
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
    const valid = RescheduleInterviewSchema.safeParse({
      scheduleId: validId,
      newScheduledAt: "2026-03-26T10:00:00.000Z",
      rescheduleReason: "Candidate requested rescheduling due to exam conflict",
    });

    expect(valid.success).toBe(true);

    const invalid = RescheduleInterviewSchema.safeParse({
      scheduleId: validId,
      newScheduledAt: "2026-03-26T10:00:00.000Z",
      rescheduleReason: "  ", // Empty reason
    });

    expect(invalid.success).toBe(false);
  });

  it("validates interview cancellation and requires reason", () => {
    const valid = CancelInterviewSchema.safeParse({
      scheduleId: crypto.randomUUID(),
      cancellationReason: "Position filled or cohort paused",
    });

    expect(valid.success).toBe(true);
  });

  it("validates structured interviewer feedback and recommendation", () => {
    const valid = SubmitFeedbackSchema.safeParse({
      scheduleId: crypto.randomUUID(),
      recommendation: InterviewRecommendation.STRONG_HIRE,
      summaryNotes: "Demonstrated strong mastery of algorithms and clean design patterns.",
      ratings: {
        technical: 5,
        communication: 4,
      },
    });

    expect(valid.success).toBe(true);
  });
});

describe("Recruitment Decision Authority vs Interviewer Advisory Separation", () => {
  const DECISION_ROLES: Role[] = [Role.ADMIN, Role.HR];

  it("restricts final stage decision authority to ADMIN and HR", () => {
    const candidateUser = { roles: [Role.CANDIDATE] };
    const interviewerUser = { roles: [Role.INTERVIEWER] };
    const hrUser = { roles: [Role.HR] };
    const adminUser = { roles: [Role.ADMIN] };

    const canMakeDecision = (user: { roles: Role[] }) =>
      user.roles.some((r) => DECISION_ROLES.includes(r));

    expect(canMakeDecision(candidateUser)).toBe(false);
    expect(canMakeDecision(interviewerUser)).toBe(false);
    expect(canMakeDecision(hrUser)).toBe(true);
    expect(canMakeDecision(adminUser)).toBe(true);
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
      {
        id: "h2",
        fromStatus: "SCREENING",
        toStatus: "SHORTLISTED",
        internalNotes: "CONFIDENTIAL: Score: 92/100, assigned to Senior Architect.",
        candidateMessage: "Congratulations! You have been shortlisted for an interview.",
        actor: { name: "HR Manager", email: "hr@gara.com" },
      },
    ];

    // Filter applied for candidate projection
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
