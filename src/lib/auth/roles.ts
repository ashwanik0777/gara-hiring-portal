import { Role } from "@/types/enums";

/**
 * Standard list of sub-administrator roles.
 * Isolated from database modules so it can be safely imported in both Client and Server Components.
 */
export const SUB_ADMIN_ROLES: Role[] = [
  Role.HR,
  Role.MANAGER,
  Role.INTERVIEWER,
  Role.MENTOR,
];

export function isSubAdminRole(role: Role | string): boolean {
  return (SUB_ADMIN_ROLES as readonly (Role | string)[]).includes(role as Role);
}

export function hasSubAdminAccess(roles: (Role | string)[] = []): boolean {
  return roles.some((r) => isSubAdminRole(r));
}
