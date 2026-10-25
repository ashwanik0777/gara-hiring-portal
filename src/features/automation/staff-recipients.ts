import { Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { AuthenticatedUser } from "@/lib/auth/guards";
import { STAFF_ROLES } from "@/lib/auth/permissions";

/** Staff portal root for links in staff emails and the Action Center. */
export function staffPortalBase(roles: readonly Role[]): "/admin" | "/subadmin" {
  return roles.includes(Role.ADMIN) ? "/admin" : "/subadmin";
}

/** True when the user holds any staff role (ADMIN, HR, MANAGER, INTERVIEWER, MENTOR). */
export function hasStaffRole(roles: readonly Role[]): boolean {
  return roles.some((role) => STAFF_ROLES.includes(role));
}

/** Every user with a staff role, shaped like a signed-in user for permission checks. */
export async function listStaffMembers(): Promise<AuthenticatedUser[]> {
  const users = await prisma.user.findMany({
    where: { roles: { some: { role: { in: STAFF_ROLES } } } },
    select: {
      id: true,
      name: true,
      email: true,
      mustChangePassword: true,
      roles: { select: { role: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  return users.map((user) => ({
    id: user.id,
    name: user.name,
    email: user.email,
    mustChangePassword: user.mustChangePassword,
    roles: user.roles.map((r) => r.role),
  }));
}
