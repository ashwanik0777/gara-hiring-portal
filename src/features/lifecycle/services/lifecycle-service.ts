import { cache } from "react";
import { redirect } from "next/navigation";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getCurrentUser, type AuthenticatedUser } from "@/lib/auth/guards";
import { getHomePathForUser } from "@/lib/auth/home";
import { STAFF_ROLES } from "@/lib/auth/permissions";
import type { CareerInterest, EmployeeStatus, EmploymentType, EvaluationStatus } from "@/types/enums";
import {
  capabilitiesForStage,
  determineLifecycleStage,
  isApplicationsReadOnly,
  STAGE_HOME_PATHS,
  STAGE_LABELS,
  STAGE_UNLOCKED_FEATURES,
  UPGRADE_ANNOUNCEMENT_MS,
} from "../capabilities";
import type { LifecycleState, PortalCapability } from "../types";

/** True for administrators and sub-admin staff, who use the staff portals instead. */
export function isStaffUser(user: Pick<AuthenticatedUser, "roles">): boolean {
  return user.roles.some((role) => STAFF_ROLES.includes(role));
}

/**
 * Resolves where a user is in the hiring-to-employment lifecycle. Memoized per request,
 * so the portal shell, the page and its guards share one set of reads.
 */
export const getLifecycleState = cache(async (userId: string, roleKey: string): Promise<LifecycleState> => {
  const roles = roleKey ? roleKey.split(",") : [];
  const [profile, enrollment, employee, upgradeRoles] = await Promise.all([
    prisma.candidateProfile.findUnique({
      where: { userId },
      select: { careerInterest: true },
    }),
    prisma.internshipEnrollment.findFirst({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        status: true,
        startDate: true,
        endDate: true,
        createdAt: true,
        application: { select: { status: true, opening: { select: { title: true } } } },
      },
    }),
    prisma.employee.findUnique({
      where: { userId },
      select: {
        id: true,
        employeeCode: true,
        status: true,
        employmentType: true,
        designation: true,
        department: true,
        joiningDate: true,
      },
    }),
    prisma.userRole.findMany({
      where: { userId, role: { in: [Role.INTERN, Role.EMPLOYEE] } },
      select: { role: true, assignedAt: true },
    }),
  ]);

  // An enrollment whose application already led to joining (HIRED) is history.
  const activeEnrollment = enrollment && enrollment.application.status !== "HIRED" ? enrollment : null;
  const stage = determineLifecycleStage({
    roles,
    enrollmentStatus: (activeEnrollment?.status as EvaluationStatus | undefined) ?? null,
    employeeStatus: (employee?.status as EmployeeStatus | undefined) ?? null,
  });

  const upgradeRole = stage === "EMPLOYEE" ? Role.EMPLOYEE : stage === "INTERN" ? Role.INTERN : null;
  const upgradedAt =
    stage === "EVALUATION"
      ? enrollment?.createdAt ?? null
      : upgradeRole
        ? upgradeRoles.find((r) => r.role === upgradeRole)?.assignedAt ?? null
        : null;

  return {
    stage,
    capabilities: capabilitiesForStage(stage),
    applicationsReadOnly: isApplicationsReadOnly(stage),
    careerInterest: (profile?.careerInterest as CareerInterest | null | undefined) ?? null,
    enrollment: enrollment
      ? {
          id: enrollment.id,
          status: enrollment.status as EvaluationStatus,
          openingTitle: enrollment.application.opening.title,
          startDate: enrollment.startDate?.toISOString() ?? null,
          endDate: enrollment.endDate?.toISOString() ?? null,
        }
      : null,
    employment: employee
      ? {
          id: employee.id,
          employeeCode: employee.employeeCode,
          status: employee.status as EmployeeStatus,
          employmentType: (employee.employmentType as EmploymentType | null) ?? null,
          designation: employee.designation,
          department: employee.department,
          joiningDate: employee.joiningDate.toISOString(),
        }
      : null,
    upgradedAt: upgradedAt?.toISOString() ?? null,
    // Evaluated once per request while loading data, so rendering stays pure.
    recentlyUpgraded:
      Boolean(STAGE_UNLOCKED_FEATURES[stage] && upgradedAt) &&
      Date.now() - (upgradedAt as Date).getTime() < UPGRADE_ANNOUNCEMENT_MS,
    homePath: STAGE_HOME_PATHS[stage],
  };
});

/** Lifecycle state for an already-resolved user. */
export function getLifecycleForUser(user: AuthenticatedUser): Promise<LifecycleState> {
  return getLifecycleState(user.id, [...user.roles].sort().join(","));
}

/**
 * The page a signed-in user should land on: staff portals for staff, otherwise the
 * home of the user's lifecycle stage (or the forced password change).
 */
export async function resolveHomePath(user: AuthenticatedUser): Promise<string> {
  if (user.mustChangePassword || isStaffUser(user)) {
    return getHomePathForUser(user);
  }
  return (await getLifecycleForUser(user)).homePath;
}

/**
 * Page guard for self-service pages. Redirects anonymous users to sign in, staff to
 * their portal, and users whose stage does not include the capability to their home.
 * Server actions must still authorize themselves.
 */
export async function requirePortalCapability(
  capability: PortalCapability,
  options: { callbackPath: string }
): Promise<{ user: AuthenticatedUser; lifecycle: LifecycleState }> {
  const user = await getCurrentUser();
  if (!user) {
    redirect(`/login?callbackUrl=${encodeURIComponent(options.callbackPath)}`);
  }
  if (user.mustChangePassword || isStaffUser(user)) {
    redirect(getHomePathForUser(user));
  }
  const lifecycle = await getLifecycleForUser(user);
  if (!lifecycle.capabilities.includes(capability)) {
    redirect(lifecycle.homePath);
  }
  return { user, lifecycle };
}

/**
 * Why this account may not submit a new application, or null when it may.
 * Product-owner decision (2026-10-25): after joining, candidate features are hidden,
 * so interns, employees and staff cannot apply. Used by the apply page and enforced
 * again inside the submit action.
 */
export async function getApplyBlockedReason(user: AuthenticatedUser): Promise<string | null> {
  if (isStaffUser(user)) {
    return "Staff accounts cannot apply to openings.";
  }
  const lifecycle = await getLifecycleForUser(user);
  if (lifecycle.capabilities.includes("applyToOpenings")) {
    return null;
  }
  return `You are part of GARA Innovation as ${lifecycle.stage === "INTERN" ? "an" : "a"} ${STAGE_LABELS[lifecycle.stage].toLowerCase()}, so new applications are not available from this account.`;
}
