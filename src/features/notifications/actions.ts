"use server";

import { getCurrentUser } from "@/lib/auth/guards";
import { buildNotificationsForUser } from "./services/notification-service";
import type { SystemNotification } from "./types";

/**
 * Server action to fetch platform notifications for the dashboard header, newest first.
 * Read and dismissed states are kept in the browser (per user), so this action never
 * reads or writes cookies: a cookie write from a Server Action re-renders the whole
 * current page.
 */
export async function getDashboardNotificationsAction(): Promise<SystemNotification[]> {
  try {
    const user = await getCurrentUser();
    if (!user || user.mustChangePassword) return [];

    const notifications = await buildNotificationsForUser(user);
    return notifications.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  } catch (error) {
    console.error(
      "[NotificationsAction] Failed to query notifications:",
      error instanceof Error ? error.message : String(error)
    );
    return [];
  }
}
