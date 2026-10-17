import { headers } from "next/headers";
import { auth } from "./auth";
import { prisma } from "@/lib/db";
import { UnauthorizedError, ForbiddenError } from "@/lib/errors";
import { Role } from "@prisma/client";

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  roles: Role[];
  mustChangePassword?: boolean;
}

/**
 * Retrieves the current session from request headers.
 */
export async function getCurrentUser(): Promise<AuthenticatedUser | null> {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user) {
      return null;
    }

    // Fetch user details and roles from the database
    const dbUser = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        mustChangePassword: true,
        roles: {
          select: { role: true },
        },
      },
    });

    const roles = dbUser?.roles.map((r: { role: Role }) => r.role) || [];
    // If no roles are explicitly assigned, candidate is default
    if (roles.length === 0) {
      roles.push(Role.CANDIDATE);
    }

    return {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
      roles,
      mustChangePassword: dbUser?.mustChangePassword ?? false,
    };
  } catch {
    return null;
  }
}

/**
 * Server-side guard requiring an authenticated user.
 */
export async function requireAuth(): Promise<AuthenticatedUser> {
  const user = await getCurrentUser();
  if (!user) {
    throw new UnauthorizedError("You must be logged in to access this resource");
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
 * Server-side guard requiring that the current user owns the resource or is an Admin/HR.
 */
export async function requireOwnership(
  resourceOwnerId: string,
  allowedStaffRoles: Role[] = [Role.ADMIN, Role.HR]
): Promise<AuthenticatedUser> {
  const user = await requireAuth();
  const isOwner = user.id === resourceOwnerId;
  const isStaff = user.roles.some((r) => allowedStaffRoles.includes(r));

  if (!isOwner && !isStaff) {
    throw new ForbiddenError("You are not authorized to view or edit this resource");
  }
  return user;
}
