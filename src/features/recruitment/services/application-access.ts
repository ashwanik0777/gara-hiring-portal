import { Prisma, Role } from "@prisma/client";
import type { AuthenticatedUser } from "@/lib/auth/guards";
import { ForbiddenError } from "@/lib/errors";

/** Staff roles that may use the recruitment workspace (subject to granular permissions). */
export const RECRUITMENT_STAFF_ROLES: Role[] = [Role.ADMIN, Role.HR, Role.INTERVIEWER, Role.MANAGER];

/**
 * Roles with pipeline-wide application visibility. MANAGER keeps its current visibility
 * until the OD-019 permission matrix decides how managers are scoped.
 */
const PIPELINE_WIDE_ROLES: Role[] = [Role.ADMIN, Role.HR, Role.MANAGER];

export const OWN_APPLICATION_ACTION_MESSAGE = "You cannot act on your own application.";
export const OWN_APPLICATION_VIEW_MESSAGE =
  "You cannot open your own application in the staff workspace. Use the candidate portal instead.";
export const UNASSIGNED_APPLICATION_MESSAGE =
  "You can only open applications you are assigned to interview or manage.";

/**
 * True for users whose only recruitment role is INTERVIEWER. docs/SECURITY.md
 * ("Record-Level Access Examples") limits them to applications they are assigned to and
 * to their own interview feedback.
 */
export function isInterviewerScoped(user: AuthenticatedUser): boolean {
  return (
    user.roles.includes(Role.INTERVIEWER) &&
    !user.roles.some((role) => PIPELINE_WIDE_ROLES.includes(role))
  );
}

/** Applications an interviewer-scoped user is assigned to (interviewer on a round, or recruiter). */
export function interviewerApplicationScope(userId: string): Prisma.ApplicationWhereInput {
  return {
    OR: [
      { assignedRecruiterId: userId },
      { interviewSchedules: { some: { interviewerId: userId } } },
    ],
  };
}

/**
 * Record filter for every staff listing of applications: staff never see their own
 * application in the staff workspace, and interviewer-scoped users only see assigned ones.
 */
export function staffApplicationVisibility(user: AuthenticatedUser): Prisma.ApplicationWhereInput {
  const conditions: Prisma.ApplicationWhereInput[] = [{ candidate: { userId: { not: user.id } } }];
  if (isInterviewerScoped(user)) {
    conditions.push(interviewerApplicationScope(user.id));
  }
  return { AND: conditions };
}

/** In-memory equivalent of `interviewerApplicationScope` for an already loaded application. */
export function isAssignedToApplication(
  userId: string,
  application: {
    assignedRecruiterId: string | null;
    interviewerIds: ReadonlyArray<string | null>;
  }
): boolean {
  return (
    application.assignedRecruiterId === userId ||
    application.interviewerIds.some((interviewerId) => interviewerId === userId)
  );
}

/**
 * Separation of duties: a staff member may never perform recruitment, offer or hiring
 * actions on an application they submitted themselves.
 */
export function assertNotOwnApplication(actor: AuthenticatedUser, candidateUserId: string): void {
  if (candidateUserId === actor.id) {
    throw new ForbiddenError(OWN_APPLICATION_ACTION_MESSAGE);
  }
}
