import { describe, it, expect, vi, beforeEach } from "vitest";
import { Role } from "@prisma/client";

const { db, mockGetCurrentUser, mockRequireAuth, mockRedirect } = vi.hoisted(() => ({
  db: {
    candidateProfile: { findUnique: vi.fn(), upsert: vi.fn() },
    internshipEnrollment: { findFirst: vi.fn() },
    employee: { findUnique: vi.fn() },
    userRole: { findMany: vi.fn() },
  },
  mockGetCurrentUser: vi.fn(),
  mockRequireAuth: vi.fn(),
  mockRedirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));

vi.mock("@/lib/db", () => ({ prisma: db }));
vi.mock("@/lib/auth/guards", () => ({ getCurrentUser: mockGetCurrentUser, requireAuth: mockRequireAuth }));
vi.mock("next/navigation", () => ({ redirect: mockRedirect }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/components/dashboard/dashboard-shell", () => ({ DashboardShell: () => null }));

import {
  buildSelfServiceNav,
  capabilitiesForStage,
  determineLifecycleStage,
  isApplicationsReadOnly,
  STAGE_HOME_PATHS,
} from "@/features/lifecycle/capabilities";
import {
  getApplyBlockedReason,
  getLifecycleForUser,
  requirePortalCapability,
  resolveHomePath,
} from "@/features/lifecycle/services/lifecycle-service";
import { saveCareerInterestAction } from "@/features/lifecycle/actions";
import { SelfServiceShell } from "@/features/lifecycle/components/self-service-shell";
import { HRMS_NAV_ITEMS } from "@/config/dashboard-nav";
import { UnauthorizedError } from "@/lib/errors";

const baseUser = { id: "user-1", email: "u@gara.test", name: "Asha", mustChangePassword: false };

function primeFacts({
  enrollment = null,
  employee = null,
  roleRows = [],
  interest = null,
}: {
  enrollment?: { status: string; createdAt?: Date; applicationStatus?: string } | null;
  employee?: { status: string; employmentType?: string | null } | null;
  roleRows?: Array<{ role: Role; assignedAt: Date }>;
  interest?: string | null;
}) {
  db.candidateProfile.findUnique.mockResolvedValue(interest ? { careerInterest: interest } : null);
  db.internshipEnrollment.findFirst.mockResolvedValue(
    enrollment
      ? {
          id: "enr-1",
          status: enrollment.status,
          startDate: null,
          endDate: null,
          createdAt: enrollment.createdAt ?? new Date("2026-10-01T00:00:00Z"),
          application: { status: enrollment.applicationStatus ?? "EVALUATION_SELECTED", opening: { title: "Frontend Intern" } },
        }
      : null
  );
  db.employee.findUnique.mockResolvedValue(
    employee
      ? {
          id: "emp-1",
          employeeCode: "E-1",
          status: employee.status,
          employmentType: employee.employmentType ?? null,
          designation: "Engineer",
          department: "Engineering",
          joiningDate: new Date("2026-10-20T00:00:00Z"),
        }
      : null
  );
  db.userRole.findMany.mockResolvedValue(roleRows);
}

describe("Lifecycle stage rules", () => {
  it("keeps signed-up users as candidates", () => {
    expect(
      determineLifecycleStage({ roles: [Role.CANDIDATE], enrollmentStatus: null, employeeStatus: null })
    ).toBe("CANDIDATE");
  });

  it("moves internship candidates into the evaluation stage once selected, without a role", () => {
    for (const status of ["PENDING_TRIGGER", "IN_PROGRESS", "UNDER_REVIEW", "EXTENDED", "PASSED"] as const) {
      expect(determineLifecycleStage({ roles: [], enrollmentStatus: status, employeeStatus: null })).toBe(
        "EVALUATION"
      );
    }
  });

  it("returns failed evaluations to the candidate stage", () => {
    expect(determineLifecycleStage({ roles: [], enrollmentStatus: "FAILED", employeeStatus: null })).toBe(
      "CANDIDATE"
    );
  });

  it("upgrades only when the joining role exists", () => {
    expect(
      determineLifecycleStage({ roles: [Role.INTERN], enrollmentStatus: "PASSED", employeeStatus: "ACTIVE" })
    ).toBe("INTERN");
    expect(
      determineLifecycleStage({ roles: [Role.EMPLOYEE], enrollmentStatus: null, employeeStatus: "PROBATION" })
    ).toBe("EMPLOYEE");
    // An intern later hired full time is an employee.
    expect(
      determineLifecycleStage({ roles: [Role.INTERN, Role.EMPLOYEE], enrollmentStatus: "PASSED", employeeStatus: "ACTIVE" })
    ).toBe("EMPLOYEE");
  });

  it("treats exited employment as alumni who can re-apply", () => {
    expect(
      determineLifecycleStage({ roles: [Role.EMPLOYEE], enrollmentStatus: null, employeeStatus: "EXITED" })
    ).toBe("ALUMNI");
    expect(capabilitiesForStage("ALUMNI")).toEqual(expect.arrayContaining(["applyToOpenings", "applications", "certificate"]));
    expect(STAGE_HOME_PATHS.ALUMNI).toBe("/candidate/dashboard");
  });

  it("puts a returning person who is selected again into evaluation", () => {
    expect(
      determineLifecycleStage({ roles: [Role.INTERN], enrollmentStatus: "IN_PROGRESS", employeeStatus: "EXITED" })
    ).toBe("EVALUATION");
  });
});

describe("Stage capabilities and navigation", () => {
  it("hides candidate features after joining and keeps history read-only", () => {
    for (const stage of ["INTERN", "EMPLOYEE"] as const) {
      const caps = capabilitiesForStage(stage);
      expect(caps).not.toContain("applyToOpenings");
      expect(caps).not.toContain("exploreOpenings");
      expect(caps).not.toContain("candidateOverview");
      expect(caps).toContain("journey");
      expect(isApplicationsReadOnly(stage)).toBe(true);
    }
    expect(isApplicationsReadOnly("CANDIDATE")).toBe(false);
  });

  it("adds the evaluation workspace on top of candidate features", () => {
    const candidate = capabilitiesForStage("CANDIDATE");
    const evaluation = capabilitiesForStage("EVALUATION");
    expect(evaluation).toEqual(expect.arrayContaining(candidate));
    expect(evaluation).toContain("evaluationWorkspace");
    expect(evaluation).not.toContain("attendance");
  });

  it("unlocks HR self-service only for joined stages", () => {
    expect(capabilitiesForStage("INTERN")).toEqual(expect.arrayContaining(["attendance", "leave", "payslips", "certificate"]));
    expect(capabilitiesForStage("EMPLOYEE")).toEqual(expect.arrayContaining(["employeeHome", "attendance", "leave", "payslips"]));
    expect(capabilitiesForStage("CANDIDATE")).not.toContain("attendance");
  });

  it("builds menus that never link to hidden features", () => {
    const candidateHrefs = buildSelfServiceNav("CANDIDATE").map((i) => i.href);
    expect(candidateHrefs).toContain("/careers");
    expect(candidateHrefs).not.toContain("/hrms/attendance");

    const employeeNav = buildSelfServiceNav("EMPLOYEE");
    const employeeHrefs = employeeNav.map((i) => i.href);
    expect(employeeHrefs[0]).toBe("/hrms");
    expect(employeeHrefs).not.toContain("/careers");
    expect(employeeHrefs).not.toContain("/candidate/dashboard");
    expect(employeeNav.find((i) => i.href === "/candidate/applications")?.label).toBe("My Journey");
  });

  it("routes each stage to its own home", () => {
    expect(STAGE_HOME_PATHS).toMatchObject({
      CANDIDATE: "/candidate/dashboard",
      EVALUATION: "/candidate/dashboard",
      INTERN: "/intern/dashboard",
      EMPLOYEE: "/hrms",
    });
  });
});

describe("Lifecycle resolver and guards", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reports the upgrade time from the joining role grant", async () => {
    const assignedAt = new Date("2026-10-24T10:00:00Z");
    primeFacts({
      employee: { status: "ACTIVE", employmentType: "INTERN" },
      enrollment: { status: "PASSED", applicationStatus: "HIRED" },
      roleRows: [{ role: Role.INTERN, assignedAt }],
      interest: "INTERNSHIP",
    });
    const state = await getLifecycleForUser({ ...baseUser, roles: [Role.INTERN] });
    expect(state.stage).toBe("INTERN");
    expect(state.upgradedAt).toBe(assignedAt.toISOString());
    expect(state.careerInterest).toBe("INTERNSHIP");
    expect(state.employment?.employmentType).toBe("INTERN");
    expect(db.employee.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: "user-1" } }));
  });

  it("sends staff to staff portals and joined users to their stage home", async () => {
    await expect(resolveHomePath({ ...baseUser, roles: [Role.ADMIN] })).resolves.toBe("/admin");
    await expect(resolveHomePath({ ...baseUser, roles: [Role.HR] })).resolves.toBe("/subadmin");
    primeFacts({ employee: { status: "PROBATION" }, roleRows: [] });
    await expect(resolveHomePath({ ...baseUser, roles: [Role.EMPLOYEE] })).resolves.toBe("/hrms");
  });

  it("redirects joined users away from candidate-only pages", async () => {
    mockGetCurrentUser.mockResolvedValue({ ...baseUser, roles: [Role.EMPLOYEE] });
    primeFacts({ employee: { status: "ACTIVE" } });
    await expect(
      requirePortalCapability("candidateOverview", { callbackPath: "/candidate/dashboard" })
    ).rejects.toThrow("NEXT_REDIRECT:/hrms");
  });

  it("redirects candidates away from HR self-service", async () => {
    mockGetCurrentUser.mockResolvedValue({ ...baseUser, roles: [] });
    primeFacts({});
    await expect(requirePortalCapability("attendance", { callbackPath: "/hrms/attendance" })).rejects.toThrow(
      "NEXT_REDIRECT:/candidate/dashboard"
    );
  });

  it("sends anonymous visitors to sign in with a return path", async () => {
    mockGetCurrentUser.mockResolvedValue(null);
    await expect(requirePortalCapability("profile", { callbackPath: "/candidate/profile" })).rejects.toThrow(
      "NEXT_REDIRECT:/login?callbackUrl=%2Fcandidate%2Fprofile"
    );
  });

  it("blocks new applications from joined users and staff only", async () => {
    await expect(getApplyBlockedReason({ ...baseUser, roles: [Role.HR] })).resolves.toMatch(/Staff accounts/);
    primeFacts({ employee: { status: "ACTIVE" }, roleRows: [] });
    await expect(getApplyBlockedReason({ ...baseUser, roles: [Role.INTERN] })).resolves.toMatch(/an intern/);
    primeFacts({ enrollment: { status: "IN_PROGRESS" } });
    await expect(getApplyBlockedReason({ ...baseUser, roles: [] })).resolves.toBeNull();
  });
});

