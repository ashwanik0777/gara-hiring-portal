import { describe, it, expect, vi, beforeEach } from "vitest";
import crypto from "node:crypto";

const { db, state } = vi.hoisted(() => {
  const state = {
    session: null as null | { user: { id: string; email: string; name: string } },
    users: {} as Record<string, { roles: string[] }>,
  };
  const db = {
    user: { findUnique: vi.fn() },
    subAdminPermission: { findUnique: vi.fn() },
    application: { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    applicationStatusHistory: { create: vi.fn(), findFirst: vi.fn() },
    jobOffer: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn(), delete: vi.fn() },
    employee: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      groupBy: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    employmentHistory: { create: vi.fn(), findMany: vi.fn() },
    employmentPeriod: { create: vi.fn(), updateMany: vi.fn(), findMany: vi.fn() },
    conversionReview: { updateMany: vi.fn(), findMany: vi.fn() },
    scheduledJob: { updateMany: vi.fn() },
    employeeExitRecord: { create: vi.fn(), findMany: vi.fn() },
    employeeDocument: { create: vi.fn(), findMany: vi.fn() },
    userRole: { upsert: vi.fn(), deleteMany: vi.fn() },
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
  CreateJobOfferSchema,
  CandidateOfferDecisionSchema,
  CreateEmployeeFromApplicationSchema,
  DirectCreateEmployeeSchema,
  UpdateEmployeeStatusSchema,
  AssignManagerSchema,
} from "@/features/employees/schemas";
import { EmployeeStatus, OfferStatus, Role, ApplicationStatus } from "@/features/employees/types";
import { VALID_APPLICATION_TRANSITIONS } from "@/features/recruitment/schemas";
import { employeeService, EMPLOYEE_STATUS_TRANSITIONS } from "@/features/employees/services/employee-service";
import {
  offerService,
  REVOKE_FALLBACK_APPLICATION_STATUS,
} from "@/features/employees/services/offer-service";
import { offerLetterHash } from "@/features/employees/services/offer-letter";
import { OWN_APPLICATION_ACTION_MESSAGE } from "@/features/recruitment/services/application-access";
import {
  extendJobOfferAction,
  revokeJobOfferAction,
  createJobOfferAction,
  searchReportingManagersAction,
} from "@/features/employees/actions";
import { createElement, useState } from "react";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";
import {
  ReportingManagerCombobox,
  type ReportingManagerChoice,
} from "@/features/employees/components/reporting-manager-combobox";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  PolicyBlockedError,
  ValidationError,
} from "@/lib/errors";
import type { AuthenticatedUser } from "@/lib/auth/guards";

const HR_ID = "11111111-1111-4111-8111-111111111111";
const ADMIN_ID = "22222222-2222-4222-8222-222222222222";
const CANDIDATE_ID = "33333333-3333-4333-8333-333333333333";
const INTERVIEWER_ID = "44444444-4444-4444-8444-444444444444";
const APP_ID = "55555555-5555-4555-8555-555555555555";
const OFFER_ID = "66666666-6666-4666-8666-666666666666";
const EMP_ID = "77777777-7777-4777-8777-777777777777";
const MANAGER_ID = "88888888-8888-4888-8888-888888888888";

const hrUser: AuthenticatedUser = { id: HR_ID, name: "HR", email: "hr@gara.test", roles: [Role.HR] };
const adminUser: AuthenticatedUser = { id: ADMIN_ID, name: "Admin", email: "admin@gara.test", roles: [Role.ADMIN] };
const candidateUser: AuthenticatedUser = {
  id: CANDIDATE_ID,
  name: "Candidate",
  email: "cand@gara.test",
  roles: [Role.CANDIDATE],
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
  db.subAdminPermission.findUnique.mockResolvedValue({ id: "perm", userId: HR_ID, ...allPermissions, [key]: false });
}

function signInAs(userId: string, roles: Role[]) {
  state.session = { user: { id: userId, email: `${userId}@gara.test`, name: "Tester" } };
  state.users[userId] = { roles };
}

function offerRecord(status: OfferStatus, applicationStatus: ApplicationStatus, extra: Record<string, unknown> = {}) {
  return {
    id: OFFER_ID,
    applicationId: APP_ID,
    status,
    expectedJoiningDate: new Date("2026-12-01T00:00:00.000Z"),
    department: "Engineering",
    designation: "Engineer",
    location: null,
    termsSummary: "Terms agreed with the candidate.",
    extendedBy: { id: HR_ID, name: "HR", email: "hr@gara.test" },
    extendedAt: null,
    decisionAt: null,
    declineReason: status === OfferStatus.REVOKED ? "Budget freeze (internal)" : null,
    notes: "Confidential staff notes",
    createdAt: new Date("2026-10-01T00:00:00.000Z"),
    application: {
      id: APP_ID,
      referenceCode: "APP-1",
      status: applicationStatus,
      isArchived: false,
      candidate: {
        id: "cand-profile",
        userId: CANDIDATE_ID,
        user: { id: CANDIDATE_ID, name: "Candidate", email: "cand@gara.test" },
      },
      opening: { title: "Engineer" },
    },
    ...extra,
  };
}

/** Electronic acceptance input for the default offer record (signature checks pass). */
function acceptInput(letterHash = "0".repeat(64)) {
  return {
    offerId: OFFER_ID,
    decision: "ACCEPT" as const,
    signedName: "Candidate",
    consent: true as const,
    letterHash,
  };
}

const signatureRequest = { ipHash: "f".repeat(64), userAgent: "Vitest" };

/** A joining date safely in the past ("Mark as joined" rejects future dates). */
const PAST_JOINING_DATE = "2025-01-06T00:00:00.000Z";

const hireInput = {
  applicationId: APP_ID,
  employeeCode: "ENG-101",
  department: "Engineering",
  designation: "Engineer",
  joiningDate: PAST_JOINING_DATE,
  initialStatus: EmployeeStatus.PROBATION,
};

beforeEach(() => {
  vi.resetAllMocks();
  state.session = null;
  state.users = {};
  db.$transaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => cb(db));
  db.user.findUnique.mockImplementation(async (args: { where: { id: string } }) => {
    const entry = state.users[args.where.id];
    return entry ? { id: args.where.id, mustChangePassword: false, roles: entry.roles.map((role) => ({ role })) } : null;
  });
  db.application.updateMany.mockResolvedValue({ count: 1 });
  db.jobOffer.updateMany.mockResolvedValue({ count: 1 });
  db.employee.updateMany.mockResolvedValue({ count: 1 });
  db.employmentPeriod.create.mockResolvedValue({ id: "period-new" });
  db.employmentPeriod.updateMany.mockResolvedValue({ count: 1 });
  db.conversionReview.updateMany.mockResolvedValue({ count: 0 });
  db.conversionReview.findMany.mockResolvedValue([]);
  db.scheduledJob.updateMany.mockResolvedValue({ count: 0 });
  db.userRole.deleteMany.mockResolvedValue({ count: 0 });
});

describe("Prompt 7: Full-Time Recruitment Pipeline Independence", () => {
  it("allows direct transition from INTERVIEWED to OFFERED, bypassing internship evaluation", () => {
    expect(VALID_APPLICATION_TRANSITIONS[ApplicationStatus.INTERVIEWED]).toContain(ApplicationStatus.OFFERED);
  });

  it("permits progression from OFFER_ACCEPTED to HIRED upon employee creation", () => {
    expect(VALID_APPLICATION_TRANSITIONS[ApplicationStatus.OFFER_ACCEPTED]).toContain(ApplicationStatus.HIRED);
  });

  it("ensures HIRED is a terminal recruitment state", () => {
    expect(VALID_APPLICATION_TRANSITIONS[ApplicationStatus.HIRED]).toHaveLength(0);
  });
});

