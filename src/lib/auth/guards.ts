import { cache } from "react";
import { headers } from "next/headers";
import { auth } from "./auth";
import { prisma } from "@/lib/db";
import { UnauthorizedError, ForbiddenError } from "@/lib/errors";
import { Role } from "@prisma/client";
import {
  getUserPermissions,
  type SubAdminPermissionKey,
  type SubAdminPermissions,
} from "./permissions";

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  roles: Role[];
  mustChangePassword?: boolean;
}

export interface RequireAuthOptions {
  /**
   * Allows users who still hold a temporary password. Only the set-password
   * flow should pass this; every other boundary rejects such sessions.
   */
  allowPendingPasswordChange?: boolean;
}

interface SessionAccessRow {
  mustChangePassword: boolean;
  roles: Role[];
}

/**
 * Loads the temporary-password flag and the assigned roles (in assignment order) in one
 * parameterised statement. A `user.findUnique` that selects the roles relation costs two
 * round trips because Prisma's relationJoins is not enabled. Roles are cast to text so
 * the driver returns a plain string array; no row means the user no longer exists.
 */
async function loadSessionAccess(userId: string): Promise<SessionAccessRow | null> {
  const rows = await prisma.$queryRaw<SessionAccessRow[]>`
    SELECT u."mustChangePassword" AS "mustChangePassword",
           ARRAY(
             SELECT ur."role"::text
             FROM "user_roles" ur
             WHERE ur."userId" = u."id"
             ORDER BY ur."assignedAt", ur."id"
           ) AS "roles"
    FROM "users" u
    WHERE u."id" = ${userId}
  `;
  return rows[0] ?? null;
}

/**
 * Retrieves the current session from request headers.
 * Memoized per request with React `cache()`: layouts, pages and services that each
 * ask for the user share one session lookup instead of repeating the database reads.
 */
export const getCurrentUser = cache(async (): Promise<AuthenticatedUser | null> => {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user) {
      return null;
    }

    const dbUser = await loadSessionAccess(session.user.id);
    if (!dbUser) {
      return null;
    }

    const roles = [...dbUser.roles];
    // If no roles are explicitly assigned, candidate is default
    if (roles.length === 0) {
      roles.push(Role.CANDIDATE);
    }

    return {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
      roles,
      mustChangePassword: dbUser.mustChangePassword,
    };
  } catch {
    return null;
  }
});

/**
 * Server-side guard requiring an authenticated user.
 * Sessions that still use a temporary password are rejected unless explicitly allowed.
 */
export async function requireAuth(
  options: RequireAuthOptions = {}
): Promise<AuthenticatedUser> {
  const user = await getCurrentUser();
  if (!user) {
    throw new UnauthorizedError("You must be logged in to access this resource");
  }
  if (user.mustChangePassword && !options.allowPendingPasswordChange) {
    throw new ForbiddenError(
      "Please set a permanent password before continuing."
    );
  }
  return user;
}

/**
 * Server-side guard requiring one of the specified roles.
 */
export async function requireRole(allowedRoles: Role[]): Promise<AuthenticatedUser> {
  const user = await requireAuth();
  const hasRole = user.roles.some((r) => allowedRoles.includes(r));
  if (!hasRole && !user.roles.includes(Role.ADMIN)) {
    throw new ForbiddenError(
      `Access restricted. Requires one of the following roles: ${allowedRoles.join(", ")}`
    );
  }
  return user;
}

/**
 * Returns true when the user holds the given granular module permission.
 * ADMIN always passes; staff roles are resolved through SubAdminPermission
 * records (or role defaults when no record exists); everyone else fails.
 */
export async function hasPermission(
  user: AuthenticatedUser,
  permission: SubAdminPermissionKey
): Promise<boolean> {
  const permissions = await getUserPermissions(user.id, user.roles);
  return permissions[permission];
}

/**
 * Throws ForbiddenError unless the given user holds the granular module permission.
 * Use inside services that already received an AuthenticatedUser.
 */
export async function assertPermission(
  user: AuthenticatedUser,
  permission: SubAdminPermissionKey,
  options: { roles?: Role[] } = {}
): Promise<SubAdminPermissions> {
  if (options.roles && !user.roles.includes(Role.ADMIN)) {
    const hasRole = user.roles.some((r) => options.roles?.includes(r));
    if (!hasRole) {
      throw new ForbiddenError("Your role is not permitted to perform this action.");
    }
  }
  const permissions = await getUserPermissions(user.id, user.roles);
  if (!permissions[permission]) {
    throw new ForbiddenError("You do not have permission to access this module.");
  }
  return permissions;
}

/**
 * Server-side guard for staff boundaries: authenticates the session, rejects
 * temporary-password sessions, optionally restricts roles, and requires the
 * granular module permission.
 */
export async function requirePermission(
  permission: SubAdminPermissionKey,
  options: { roles?: Role[] } = {}
): Promise<AuthenticatedUser> {
  const user = await requireAuth();
  await assertPermission(user, permission, options);
  return user;
}
