import { describe, it, expect } from "vitest";
import {
  WorkingDayService,
  DEFAULT_WORKING_CALENDAR,
} from "@/features/internship-evaluation/services/working-day-service";
import {
  EvaluationStatus,
  OnboardingStatus,
  Role,
} from "@prisma/client";

describe("Working Day Service & Calendar Boundaries (Prompt 5 / OD-002)", () => {
  const service = new WorkingDayService();

  it("calculates 7 working days starting on a Monday with standard Mon-Fri calendar", () => {
    // 2026-03-02 is a Monday (UTC)
    const monday = new Date(Date.UTC(2026, 2, 2, 0, 0, 0));

    // Day 1: Mon Mar 2
    // Day 2: Tue Mar 3
    // Day 3: Wed Mar 4
    // Day 4: Thu Mar 5
    // Day 5: Fri Mar 6
    // [Sat Mar 7 & Sun Mar 8 skipped]
    // Day 6: Mon Mar 9
    // Day 7: Tue Mar 10
    const endDate = service.addWorkingDays(monday, 7, DEFAULT_WORKING_CALENDAR);

    expect(endDate.getUTCFullYear()).toBe(2026);
    expect(endDate.getUTCMonth()).toBe(2); // March
    expect(endDate.getUTCDate()).toBe(10); // Tuesday, March 10
  });

  it("strictly honors explicit holidays and advances end date accordingly", () => {
    const monday = new Date(Date.UTC(2026, 2, 2, 0, 0, 0));

    // Custom calendar with March 3 and March 4 configured as national/company holidays
    const calendarWithHolidays = {
      workingDaysOfWeek: [1, 2, 3, 4, 5],
      holidays: ["2026-03-03", "2026-03-04"],
    };

    // Day 1: Mon Mar 2
    // [Tue Mar 3 - Holiday]
    // [Wed Mar 4 - Holiday]
    // Day 2: Thu Mar 5
    // Day 3: Fri Mar 6
    // [Sat Mar 7 & Sun Mar 8 - Weekend]
    // Day 4: Mon Mar 9
    // Day 5: Tue Mar 10
    // Day 6: Wed Mar 11
    // Day 7: Thu Mar 12
    const endDate = service.addWorkingDays(monday, 7, calendarWithHolidays);

    expect(endDate.getUTCDate()).toBe(12); // Thursday, March 12
  });

  it("accurately counts working days between dates excluding weekends and holidays", () => {
    const startDate = new Date(Date.UTC(2026, 2, 2, 0, 0, 0)); // Mon Mar 2
    const endDate = new Date(Date.UTC(2026, 2, 13, 0, 0, 0)); // Fri Mar 13

    // 2 full weeks Mon-Fri = 10 working days
    const count = service.countWorkingDays(startDate, endDate, DEFAULT_WORKING_CALENDAR);
    expect(count).toBe(10);

    // With one holiday
    const withHoliday = {
      workingDaysOfWeek: [1, 2, 3, 4, 5],
      holidays: ["2026-03-05"],
    };
    const countWithHoliday = service.countWorkingDays(startDate, endDate, withHoliday);
    expect(countWithHoliday).toBe(9);
  });
});

describe("Intern ID Card Policy Gating (Prompt 5 / OD-014)", () => {
  // Pure logic policy checker mirroring EvaluationService.approveAndIssueIdCard assertions
  function validateIdCardIssuancePolicy(params: {
    userRoles: Role[];
    evaluationStatus: EvaluationStatus;
    onboardingStatus?: OnboardingStatus;
  }): { allowed: boolean; reason?: string } {
    const isAuthorizedRole = params.userRoles.includes(Role.ADMIN) || params.userRoles.includes(Role.HR);
    if (!isAuthorizedRole) {
      return { allowed: false, reason: "Unauthorized: Requires ADMIN or HR authorization" };
    }

    if (params.evaluationStatus !== EvaluationStatus.PASSED) {
      return {
        allowed: false,
        reason: `Policy Gate: Evaluation status is ${params.evaluationStatus}. Must be officially approved as PASSED.`,
      };
    }

    if (params.onboardingStatus !== OnboardingStatus.COMPLETED) {
      return {
        allowed: false,
        reason: "Policy Gate: All required onboarding checklist items must be verified and completed.",
      };
    }

    return { allowed: true };
  }

  it("strictly rejects ID card issuance merely because 7 days elapsed without passing evaluation", () => {
    // Evaluation is IN_PROGRESS (e.g. 7 days elapsed on the calendar, but supervisor has not approved pass)
    const check1 = validateIdCardIssuancePolicy({
      userRoles: [Role.HR],
      evaluationStatus: EvaluationStatus.IN_PROGRESS,
      onboardingStatus: OnboardingStatus.IN_PROGRESS,
    });

    expect(check1.allowed).toBe(false);
    expect(check1.reason).toContain("Evaluation status is IN_PROGRESS");

    // Evaluation is FAILED
    const check2 = validateIdCardIssuancePolicy({
      userRoles: [Role.ADMIN],
      evaluationStatus: EvaluationStatus.FAILED,
      onboardingStatus: OnboardingStatus.COMPLETED,
    });

    expect(check2.allowed).toBe(false);
    expect(check2.reason).toContain("Must be officially approved as PASSED");
  });

  it("strictly rejects ID card issuance if onboarding checklist is incomplete", () => {
    const check = validateIdCardIssuancePolicy({
      userRoles: [Role.HR],
      evaluationStatus: EvaluationStatus.PASSED,
      onboardingStatus: OnboardingStatus.IN_PROGRESS, // Incomplete onboarding
    });

    expect(check.allowed).toBe(false);
    expect(check.reason).toContain("All required onboarding checklist items must be verified");
  });

  it("strictly rejects ID card approval by unprivileged roles (Candidate or Mentor)", () => {
    const checkMentor = validateIdCardIssuancePolicy({
      userRoles: [Role.MENTOR],
      evaluationStatus: EvaluationStatus.PASSED,
      onboardingStatus: OnboardingStatus.COMPLETED,
    });

    expect(checkMentor.allowed).toBe(false);
    expect(checkMentor.reason).toContain("Requires ADMIN or HR authorization");
  });

  it("approves ID card issuance only when evaluation is PASSED and onboarding is COMPLETED by authorized HR/Admin", () => {
    const checkSuccess = validateIdCardIssuancePolicy({
      userRoles: [Role.HR],
      evaluationStatus: EvaluationStatus.PASSED,
      onboardingStatus: OnboardingStatus.COMPLETED,
    });

    expect(checkSuccess.allowed).toBe(true);
    expect(checkSuccess.reason).toBeUndefined();
  });
});
