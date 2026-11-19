import { describe, it, expect, vi, beforeEach } from "vitest";
import { isValidElement, type ReactElement } from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import { Role } from "@prisma/client";
import type { AuthenticatedUser } from "@/lib/auth/guards";

/*
 * Round 7: the Registrations admin page (/admin/registrations and /subadmin/registrations).
 * Pins (1) page-level access: ADMIN, or HR holding canReports; HR without it, MANAGER and
 * candidates are refused before any registrant query, (2) staff accounts and unknown ids
 * are "not found", (3) the detail read selects no secret columns and returns none, (4) every
 * detail read is audited as VIEW_REGISTRANT / USER, (5) only https profile links become
 * links (rel="noopener noreferrer"), and (6) list rows and applications link onwards.
 */

const { db, mockGetCurrentUser } = vi.hoisted(() => ({
  db: {
    user: { findUnique: vi.fn() },
    auditLog: { create: vi.fn() },
    subAdminPermission: { findUnique: vi.fn() },
    candidateProfile: { findMany: vi.fn(), count: vi.fn() },
    $queryRaw: vi.fn(),
  },
  mockGetCurrentUser: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ prisma: db }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("@/lib/auth/auth", () => ({ auth: { api: { getSession: vi.fn(async () => null) } } }));
vi.mock("@/lib/auth/guards", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/guards")>();
  return { ...actual, getCurrentUser: mockGetCurrentUser };
});
vi.mock("next/navigation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/navigation")>();
  return {
    ...actual,
    redirect: vi.fn((url: string) => {
      throw new Error(`NEXT_REDIRECT:${url}`);
    }),
    notFound: vi.fn(() => {
      throw new Error("NEXT_NOT_FOUND");
    }),
    useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  };
});

import { ForbiddenError, NotFoundError } from "@/lib/errors";
import { UnauthorizedState } from "@/components/feedback/unauthorized-state";
import AdminRegistrationsPage from "@/app/admin/registrations/page";
import SubAdminRegistrationsPage from "@/app/subadmin/registrations/page";
import AdminRegistrantDetailPage from "@/app/admin/registrations/[userId]/page";
import SubAdminRegistrantDetailPage from "@/app/subadmin/registrations/[userId]/page";
import { RegistrationsDirectory } from "@/features/reports/components/registrations-directory";
import { RegistrantDirectoryList } from "@/features/reports/components/registrations-list";
import {
  registrationAnalyticsService,
  safeHttpsUrl,
  signInMethodLabel,
} from "@/features/reports/services/registration-analytics-service";

const admin: AuthenticatedUser = { id: "admin-1", name: "Admin", email: "admin@gara.test", roles: [Role.ADMIN] };
const hr: AuthenticatedUser = { id: "hr-1", name: "Meera HR", email: "hr@gara.test", roles: [Role.HR] };
const manager: AuthenticatedUser = { id: "mgr-1", name: "Vikram", email: "mgr@gara.test", roles: [Role.MANAGER] };
const candidate: AuthenticatedUser = { id: "cand-9", name: "Cara", email: "cara@example.com", roles: [Role.CANDIDATE] };

/** Every SubAdminPermission flag set to `value` (overridable). */
function permissionRow(userId: string, value: boolean, overrides: Record<string, boolean> = {}) {
  return {
    id: `perm-${userId}`,
    userId,
    canApplications: value,
    canOpenings: value,
    canInterviews: value,
    canEvaluations: value,
    canEmployees: value,
    canAttendance: value,
    canLeave: value,
    canPayroll: value,
    canReports: value,
    canManageSubAdmins: false,
    ...overrides,
  };
}

function signInAs(user: AuthenticatedUser | null) {
  mockGetCurrentUser.mockResolvedValue(user ? { ...user, mustChangePassword: false } : null);
}

function detailRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "user-1",
    name: "Asha Rao",
    email: "asha@example.com",
    emailVerified: true,
    createdAt: new Date("2026-10-20T20:00:00.000Z"), // 2026-10-21 in Asia/Kolkata
    roles: [{ role: Role.CANDIDATE }],
    // Google first: the account was created with Google, a password was added later.
    accounts: [{ providerId: "google" }, { providerId: "credential" }],
    employeeProfile: null,
    evaluationsAsIntern: [],
    candidateProfile: {
      phone: "+91 98765 43210",
      location: "Bengaluru",
      currentOrganization: "   ",
      highestEducation: "B.Tech, Computer Science",
      linkedinUrl: "https://www.linkedin.com/in/asha-rao",
      githubUrl: "http://github.com/asha",
      portfolioUrl: "javascript:alert(document.cookie)",
      careerInterest: "INTERNSHIP",
      updatedAt: new Date("2026-10-22T05:00:00.000Z"),
      applications: [
        {
          id: "app-1",
          referenceCode: "GARA-2026-APP-0001",
          status: "SCREENING",
          createdAt: new Date("2026-10-22T06:00:00.000Z"),
          opening: { title: "Frontend Intern", type: "INTERNSHIP" },
        },
      ],
      _count: { applications: 1 },
    },
    ...overrides,
  };
}

/** Every key of a nested object (select clauses and results). */
function allKeys(value: unknown, keys: Set<string> = new Set()): Set<string> {
  if (Array.isArray(value)) {
    value.forEach((item) => allKeys(item, keys));
  } else if (value && typeof value === "object" && !(value instanceof Date)) {
    for (const [key, nested] of Object.entries(value)) {
      keys.add(key);
      allKeys(nested, keys);
    }
  }
  return keys;
}

const SECRET_KEYS = [
  "password",
  "accessToken",
  "refreshToken",
  "idToken",
  "sessions",
  "token",
  "twoFactors",
  "secret",
  "backupCodes",
  "verifications",
  "ipAddress",
  "ipHash",
  "userAgent",
];

const NO_SEARCH = Promise.resolve({});

beforeEach(() => {
  vi.resetAllMocks();
  cleanup();
  signInAs(null);
  db.subAdminPermission.findUnique.mockResolvedValue(null);
  db.auditLog.create.mockResolvedValue({ id: "audit-1" });
  db.candidateProfile.findMany.mockResolvedValue([]);
  db.candidateProfile.count.mockResolvedValue(0);
  db.user.findUnique.mockResolvedValue(detailRow());
});

describe("Registrations page access (ADMIN, or HR with canReports)", () => {
  it("lets ADMIN open the admin page and HR with canReports open the staff page", async () => {
    signInAs(admin);
    const adminPage = (await AdminRegistrationsPage({ searchParams: NO_SEARCH })) as ReactElement;
    expect(adminPage.type).toBe(RegistrationsDirectory);
    expect(adminPage.props).toMatchObject({ basePath: "/admin" });

    signInAs(hr);
    const staffPage = (await SubAdminRegistrationsPage({ searchParams: Promise.resolve({ q: "asha" }) })) as ReactElement;
    expect(staffPage.type).toBe(RegistrationsDirectory);
    expect(staffPage.props).toMatchObject({ basePath: "/subadmin", searchParams: { q: "asha" } });
  });

  it("refuses HR without canReports, managers (even with canReports) and candidates", async () => {
    // HR has a custom row without canReports; the manager keeps the default (canReports on).
    db.subAdminPermission.findUnique.mockImplementation(async (args: { where: { userId: string } }) =>
      args.where.userId === hr.id ? permissionRow(hr.id, true, { canReports: false }) : null
    );
    for (const user of [hr, manager, candidate]) {
      signInAs(user);
      for (const page of [AdminRegistrationsPage, SubAdminRegistrationsPage]) {
        const element = (await page({ searchParams: NO_SEARCH })) as ReactElement;
        expect(isValidElement(element)).toBe(true);
        expect(element.type).toBe(UnauthorizedState);
      }
    }
    expect(db.candidateProfile.findMany).not.toHaveBeenCalled();
    expect(db.$queryRaw).not.toHaveBeenCalled();
  });

  it("sends signed-out visitors to sign in and temporary passwords to the password change", async () => {
    signInAs(null);
    await expect(AdminRegistrationsPage({ searchParams: NO_SEARCH })).rejects.toThrow(
      "NEXT_REDIRECT:/login?callbackUrl=/admin/registrations"
    );
    mockGetCurrentUser.mockResolvedValue({ ...admin, mustChangePassword: true });
    await expect(SubAdminRegistrantDetailPage({ params: Promise.resolve({ userId: "user-1" }) })).rejects.toThrow(
      "NEXT_REDIRECT:/set-password"
    );
    expect(db.user.findUnique).not.toHaveBeenCalled();
  });

  it("refuses the detail page before reading the registrant or writing an audit entry", async () => {
    signInAs(manager);
    const element = (await SubAdminRegistrantDetailPage({ params: Promise.resolve({ userId: "user-1" }) })) as ReactElement;
    expect(element.type).toBe(UnauthorizedState);
    await expect(registrationAnalyticsService.getRegistrantDetail(manager, "user-1")).rejects.toBeInstanceOf(
      ForbiddenError
    );
    expect(db.user.findUnique).not.toHaveBeenCalled();
    expect(db.auditLog.create).not.toHaveBeenCalled();
  });
});

