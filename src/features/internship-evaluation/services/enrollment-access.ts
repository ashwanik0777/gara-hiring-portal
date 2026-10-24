import { Role, Prisma } from "@prisma/client";
import type { AuthenticatedUser } from "@/lib/auth/guards";
import { getUserPermissions, type SubAdminPermissions } from "@/lib/auth/permissions";
import { ConflictError, ForbiddenError } from "@/lib/errors";

/**
 * Record-level authorization for internship evaluation, task and certificate records.
 *
 * OD-001 limits evaluation actions to ADMIN, HR or the ASSIGNED supervisor. Every path
 * additionally requires the granular `canEvaluations` permission (ADMIN always holds it).
 *  - ADMIN / HR            → scope "ALL": any enrollment.
 *  - MENTOR / MANAGER /
 *    INTERVIEWER           → scope "ASSIGNED": only enrollments where supervisorId === user.id.
 */

/** Roles that may act on every enrollment (decision authority). */
export const EVALUATION_DECISION_ROLES: Role[] = [Role.ADMIN, Role.HR];

/** Roles that may act only on enrollments they supervise. */
export const EVALUATION_SUPERVISOR_ROLES: Role[] = [Role.MENTOR, Role.MANAGER, Role.INTERVIEWER];

/** Roles that may be assigned as an enrollment supervisor. */
export const SUPERVISOR_ELIGIBLE_ROLES: Role[] = [
  ...EVALUATION_DECISION_ROLES,
  ...EVALUATION_SUPERVISOR_ROLES,
];

export type EvaluationScope = "ALL" | "ASSIGNED";

export interface EvaluationAccess {
  scope: EvaluationScope;
  permissions: SubAdminPermissions;
}

type AccessUser = Pick<AuthenticatedUser, "id" | "roles">;

export function hasDecisionRole(user: AccessUser): boolean {
  return user.roles.some((r) => EVALUATION_DECISION_ROLES.includes(r));
}

/**
 * Resolves the evaluation scope of a user, or null when the user may not access
 * evaluation records as staff at all.
 */
export async function resolveEvaluationAccess(user: AccessUser): Promise<EvaluationAccess | null> {
  const isDecisionMaker = hasDecisionRole(user);
  const isSupervisorRole = user.roles.some((r) => EVALUATION_SUPERVISOR_ROLES.includes(r));
  if (!isDecisionMaker && !isSupervisorRole) {
    return null;
  }

  const permissions = await getUserPermissions(user.id, user.roles);
  if (!permissions.canEvaluations) {
    return null;
  }

  return { scope: isDecisionMaker ? "ALL" : "ASSIGNED", permissions };
}

/** Throws ForbiddenError unless the user may act on evaluation records as staff. */
export async function assertEvaluationAccess(user: AccessUser): Promise<EvaluationAccess> {
  const access = await resolveEvaluationAccess(user);
  if (!access) {
    throw new ForbiddenError("You do not have permission to manage internship evaluations.");
  }
  return access;
}

/** Throws ForbiddenError unless the user is ADMIN/HR with evaluation permission. */
export async function assertEvaluationDecisionAuthority(user: AccessUser): Promise<EvaluationAccess> {
  const access = await assertEvaluationAccess(user);
  if (access.scope !== "ALL") {
    throw new ForbiddenError("Administrative or HR authorization is required for this decision.");
  }
  return access;
}

/**
 * Record-level check: supervisors may only act on enrollments assigned to them, and nobody
 * may evaluate their own enrollment.
 */
export function assertEnrollmentInScope(
  access: EvaluationAccess,
  user: AccessUser,
  enrollment: { userId: string; supervisorId: string | null }
): void {
  if (enrollment.userId === user.id) {
    throw new ForbiddenError("You cannot review or decide on your own internship records.");
  }
  if (access.scope === "ASSIGNED" && enrollment.supervisorId !== user.id) {
    throw new ForbiddenError("You can only act on interns who are assigned to you.");
  }
}

/** Prisma filter limiting enrollment queries to the user's scope. */
export function enrollmentScopeWhere(
  access: EvaluationAccess,
  user: AccessUser
): Prisma.InternshipEnrollmentWhereInput {
  return access.scope === "ALL" ? {} : { supervisorId: user.id };
}

/** Returns the primary role label recorded in audit rows. */
export function primaryActorRole(user: AccessUser): string {
  const ordered: Role[] = [Role.ADMIN, Role.HR, Role.MANAGER, Role.MENTOR, Role.INTERVIEWER, Role.INTERN];
  return ordered.find((r) => user.roles.includes(r)) ?? user.roles[0] ?? "UNKNOWN";
}

/** True for a Prisma unique-constraint violation (detected structurally). */
export function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: unknown }).code === "P2002"
  );
}

/** Re-throws unique-constraint violations as a ConflictError with the given message. */
export function rethrowUniqueAsConflict(error: unknown, message: string): never {
  if (isUniqueConstraintError(error)) {
    throw new ConflictError(message);
  }
  throw error;
}
