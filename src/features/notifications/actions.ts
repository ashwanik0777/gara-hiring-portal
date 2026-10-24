"use server";

import { cookies } from "next/headers";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/guards";
import { buildNotificationsForUser } from "./services/notification-service";
import type { SystemNotification } from "./types";

/** Notification ids are generated server-side as `<kind>-<uuid>`. */
const NotificationIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .regex(/^[a-z]+-[A-Za-z0-9-]+$/, "Invalid notification id");
const NotificationIdListSchema = z.array(NotificationIdSchema).max(100);

/** Upper bound of ids kept per cookie so it stays well below browser cookie limits. */
const MAX_STORED_IDS = 100;

const COOKIE_OPTIONS = {
  path: "/",
  maxAge: 365 * 24 * 3600, // 1 year
  sameSite: "lax" as const,
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
};

function parseIdsCookie(value?: string): Set<string> {
  if (!value) return new Set();
  try {
    const parsed = NotificationIdListSchema.safeParse(JSON.parse(value));
    return parsed.success ? new Set(parsed.data) : new Set();
  } catch {
    return new Set();
  }
}

/**
 * Server action to fetch platform notifications for the dashboard header.
 * Persistently respects read & dismissed states per authenticated user.
 */
export async function getDashboardNotificationsAction(): Promise<SystemNotification[]> {
  try {
    const user = await getCurrentUser();
    if (!user || user.mustChangePassword) return [];

    const cookieStore = await cookies();
    const readSet = parseIdsCookie(cookieStore.get(`gara_notifications_read_${user.id}`)?.value);
    const dismissedSet = parseIdsCookie(
      cookieStore.get(`gara_notifications_dismissed_${user.id}`)?.value
    );

    const notifications = await buildNotificationsForUser(user);

    return notifications
      .filter((n) => !dismissedSet.has(n.id))
      .map((n) => ({ ...n, read: readSet.has(n.id) }))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  } catch (error) {
    console.error(
      "[NotificationsAction] Failed to query notifications:",
      error instanceof Error ? error.message : String(error)
    );
    return [];
  }
}

async function appendIdsToCookie(kind: "read" | "dismissed", newIds: string[]): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;
  const cookieStore = await cookies();
  const key = `gara_notifications_${kind}_${user.id}`;
  const ids = Array.from(parseIdsCookie(cookieStore.get(key)?.value));
  for (const id of newIds) {
    if (!ids.includes(id)) {
      ids.push(id);
    }
  }
  cookieStore.set(key, JSON.stringify(ids.slice(-MAX_STORED_IDS)), COOKIE_OPTIONS);
}

/**
 * Server action to mark a single notification as read persistently.
 */
export async function markNotificationAsReadAction(notificationId: unknown): Promise<void> {
  try {
    const parsed = NotificationIdSchema.safeParse(notificationId);
    if (!parsed.success) return;
    await appendIdsToCookie("read", [parsed.data]);
  } catch (err) {
    console.error(
      "[markNotificationAsReadAction] Error persisting read status:",
      err instanceof Error ? err.message : String(err)
    );
  }
}

/**
 * Server action to mark all notifications as read persistently.
 */
export async function markAllNotificationsAsReadAction(notificationIds: unknown): Promise<void> {
  try {
    const parsed = NotificationIdListSchema.safeParse(notificationIds);
    if (!parsed.success) return;
    await appendIdsToCookie("read", parsed.data);
  } catch (err) {
    console.error(
      "[markAllNotificationsAsReadAction] Error persisting read status:",
      err instanceof Error ? err.message : String(err)
    );
  }
}

/**
 * Server action to dismiss a notification so it never shows up again.
 */
export async function dismissNotificationAction(notificationId: unknown): Promise<void> {
  try {
    const parsed = NotificationIdSchema.safeParse(notificationId);
    if (!parsed.success) return;
    await appendIdsToCookie("dismissed", [parsed.data]);
  } catch (err) {
    console.error(
      "[dismissNotificationAction] Error persisting dismiss status:",
      err instanceof Error ? err.message : String(err)
    );
  }
}