describe("Registrant detail is for registrants only", () => {
  it("treats staff accounts, unknown ids, malformed ids and users without a profile as not found", async () => {
    signInAs(admin);
    db.user.findUnique.mockResolvedValueOnce(detailRow({ id: "staff-1", roles: [{ role: Role.CANDIDATE }, { role: Role.HR }] }));
    await expect(AdminRegistrantDetailPage({ params: Promise.resolve({ userId: "staff-1" }) })).rejects.toThrow(
      "NEXT_NOT_FOUND"
    );

    db.user.findUnique.mockResolvedValueOnce(null);
    await expect(registrationAnalyticsService.getRegistrantDetail(admin, "missing")).rejects.toBeInstanceOf(NotFoundError);

    db.user.findUnique.mockResolvedValueOnce(detailRow({ candidateProfile: null }));
    await expect(registrationAnalyticsService.getRegistrantDetail(admin, "no-profile")).rejects.toBeInstanceOf(
      NotFoundError
    );

    const callsBefore = db.user.findUnique.mock.calls.length;
    await expect(registrationAnalyticsService.getRegistrantDetail(admin, "../../etc/passwd")).rejects.toBeInstanceOf(
      NotFoundError
    );
    expect(db.user.findUnique.mock.calls.length).toBe(callsBefore);

    // Nothing was shown, so nothing was audited.
    expect(db.auditLog.create).not.toHaveBeenCalled();
  });

  it("selects and returns no passwords, sessions, tokens, OTP data or IP addresses", async () => {
    const detail = await registrationAnalyticsService.getRegistrantDetail(hr, "user-1");

    const args = db.user.findUnique.mock.calls[0][0];
    expect(args.where).toEqual({ id: "user-1" });
    expect(args).not.toHaveProperty("include");
    const selected = allKeys(args.select);
    for (const key of SECRET_KEYS) {
      expect(selected.has(key)).toBe(false);
    }
    expect(args.select.accounts).toEqual({ select: { providerId: true }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });

    const returned = allKeys(detail);
    for (const key of SECRET_KEYS) {
      expect(returned.has(key)).toBe(false);
    }
    expect(detail).toMatchObject({
      userId: "user-1",
      name: "Asha Rao",
      email: "asha@example.com",
      emailVerified: true,
      signedUpDate: "2026-10-21",
      signUpMethod: "Google",
      signInMethods: ["Google", "Email and password"],
      interest: "INTERNSHIP",
      phone: "+91 98765 43210",
      currentOrganization: null,
      // Blank organization is missing; the other seven profile fields are filled in.
      profileCompleteness: { completed: 7, total: 8 },
      stage: "CANDIDATE",
      applicationCount: 1,
    });
    expect(detail.applications[0]).toMatchObject({
      referenceCode: "GARA-2026-APP-0001",
      openingTitle: "Frontend Intern",
      statusLabel: "Screening",
      submittedDate: "2026-10-22",
    });
  });

  it("writes a VIEW_REGISTRANT audit entry for every detail read", async () => {
    await registrationAnalyticsService.getRegistrantDetail(hr, "user-1");
    expect(db.auditLog.create).toHaveBeenCalledTimes(1);
    expect(db.auditLog.create.mock.calls[0][0]).toEqual({
      data: {
        actorId: hr.id,
        actorRole: "HR",
        action: "VIEW_REGISTRANT",
        resourceType: "USER",
        resourceId: "user-1",
      },
    });
  });

  it("does not show the detail when the audit entry cannot be written", async () => {
    db.auditLog.create.mockRejectedValue(new Error("audit store unavailable"));
    await expect(registrationAnalyticsService.getRegistrantDetail(admin, "user-1")).rejects.toThrow(
      "audit store unavailable"
    );
  });
});