describe("Prompt 7: Job Offer Schema & Policy Validations", () => {
  it("validates valid job offer creation input", () => {
    const valid = CreateJobOfferSchema.safeParse({
      applicationId: crypto.randomUUID(),
      department: "Core Engineering",
      designation: "Senior Platform Engineer",
      expectedJoiningDate: "2026-05-01T00:00:00.000Z",
      termsSummary: "Terms summary as agreed with the candidate.",
    });
    expect(valid.success).toBe(true);
  });

  it("rejects offer creation with missing terms summary or invalid joining date", () => {
    expect(
      CreateJobOfferSchema.safeParse({
        applicationId: crypto.randomUUID(),
        department: "Core Engineering",
        designation: "Senior Platform Engineer",
        expectedJoiningDate: "not-a-valid-date",
        termsSummary: "Valid terms summary with sufficient length.",
      }).success
    ).toBe(false);
    expect(
      CreateJobOfferSchema.safeParse({
        applicationId: crypto.randomUUID(),
        department: "Core Engineering",
        designation: "Senior Platform Engineer",
        expectedJoiningDate: "2026-05-01T00:00:00.000Z",
        termsSummary: "Short",
      }).success
    ).toBe(false);
  });

  it("validates candidate offer decision input", () => {
    // Accepting is an electronic signature: name, consent and the reviewed letter hash are required.
    expect(CandidateOfferDecisionSchema.safeParse({ offerId: crypto.randomUUID(), decision: "ACCEPT" }).success).toBe(false);
    expect(
      CandidateOfferDecisionSchema.safeParse({
        offerId: crypto.randomUUID(),
        decision: "ACCEPT",
        signedName: "Candidate",
        consent: true,
        letterHash: "a".repeat(64),
      }).success
    ).toBe(true);
    expect(
      CandidateOfferDecisionSchema.safeParse({ offerId: crypto.randomUUID(), decision: "DECLINE", declineReason: "Other offer" })
        .success
    ).toBe(true);
    expect(CandidateOfferDecisionSchema.safeParse({ offerId: crypto.randomUUID(), decision: "MAYBE" }).success).toBe(false);
  });
});

describe("Prompt 7: Gated Employee Record Creation Schema", () => {
  it("validates employee creation schema with valid employee code pattern", () => {
    const valid = CreateEmployeeFromApplicationSchema.safeParse({
      ...hireInput,
      employeeCode: "GARA-ENG-101",
      personalPhone: "+91 9876543210",
      emergencyContact: { name: "Alice Doe", relation: "Spouse", phone: "+91 9123456780" },
    });
    expect(valid.success).toBe(true);
  });

  it("rejects invalid employee codes with lower-case or special symbols", () => {
    expect(
      CreateEmployeeFromApplicationSchema.safeParse({ ...hireInput, employeeCode: "invalid code with spaces!" }).success
    ).toBe(false);
  });

  it("requires a justification for direct employee creation and never allows EXITED", () => {
    const base = { ...hireInput, userId: crypto.randomUUID() };
    expect(DirectCreateEmployeeSchema.safeParse(base).success).toBe(false);
    expect(DirectCreateEmployeeSchema.safeParse({ ...base, justification: "Transfer from partner firm (ref. HR-42)" }).success).toBe(true);
    expect(
      DirectCreateEmployeeSchema.safeParse({
        ...base,
        justification: "Transfer from partner firm (ref. HR-42)",
        status: EmployeeStatus.EXITED,
      }).success
    ).toBe(false);
  });
});

describe("Prompt 7: Employee Lifecycle Status & Manager Transitions", () => {
  it("validates employee status update schema", () => {
    expect(
      UpdateEmployeeStatusSchema.safeParse({ employeeId: crypto.randomUUID(), toStatus: EmployeeStatus.ACTIVE }).success
    ).toBe(true);
  });

  it("validates manager assignment schema", () => {
    expect(AssignManagerSchema.safeParse({ employeeId: crypto.randomUUID(), managerId: crypto.randomUUID() }).success).toBe(true);
    expect(AssignManagerSchema.safeParse({ employeeId: crypto.randomUUID(), managerId: null }).success).toBe(true);
  });

  it("keeps EXITED out of the generic status transition map and terminal", () => {
    for (const targets of Object.values(EMPLOYEE_STATUS_TRANSITIONS)) {
      expect(targets).not.toContain(EmployeeStatus.EXITED);
    }
    expect(EMPLOYEE_STATUS_TRANSITIONS[EmployeeStatus.EXITED]).toHaveLength(0);
  });
});

describe("Hiring requires candidate consent (SEC-12)", () => {
  it("blocks non-HR/non-Admin from creating employee records", async () => {
    await expect(employeeService.createEmployeeFromApplication(candidateUser, hireInput)).rejects.toBeInstanceOf(
      ForbiddenError
    );
  });

  it("requires the canEmployees permission for HR", async () => {
    denyPermission("canEmployees");
    await expect(employeeService.createEmployeeFromApplication(hrUser, hireInput)).rejects.toBeInstanceOf(
      ForbiddenError
    );
  });

  it.each([null, { id: OFFER_ID, status: OfferStatus.EXTENDED }, { id: OFFER_ID, status: OfferStatus.REVOKED }])(
    "rejects hiring without an ACCEPTED offer (offer: %o)",
    async (jobOffer) => {
      db.application.findUnique.mockResolvedValue({
        id: APP_ID,
        referenceCode: "APP-1",
        status: ApplicationStatus.OFFER_ACCEPTED,
        candidate: { user: { id: CANDIDATE_ID, name: "Candidate", email: "cand@gara.test", employeeProfile: null } },
        jobOffer,
      });
      await expect(employeeService.createEmployeeFromApplication(hrUser, hireInput)).rejects.toBeInstanceOf(
        ValidationError
      );
      expect(db.employee.create).not.toHaveBeenCalled();
    }
  );

  it("fails atomically when the application stage changed concurrently", async () => {
    db.application.findUnique.mockResolvedValue({
      id: APP_ID,
      referenceCode: "APP-1",
      status: ApplicationStatus.OFFER_ACCEPTED,
      candidate: { user: { id: CANDIDATE_ID, name: "Candidate", email: "cand@gara.test", employeeProfile: null } },
      jobOffer: { id: OFFER_ID, status: OfferStatus.ACCEPTED },
    });
    db.employee.findUnique.mockResolvedValue(null);
    db.application.updateMany.mockResolvedValue({ count: 0 });

    await expect(employeeService.createEmployeeFromApplication(hrUser, hireInput)).rejects.toBeInstanceOf(
      ConflictError
    );
    expect(db.employee.create).not.toHaveBeenCalled();
  });
});

