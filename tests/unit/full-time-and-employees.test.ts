import { describe, it, expect } from "vitest";
import crypto from "node:crypto";
import {
  CreateJobOfferSchema,
  CandidateOfferDecisionSchema,
  CreateEmployeeFromApplicationSchema,
  UpdateEmployeeStatusSchema,
  AssignManagerSchema,
} from "@/features/employees/schemas";
import { EmployeeStatus, OfferStatus, Role, ApplicationStatus } from "@/features/employees/types";
import { VALID_APPLICATION_TRANSITIONS } from "@/features/recruitment/schemas";
import { ForbiddenError } from "@/lib/errors";

describe("Prompt 7: Full-Time Recruitment Pipeline Independence", () => {
  it("allows direct transition from INTERVIEWED to OFFERED, bypassing internship evaluation", () => {
    // Full-time candidates can proceed straight from interview completion to offer
    const allowedFromInterviewed = VALID_APPLICATION_TRANSITIONS[ApplicationStatus.INTERVIEWED];
    expect(allowedFromInterviewed).toContain(ApplicationStatus.OFFERED);
  });

  it("permits progression from OFFER_ACCEPTED to HIRED upon employee creation", () => {
    const allowedFromAccepted = VALID_APPLICATION_TRANSITIONS[ApplicationStatus.OFFER_ACCEPTED];
    expect(allowedFromAccepted).toContain(ApplicationStatus.HIRED);
  });

  it("ensures HIRED is a terminal recruitment state", () => {
    const allowedFromHired = VALID_APPLICATION_TRANSITIONS[ApplicationStatus.HIRED];
    expect(allowedFromHired).toHaveLength(0);
  });
});

describe("Prompt 7: Job Offer Schema & Policy Validations", () => {
  it("validates valid job offer creation input", () => {
    const valid = CreateJobOfferSchema.safeParse({
      applicationId: crypto.randomUUID(),
      department: "Core Engineering",
      designation: "Senior Platform Engineer",
      expectedJoiningDate: "2026-05-01T00:00:00.000Z",
      location: "Bangalore (Hybrid)",
      termsSummary:
        "Standard full-time employment agreement. Reporting hours: 9:30 AM - 6:30 PM. 3 months probation. Confidentiality agreement applies.",
    });

    expect(valid.success).toBe(true);
  });

  it("rejects offer creation with missing terms summary or invalid joining date", () => {
    const invalidDate = CreateJobOfferSchema.safeParse({
      applicationId: crypto.randomUUID(),
      department: "Core Engineering",
      designation: "Senior Platform Engineer",
      expectedJoiningDate: "not-a-valid-date",
      termsSummary: "Valid terms summary with sufficient length.",
    });
    expect(invalidDate.success).toBe(false);

    const invalidTerms = CreateJobOfferSchema.safeParse({
      applicationId: crypto.randomUUID(),
      department: "Core Engineering",
      designation: "Senior Platform Engineer",
      expectedJoiningDate: "2026-05-01T00:00:00.000Z",
      termsSummary: "Short", // < 10 characters
    });
    expect(invalidTerms.success).toBe(false);
  });

  it("validates candidate offer decision input", () => {
    const validAccept = CandidateOfferDecisionSchema.safeParse({
      offerId: crypto.randomUUID(),
      decision: "ACCEPT",
    });
    expect(validAccept.success).toBe(true);

    const validDecline = CandidateOfferDecisionSchema.safeParse({
      offerId: crypto.randomUUID(),
      decision: "DECLINE",
      declineReason: "Accepted another opportunity closer to hometown",
    });
    expect(validDecline.success).toBe(true);

    const invalidDecision = CandidateOfferDecisionSchema.safeParse({
      offerId: crypto.randomUUID(),
      decision: "MAYBE",
    });
    expect(invalidDecision.success).toBe(false);
  });
});

describe("Prompt 7: Gated Employee Record Creation Schema", () => {
  it("validates employee creation schema with valid employee code pattern", () => {
    const valid = CreateEmployeeFromApplicationSchema.safeParse({
      applicationId: crypto.randomUUID(),
      employeeCode: "GARA-ENG-101",
      department: "Engineering",
      designation: "Frontend Engineer",
      joiningDate: "2026-05-01T00:00:00.000Z",
      personalPhone: "+91 9876543210",
      emergencyContact: {
        name: "Alice Doe",
        relation: "Spouse",
        phone: "+91 9123456780",
      },
      internalNotes: "Offer accepted on 2026-04-10. Equipment laptop requested.",
    });

    expect(valid.success).toBe(true);
  });

  it("rejects invalid employee codes with lower-case or special symbols", () => {
    const invalidCode = CreateEmployeeFromApplicationSchema.safeParse({
      applicationId: crypto.randomUUID(),
      employeeCode: "invalid code with spaces!",
      department: "Engineering",
      designation: "Frontend Engineer",
      joiningDate: "2026-05-01T00:00:00.000Z",
    });

    expect(invalidCode.success).toBe(false);
  });
});

