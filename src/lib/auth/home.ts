import { Role } from "@prisma/client";
import { SUB_ADMIN_ROLES } from "./roles";
import type { AuthenticatedUser } from "./guards";

/**
 * The portal a signed-in user lands on. Shared by the `/dashboard` hub and the
 * post-login redirect so sign-in goes straight to the right portal in one hop.
 */
export function getHomePathForUser(user: Pick<AuthenticatedUser, "roles" | "mustChangePassword">): string {
  if (user.mustChangePassword) {
    return "/set-password";
  }
  if (user.roles.includes(Role.ADMIN)) {
    return "/admin";
  }
  if (user.roles.some((r) => SUB_ADMIN_ROLES.includes(r))) {
    return "/subadmin";
  }
  return "/candidate/dashboard";
}
