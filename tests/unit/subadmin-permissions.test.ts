import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getUserPermissions,
  ALL_ADMIN_PERMISSIONS,
  NO_PERMISSIONS,
  DEFAULT_HR_PERMISSIONS,
  DEFAULT_MANAGER_PERMISSIONS,
  DEFAULT_INTERVIEWER_PERMISSIONS,
  STAFF_ROLES,
  SUB_ADMIN_ROLES,
} from "@/lib/auth/permissions";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/db";

vi.mock("@/lib/db", () => ({
  prisma: {
    subAdminPermission: {
      findUnique: vi.fn(),
    },
    user: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
    userRole: {
      groupBy: vi.fn(),
    },
    $queryRaw: vi.fn(),
  },
}));

import { subAdminService, SUBADMIN_MAX_PAGE_SIZE } from "@/features/subadmins/services/subadmin-service";
import { ForbiddenError } from "@/lib/errors";
import type { AuthenticatedUser } from "@/lib/auth/guards";

const superAdmin: AuthenticatedUser = { id: "admin-1", email: "admin@gara.test", name: "Admin", roles: [Role.ADMIN] };
const hrStaff: AuthenticatedUser = { id: "hr-1", email: "hr@gara.test", name: "HR", roles: [Role.HR] };

function primeSubAdminList() {
  vi.mocked(prisma.user.findMany).mockResolvedValue([
    {
      id: "staff-1",
      name: "Priya",
      email: "priya@gara.test",
      createdAt: new Date("2026-01-01T00:00:00Z"),
      roles: [{ role: Role.HR }],
      subAdminPermission: null,
    },
  ] as never);
  vi.mocked(prisma.user.count).mockResolvedValue(1);
  vi.mocked(prisma.userRole.groupBy).mockResolvedValue([
    { role: Role.HR, _count: { _all: 1 } },
    { role: Role.MENTOR, _count: { _all: 2 } },
  ] as never);
  vi.mocked(prisma.$queryRaw).mockResolvedValue([{ count: 1 }] as never);
}