describe("Full-time \"Mark as joined\" (lifecycle 2026-10-25)", () => {
  function acceptedApplication() {
    return {
      id: APP_ID,
      referenceCode: "APP-1",
      status: ApplicationStatus.OFFER_ACCEPTED,
      candidate: { user: { id: CANDIDATE_ID, name: "Candidate", email: "cand@gara.test", employeeProfile: null } },
      jobOffer: { id: OFFER_ID, status: OfferStatus.ACCEPTED },
    };
  }

  function mockCreatedEmployee() {
    db.employee.findUnique.mockImplementation(async (args: { where: { id?: string; employeeCode?: string } }) => {
      if (args.where.employeeCode) return null;
      // getEmployeeDetail after creation (HR may read confidential details).
      return {
        id: EMP_ID,
        employeeCode: "ENG-101",
        department: "Engineering",
        designation: "Engineer",
        joiningDate: new Date(PAST_JOINING_DATE),
        status: EmployeeStatus.ACTIVE,
        employmentType: "FULL_TIME",
        personalPhone: null,
        emergencyContact: null,
        internalNotes: null,
        onboardingChecklist: [],
        user: { id: CANDIDATE_ID, name: "Candidate", email: "cand@gara.test", image: null },
        manager: null,
        directReports: [],
        application: { id: APP_ID, referenceCode: "APP-1", opening: { title: "Engineer" } },
        employmentHistories: [],
        secureDocuments: [],
        exitRecords: [],
        employmentPeriods: [],
      };
    });
    db.employee.create.mockImplementation(async (args: { data: Record<string, unknown> }) => ({
      id: EMP_ID,
      ...args.data,
    }));
  }

  it("rejects a joining date in the future before touching the database", async () => {
    const future = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    await expect(
      employeeService.createEmployeeFromApplication(hrUser, { ...hireInput, joiningDate: future })
    ).rejects.toThrow(/cannot be in the future/);
    expect(db.application.findUnique).not.toHaveBeenCalled();
    expect(db.employee.create).not.toHaveBeenCalled();
  });

  it("requires an explicit initial status in the schema (no probation default)", () => {
    const { initialStatus: _omitted, ...withoutStatus } = hireInput;
    void _omitted;
    expect(CreateEmployeeFromApplicationSchema.safeParse(withoutStatus).success).toBe(false);
    expect(
      CreateEmployeeFromApplicationSchema.safeParse({ ...hireInput, initialStatus: EmployeeStatus.ON_LEAVE }).success
    ).toBe(false);
    expect(
      CreateEmployeeFromApplicationSchema.safeParse({ ...hireInput, initialStatus: EmployeeStatus.ACTIVE }).success
    ).toBe(true);
  });

  it("records FULL_TIME employment, the chosen status, a fresh EMPLOYEE role and the EMPLOYEE_JOINED email", async () => {
    db.application.findUnique.mockResolvedValue(acceptedApplication());
    mockCreatedEmployee();

    const before = Date.now();
    await employeeService.createEmployeeFromApplication(hrUser, {
      ...hireInput,
      initialStatus: EmployeeStatus.ACTIVE,
    });

    const created = db.employee.create.mock.calls[0][0].data;
    expect(created.employmentType).toBe("FULL_TIME");
    expect(created.status).toBe(EmployeeStatus.ACTIVE);
    expect(db.application.updateMany).toHaveBeenCalledWith({
      where: { id: APP_ID, status: ApplicationStatus.OFFER_ACCEPTED },
      data: { status: ApplicationStatus.HIRED },
    });

    const role = db.userRole.upsert.mock.calls[0][0];
    expect(role.where).toEqual({ userId_role: { userId: CANDIDATE_ID, role: Role.EMPLOYEE } });
    expect(role.update.assignedAt).toBeInstanceOf(Date);
    expect(role.update.assignedAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(role.create.assignedAt).toBe(role.update.assignedAt);

    const email = db.notificationOutbox.create.mock.calls[0][0].data;
    expect(email.templateName).toBe("EMPLOYEE_JOINED");
    expect(email.recipientEmail).toBe("cand@gara.test");
    expect(db.auditLog.create.mock.calls[0][0].data.action).toBe("MARK_EMPLOYEE_JOINED");
  });

  it("rejects a candidate who already has an active employee record", async () => {
    db.application.findUnique.mockResolvedValue({
      ...acceptedApplication(),
      candidate: {
        user: {
          id: CANDIDATE_ID,
          name: "Candidate",
          email: "cand@gara.test",
          employeeProfile: { employeeCode: "INT-7", status: EmployeeStatus.ACTIVE },
        },
      },
    });
    await expect(employeeService.createEmployeeFromApplication(hrUser, hireInput)).rejects.toBeInstanceOf(
      ConflictError
    );
    expect(db.application.updateMany).not.toHaveBeenCalled();
    expect(db.employee.create).not.toHaveBeenCalled();
  });
});

describe("Offer lifecycle (SEC-12, BUG-11, POL-09)", () => {
  it("blocks non-HR/non-Admin from preparing job offers", async () => {
    await expect(
      offerService.createDraftOffer(interviewerUser, {
        applicationId: APP_ID,
        department: "Engineering",
        designation: "Developer",
        expectedJoiningDate: "2026-05-01T00:00:00.000Z",
        termsSummary: "Agreed terms summary with sufficient length.",
      })
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("never deletes offer history when an offer already exists", async () => {
    db.application.findUnique.mockResolvedValue({
      id: APP_ID,
      status: ApplicationStatus.INTERVIEWED,
      isArchived: false,
      jobOffer: { status: OfferStatus.DECLINED },
      candidate: { userId: CANDIDATE_ID },
    });
    await expect(
      offerService.createDraftOffer(hrUser, {
        applicationId: APP_ID,
        department: "Engineering",
        designation: "Developer",
        expectedJoiningDate: "2026-05-01T00:00:00.000Z",
        termsSummary: "Agreed terms summary with sufficient length.",
      })
    ).rejects.toBeInstanceOf(ConflictError);
    expect(db.jobOffer.delete).not.toHaveBeenCalled();
    expect(db.jobOffer.create).not.toHaveBeenCalled();
  });

  it("only prepares offers for stages that may move to OFFERED", async () => {
    db.application.findUnique.mockResolvedValue({
      id: APP_ID,
      status: ApplicationStatus.REJECTED,
      isArchived: false,
      jobOffer: null,
      candidate: { userId: CANDIDATE_ID },
    });
    await expect(
      offerService.createDraftOffer(hrUser, {
        applicationId: APP_ID,
        department: "Engineering",
        designation: "Developer",
        expectedJoiningDate: "2026-05-01T00:00:00.000Z",
        termsSummary: "Agreed terms summary with sufficient length.",
      })
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("validates the application stage before extending an offer", async () => {
    db.jobOffer.findUnique.mockResolvedValue(offerRecord(OfferStatus.DRAFT, ApplicationStatus.REJECTED));
    await expect(offerService.extendOffer(hrUser, OFFER_ID)).rejects.toBeInstanceOf(ValidationError);
    expect(db.jobOffer.updateMany).not.toHaveBeenCalled();
  });

  it("extends an offer with conditional writes on offer and application", async () => {
    db.jobOffer.findUnique.mockResolvedValue(offerRecord(OfferStatus.DRAFT, ApplicationStatus.INTERVIEWED));
    await expect(offerService.extendOffer(hrUser, OFFER_ID)).resolves.toEqual({ applicationId: APP_ID });
    expect(db.jobOffer.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: OFFER_ID, status: OfferStatus.DRAFT } })
    );
    expect(db.application.updateMany).toHaveBeenCalledWith({
      where: { id: APP_ID, status: ApplicationStatus.INTERVIEWED },
      data: { status: ApplicationStatus.OFFERED },
    });
  });

  it("only lets the owning candidate respond", async () => {
    db.jobOffer.findUnique.mockResolvedValue(offerRecord(OfferStatus.EXTENDED, ApplicationStatus.OFFERED));
    await expect(
      offerService.acceptOfferElectronically(interviewerUser, acceptInput(), signatureRequest)
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("refuses a decision when the application is no longer OFFERED", async () => {
    db.jobOffer.findUnique.mockResolvedValue(offerRecord(OfferStatus.EXTENDED, ApplicationStatus.REJECTED));
    await expect(
      offerService.acceptOfferElectronically(candidateUser, acceptInput(), signatureRequest)
    ).rejects.toBeInstanceOf(ValidationError);
    expect(db.jobOffer.updateMany).not.toHaveBeenCalled();
  });

  it("loses the race cleanly when the offer was revoked concurrently", async () => {
    const record = offerRecord(OfferStatus.EXTENDED, ApplicationStatus.OFFERED);
    db.jobOffer.findUnique.mockResolvedValue(record);
    db.jobOffer.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      offerService.acceptOfferElectronically(candidateUser, acceptInput(offerLetterHash({ ...record, signedName: null, signedAt: null, signedDocumentHash: null })), signatureRequest)
    ).rejects.toBeInstanceOf(ConflictError);
    expect(db.jobOffer.updateMany).toHaveBeenCalledTimes(1);
    expect(db.application.updateMany).not.toHaveBeenCalled();
  });

  it("records a decline on the offer without withdrawing the application", async () => {
    db.jobOffer.findUnique.mockResolvedValue(offerRecord(OfferStatus.EXTENDED, ApplicationStatus.OFFERED));
    await offerService.declineOffer(candidateUser, {
      offerId: OFFER_ID,
      decision: "DECLINE",
      declineReason: "Accepted another offer",
    });

    expect(db.jobOffer.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: OfferStatus.DECLINED, declineReason: "Accepted another offer" }),
      })
    );
    for (const call of db.application.updateMany.mock.calls) {
      expect(call[0].data).not.toHaveProperty("status");
    }
    expect(db.applicationStatusHistory.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ fromStatus: ApplicationStatus.OFFERED, toStatus: ApplicationStatus.OFFERED }),
      })
    );
  });

  it("cannot revoke an accepted offer", async () => {
    db.jobOffer.findUnique.mockResolvedValue(offerRecord(OfferStatus.ACCEPTED, ApplicationStatus.OFFER_ACCEPTED));
    await expect(offerService.revokeOffer(hrUser, { offerId: OFFER_ID, reason: "x" })).rejects.toBeInstanceOf(
      ValidationError
    );
  });

  it("returns the application to its pre-offer stage when an extended offer is revoked", async () => {
    db.jobOffer.findUnique.mockResolvedValue(offerRecord(OfferStatus.EXTENDED, ApplicationStatus.OFFERED));
    db.applicationStatusHistory.findFirst.mockResolvedValue({ fromStatus: ApplicationStatus.INTERVIEWED });

    await offerService.revokeOffer(hrUser, { offerId: OFFER_ID, reason: "Role closed" });

    expect(db.jobOffer.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: OFFER_ID, status: OfferStatus.EXTENDED } })
    );
    expect(db.application.updateMany).toHaveBeenCalledWith({
      where: { id: APP_ID, status: ApplicationStatus.OFFERED },
      data: { status: ApplicationStatus.INTERVIEWED },
    });
  });
});

