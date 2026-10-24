import { cache } from "react";
import { prisma } from "@/lib/db";
import { Role } from "@prisma/client";
import { SUB_ADMIN_ROLES } from "./roles";
export { SUB_ADMIN_ROLES };

export interface SubAdminPermissions {
  canApplications: boolean;
  canOpenings: boolean;
  canInterviews: boolean;
  canEvaluations: boolean;
  canEmployees: boolean;
  canAttendance: boolean;
  canLeave: boolean;
  canPayroll: boolean;
  canReports: boolean;
  canManageSubAdmins: boolean;
}

export type SubAdminPermissionKey = keyof SubAdminPermissions;

export const ALL_ADMIN_PERMISSIONS: SubAdminPermissions = {
  canApplications: true,
  canOpenings: true,
  canInterviews: true,
  canEvaluations: true,
  canEmployees: true,
  canAttendance: true,
  canLeave: true,
  canPayroll: true,
  canReports: true,
  canManageSubAdmins: true,
};

export const DEFAULT_HR_PERMISSIONS: SubAdminPermissions = {
  canApplications: true,
  canOpenings: true,
  canInterviews: true,
  canEvaluations: true,
  canEmployees: true,
  canAttendance: true,
  canLeave: true,
  canPayroll: false,
  canReports: true,
  canManageSubAdmins: false,
};

export const DEFAULT_MANAGER_PERMISSIONS: SubAdminPermissions = {
  canApplications: true,
  canOpenings: false,
  canInterviews: true,
  canEvaluations: true,
  canEmployees: true,
  canAttendance: true,
  canLeave: true,
  canPayroll: false,
  canReports: true,
  canManageSubAdmins: false,
};

export const DEFAULT_INTERVIEWER_PERMISSIONS: SubAdminPermissions = {
  canApplications: true,
  canOpenings: false,
  canInterviews: true,
  canEvaluations: true,
  canEmployees: false,
  canAttendance: false,
  canLeave: false,
  canPayroll: false,
  canReports: false,
  canManageSubAdmins: false,
};

export const DEFAULT_MENTOR_PERMISSIONS: SubAdminPermissions = {
  canApplications: false,
  canOpenings: false,
  canInterviews: false,
  canEvaluations: true,
  canEmployees: false,
  canAttendance: false,
  canLeave: false,
  canPayroll: false,
  canReports: false,
  canManageSubAdmins: false,
};

export const NO_PERMISSIONS: SubAdminPermissions = {
  canApplications: false,
  canOpenings: false,
  canInterviews: false,
  canEvaluations: false,
  canEmployees: false,
  canAttendance: false,
  canLeave: false,
  canPayroll: false,
  canReports: false,
  canManageSubAdmins: false,
};

export const STAFF_ROLES: Role[] = [
  Role.ADMIN,
  Role.HR,
  Role.MANAGER,
  Role.INTERVIEWER,
  Role.MENTOR,
];


/**
 * Resolves user permissions based on user role and granular database records.
 * Memoized per request (keyed by user and role set) so repeated authorization checks
 * during one render or action reuse a single database read.
 */
export async function getUserPermissions(
  userId: string,
  roles: Role[]
): Promise<SubAdminPermissions> {
  return resolvePermissions(userId, [...roles].sort().join(","));
}

const resolvePermissions = cache(async (
  userId: string,
  roleKey: string
): Promise<SubAdminPermissions> => {
  const roles = roleKey ? (roleKey.split(",") as Role[]) : [];

  // 1. Super Admin has unrestricted authority
  if (roles.includes(Role.ADMIN)) {
    return ALL_ADMIN_PERMISSIONS;
  }

  // 2. Candidate has zero staff permissions
  const isStaff = roles.some((r) => SUB_ADMIN_ROLES.includes(r));

  if (!isStaff) {
    return NO_PERMISSIONS;
  }

  // 3. Query customized database permissions. Errors propagate so a database
  // failure never silently grants the broader role defaults.
  const custom = await prisma.subAdminPermission.findUnique({
    where: { userId },
  });

  if (custom) {
    return {
      canApplications: custom.canApplications,
      canOpenings: custom.canOpenings,
      canInterviews: custom.canInterviews,
      canEvaluations: custom.canEvaluations,
      canEmployees: custom.canEmployees,
      canAttendance: custom.canAttendance,
      canLeave: custom.canLeave,
      canPayroll: custom.canPayroll,
      canReports: custom.canReports,
      canManageSubAdmins: false,
    };
  }

  // 4. Fallback to role-based baseline defaults
  if (roles.includes(Role.HR)) {
    return DEFAULT_HR_PERMISSIONS;
  }
  if (roles.includes(Role.MANAGER)) {
    return DEFAULT_MANAGER_PERMISSIONS;
  }
  if (roles.includes(Role.INTERVIEWER)) {
    return DEFAULT_INTERVIEWER_PERMISSIONS;
  }

  if (roles.includes(Role.MENTOR)) {
    return DEFAULT_MENTOR_PERMISSIONS;
  }

  return NO_PERMISSIONS;
});