describe("Registrant detail page", () => {
  it("opens only https profile links, in a new tab without opener or referrer", async () => {
    signInAs(admin);
    render(await AdminRegistrantDetailPage({ params: Promise.resolve({ userId: "user-1" }) }));

    expect(screen.getByRole("heading", { name: "Asha Rao" })).toBeTruthy();
    const linkedin = screen.getByRole("link", { name: /LinkedIn: https:\/\/www\.linkedin\.com\/in\/asha-rao/ });
    expect(linkedin.getAttribute("href")).toBe("https://www.linkedin.com/in/asha-rao");
    expect(linkedin.getAttribute("target")).toBe("_blank");
    expect(linkedin.getAttribute("rel")).toBe("noopener noreferrer");

    // http and javascript: values are shown as text, never as links.
    expect(screen.getByText("http://github.com/asha")).toBeTruthy();
    expect(screen.getByText("javascript:alert(document.cookie)")).toBeTruthy();
    for (const link of screen.getAllByRole("link")) {
      const href = link.getAttribute("href") ?? "";
      expect(href.startsWith("javascript:")).toBe(false);
      expect(href.startsWith("http://")).toBe(false);
    }

    // ADMIN can open the staff application page.
    const reference = screen.getByRole("link", { name: "GARA-2026-APP-0001" });
    expect(reference.getAttribute("href")).toBe("/admin/applications/app-1");
    expect(screen.getByRole("link", { name: /All registrations/ }).getAttribute("href")).toBe("/admin/registrations");
    expect(screen.getByRole("meter", { name: "Profile completeness" }).getAttribute("aria-valuenow")).toBe("7");
    expect(db.auditLog.create).toHaveBeenCalledTimes(1);
  });

  it("does not link applications for HR without the applications module", async () => {
    db.subAdminPermission.findUnique.mockResolvedValue(permissionRow(hr.id, true, { canApplications: false }));
    signInAs(hr);
    render(await SubAdminRegistrantDetailPage({ params: Promise.resolve({ userId: "user-1" }) }));

    expect(screen.getByText("GARA-2026-APP-0001")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "GARA-2026-APP-0001" })).toBeNull();
    expect(screen.getByRole("link", { name: /All registrations/ }).getAttribute("href")).toBe("/subadmin/registrations");
  });

  it("validates link values strictly", () => {
    expect(safeHttpsUrl("https://example.com/me")).toBe("https://example.com/me");
    expect(safeHttpsUrl("  https://example.com/me  ")).toBe("https://example.com/me");
    expect(safeHttpsUrl("http://example.com")).toBeNull();
    expect(safeHttpsUrl("javascript:alert(1)")).toBeNull();
    expect(safeHttpsUrl("data:text/html,<script>alert(1)</script>")).toBeNull();
    expect(safeHttpsUrl("https://user:secret@example.com")).toBeNull();
    expect(safeHttpsUrl("www.example.com")).toBeNull();
    expect(safeHttpsUrl(null)).toBeNull();
    expect(signInMethodLabel("credential")).toBe("Email and password");
    expect(signInMethodLabel("google")).toBe("Google");
  });
});

describe("Registrant list rows link to the detail page", () => {
  it("links every name to /registrations/<userId> and keeps the filters in the page links", async () => {
    db.candidateProfile.findMany.mockResolvedValue([
      {
        id: "profile-1",
        userId: "user-1",
        careerInterest: null,
        user: {
          name: "Asha Rao",
          email: "asha@example.com",
          emailVerified: false,
          createdAt: new Date("2026-10-20T20:00:00.000Z"),
          roles: [{ role: Role.CANDIDATE }],
          employeeProfile: null,
          evaluationsAsIntern: [],
        },
        _count: { applications: 0 },
      },
    ]);
    db.candidateProfile.count.mockResolvedValue(60);

    render(
      await RegistrantDirectoryList({
        user: admin,
        params: { interest: "NOT_CHOSEN", emailVerified: "no", page: "" },
        listPath: "/admin/registrations",
      })
    );

    const table = screen.getByRole("table");
    const nameLink = within(table).getByRole("link", { name: "Asha Rao" });
    expect(nameLink.getAttribute("href")).toBe("/admin/registrations/user-1");
    expect(within(table).getByText("Not chosen")).toBeTruthy();
    const next = screen.getByRole("link", { name: "Next" });
    expect(next.getAttribute("href")).toBe("/admin/registrations?interest=NOT_CHOSEN&verified=no&page=2");
    expect(screen.getByText(/60 people match these filters/)).toBeTruthy();
  });
});