describe("Offer visibility (BUG-13, BUG-21)", () => {
  it("returns null instead of throwing for interviewers", async () => {
    db.jobOffer.findUnique.mockResolvedValue(offerRecord(OfferStatus.EXTENDED, ApplicationStatus.OFFERED));
    await expect(offerService.getOfferByApplicationId(interviewerUser, APP_ID)).resolves.toBeNull();
  });

  it("returns null for HR without the employees permission", async () => {
    denyPermission("canEmployees");
    db.jobOffer.findUnique.mockResolvedValue(offerRecord(OfferStatus.EXTENDED, ApplicationStatus.OFFERED));
    await expect(offerService.getOfferByApplicationId(hrUser, APP_ID)).resolves.toBeNull();
  });

  it.each([OfferStatus.DRAFT, OfferStatus.REVOKED, OfferStatus.EXPIRED])(
    "hides %s offers from the candidate",
    async (status) => {
      db.jobOffer.findUnique.mockResolvedValue(offerRecord(status, ApplicationStatus.INTERVIEWED));
      await expect(offerService.getOfferByApplicationId(candidateUser, APP_ID)).resolves.toBeNull();
      await expect(offerService.getOfferDetail(candidateUser, OFFER_ID)).rejects.toBeInstanceOf(ForbiddenError);
    }
  );

  it("never exposes staff notes or staff contact details to the candidate", async () => {
    db.jobOffer.findUnique.mockResolvedValue(offerRecord(OfferStatus.EXTENDED, ApplicationStatus.OFFERED));
    const offer = await offerService.getOfferByApplicationId(candidateUser, APP_ID);
    expect(offer).not.toBeNull();
    expect(offer?.notes).toBeNull();
    expect(offer?.extendedBy).toBeNull();
    expect(offer?.declineReason).toBeNull();
  });

  it("shows HR the internal revoke reason and notes", async () => {
    db.jobOffer.findUnique.mockResolvedValue(offerRecord(OfferStatus.REVOKED, ApplicationStatus.INTERVIEWED));
    const offer = await offerService.getOfferByApplicationId(hrUser, APP_ID);
    expect(offer?.declineReason).toBe("Budget freeze (internal)");
    expect(offer?.notes).toBe("Confidential staff notes");
  });
});

