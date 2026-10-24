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
    employee: { findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    employmentHistory: { create: vi.fn() },
    employeeExitRecord: { create: vi.fn() },
    employeeDocument: { create: vi.fn() },
    userRole: { upsert: vi.fn() },
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
import { OWN_APPLICATION_ACTION_MESSAGE } from "@/features/recruitment/services/application-access";
import {
  extendJobOfferAction,
  revokeJobOfferAction,
  createJobOfferAction,
} from "@/features/employees/actions";
import {
  ConflictError,
  ForbiddenError,
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

const hireInput = {
  applicationId: APP_ID,
  employeeCode: "ENG-101",
  department: "Engineering",
  designation: "Engineer",
  joiningDate: "2026-12-01T00:00:00.000Z",
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
    expect(CandidateOfferDecisionSchema.safeParse({ offerId: crypto.randomUUID(), decision: "ACCEPT" }).success).toBe(true);
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
      offerService.candidateDecideOffer(interviewerUser, { offerId: OFFER_ID, decision: "ACCEPT" })
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("refuses a decision when the application is no longer OFFERED", async () => {
    db.jobOffer.findUnique.mockResolvedValue(offerRecord(OfferStatus.EXTENDED, ApplicationStatus.REJECTED));
    await expect(
      offerService.candidateDecideOffer(candidateUser, { offerId: OFFER_ID, decision: "ACCEPT" })
    ).rejects.toBeInstanceOf(ValidationError);
    expect(db.jobOffer.updateMany).not.toHaveBeenCalled();
  });

  it("loses the race cleanly when the offer was revoked concurrently", async () => {
    db.jobOffer.findUnique.mockResolvedValue(offerRecord(OfferStatus.EXTENDED, ApplicationStatus.OFFERED));
    db.jobOffer.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      offerService.candidateDecideOffer(candidateUser, { offerId: OFFER_ID, decision: "ACCEPT" })
    ).rejects.toBeInstanceOf(ConflictError);
    expect(db.application.updateMany).not.toHaveBeenCalled();
  });

  it("records a decline on the offer without withdrawing the application", async () => {
    db.jobOffer.findUnique.mockResolvedValue(offerRecord(OfferStatus.EXTENDED, ApplicationStatus.OFFERED));
    await offerService.candidateDecideOffer(candidateUser, {
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
    await employeeService.getEmployeeDirectory(adminUser);
    const select = db.employee.findMany.mock.calls[0][0].select;
    expect(select).not.toHaveProperty("personalPhone");
    expect(select).not.toHaveProperty("emergencyContact");
    expect(select).not.toHaveProperty("internalNotes");
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
    db.employee.findUnique.mockResolvedValue({ id: EMP_ID, status: EmployeeStatus.ACTIVE, exitRecord: null });
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

    expect(res).toEqual({ success: false, error: "Offer creation failed." });
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
