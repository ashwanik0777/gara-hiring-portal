import { Role } from "@prisma/client";

/** Roles that may run payroll; staff also need the `canPayroll` permission (ADMIN always holds it). */
export const PAYROLL_STAFF_ROLES: Role[] = [Role.ADMIN, Role.HR];
