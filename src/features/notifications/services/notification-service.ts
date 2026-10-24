import { Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { AuthenticatedUser } from "@/lib/auth/guards";
import {
  getUserPermissions,
  SUB_ADMIN_ROLES,
  type SubAdminPermissions,
} from "@/lib/auth/permissions";
import type { SystemNotification } from "../types";

/** Offer statuses a candidate may see (draft/revoked offers stay internal). */
const CANDIDATE_VISIBLE_OFFER_STATUSES = ["EXTENDED", "ACCEPTED", "DECLINED", "EXPIRED"] as const;

function formatStatus(status: string): string {
  return status.replace(/_/g, " ").toLowerCase();
}

/**
 * Candidate-scoped events: only the signed-in user's own applications,
 * interviews and offers. Never includes other users' names or data.
 */
async function buildOwnNotifications(user: AuthenticatedUser): Promise<SystemNotification[]> {
  const notifications: SystemNotification[] = [];

  const [ownApplications, ownInterviews, ownOffers] = await Promise.all([
    prisma.application
      .findMany({
        where: { candidate: { userId: user.id } },
        take: 3,
        orderBy: { updatedAt: "desc" },
        select: {
          id: true,
          status: true,
          updatedAt: true,
          opening: { select: { title: true } },
        },
      })
      .catch(() => []),
    prisma.interviewSchedule
      .findMany({
        where: {
          status: "SCHEDULED",
          application: { candidate: { userId: user.id } },
        },
        take: 3,
        orderBy: { scheduledAt: "asc" },
        select: {
          id: true,
          roundName: true,
          scheduledAt: true,
          applicationId: true,
          application: { select: { opening: { select: { title: true } } } },
        },
      })
      .catch(() => []),
    prisma.jobOffer
      .findMany({
        where: {
          status: { in: [...CANDIDATE_VISIBLE_OFFER_STATUSES] },
          application: { candidate: { userId: user.id } },
        },
        take: 3,
        orderBy: { updatedAt: "desc" },
        select: {
          id: true,
          status: true,
          updatedAt: true,
          applicationId: true,
          application: { select: { opening: { select: { title: true } } } },
        },
      })
      .catch(() => []),
  ]);

  for (const app of ownApplications) {
    notifications.push({
      id: `ownapp-${app.id}`,
      title: "Application Update",
      message: `Your application for ${app.opening?.title || "a role"} is ${formatStatus(app.status)}.`,
      type: "application",
      link: `/candidate/applications/${app.id}`,
      createdAt: app.updatedAt.toISOString(),
      read: false,
    });
  }

  for (const interview of ownInterviews) {
    notifications.push({
      id: `owninterview-${interview.id}`,
      title: "Interview Scheduled",
      message: `${interview.roundName} for ${interview.application?.opening?.title || "your application"}`,
      type: "interview",
      link: `/candidate/applications/${interview.applicationId}`,
      createdAt: interview.scheduledAt.toISOString(),
      read: false,
    });
  }

  for (const offer of ownOffers) {
    notifications.push({
      id: `ownoffer-${offer.id}`,
      title: "Offer Update",
      message: `Offer for ${offer.application?.opening?.title || "your application"}: ${formatStatus(offer.status)}.`,
      type: "application",
      link: `/candidate/applications/${offer.applicationId}`,
      createdAt: offer.updatedAt.toISOString(),
      read: false,
    });
  }

  return notifications;
}

/**
 * Staff-scoped events: only modules the user holds a granular permission for.
 * Leave notifications never include the leave reason.
 */
async function buildStaffNotifications(
  permissions: SubAdminPermissions,
  basePath: "/admin" | "/subadmin"
): Promise<SystemNotification[]> {
  const notifications: SystemNotification[] = [];

  const [recentApps, pendingLeaves, upcomingInterviews] = await Promise.all([
    permissions.canApplications
      ? prisma.application
          .findMany({
            take: 4,
            orderBy: { createdAt: "desc" },
            select: {
              id: true,
              createdAt: true,
              opening: { select: { title: true } },
              candidate: { select: { user: { select: { name: true } } } },
            },
          })
          .catch(() => [])
      : Promise.resolve([]),
    permissions.canLeave
      ? prisma.leaveRequest
          .findMany({
            where: { status: "PENDING" },
            take: 3,
            orderBy: { createdAt: "desc" },
            select: {
              id: true,
              createdAt: true,
              employee: { select: { user: { select: { name: true } } } },
              leaveType: { select: { name: true } },
            },
          })
          .catch(() => [])
      : Promise.resolve([]),
    permissions.canInterviews
      ? prisma.interviewSchedule
          .findMany({
            where: { status: "SCHEDULED" },
            take: 3,
            orderBy: { scheduledAt: "asc" },
            select: {
              id: true,
              roundName: true,
              scheduledAt: true,
              application: {
                select: { candidate: { select: { user: { select: { name: true } } } } },
              },
            },
          })
          .catch(() => [])
      : Promise.resolve([]),
  ]);

  for (const app of recentApps) {
    notifications.push({
      id: `app-${app.id}`,
      title: "New Application Received",
      message: `${app.candidate?.user?.name || "Candidate"} applied for ${app.opening?.title || "Role"}`,
      type: "application",
      link: `${basePath}/applications`,
      createdAt: app.createdAt.toISOString(),
      read: false,
    });
  }

  for (const leave of pendingLeaves) {
    notifications.push({
      id: `leave-${leave.id}`,
      title: "Pending Leave Request",
      message: `${leave.employee?.user?.name || "Staff member"} requested ${leave.leaveType?.name || "leave"}`,
      type: "leave",
      link: `${basePath}/leave`,
      createdAt: leave.createdAt.toISOString(),
      read: false,
    });
  }

  for (const interview of upcomingInterviews) {
    notifications.push({
      id: `interview-${interview.id}`,
      title: "Interview Round Scheduled",
      message: `${interview.roundName} with ${interview.application?.candidate?.user?.name || "Candidate"}`,
      type: "interview",
      link: `${basePath}/interviews`,
      createdAt: interview.scheduledAt.toISOString(),
      read: false,
    });
  }

  return notifications;
}

/**
 * Builds the notification list for a user, scoped by role and granular permission:
 * - ADMIN / sub-admin staff: only modules they hold a permission for.
 * - Everyone else (candidates, interns, employees): only their own events.
 * Not a Server Action: callers must pass the authenticated session user.
 */
export async function buildNotificationsForUser(
  user: AuthenticatedUser
): Promise<SystemNotification[]> {
  const isAdmin = user.roles.includes(Role.ADMIN);
  const isSubAdmin = user.roles.some((r) => SUB_ADMIN_ROLES.includes(r));

  if (!isAdmin && !isSubAdmin) {
    return buildOwnNotifications(user);
  }

  const permissions = await getUserPermissions(user.id, user.roles);
  return buildStaffNotifications(permissions, isAdmin ? "/admin" : "/subadmin");
}