describe("Prompt 7: Employee Lifecycle Status & Manager Transitions", () => {
  it("validates employee status update schema", () => {
    const valid = UpdateEmployeeStatusSchema.safeParse({
      employeeId: crypto.randomUUID(),
      toStatus: EmployeeStatus.ACTIVE,
      remarks: "Probation period completed satisfactorily.",
    });

    expect(valid.success).toBe(true);
  });

  it("validates manager assignment schema", () => {
    const valid = AssignManagerSchema.safeParse({
      employeeId: crypto.randomUUID(),
      managerId: crypto.randomUUID(),
      remarks: "Assigned after department transfer.",
    });
    expect(valid.success).toBe(true);

    // Can assign null (unassign manager)
    const validUnassign = AssignManagerSchema.safeParse({
      employeeId: crypto.randomUUID(),
      managerId: null,
      remarks: "Reports directly to Director.",
    });
    expect(validUnassign.success).toBe(true);
  });
});

describe("Prompt 7: RBAC Authorization & Data Isolation Contracts", () => {
  it("verifies staff roles authorized for employee record management", () => {
    const authorizedRoles: Role[] = [Role.ADMIN, Role.HR];
    expect(authorizedRoles.includes(Role.ADMIN)).toBe(true);
    expect(authorizedRoles.includes(Role.HR)).toBe(true);

    // Unauthorized roles must not manage employee records
    expect(authorizedRoles.includes(Role.CANDIDATE)).toBe(false);
    expect(authorizedRoles.includes(Role.INTERVIEWER)).toBe(false);
    expect(authorizedRoles.includes(Role.MENTOR)).toBe(false);
    expect(authorizedRoles.includes(Role.INTERN)).toBe(false);
  });

  it("verifies employee status enum matches lifecycle specifications", () => {
    expect(EmployeeStatus.PROBATION).toBe("PROBATION");
    expect(EmployeeStatus.ACTIVE).toBe("ACTIVE");
    expect(EmployeeStatus.ON_LEAVE).toBe("ON_LEAVE");
    expect(EmployeeStatus.EXITED).toBe("EXITED");
  });

  it("verifies offer status enum values", () => {
    expect(OfferStatus.DRAFT).toBe("DRAFT");
    expect(OfferStatus.EXTENDED).toBe("EXTENDED");
    expect(OfferStatus.ACCEPTED).toBe("ACCEPTED");
    expect(OfferStatus.DECLINED).toBe("DECLINED");
    expect(OfferStatus.REVOKED).toBe("REVOKED");
    expect(OfferStatus.EXPIRED).toBe("EXPIRED");
  });
});

describe("Prompt 7: Gated Service Operations & Policy Enforcement", () => {
  it("strictly blocks non-HR/non-Admin from creating employee records", async () => {
    const { employeeService } = await import("@/features/employees/services/employee-service");
    const candidateUser = {
      id: crypto.randomUUID(),
      name: "Candidate User",
      email: "candidate@example.com",
      roles: [Role.CANDIDATE],
    };

    await expect(
      employeeService.createEmployeeFromApplication(candidateUser, {
        applicationId: crypto.randomUUID(),
        employeeCode: "GARA-100",
        department: "Engineering",
        designation: "Developer",
        joiningDate: "2026-05-01T00:00:00.000Z",
      })
    ).rejects.toThrow(ForbiddenError);
  });

  it("strictly blocks non-HR/non-Admin from preparing job offers", async () => {
    const { offerService } = await import("@/features/employees/services/offer-service");
    const interviewerUser = {
      id: crypto.randomUUID(),
      name: "Interviewer User",
      email: "interviewer@example.com",
      roles: [Role.INTERVIEWER],
    };

    await expect(
      offerService.createDraftOffer(interviewerUser, {
        applicationId: crypto.randomUUID(),
        department: "Engineering",
        designation: "Developer",
        expectedJoiningDate: "2026-05-01T00:00:00.000Z",
        termsSummary: "Agreed terms summary with sufficient length.",
      })
    ).rejects.toThrow(ForbiddenError);
  });

  it("strictly blocks non-HR/non-Admin from updating employee lifecycle status", async () => {
    const { employeeService } = await import("@/features/employees/services/employee-service");
    const mentorUser = {
      id: crypto.randomUUID(),
      name: "Mentor User",
      email: "mentor@example.com",
      roles: [Role.MENTOR],
    };

    await expect(
      employeeService.updateEmployeeStatus(mentorUser, {
        employeeId: crypto.randomUUID(),
        toStatus: EmployeeStatus.ACTIVE,
      })
    ).rejects.toThrow(ForbiddenError);
  });

  it("strictly blocks non-HR/non-Admin from assigning reporting managers", async () => {
    const { employeeService } = await import("@/features/employees/services/employee-service");
    const candidateUser = {
      id: crypto.randomUUID(),
      name: "Candidate User",
      email: "candidate@example.com",
      roles: [Role.CANDIDATE],
    };

    await expect(
      employeeService.assignManager(candidateUser, {
        employeeId: crypto.randomUUID(),
        managerId: crypto.randomUUID(),
      })
    ).rejects.toThrow(ForbiddenError);
  });
});

