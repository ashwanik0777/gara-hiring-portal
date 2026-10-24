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

