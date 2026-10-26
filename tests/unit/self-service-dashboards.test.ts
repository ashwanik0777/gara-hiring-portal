import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { Role } from "@prisma/client";

const {
  db,
  mockGetCurrentUser,
  mockRedirect,
  mockRefresh,
  mockSaveCareerInterest,
  mockGetCandidateApplications,
  mockGetCandidateApplicationDetail,
  mockGetOfferByApplicationId,
} = vi.hoisted(() => ({
  db: {
    application: { findMany: vi.fn() },
    applicationStatusHistory: { findMany: vi.fn() },
    interviewSchedule: { findMany: vi.fn() },
    jobOffer: { findMany: vi.fn() },
    opening: { findMany: vi.fn() },
    candidateProfile: { findUnique: vi.fn() },
    evaluationCheckpoint: { findMany: vi.fn() },
    internshipEnrollment: { findFirst: vi.fn() },
    attendanceRecord: { findFirst: vi.fn() },
    employee: { findUnique: vi.fn() },
    leaveRequest: { count: vi.fn() },
    payrollRecord: { findMany: vi.fn() },
    userRole: { findMany: vi.fn() },
    employmentPeriod: { findMany: vi.fn() },
    conversionReview: { findMany: vi.fn() },
  },
  mockGetCurrentUser: vi.fn(),
  mockRedirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
  mockRefresh: vi.fn(),
  mockSaveCareerInterest: vi.fn(),
  mockGetCandidateApplications: vi.fn(),
  mockGetCandidateApplicationDetail: vi.fn(),
  mockGetOfferByApplicationId: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ prisma: db }));