describe("Employee records authorization and lifecycle (SEC-05, SEC-30, BUG-09, POL-06)", () => {
  it.each([interviewerUser, { ...candidateUser, roles: [Role.EMPLOYEE] }])(
    "requires canEmployees for the employee directory",
    async (user) => {
      await expect(employeeService.getEmployeeDirectory(user)).rejects.toBeInstanceOf(ForbiddenError);
      expect(db.employee.findMany).not.toHaveBeenCalled();
    }
  );

  it("allows ADMIN to read the directory without confidential fields", async () => {
    db.employee.findMany.mockResolvedValue([]);
    db.employee.count.mockResolvedValue(0);
    db.employee.groupBy.mockResolvedValue([]);
    await employeeService.getEmployeeDirectory(adminUser);
    const args = db.employee.findMany.mock.calls[0][0];
    expect(args).not.toHaveProperty("include");
    expect(args.select).not.toHaveProperty("personalPhone");
    expect(args.select).not.toHaveProperty("emergencyContact");
    expect(args.select).not.toHaveProperty("internalNotes");
  });

  it("blocks non-HR/non-Admin from updating employee lifecycle status", async () => {
    await expect(
      employeeService.updateEmployeeStatus(
        { ...interviewerUser, roles: [Role.MENTOR] },
        { employeeId: EMP_ID, toStatus: EmployeeStatus.ACTIVE }
      )
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("prevents staff from changing their own employment record", async () => {
    db.employee.findUnique.mockResolvedValue({
      id: EMP_ID,
      userId: HR_ID,
      status: EmployeeStatus.PROBATION,
      employeeCode: "EMP-1",
      managerId: null,
      manager: null,
      exitRecord: null,
      onboardingChecklist: [],
      updatedAt: new Date(),
    });
    await expect(
      employeeService.updateEmployeeStatus(hrUser, { employeeId: EMP_ID, toStatus: EmployeeStatus.ACTIVE })
    ).rejects.toThrow("You cannot change your own employment record.");
    await expect(
      employeeService.processEmployeeExit(hrUser, {
        employeeId: EMP_ID,
        lastWorkingDate: "2026-12-31T00:00:00.000Z",
      })
    ).rejects.toThrow("You cannot change your own employment record.");
    expect(db.employee.updateMany).not.toHaveBeenCalled();
    expect(db.employeeExitRecord.create).not.toHaveBeenCalled();
  });

  it("only allows EXITED through the exit flow", async () => {
    await expect(
      employeeService.updateEmployeeStatus(hrUser, { employeeId: EMP_ID, toStatus: EmployeeStatus.EXITED })
    ).rejects.toBeInstanceOf(ValidationError);
    expect(db.employee.updateMany).not.toHaveBeenCalled();
  });

  it("does not mark exit clearance automatically", async () => {
    db.employee.findUnique.mockResolvedValue({
      id: EMP_ID,
      status: EmployeeStatus.ACTIVE,
      joiningDate: new Date("2025-01-06T00:00:00.000Z"),
      employmentPeriods: [{ id: "period-1", startDate: new Date("2025-01-06T00:00:00.000Z"), exitRecord: null }],
    });
    await employeeService.processEmployeeExit(hrUser, {
      employeeId: EMP_ID,
      lastWorkingDate: "2026-12-31T00:00:00.000Z",
    });
    const data = db.employeeExitRecord.create.mock.calls[0][0].data;
    expect(data).not.toHaveProperty("status");
  });

  it("does not let employees verify their own onboarding checklist", async () => {
    await expect(
      employeeService.updateOnboardingChecklist(
        { ...candidateUser, roles: [Role.EMPLOYEE] },
        { employeeId: EMP_ID, itemId: "ID_VERIFICATION", completed: true }
      )
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(db.employee.updateMany).not.toHaveBeenCalled();
  });

  it("audits checklist changes made by HR", async () => {
    db.employee.findUnique.mockResolvedValue({
      id: EMP_ID,
      updatedAt: new Date("2026-10-01T00:00:00.000Z"),
      onboardingChecklist: [{ id: "ID_VERIFICATION", label: "ID", completed: false }],
    });
    await employeeService.updateOnboardingChecklist(hrUser, {
      employeeId: EMP_ID,
      itemId: "ID_VERIFICATION",
      completed: true,
    });
    expect(db.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: "UPDATE_ONBOARDING_CHECKLIST_ITEM" }) })
    );
  });

  it("policy-gates employee document registration (OD-013)", async () => {
    db.employee.findUnique.mockResolvedValue({ id: EMP_ID });
    await expect(
      employeeService.addEmployeeDocument(hrUser, {
        employeeId: EMP_ID,
        documentType: "GOVERNMENT_ID",
        title: "Passport",
        storageKey: "documents/fake-key",
        mimeType: "application/pdf",
        fileSizeBytes: 1024,
        isConfidential: true,
      })
    ).rejects.toBeInstanceOf(PolicyBlockedError);
    expect(db.employeeDocument.create).not.toHaveBeenCalled();
  });

  it("restricts direct employee creation to ADMIN and audits the justification", async () => {
    const input = {
      ...hireInput,
      userId: CANDIDATE_ID,
      justification: "Transfer from partner firm (ref. HR-42)",
      status: EmployeeStatus.PROBATION,
    };
    await expect(employeeService.createDirectEmployee(hrUser, input)).rejects.toBeInstanceOf(ForbiddenError);

    db.user.findUnique.mockResolvedValue({ id: CANDIDATE_ID, name: "Candidate", employeeProfile: null });
    db.employee.findUnique.mockResolvedValueOnce(null);
    db.employee.create.mockResolvedValue({ id: EMP_ID, employeeCode: "ENG-101", status: EmployeeStatus.PROBATION });
    // getEmployeeDetail after creation is not under test here.
    db.employee.findUnique.mockResolvedValueOnce(null);

    await expect(employeeService.createDirectEmployee(adminUser, input)).rejects.toThrow("Employee record not found.");
    expect(db.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "CREATE_DIRECT_EMPLOYEE",
          diffPayload: expect.objectContaining({ justification: "Transfer from partner firm (ref. HR-42)" }),
        }),
      })
    );
  });

  it("blocks non-HR/non-Admin from assigning reporting managers", async () => {
    await expect(
      employeeService.assignManager(candidateUser, { employeeId: EMP_ID, managerId: MANAGER_ID })
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("detects reporting cycles inside the transaction and records codes consistently", async () => {
    db.employee.findUnique.mockImplementation(async (args: { where: { id: string } }) => {
      if (args.where.id === EMP_ID) {
        return { id: EMP_ID, employeeCode: "EMP-A", managerId: null, manager: null, status: EmployeeStatus.ACTIVE };
      }
      if (args.where.id === MANAGER_ID) {
        return { id: MANAGER_ID, employeeCode: "EMP-B", managerId: EMP_ID, status: EmployeeStatus.ACTIVE };
      }
      return null;
    });
    await expect(
      employeeService.assignManager(hrUser, { employeeId: EMP_ID, managerId: MANAGER_ID })
    ).rejects.toBeInstanceOf(ValidationError);
    expect(db.employee.update).not.toHaveBeenCalled();

    db.employee.findUnique.mockImplementation(async (args: { where: { id: string } }) => {
      if (args.where.id === EMP_ID) {
        return { id: EMP_ID, employeeCode: "EMP-A", managerId: null, manager: null, status: EmployeeStatus.ACTIVE };
      }
      if (args.where.id === MANAGER_ID) {
        return { id: MANAGER_ID, employeeCode: "EMP-B", managerId: null, status: EmployeeStatus.ACTIVE };
      }
      return null;
    });
    await employeeService.assignManager(hrUser, { employeeId: EMP_ID, managerId: MANAGER_ID });
    expect(db.employmentHistory.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ previousValue: "None", newValue: "EMP-B" }),
      })
    );
  });
});

describe("Employee/offer Server Actions (SEC-20)", () => {
  it("validates offer identifiers and bounds the revoke reason", async () => {
    signInAs(HR_ID, [Role.HR]);
    expect((await extendJobOfferAction("not-a-uuid")).success).toBe(false);
    expect((await revokeJobOfferAction(OFFER_ID, "x".repeat(5000))).success).toBe(false);
    expect(db.jobOffer.findUnique).not.toHaveBeenCalled();
  });

  it("rejects interviewers before reaching the offer service", async () => {
    signInAs(INTERVIEWER_ID, [Role.INTERVIEWER]);
    const res = await extendJobOfferAction(OFFER_ID);
    expect(res.success).toBe(false);
    expect(db.jobOffer.findUnique).not.toHaveBeenCalled();
  });

  it("replaces unexpected internal errors with a generic message", async () => {
    signInAs(HR_ID, [Role.HR]);
    db.application.findUnique.mockRejectedValue(new Error("relation \"job_offers\" does not exist at db-host-7"));
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const formData = new FormData();
    formData.set("applicationId", APP_ID);
    formData.set("department", "Engineering");
    formData.set("designation", "Engineer");
    formData.set("expectedJoiningDate", "2026-12-01");
    formData.set("termsSummary", "Terms agreed with the candidate.");
    const res = await createJobOfferAction(formData);

    expect(res).toEqual({ success: false, error: "We couldn't save the offer. Please try again." });
    consoleSpy.mockRestore();
  });
});