describe("saveCareerInterestAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("stores a valid interest on the signed-in candidate's own profile", async () => {
    mockRequireAuth.mockResolvedValue({ ...baseUser, roles: [Role.CANDIDATE] });
    await expect(saveCareerInterestAction({ careerInterest: "BOTH" })).resolves.toEqual({ success: true });
    expect(db.candidateProfile.upsert).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      create: { userId: "user-1", careerInterest: "BOTH" },
      update: { careerInterest: "BOTH" },
    });
  });

  it("rejects unknown values, staff accounts and anonymous calls", async () => {
    mockRequireAuth.mockResolvedValue({ ...baseUser, roles: [Role.CANDIDATE] });
    await expect(saveCareerInterestAction({ careerInterest: "ADMIN" })).resolves.toMatchObject({ success: false });

    mockRequireAuth.mockResolvedValue({ ...baseUser, roles: [Role.MANAGER] });
    await expect(saveCareerInterestAction({ careerInterest: "JOB" })).resolves.toEqual({
      success: false,
      error: "Staff accounts do not have a candidate profile.",
    });

    mockRequireAuth.mockRejectedValue(new UnauthorizedError("You must be logged in to access this resource"));
    await expect(saveCareerInterestAction({ careerInterest: "JOB" })).resolves.toMatchObject({ success: false });
    expect(db.candidateProfile.upsert).not.toHaveBeenCalled();
  });
});