describe("SubAdmin RBAC & Granular Permission System", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Role Definitions & Constants", () => {
    it("STAFF_ROLES includes Super Admin and all Sub-Admin staff roles", () => {
      expect(STAFF_ROLES).toContain(Role.ADMIN);
      expect(STAFF_ROLES).toContain(Role.HR);
      expect(STAFF_ROLES).toContain(Role.MANAGER);
      expect(STAFF_ROLES).toContain(Role.INTERVIEWER);
      expect(STAFF_ROLES).toContain(Role.MENTOR);
      expect(STAFF_ROLES).not.toContain(Role.CANDIDATE);
    });

    it("SUB_ADMIN_ROLES strictly excludes Super Admin and Candidate", () => {
      expect(SUB_ADMIN_ROLES).toContain(Role.HR);
      expect(SUB_ADMIN_ROLES).toContain(Role.MANAGER);
      expect(SUB_ADMIN_ROLES).toContain(Role.INTERVIEWER);
      expect(SUB_ADMIN_ROLES).toContain(Role.MENTOR);
      expect(SUB_ADMIN_ROLES).not.toContain(Role.ADMIN);
      expect(SUB_ADMIN_ROLES).not.toContain(Role.CANDIDATE);
    });
  });

  describe("getUserPermissions", () => {
    it("Super Admin (ADMIN) gets unrestricted authority across all modules", async () => {
      const perms = await getUserPermissions("admin-1", [Role.ADMIN]);
      expect(perms).toEqual(ALL_ADMIN_PERMISSIONS);
      expect(perms.canApplications).toBe(true);
      expect(perms.canOpenings).toBe(true);
      expect(perms.canInterviews).toBe(true);
      expect(perms.canEvaluations).toBe(true);
      expect(perms.canEmployees).toBe(true);
      expect(perms.canAttendance).toBe(true);
      expect(perms.canLeave).toBe(true);
      expect(perms.canPayroll).toBe(true);
      expect(perms.canReports).toBe(true);
      expect(perms.canManageSubAdmins).toBe(true);
      // Prisma shouldn't even be called for Super Admin
      expect(prisma.subAdminPermission.findUnique).not.toHaveBeenCalled();
    });

    it("Candidate (CANDIDATE) gets zero permissions", async () => {
      const perms = await getUserPermissions("cand-1", [Role.CANDIDATE]);
      expect(perms).toEqual(NO_PERMISSIONS);
      expect(perms.canApplications).toBe(false);
      expect(perms.canManageSubAdmins).toBe(false);
      expect(prisma.subAdminPermission.findUnique).not.toHaveBeenCalled();
    });

    it("Sub-Admin with custom database permissions returns exact granted privileges", async () => {
      vi.mocked(prisma.subAdminPermission.findUnique).mockResolvedValueOnce({
        id: "perm-1",
        userId: "staff-1",
        canApplications: true,
        canOpenings: true,
        canInterviews: false,
        canEvaluations: false,
        canEmployees: true,
        canAttendance: false,
        canLeave: false,
        canPayroll: false,
        canReports: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const perms = await getUserPermissions("staff-1", [Role.HR]);
      expect(perms.canApplications).toBe(true);
      expect(perms.canOpenings).toBe(true);
      expect(perms.canInterviews).toBe(false);
      expect(perms.canEmployees).toBe(true);
      expect(perms.canReports).toBe(true);
      expect(perms.canManageSubAdmins).toBe(false); // Sub-admin can NEVER manage subadmins
    });

    it("Falls back to HR default preset when no custom DB permission exists", async () => {
      vi.mocked(prisma.subAdminPermission.findUnique).mockResolvedValueOnce(null);

      const perms = await getUserPermissions("hr-1", [Role.HR]);
      expect(perms).toEqual(DEFAULT_HR_PERMISSIONS);
      expect(perms.canApplications).toBe(true);
      expect(perms.canPayroll).toBe(false);
      expect(perms.canManageSubAdmins).toBe(false);
    });

    it("Falls back to Manager default preset when user is Manager", async () => {
      vi.mocked(prisma.subAdminPermission.findUnique).mockResolvedValueOnce(null);

      const perms = await getUserPermissions("mgr-1", [Role.MANAGER]);
      expect(perms).toEqual(DEFAULT_MANAGER_PERMISSIONS);
      expect(perms.canApplications).toBe(true);
      expect(perms.canOpenings).toBe(false);
    });

    it("Falls back to Interviewer default preset when user is Interviewer", async () => {
      vi.mocked(prisma.subAdminPermission.findUnique).mockResolvedValueOnce(null);

      const perms = await getUserPermissions("int-1", [Role.INTERVIEWER]);
      expect(perms).toEqual(DEFAULT_INTERVIEWER_PERMISSIONS);
      expect(perms.canApplications).toBe(true);
      expect(perms.canInterviews).toBe(true);
      expect(perms.canEmployees).toBe(false);
      expect(perms.canReports).toBe(false);
    });
  });
});

describe("Sub-admin directory list (bounded, Super Admin only)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("refuses everyone but ADMIN before any query runs", async () => {
    await expect(subAdminService.listSubAdmins(hrStaff)).rejects.toBeInstanceOf(ForbiddenError);
    expect(prisma.user.findMany).not.toHaveBeenCalled();
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it("loads one bounded page with an explicit select and counts from the database", async () => {
    primeSubAdminList();
    const list = await subAdminService.listSubAdmins(superAdmin, { page: 3, pageSize: 500, q: "pri" });

    const args = vi.mocked(prisma.user.findMany).mock.calls[0][0] as Record<string, unknown>;
    expect(args.take).toBe(SUBADMIN_MAX_PAGE_SIZE);
    expect(args.skip).toBe(2 * SUBADMIN_MAX_PAGE_SIZE);
    expect(args.include).toBeUndefined();
    expect(args.select).toBeDefined();
    expect(args.where).toMatchObject({ roles: { some: { role: { in: SUB_ADMIN_ROLES } } } });
    expect(JSON.stringify(args.where)).toContain("pri");
    expect(prisma.user.count).toHaveBeenCalledTimes(2);
    expect(prisma.userRole.groupBy).toHaveBeenCalledTimes(1);

    expect(list.items).toEqual([
      expect.objectContaining({ id: "staff-1", role: Role.HR, permissions: expect.objectContaining({ canPayroll: false }) }),
    ]);
    expect(list.page).toMatchObject({ page: 3, pageSize: SUBADMIN_MAX_PAGE_SIZE, total: 1 });
    expect(list.stats).toEqual({ total: 1, hrCount: 1, reviewerCount: 2, multiModuleCount: 1 });
    expect(list.search).toBe("pri");
  });

  it("never grants an account the sub-admin management permission through the list defaults", async () => {
    primeSubAdminList();
    const list = await subAdminService.listSubAdmins(superAdmin);
    expect(Object.keys(list.items[0].permissions)).not.toContain("canManageSubAdmins");
  });
});