vi.mock("@/lib/auth/guards", () => ({ getCurrentUser: mockGetCurrentUser, requireAuth: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: mockRedirect,
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  useRouter: () => ({ refresh: mockRefresh, push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/",
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/features/lifecycle/actions", () => ({ saveCareerInterestAction: mockSaveCareerInterest }));
vi.mock("@/features/applications/services/application-service", () => ({
  applicationService: {
    getCandidateApplications: mockGetCandidateApplications,
    getCandidateApplicationDetail: mockGetCandidateApplicationDetail,
  },
}));
vi.mock("@/features/employees/services/offer-service", () => ({
  offerService: { getOfferByApplicationId: mockGetOfferByApplicationId },
}));
vi.mock("@/features/employees/actions", () => ({ candidateDecideOfferAction: vi.fn() }));

import {
  getOffersAwaitingDecision,
  getOwnApplicationHistory,
  getOwnCheckpointProgress,
  getOwnConversionStatus,
  getOwnEmploymentPeriods,
  getOwnEmploymentProfile,
  getOwnEvaluationWorkspace,
  getOwnLatestPayrollRecords,
  getOwnLeaveSummary,
  getProfileCompleteness,
  getRecommendedOpenings,
  getTodayAttendance,
  getUpcomingInterviews,
  listOwnApplications,
} from "@/features/lifecycle/services/self-service-dashboard-service";
import {
  buildJourneyProgress,
  computeProfileCompleteness,
  journeyRank,
  openingTypesForInterest,
  parseChecklistProgress,
  safeMeetingLink,
} from "@/features/lifecycle/services/journey-progress";
import { pickFeaturedApplication } from "@/features/lifecycle/components/candidate-dashboard-sections";
import { CareerInterestPrompt } from "@/features/lifecycle/components/career-interest-prompt";
import CandidateDashboardPage from "@/app/candidate/dashboard/page";
import CandidateApplicationsPage from "@/app/candidate/applications/page";
import ApplicationDetailPage from "@/app/candidate/applications/[id]/page";
import InternDashboardPage from "@/app/intern/dashboard/page";
import EmployeeHomePage from "@/app/hrms/page";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

/** True when a Prisma `where` filters on `userId === id` (directly or through a relation). */
function hasUserScope(where: unknown, id: string): boolean {
  if (!where || typeof where !== "object") return false;
  return Object.entries(where as Record<string, unknown>).some(
    ([key, value]) => (key === "userId" && value === id) || hasUserScope(value, id)
  );
}

/** Every field name selected by a Prisma `select`, including nested relation selects. */
function collectSelectedFields(select: unknown, out: Set<string> = new Set()): Set<string> {
  if (!select || typeof select !== "object") return out;
  for (const [key, value] of Object.entries(select as Record<string, unknown>)) {
    out.add(key);
    if (value && typeof value === "object" && "select" in value) {
      collectSelectedFields((value as { select: unknown }).select, out);
    }
  }
  return out;
}

function allQueryCalls(): Array<{ model: string; method: string; args: Record<string, unknown> }> {
  const calls: Array<{ model: string; method: string; args: Record<string, unknown> }> = [];
  for (const [model, methods] of Object.entries(db)) {
    for (const [method, fn] of Object.entries(methods as Record<string, ReturnType<typeof vi.fn>>)) {
      for (const call of fn.mock.calls) {
        calls.push({ model, method, args: (call[0] ?? {}) as Record<string, unknown> });
      }
    }
  }
  return calls;
}

const SENSITIVE_FIELDS = [
  "email",
  "internalNotes",
  "personalPhone",
  "emergencyContact",
  "notes",
  "disbursedAmount",
  "disbursementReference",
  "resumeStorageKey",
  "submittedResponses",
  "finalReviewNotes",
  "summaryNotes",
  "feedback",
  "ratings",
  "recommendation",
  "interviewer",
  "interviewerId",
  "scheduledBy",
  "extendedBy",
  "declineReason",
  "rescheduleReason",
  "cancellationReason",
  "revocationReason",
  "pdfStorageKey",
  "metadata",
  "approvedBy",
  "evaluatedBy",
  "assignedRecruiter",
  "checkpointConfig",
  "reviewNotes",
  "finalizedBy",
];

function primeLifecycle({
  roles = [],
  enrollment = null,
  employee = null,
}: {
  roles?: Role[];
  enrollment?: { status: string } | null;
  employee?: { status: string; joiningDate?: Date } | null;
}) {
  db.candidateProfile.findUnique.mockResolvedValue({ careerInterest: "JOB" });
  db.internshipEnrollment.findFirst.mockResolvedValue(
    enrollment
      ? {
          id: "enr-1",
          status: enrollment.status,
          startDate: null,
          endDate: null,
          createdAt: new Date("2026-10-01T00:00:00Z"),
          application: { opening: { title: "Frontend Intern" } },
        }
      : null
  );
  db.employee.findUnique.mockResolvedValue(
    employee
      ? {
          id: "emp-1",
          employeeCode: "E-1",
          status: employee.status,
          employmentType: null,
          designation: "Engineer",
          department: "Engineering",
          joiningDate: employee.joiningDate ?? new Date("2026-10-20T00:00:00Z"),
        }
      : null
  );
  db.userRole.findMany.mockResolvedValue(
    roles.filter((r) => r === Role.INTERN || r === Role.EMPLOYEE).map((role) => ({
      role,
      assignedAt: new Date("2026-01-01T00:00:00Z"),
    }))
  );
}

let userCounter = 0;
/** A fresh user id per test so request-memoized reads never leak between tests. */
function signIn(roles: Role[]) {
  userCounter += 1;
  const user = { id: `user-${userCounter}`, email: "u@gara.test", name: "Asha Rao", roles, mustChangePassword: false };
  mockGetCurrentUser.mockResolvedValue(user);
  return user;
}

beforeEach(() => {
  vi.clearAllMocks();
  cleanup();
});

// -----------------------------------------------------------------------------
// Dashboard service: scoping, recommendations and field selection
// -----------------------------------------------------------------------------

describe("self-service dashboard service", () => {
  const uid = "user-scope-1";

  function primeServiceData() {
    const now = new Date("2026-10-25T09:00:00Z");
    db.application.findMany.mockResolvedValue([
      {
        id: "app-1",
        referenceCode: "GARA-1",
        status: "SCREENING",
        createdAt: now,
        updatedAt: now,
        opening: { title: "Engineer", slug: "engineer", department: "Eng", type: "FULL_TIME", location: "Pune" },
      },
    ]);
    db.applicationStatusHistory.findMany.mockResolvedValue([]);
    db.interviewSchedule.findMany.mockResolvedValue([
      {
        id: "int-1",
        roundNumber: 1,
        roundName: "Technical",
        scheduledAt: now,
        durationMinutes: 45,
        status: "SCHEDULED",
        meetingLink: "javascript:alert(1)",
        application: { id: "app-1", referenceCode: "GARA-1", opening: { title: "Engineer" } },
      },
    ]);
    db.jobOffer.findMany.mockResolvedValue([]);
    db.opening.findMany.mockResolvedValue([]);
    db.candidateProfile.findUnique.mockResolvedValue({ careerInterest: "JOB", phone: "123", location: null });
    db.evaluationCheckpoint.findMany.mockResolvedValue([
      { status: "SUBMITTED" },
      { status: "REVIEWED" },
      { status: "PENDING" },
    ]);
    db.internshipEnrollment.findFirst.mockResolvedValue(null);
    db.attendanceRecord.findFirst.mockResolvedValue(null);
    db.employee.findUnique.mockResolvedValue(null);
    db.leaveRequest.count.mockResolvedValue(2);
    db.payrollRecord.findMany.mockResolvedValue([]);
    return now;
  }

  async function runEveryQuery(userId: string, now: Date) {
    await listOwnApplications(userId);
    await getOwnApplicationHistory(userId, "app-1");
    await getUpcomingInterviews(userId, now);
    await getOffersAwaitingDecision(userId);
    await getRecommendedOpenings(userId, "BOTH");
    await getProfileCompleteness(userId);
    await getOwnCheckpointProgress(userId, "enr-1");
    await getOwnEvaluationWorkspace(userId);
    await getTodayAttendance(userId, now);
    await getOwnEmploymentProfile(userId);
    await getOwnLeaveSummary(userId);
    await getOwnLatestPayrollRecords(userId);
  }

  it("scopes every query by the signed-in user's id", async () => {
    const now = primeServiceData();
    await runEveryQuery(uid, now);

    const calls = allQueryCalls();
    // 12 functions; the leave summary runs two counts.
    expect(calls).toHaveLength(13);
    for (const call of calls) {
      expect(hasUserScope(call.args.where, uid), `${call.model}.${call.method} must filter by userId`).toBe(true);
    }
  });

  it("selects only rendered fields: no include, no internal or staff-identifying fields", async () => {
    const now = primeServiceData();
    await runEveryQuery("user-scope-2", now);

    const selected = new Set<string>();
    for (const call of allQueryCalls()) {
      expect(call.args.include, `${call.model}.${call.method} must not use include`).toBeUndefined();
      if (call.method !== "count") {
        expect(call.args.select, `${call.model}.${call.method} must use an explicit select`).toBeDefined();
      }
      collectSelectedFields(call.args.select, selected);
    }
    for (const field of SENSITIVE_FIELDS) {
      expect(selected.has(field), `"${field}" must not be selected`).toBe(false);
    }
  });

  it("reads only the user's own employment periods and progress reviews, never internal notes", async () => {
    db.employmentPeriod.findMany.mockResolvedValue([
      {
        id: "p-1",
        employmentType: "INTERN",
        designation: "Intern",
        department: "Eng",
        startDate: new Date("2025-01-06T00:00:00.000Z"),
        endDate: new Date("2025-06-30T00:00:00.000Z"),
        startReason: "JOINED",
        endReason: "EXITED",
      },
    ]);
    db.conversionReview.findMany.mockResolvedValue([]);

    const periods = await getOwnEmploymentPeriods("user-periods");
    await getOwnConversionStatus("user-periods");

    expect(periods).toEqual([
      expect.objectContaining({ id: "p-1", startDate: "2025-01-06T00:00:00.000Z", endReason: "EXITED" }),
    ]);
    for (const call of [...db.employmentPeriod.findMany.mock.calls, ...db.conversionReview.findMany.mock.calls]) {
      const args = call[0] as Record<string, unknown>;
      expect(hasUserScope(args.where, "user-periods")).toBe(true);
      const selected = collectSelectedFields(args.select);
      for (const field of ["internalNotes", "reviewerId", "reviewer", "createdById"]) {
        expect(selected.has(field), `"${field}" must not be selected`).toBe(false);
      }
    }
  });

  it("summarizes the next review, a pending offer and an accepted offer for the intern", async () => {
    const base = {
      reviewPeriodMonths: 3,
      decidedAt: null,
      sharedSummary: null,
      proposedDesignation: null,
      proposedDepartment: null,
      proposedEffectiveDate: null,
      proposedInitialStatus: null,
      offerStatus: null,
      convertedAt: null,
      outcome: null,
    };
    db.conversionReview.findMany.mockResolvedValue([
      { ...base, id: "r-3", status: "SCHEDULED", scheduledFor: new Date("2027-01-25T00:00:00.000Z") },
      {
        ...base,
        id: "r-2",
        status: "COMPLETED",
        scheduledFor: new Date("2026-10-20T00:00:00.000Z"),
        outcome: "CONVERT",
        offerStatus: "PENDING",
        decidedAt: new Date("2026-10-21T10:00:00.000Z"),
        sharedSummary: "Well done",
        proposedDesignation: "Engineer",
        proposedDepartment: "Platform",
        proposedEffectiveDate: new Date("2026-11-01T00:00:00.000Z"),
        proposedInitialStatus: "PROBATION",
      },
    ]);

    const status = await getOwnConversionStatus("user-conv");

    expect(status.nextReview).toEqual({ scheduledFor: "2027-01-25T00:00:00.000Z", reviewPeriodMonths: 3 });
    expect(status.pendingOffer).toMatchObject({
      reviewId: "r-2",
      proposedDesignation: "Engineer",
      effectiveDate: "2026-11-01T00:00:00.000Z",
      sharedSummary: "Well done",
    });
    expect(status.acceptedOffer).toBeNull();
    expect(status.latestDecision).toMatchObject({ outcome: "CONVERT", offerStatus: "PENDING" });
  });

  it("recommends only published openings of the chosen type that were not applied to", async () => {
    db.opening.findMany.mockResolvedValue([]);
    const cases: Array<[Parameters<typeof getRecommendedOpenings>[1], string[]]> = [
      ["JOB", ["FULL_TIME"]],
      ["INTERNSHIP", ["INTERNSHIP"]],
      ["BOTH", ["FULL_TIME", "INTERNSHIP"]],
      [null, ["FULL_TIME", "INTERNSHIP"]],
    ];
    for (const [interest, types] of cases) {
      db.opening.findMany.mockClear();
      await getRecommendedOpenings("user-rec", interest);
      const args = db.opening.findMany.mock.calls[0][0];
      expect(args.where).toEqual({
        status: "PUBLISHED",
        type: { in: types },
        applications: { none: { candidate: { userId: "user-rec" } } },
      });
      expect(args.take).toBe(6);
    }
    expect(openingTypesForInterest("JOB")).toEqual(["FULL_TIME"]);
  });

  it("drops non-http meeting links and keeps upcoming interviews for open applications only", async () => {
    const now = primeServiceData();
    const [interview] = await getUpcomingInterviews("user-int", now);
    expect(interview.meetingLink).toBeNull();

    const args = db.interviewSchedule.findMany.mock.calls[0][0];
    expect(args.where.application.status).toEqual({ notIn: ["REJECTED", "WITHDRAWN", "ARCHIVED"] });
    expect(args.where.status).toEqual({ in: ["SCHEDULED", "RESCHEDULED"] });
    expect(args.where.scheduledAt.gte.getTime()).toBe(now.getTime() - 2 * 60 * 60 * 1000);

    expect(safeMeetingLink("https://meet.example.com/abc")).toBe("https://meet.example.com/abc");
    expect(safeMeetingLink("http://meet.example.com/x")).toBe("http://meet.example.com/x");
    expect(safeMeetingLink("javascript:alert(1)")).toBeNull();
    expect(safeMeetingLink("data:text/html,hi")).toBeNull();
    expect(safeMeetingLink("not a url")).toBeNull();
  });

  it("reads only extended offers and today's UTC attendance row", async () => {
    const now = primeServiceData();
    await getOffersAwaitingDecision("user-off");
    expect(db.jobOffer.findMany.mock.calls[0][0].where).toEqual({
      status: "EXTENDED",
      application: { candidate: { userId: "user-off" } },
    });

    const today = await getTodayAttendance("user-att", now);
    expect(today).toEqual({ dateKey: "2026-10-25", record: null });
    expect(db.attendanceRecord.findFirst.mock.calls[0][0].where).toEqual({
      date: new Date("2026-10-25T00:00:00.000Z"),
      employee: { userId: "user-att" },
    });
  });

  it("summarises checkpoints, leave and onboarding from recorded data only", async () => {
    primeServiceData();
    await expect(getOwnCheckpointProgress("user-cp", "enr-1")).resolves.toEqual({ total: 3, submitted: 2, reviewed: 1 });
    await expect(getOwnLeaveSummary("user-lv")).resolves.toEqual({ pending: 2, approved: 2 });

    db.employee.findUnique.mockResolvedValue({
      employeeCode: "E-9",
      designation: "Engineer",
      department: "Engineering",
      joiningDate: new Date("2026-10-20T00:00:00Z"),
      status: "ACTIVE",
      employmentType: "FULL_TIME",
      manager: { user: { name: "Meera" } },
      onboardingChecklist: [{ id: "a", label: "Laptop", completed: true }, { bogus: true }],
    });
    const profile = await getOwnEmploymentProfile("user-emp-profile");
    expect(profile?.reportingManagerName).toBe("Meera");
    expect(profile?.onboarding).toEqual([{ id: "a", label: "Laptop", completed: true }]);
    expect(parseChecklistProgress(null)).toEqual([]);
  });
});

// -----------------------------------------------------------------------------
// Pure journey helpers
// -----------------------------------------------------------------------------

describe("journey progress", () => {
  const createdAt = "2026-10-01T00:00:00.000Z";

  it("marks the real current stage of an active application", () => {
    const progress = buildJourneyProgress({
      status: "INTERVIEW_SCHEDULED",
      openingType: "FULL_TIME",
      createdAt,
      history: [
        { toStatus: "SUBMITTED", createdAt },
        { toStatus: "SCREENING", createdAt: "2026-10-02T00:00:00.000Z" },
        { toStatus: "SHORTLISTED", createdAt: "2026-10-03T00:00:00.000Z" },
        { toStatus: "INTERVIEW_SCHEDULED", createdAt: "2026-10-04T00:00:00.000Z" },
      ],
    });
    expect(progress.outcome).toBe("in_progress");
    expect(progress.steps.map((s) => s.state)).toEqual([
      "complete",
      "complete",
      "complete",
      "current",
      "upcoming",
      "upcoming",
    ]);
    expect(progress.steps[4].label).toBe("Offer");
    expect(progress.steps[3].reachedAt).toBe("2026-10-04T00:00:00.000Z");
  });

  it("shows where a rejected application stopped instead of inventing progress", () => {
    const progress = buildJourneyProgress({
      status: "REJECTED",
      openingType: "INTERNSHIP",
      createdAt,
      history: [
        { toStatus: "SUBMITTED", createdAt },
        { toStatus: "SCREENING", createdAt: "2026-10-02T00:00:00.000Z" },
        { toStatus: "REJECTED", createdAt: "2026-10-05T00:00:00.000Z" },
      ],
    });
    expect(progress.outcome).toBe("rejected");
    expect(progress.steps[1].state).toBe("stopped");
    expect(progress.steps.slice(2).every((s) => s.state === "upcoming")).toBe(true);
    expect(progress.steps[4].label).toBe("Evaluation");
  });

  it("completes the journey only when the application is HIRED", () => {
    expect(
      buildJourneyProgress({ status: "OFFER_ACCEPTED", openingType: "FULL_TIME", createdAt, history: [] }).steps[5].state
    ).toBe("current");
    const hired = buildJourneyProgress({ status: "HIRED", openingType: "FULL_TIME", createdAt, history: [] });
    expect(hired.outcome).toBe("joined");
    expect(hired.steps.every((s) => s.state === "complete")).toBe(true);
  });

  it("features the most advanced open application", () => {
    const base = { referenceCode: "R", createdAt, opening: { title: "T", slug: "t", department: "D", type: "FULL_TIME" as const, location: "L" } };
    const featured = pickFeaturedApplication([
      { ...base, id: "rejected", status: "REJECTED", updatedAt: "2026-10-09T00:00:00.000Z" },
      { ...base, id: "screening", status: "SCREENING", updatedAt: "2026-10-08T00:00:00.000Z" },
      { ...base, id: "offered", status: "OFFERED", updatedAt: "2026-10-02T00:00:00.000Z" },
    ]);
    expect(featured?.id).toBe("offered");
    expect(journeyRank("WITHDRAWN")).toBeLessThan(journeyRank("SUBMITTED"));
    expect(pickFeaturedApplication([])).toBeNull();
  });

  it("counts only CandidateProfile fields for completeness", () => {
    expect(computeProfileCompleteness(null)).toMatchObject({ completed: 0, total: 8 });
    const partial = computeProfileCompleteness({ careerInterest: "BOTH", phone: "  ", linkedinUrl: "https://x.test" });
    expect(partial.completed).toBe(2);
    expect(partial.missing).toContain("Phone number");
  });
});

// -----------------------------------------------------------------------------
// Page guards and read-only journey
// -----------------------------------------------------------------------------

describe("self-service page guards", () => {
  it("redirects joined interns and employees away from the candidate dashboard", async () => {
    signIn([Role.INTERN]);
    primeLifecycle({ roles: [Role.INTERN], enrollment: { status: "PASSED" }, employee: { status: "ACTIVE" } });
    await expect(CandidateDashboardPage()).rejects.toThrow("NEXT_REDIRECT:/intern/dashboard");

    signIn([Role.EMPLOYEE]);
    primeLifecycle({ roles: [Role.EMPLOYEE], employee: { status: "PROBATION" } });
    await expect(CandidateDashboardPage()).rejects.toThrow("NEXT_REDIRECT:/hrms");
    expect(db.application.findMany).not.toHaveBeenCalled();
  });

  it("lets candidates and evaluation-stage users open the candidate dashboard", async () => {
    signIn([]);
    primeLifecycle({ enrollment: { status: "IN_PROGRESS" } });
    await expect(CandidateDashboardPage()).resolves.toBeTruthy();
  });

  it("keeps the employee home for employees only", async () => {
    signIn([]);
    primeLifecycle({});
    await expect(EmployeeHomePage()).rejects.toThrow("NEXT_REDIRECT:/candidate/dashboard");

    signIn([Role.INTERN]);
    primeLifecycle({ roles: [Role.INTERN], employee: { status: "ACTIVE" } });
    await expect(EmployeeHomePage()).rejects.toThrow("NEXT_REDIRECT:/intern/dashboard");

    signIn([Role.HR]);
    await expect(EmployeeHomePage()).rejects.toThrow("NEXT_REDIRECT:/subadmin");

    signIn([Role.EMPLOYEE]);
    primeLifecycle({ roles: [Role.EMPLOYEE], employee: { status: "ACTIVE" } });
    await expect(EmployeeHomePage()).resolves.toBeTruthy();
  });

  it("opens the evaluation workspace only after selection or joining", async () => {
    signIn([]);
    primeLifecycle({});
    await expect(InternDashboardPage()).rejects.toThrow("NEXT_REDIRECT:/candidate/dashboard");

    signIn([Role.EMPLOYEE]);
    primeLifecycle({ roles: [Role.EMPLOYEE], employee: { status: "ACTIVE" } });
    db.internshipEnrollment.findFirst.mockClear();
    await expect(InternDashboardPage()).rejects.toThrow("NEXT_REDIRECT:/hrms");
    // Only the lifecycle resolution ran; the workspace query never executes for a redirect.
    expect(db.internshipEnrollment.findFirst).toHaveBeenCalledTimes(1);
  });
});

describe("My Journey (read-only history after joining)", () => {
  const application = {
    id: "app-9",
    referenceCode: "GARA-9",
    status: "OFFERED",
    createdAt: new Date("2026-09-01T00:00:00Z"),
    updatedAt: new Date("2026-09-10T00:00:00Z"),
    opening: { id: "op-1", title: "Platform Engineer", slug: "platform", department: "Eng", type: "FULL_TIME", location: "Pune" },
  };

  it("titles the list My Journey, explains the joining date and hides apply CTAs", async () => {
    const user = signIn([Role.EMPLOYEE]);
    primeLifecycle({ roles: [Role.EMPLOYEE], employee: { status: "ACTIVE", joiningDate: new Date("2026-10-20T00:00:00Z") } });
    mockGetCandidateApplications.mockResolvedValue([]);

    const { container } = render(await CandidateApplicationsPage());
    expect(mockGetCandidateApplications).toHaveBeenCalledWith(user.id);
    expect(screen.getByRole("heading", { name: "My Journey" })).toBeTruthy();
    expect(screen.getByText(/You joined GARA Innovation on Oct 20, 2026; this is your application history\./)).toBeTruthy();
    expect(container.querySelector('a[href="/careers"]')).toBeNull();
  });

  it("keeps My Applications with the browse CTA for candidates", async () => {
    signIn([]);
    primeLifecycle({});
    mockGetCandidateApplications.mockResolvedValue([]);

    const { container } = render(await CandidateApplicationsPage());
    expect(screen.getByRole("heading", { name: "My Applications" })).toBeTruthy();
    expect(container.querySelector('a[href="/careers"]')).not.toBeNull();
  });

  it("shows a joined user's offer without accept or decline actions", async () => {
    const user = signIn([Role.EMPLOYEE]);
    primeLifecycle({ roles: [Role.EMPLOYEE], employee: { status: "ACTIVE" } });
    mockGetCandidateApplicationDetail.mockResolvedValue({
      ...application,
      formVersion: { versionNumber: 1, schemaDefinition: {} },
      submittedResponses: {},
      hasResume: false,
      resumeDownloadUrl: "/api/candidate/applications/app-9/resume",
      timeline: [],
    });
    mockGetOfferByApplicationId.mockResolvedValue({
      id: "offer-1",
      applicationId: "app-9",
      status: "EXTENDED",
      designation: "Engineer",
      department: "Eng",
      location: null,
      expectedJoiningDate: new Date("2026-11-01T00:00:00Z"),
      termsSummary: "Agreed terms",
      decisionAt: null,
    });

    render(await ApplicationDetailPage({ params: Promise.resolve({ id: "app-9" }) }));
    expect(mockGetCandidateApplicationDetail).toHaveBeenCalledWith("app-9", user.id);
    expect(screen.getByRole("heading", { name: "Employment offer" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /accept/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /decline/i })).toBeNull();
  });

  it("still lets candidates respond to an extended offer", async () => {
    signIn([]);
    primeLifecycle({});
    mockGetCandidateApplicationDetail.mockResolvedValue({
      ...application,
      formVersion: { versionNumber: 1, schemaDefinition: {} },
      submittedResponses: {},
      hasResume: false,
      resumeDownloadUrl: "/api/candidate/applications/app-9/resume",
      timeline: [],
    });
    mockGetOfferByApplicationId.mockResolvedValue({
      id: "offer-1",
      applicationId: "app-9",
      status: "EXTENDED",
      designation: "Engineer",
      department: "Eng",
      location: null,
      expectedJoiningDate: new Date("2026-11-01T00:00:00Z"),
      termsSummary: "Agreed terms",
      decisionAt: null,
    });

    render(await ApplicationDetailPage({ params: Promise.resolve({ id: "app-9" }) }));
    expect(screen.getByRole("button", { name: /accept job offer/i })).toBeTruthy();
  });
});

describe("CareerInterestPrompt", () => {
  it("saves the chosen interest and refreshes the dashboard", async () => {
    mockSaveCareerInterest.mockResolvedValue({ success: true });
    render(React.createElement(CareerInterestPrompt));

    fireEvent.click(screen.getByRole("button", { name: /save preference/i }));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(mockSaveCareerInterest).not.toHaveBeenCalled();

    fireEvent.click(screen.getByLabelText(/Internship/));
    fireEvent.click(screen.getByRole("button", { name: /save preference/i }));
    await waitFor(() => expect(mockRefresh).toHaveBeenCalled());
    expect(mockSaveCareerInterest).toHaveBeenCalledWith({ careerInterest: "INTERNSHIP" });
  });
});
