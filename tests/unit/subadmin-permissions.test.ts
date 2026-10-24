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
  },
}));

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