describe("SelfServiceShell", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("gives each stage its own navigation and badge", async () => {
    mockGetCurrentUser.mockResolvedValue({ ...baseUser, roles: [Role.EMPLOYEE] });
    primeFacts({ employee: { status: "ACTIVE" }, roleRows: [{ role: Role.EMPLOYEE, assignedAt: new Date("2025-01-01T00:00:00Z") }] });
    const element = await SelfServiceShell({ children: "page", loginCallbackPath: "/hrms" });
    expect(element.props.portalBadge).toBe("EMPLOYEE PORTAL");
    expect(element.props.selfService).toBe(true);
    expect(element.props.navItems.map((i: { href: string }) => i.href)).not.toContain("/careers");
  });

  it("redirects staff to their portal unless the portal serves staff", async () => {
    mockGetCurrentUser.mockResolvedValue({ ...baseUser, roles: [Role.HR] });
    await expect(SelfServiceShell({ children: "page", loginCallbackPath: "/candidate/dashboard" })).rejects.toThrow(
      "NEXT_REDIRECT:/subadmin"
    );
    const element = await SelfServiceShell({
      children: "page",
      loginCallbackPath: "/hrms",
      staffNavItems: HRMS_NAV_ITEMS,
    });
    expect(element.props.navItems).toBe(HRMS_NAV_ITEMS);
  });

  it("forces temporary-password sessions to set a password first", async () => {
    mockGetCurrentUser.mockResolvedValue({ ...baseUser, roles: [], mustChangePassword: true });
    await expect(SelfServiceShell({ children: "page", loginCallbackPath: "/candidate/dashboard" })).rejects.toThrow(
      "NEXT_REDIRECT:/set-password"
    );
  });
});

describe("Exited interns are not mistaken for evaluations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("ignores the old PASSED enrollment that led to joining", async () => {
    primeFacts({
      employee: { status: "EXITED", employmentType: "INTERN" },
      enrollment: { status: "PASSED", applicationStatus: "HIRED" },
    });
    const state = await getLifecycleForUser({ ...baseUser, roles: [Role.INTERN] });
    expect(state.stage).toBe("ALUMNI");
    expect(state.capabilities).toContain("applyToOpenings");
  });
});