describe("Separation of duties on offers and hiring (REV-08)", () => {
  /** HR user who is also the candidate on APP_ID. */
  const hrCandidate: AuthenticatedUser = {
    id: CANDIDATE_ID,
    name: "HR Candidate",
    email: "cand@gara.test",
    roles: [Role.HR],
  };
  const draftInput = {
    applicationId: APP_ID,
    department: "Engineering",
    designation: "Developer",
    expectedJoiningDate: "2026-12-01T00:00:00.000Z",
    termsSummary: "Agreed terms summary with sufficient length.",
  };

  function expectNoOfferWrites() {
    expect(db.jobOffer.create).not.toHaveBeenCalled();
    expect(db.jobOffer.updateMany).not.toHaveBeenCalled();
    expect(db.application.updateMany).not.toHaveBeenCalled();
    expect(db.applicationStatusHistory.create).not.toHaveBeenCalled();
    expect(db.auditLog.create).not.toHaveBeenCalled();
  }

  it("blocks preparing a draft offer for the actor's own application", async () => {
    db.application.findUnique.mockResolvedValue({
      id: APP_ID,
      status: ApplicationStatus.INTERVIEWED,
      isArchived: false,
      jobOffer: null,
      candidate: { userId: CANDIDATE_ID },
    });
    await expect(offerService.createDraftOffer(hrCandidate, draftInput)).rejects.toThrow(
      OWN_APPLICATION_ACTION_MESSAGE
    );
    expectNoOfferWrites();
  });

  it("blocks extending the actor's own offer", async () => {
    db.jobOffer.findUnique.mockResolvedValue(offerRecord(OfferStatus.DRAFT, ApplicationStatus.INTERVIEWED));
    await expect(offerService.extendOffer(hrCandidate, OFFER_ID)).rejects.toBeInstanceOf(ForbiddenError);
    expectNoOfferWrites();
  });

  it("blocks revoking the actor's own offer", async () => {
    db.jobOffer.findUnique.mockResolvedValue(offerRecord(OfferStatus.EXTENDED, ApplicationStatus.OFFERED));
    await expect(offerService.revokeOffer(hrCandidate, { offerId: OFFER_ID, reason: "x" })).rejects.toThrow(
      OWN_APPLICATION_ACTION_MESSAGE
    );
    expectNoOfferWrites();
  });

  it("blocks hiring the actor from their own application", async () => {
    db.application.findUnique.mockResolvedValue({
      id: APP_ID,
      referenceCode: "APP-1",
      status: ApplicationStatus.OFFER_ACCEPTED,
      candidate: { user: { id: CANDIDATE_ID, name: "Candidate", email: "cand@gara.test", employeeProfile: null } },
      jobOffer: { id: OFFER_ID, status: OfferStatus.ACCEPTED },
    });
    await expect(employeeService.createEmployeeFromApplication(hrCandidate, hireInput)).rejects.toThrow(
      OWN_APPLICATION_ACTION_MESSAGE
    );
    expect(db.employee.create).not.toHaveBeenCalled();
    expect(db.userRole.upsert).not.toHaveBeenCalled();
    expect(db.application.updateMany).not.toHaveBeenCalled();
  });

  it("shows an HR user their own offer only through the candidate projection", async () => {
    db.jobOffer.findUnique.mockResolvedValue(offerRecord(OfferStatus.EXTENDED, ApplicationStatus.OFFERED));
    const offer = await offerService.getOfferByApplicationId(hrCandidate, APP_ID);
    expect(offer).not.toBeNull();
    expect(offer?.notes).toBeNull();
    expect(offer?.extendedBy).toBeNull();

    db.jobOffer.findUnique.mockResolvedValue(offerRecord(OfferStatus.DRAFT, ApplicationStatus.INTERVIEWED));
    await expect(offerService.getOfferByApplicationId(hrCandidate, APP_ID)).resolves.toBeNull();
    await expect(offerService.getOfferDetail(hrCandidate, OFFER_ID)).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("Offer revoke restores the real pre-offer stage (REV-10)", () => {
  type HistoryRow = { fromStatus: string; toStatus: string; createdAt: Date };

  /** Evaluates the revoke lookup against in-memory history rows like PostgreSQL would. */
  function useHistory(rows: HistoryRow[]) {
    db.applicationStatusHistory.findFirst.mockImplementation(
      async (args: { where: { toStatus: string; fromStatus?: { not: string } } }) => {
        const matches = rows
          .filter((r) => r.toStatus === args.where.toStatus)
          .filter((r) => !args.where.fromStatus || r.fromStatus !== args.where.fromStatus.not)
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        return matches[0] ? { fromStatus: matches[0].fromStatus } : null;
      }
    );
  }

  it("ignores OFFERED -> OFFERED timeline rows written after the offer (e.g. an interview reschedule)", async () => {
    db.jobOffer.findUnique.mockResolvedValue(offerRecord(OfferStatus.EXTENDED, ApplicationStatus.OFFERED));
    useHistory([
      { fromStatus: ApplicationStatus.SHORTLISTED, toStatus: ApplicationStatus.INTERVIEW_SCHEDULED, createdAt: new Date("2026-10-01") },
      { fromStatus: ApplicationStatus.INTERVIEW_SCHEDULED, toStatus: ApplicationStatus.INTERVIEWED, createdAt: new Date("2026-10-02") },
      { fromStatus: ApplicationStatus.INTERVIEWED, toStatus: ApplicationStatus.OFFERED, createdAt: new Date("2026-10-03") },
      // Legacy no-op row written by an interview reschedule while the offer was open.
      { fromStatus: ApplicationStatus.OFFERED, toStatus: ApplicationStatus.OFFERED, createdAt: new Date("2026-10-04") },
    ]);

    await offerService.revokeOffer(hrUser, { offerId: OFFER_ID, reason: "Role closed" });

    expect(db.applicationStatusHistory.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ fromStatus: { not: ApplicationStatus.OFFERED } }),
      })
    );
    expect(db.application.updateMany).toHaveBeenCalledWith({
      where: { id: APP_ID, status: ApplicationStatus.OFFERED },
      data: { status: ApplicationStatus.INTERVIEWED },
    });
    expect(db.applicationStatusHistory.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ fromStatus: ApplicationStatus.OFFERED, toStatus: ApplicationStatus.INTERVIEWED }),
      })
    );
  });

  it("restores EVALUATION_SELECTED for an internship offer", async () => {
    db.jobOffer.findUnique.mockResolvedValue(offerRecord(OfferStatus.EXTENDED, ApplicationStatus.OFFERED));
    useHistory([
      { fromStatus: ApplicationStatus.EVALUATION_SELECTED, toStatus: ApplicationStatus.OFFERED, createdAt: new Date("2026-10-03") },
      { fromStatus: ApplicationStatus.OFFERED, toStatus: ApplicationStatus.OFFERED, createdAt: new Date("2026-10-04") },
    ]);
    await offerService.revokeOffer(hrUser, { offerId: OFFER_ID, reason: "Role closed" });
    expect(db.application.updateMany).toHaveBeenCalledWith({
      where: { id: APP_ID, status: ApplicationStatus.OFFERED },
      data: { status: ApplicationStatus.EVALUATION_SELECTED },
    });
  });

  it("falls back to the documented stage when the pre-offer stage is unknown", async () => {
    db.jobOffer.findUnique.mockResolvedValue(offerRecord(OfferStatus.EXTENDED, ApplicationStatus.OFFERED));
    useHistory([
      { fromStatus: ApplicationStatus.OFFERED, toStatus: ApplicationStatus.OFFERED, createdAt: new Date("2026-10-04") },
    ]);
    await offerService.revokeOffer(hrUser, { offerId: OFFER_ID, reason: "Role closed" });

    expect(REVOKE_FALLBACK_APPLICATION_STATUS).toBe(ApplicationStatus.INTERVIEWED);
    expect(db.application.updateMany).toHaveBeenCalledWith({
      where: { id: APP_ID, status: ApplicationStatus.OFFERED },
      data: { status: REVOKE_FALLBACK_APPLICATION_STATUS },
    });
    expect(db.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "REVOKE_JOB_OFFER",
          diffPayload: expect.objectContaining({ usedFallbackStage: true }),
        }),
      })
    );
  });

  it("leaves the stage alone when a draft offer is revoked", async () => {
    db.jobOffer.findUnique.mockResolvedValue(offerRecord(OfferStatus.DRAFT, ApplicationStatus.INTERVIEWED));
    await offerService.revokeOffer(hrUser, { offerId: OFFER_ID, reason: "Not needed" });
    expect(db.application.updateMany).not.toHaveBeenCalled();
    expect(db.applicationStatusHistory.findFirst).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Round 5: bounded directory and split, streamed detail loaders
// ---------------------------------------------------------------------------

const MANAGER_USER_ID = "99999999-9999-4999-8999-999999999999";
const managerUser: AuthenticatedUser = {
  id: MANAGER_USER_ID,
  name: "Manager",
  email: "manager@gara.test",
  roles: [Role.MANAGER],
};
const selfEmployeeUser: AuthenticatedUser = {
  id: CANDIDATE_ID,
  name: "Candidate",
  email: "cand@gara.test",
  roles: [Role.EMPLOYEE],
};

function coreRow() {
  return {
    id: EMP_ID,
    userId: CANDIDATE_ID,
    employeeCode: "ENG-101",
    department: "Engineering",
    designation: "Engineer",
    joiningDate: new Date(PAST_JOINING_DATE),
    status: EmployeeStatus.ACTIVE,
    employmentType: "FULL_TIME",
    personalPhone: "+91 99999 00000",
    emergencyContact: { name: "Kin", relation: "Parent", phone: "+91 88888 00000" },
    internalNotes: "Staff-only remark",
    onboardingChecklist: [],
    user: { id: CANDIDATE_ID, name: "Candidate", email: "cand@gara.test", image: null },
    manager: null,
    directReports: [],
    _count: { directReports: 0 },
    application: null,
  };
}

const confidentialDoc = {
  id: "doc-1",
  documentType: "ID",
  title: "Passport",
  storageKey: "private/passport",
  mimeType: "application/pdf",
  fileSizeBytes: 1024,
  isConfidential: true,
  uploadedAt: new Date("2026-01-01T00:00:00.000Z"),
  uploadedBy: { id: HR_ID, name: "HR" },
};
const publicDoc = { ...confidentialDoc, id: "doc-2", title: "Offer letter", isConfidential: false };
const exitRow = {
  id: "exit-1",
  periodId: "period-1",
  resignationDate: null,
  lastWorkingDate: new Date("2026-03-31T00:00:00.000Z"),
  reason: "Relocation",
  clearanceChecklist: null,
  exitInterviewNotes: "Staff-only exit notes",
  status: "PENDING",
  processedBy: { id: HR_ID, name: "HR" },
};

describe("Employee directory is one bounded database page (round 5)", () => {
  beforeEach(() => {
    db.employee.findMany.mockResolvedValue([]);
    db.employee.count.mockResolvedValue(120);
    db.employee.groupBy.mockResolvedValue([{ department: "Engineering" }, { department: "People" }]);
  });

  it("pages with skip/take, counts with the same filters and lists departments in the database", async () => {
    const result = await employeeService.getEmployeeDirectory(adminUser, {
      search: "  eng ",
      department: "Engineering",
      status: EmployeeStatus.ACTIVE,
      page: 3,
    });

    const list = db.employee.findMany.mock.calls[0][0];
    expect(list.skip).toBe(50);
    expect(list.take).toBe(25);
    expect(list.where.department).toBe("Engineering");
    expect(list.where.status).toBe(EmployeeStatus.ACTIVE);
    expect(list.where.OR).toEqual(
      expect.arrayContaining([{ employeeCode: { contains: "eng", mode: "insensitive" } }])
    );
    expect(db.employee.count).toHaveBeenCalledWith({ where: list.where });
    expect(db.employee.groupBy).toHaveBeenCalledWith({ by: ["department"], orderBy: { department: "asc" } });
    expect(result).toMatchObject({ total: 120, page: 3, pageSize: 25, pageCount: 5, departments: ["Engineering", "People"] });
  });

  it("never exceeds 50 rows per page and never goes below page 1", async () => {
    await employeeService.getEmployeeDirectory(adminUser, { page: 0, pageSize: 500 });
    expect(db.employee.findMany.mock.calls[0][0]).toMatchObject({ skip: 0, take: 50 });

    db.employee.findMany.mockClear();
    await employeeService.getEmployeeDirectory(adminUser, { page: -4, pageSize: 0 });
    expect(db.employee.findMany.mock.calls[0][0]).toMatchObject({ skip: 0, take: 1 });
  });

  it("lets a MANAGER with canEmployees read the directory page but still without confidential columns", async () => {
    await employeeService.getEmployeeDirectory(managerUser);
    const select = db.employee.findMany.mock.calls[0][0].select;
    expect(select).not.toHaveProperty("personalPhone");
    expect(select).not.toHaveProperty("internalNotes");
  });
});

describe("Employee detail loaders keep the confidentiality projection (round 5)", () => {
  beforeEach(() => {
    db.employee.findUnique.mockResolvedValue(coreRow());
    db.employmentHistory.findMany.mockResolvedValue([]);
    db.employeeDocument.findMany.mockResolvedValue([confidentialDoc, publicDoc]);
    db.employeeExitRecord.findMany.mockResolvedValue([exitRow]);
    db.employmentPeriod.findMany.mockResolvedValue([]);
  });

  it("refuses a MANAGER (even with canEmployees) on every loader", async () => {
    await expect(employeeService.getEmployeeDetailCore(managerUser, EMP_ID)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(employeeService.getEmployeeHistory(managerUser, EMP_ID)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(employeeService.getEmployeeDocuments(managerUser, EMP_ID)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(employeeService.getEmployeeDetail(managerUser, EMP_ID)).rejects.toBeInstanceOf(ForbiddenError);
    expect(db.employmentHistory.findMany).not.toHaveBeenCalled();
    expect(db.employeeDocument.findMany).not.toHaveBeenCalled();
  });

  it("shows the person their own contact details but never internal notes, exit notes or confidential documents", async () => {
    const core = await employeeService.getEmployeeDetailCore(selfEmployeeUser, EMP_ID);
    expect(core.personalPhone).toBe("+91 99999 00000");
    expect(core.emergencyContact).toMatchObject({ name: "Kin" });
    expect(core.internalNotes).toBeNull();

    const documents = await employeeService.getEmployeeDocuments(selfEmployeeUser, EMP_ID);
    expect(db.employeeDocument.findMany.mock.calls[0][0].where).toEqual({ employeeId: EMP_ID, isConfidential: false });
    expect(documents.map((d) => d.id)).toEqual(["doc-2"]);

    const history = await employeeService.getEmployeeHistory(selfEmployeeUser, EMP_ID);
    expect(history.exitRecords[0].exitInterviewNotes).toBeNull();
  });

  it("gives HR with canEmployees the staff-only fields and the same shape through the composite loader", async () => {
    const core = await employeeService.getEmployeeDetailCore(hrUser, EMP_ID);
    expect(core.internalNotes).toBe("Staff-only remark");
    expect(core.directReportCount).toBe(0);

    const documents = await employeeService.getEmployeeDocuments(hrUser, EMP_ID);
    expect(db.employeeDocument.findMany.mock.calls[0][0].where).toEqual({ employeeId: EMP_ID });
    expect(documents).toHaveLength(2);

    const history = await employeeService.getEmployeeHistory(hrUser, EMP_ID);
    expect(history.exitRecords[0].exitInterviewNotes).toBe("Staff-only exit notes");

    db.employee.findUnique.mockResolvedValue({
      ...coreRow(),
      employmentHistories: [],
      secureDocuments: [confidentialDoc, publicDoc],
      exitRecords: [exitRow],
      employmentPeriods: [],
    });
    const detail = await employeeService.getEmployeeDetail(hrUser, EMP_ID);
    expect(detail.internalNotes).toBe("Staff-only remark");
    expect(detail.secureDocuments).toHaveLength(2);
    expect(detail.exitRecords[0].exitInterviewNotes).toBe("Staff-only exit notes");
  });

  it("bounds the history and document queries and selects columns instead of including relations", async () => {
    await employeeService.getEmployeeHistory(hrUser, EMP_ID);
    const historyArgs = db.employmentHistory.findMany.mock.calls[0][0];
    expect(historyArgs).toMatchObject({ where: { employeeId: EMP_ID }, take: 50, orderBy: { effectiveDate: "desc" } });
    expect(historyArgs).toHaveProperty("select");
    expect(historyArgs).not.toHaveProperty("include");

    await employeeService.getEmployeeDocuments(hrUser, EMP_ID);
    const docArgs = db.employeeDocument.findMany.mock.calls[0][0];
    expect(docArgs).toMatchObject({ take: 50, orderBy: { uploadedAt: "desc" } });
    expect(docArgs).toHaveProperty("select");
    expect(docArgs).not.toHaveProperty("include");

    db.employee.findUnique.mockClear();
    await employeeService.getEmployeeDetailCore(hrUser, EMP_ID);
    const coreArgs = db.employee.findUnique.mock.calls[0][0];
    expect(coreArgs).not.toHaveProperty("include");
    expect(coreArgs.select).not.toHaveProperty("employmentHistories");
    expect(coreArgs.select).not.toHaveProperty("secureDocuments");
    expect(coreArgs.select.directReports.take).toBe(50);
  });

  it("reports a missing record as not found before any authorization decision", async () => {
    db.employee.findUnique.mockResolvedValue(null);
    await expect(employeeService.getEmployeeDetailCore(hrUser, EMP_ID)).rejects.toBeInstanceOf(NotFoundError);
    await expect(employeeService.getEmployeeHistory(hrUser, EMP_ID)).rejects.toBeInstanceOf(NotFoundError);
  });
});

// ---------------------------------------------------------------------------
// Round 6: searchable reporting-manager picker
// ---------------------------------------------------------------------------

const managerOption = {
  id: MANAGER_ID,
  employeeCode: "GAR-001",
  designation: "Engineering Lead",
  user: { name: "Lead Person" },
};

describe("searchReportingManagersAction (round 6 picker)", () => {
  beforeEach(() => {
    db.employee.findMany.mockResolvedValue([managerOption]);
  });

  it("requires HR / Admin with canEmployees, like assigning a manager", async () => {
    expect((await searchReportingManagersAction({ query: "lead", excludeEmployeeId: EMP_ID })).success).toBe(false);

    signInAs(INTERVIEWER_ID, [Role.INTERVIEWER]);
    expect((await searchReportingManagersAction({ query: "lead" })).success).toBe(false);

    signInAs(HR_ID, [Role.HR]);
    denyPermission("canEmployees");
    expect((await searchReportingManagersAction({ query: "lead" })).success).toBe(false);
    expect(db.employee.findMany).not.toHaveBeenCalled();
  });

  it("validates the query and the excluded employee before searching", async () => {
    signInAs(HR_ID, [Role.HR]);
    const short = await searchReportingManagersAction({ query: "l" });
    expect(short).toMatchObject({ success: false, error: "Type at least 2 characters to search." });
    expect((await searchReportingManagersAction({ query: "x".repeat(101) })).success).toBe(false);
    expect((await searchReportingManagersAction({ query: "lead", excludeEmployeeId: "not-a-uuid" })).success).toBe(false);
    expect((await searchReportingManagersAction({ query: 42 })).success).toBe(false);
    expect((await searchReportingManagersAction(null)).success).toBe(false);
    expect(db.employee.findMany).not.toHaveBeenCalled();
  });

  it("returns at most 20 active employees matching the term, never the edited employee", async () => {
    signInAs(HR_ID, [Role.HR]);
    const res = await searchReportingManagersAction({ query: "  lead ", excludeEmployeeId: EMP_ID });

    expect(res).toEqual({
      success: true,
      data: [{ id: MANAGER_ID, employeeCode: "GAR-001", name: "Lead Person", designation: "Engineering Lead" }],
    });
    const args = db.employee.findMany.mock.calls[0][0];
    expect(args.take).toBe(20);
    expect(args.where.status).toEqual({ not: EmployeeStatus.EXITED });
    expect(args.where.id).toEqual({ not: EMP_ID });
    expect(args.where.OR).toEqual(
      expect.arrayContaining([{ user: { name: { contains: "lead", mode: "insensitive" } } }])
    );
    expect(Object.keys(args.select).sort()).toEqual(["designation", "employeeCode", "id", "user"]);
  });

  it("lists the first 20 options for an empty query (shown on focus)", async () => {
    signInAs(ADMIN_ID, [Role.ADMIN]);
    const res = await searchReportingManagersAction({ query: "", excludeEmployeeId: EMP_ID });
    expect(res.success).toBe(true);
    const args = db.employee.findMany.mock.calls[0][0];
    expect(args.take).toBe(20);
    expect(args.where).not.toHaveProperty("OR");
  });

  it("hides unexpected database errors behind a friendly message", async () => {
    signInAs(HR_ID, [Role.HR]);
    db.employee.findMany.mockRejectedValue(new Error("connection terminated at db-host-3"));
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const res = await searchReportingManagersAction({ query: "lead" });
    expect(res).toEqual({ success: false, error: "We couldn't search for managers. Please try again." });
    consoleSpy.mockRestore();
  });
});

describe("ReportingManagerCombobox keyboard selection (round 6)", () => {
  const INPUT_ID = "employee-lifecycle-card-assign-reporting-manager";

  /** Renders the picker in a labelled field and records every choice. */
  function renderPicker(options: {
    initial?: ReportingManagerChoice | null;
    initialOptions?: Array<{ id: string; employeeCode: string; name: string }>;
  } = {}) {
    const choices: Array<ReportingManagerChoice | null> = [];
    function Harness() {
      const [value, setValue] = useState<ReportingManagerChoice | null>(options.initial ?? null);
      return createElement(
        "div",
        null,
        createElement("label", { htmlFor: INPUT_ID }, "Assign Reporting Manager"),
        createElement(ReportingManagerCombobox, {
          inputId: INPUT_ID,
          excludeEmployeeId: EMP_ID,
          value,
          onChange: (choice: ReportingManagerChoice | null) => {
            choices.push(choice);
            setValue(choice);
          },
          initialOptions: options.initialOptions,
        })
      );
    }
    render(createElement(Harness));
    return { input: screen.getByRole("combobox", { name: "Assign Reporting Manager" }), choices };
  }

  it("shows the preloaded options on focus and chooses with the arrow keys and Enter", async () => {
    const { input, choices } = renderPicker({
      initialOptions: [
        { id: EMP_ID, employeeCode: "ENG-101", name: "Edited Self" },
        { id: MANAGER_ID, employeeCode: "GAR-001", name: "Lead Person" },
      ],
    });

    fireEvent.focus(input);
    expect(input.getAttribute("aria-expanded")).toBe("true");
    const listbox = screen.getByRole("listbox");
    expect(input.getAttribute("aria-controls")).toBe(listbox.id);
    const optionLabels = screen.getAllByRole("option").map((option) => option.textContent);
    // "No manager" first; the employee being edited is never offered.
    expect(optionLabels[0]).toContain("No manager");
    expect(optionLabels.join(" ")).not.toContain("Edited Self");
    expect(screen.getByRole("status").textContent).toContain("Showing the first 1 employee");
    // Focus options come from the page: no server round trip.
    expect(db.employee.findMany).not.toHaveBeenCalled();

    fireEvent.keyDown(input, { key: "ArrowDown" });
    const active = screen.getAllByRole("option")[1];
    expect(input.getAttribute("aria-activedescendant")).toBe(active.id);
    expect(active.getAttribute("aria-selected")).toBe("true");

    fireEvent.keyDown(input, { key: "Enter" });
    expect(choices).toEqual([{ id: MANAGER_ID, label: "Lead Person (GAR-001)" }]);
    expect(input.getAttribute("aria-expanded")).toBe("false");
    expect((input as HTMLInputElement).value).toBe("Lead Person (GAR-001)");
  });

  it("searches the server after two characters, announces the count and closes on Escape", async () => {
    signInAs(HR_ID, [Role.HR]);
    db.employee.findMany.mockResolvedValue([managerOption]);
    const { input, choices } = renderPicker();

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "l" } });
    expect(screen.getByRole("status").textContent).toContain("Type at least 2 characters to search.");

    fireEvent.change(input, { target: { value: "le" } });
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("1 employee found."));
    const searchCall = db.employee.findMany.mock.calls.find((call) => call[0].where.OR);
    expect(searchCall?.[0]).toMatchObject({ take: 20, where: { id: { not: EMP_ID } } });

    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(choices).toEqual([{ id: MANAGER_ID, label: "Lead Person (GAR-001)" }]);

    fireEvent.change(input, { target: { value: "zz" } });
    expect(input.getAttribute("aria-expanded")).toBe("true");
    fireEvent.keyDown(input, { key: "Escape" });
    expect(input.getAttribute("aria-expanded")).toBe("false");
    // Escape keeps the chosen manager and restores its label.
    expect((input as HTMLInputElement).value).toBe("Lead Person (GAR-001)");
  });

  it("chooses No manager from the list or with the clear button", async () => {
    const current = { id: MANAGER_ID, label: "Lead Person (GAR-001)" };
    const { input, choices } = renderPicker({ initial: current, initialOptions: [] });

    fireEvent.focus(input);
    // The first option ("No manager") is active; Enter chooses it.
    fireEvent.keyDown(input, { key: "Enter" });
    expect(choices).toEqual([null]);
    expect((input as HTMLInputElement).value).toBe("");

    cleanup();
    const second = renderPicker({ initial: current, initialOptions: [] });
    fireEvent.click(screen.getByRole("button", { name: /Clear the reporting manager/ }));
    expect(second.choices).toEqual([null]);
  });
});
