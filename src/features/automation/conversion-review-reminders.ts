import { ConversionReviewStatus, Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getUserPermissions } from "@/lib/auth/permissions";
import { JOB_TYPES } from "./job-types";
import { queueAutomationEmailsOnce, type AutomationEmail } from "./outbox-once";
import { CONVERSION_REVIEW_LEAD_DAYS, addDaysToKey, calendarDayKey, daysBetweenKeys, utcMidnight } from "./schedule";
import { staffPortalBase } from "./staff-recipients";

export type ConversionReviewReminderState = "UPCOMING" | "DUE" | "OVERDUE";

/** UPCOMING (within the lead time), DUE (today) or OVERDUE, from the review's calendar day. */
export function conversionReviewState(scheduledFor: Date, todayKey: string): ConversionReviewReminderState {
  const diff = daysBetweenKeys(todayKey, calendarDayKey(scheduledFor));
  if (diff < 0) return "OVERDUE";
  if (diff === 0) return "DUE";
  return "UPCOMING";
}

interface ReminderItem {
  reviewId: string;
  internUserId: string;
  internName: string;
  scheduledFor: string;
  state: ConversionReviewReminderState;
}

interface Recipient {
  id: string;
  name: string;
  email: string;
  href: string;
  items: Map<string, ReminderItem>;
}

/**
 * CONVERSION_REVIEW_REMINDERS_DAILY (09:00 business time): scheduled intern progress reviews
 * due within 7 days, due today or overdue. Recipients: administrators and HR users holding
 * `canEmployees` (all reviews), plus each intern's reporting manager when one is set (their
 * reports only). One CONVERSION_REVIEW_REMINDER per recipient; nobody is reminded about
 * their own review. Idempotent per day through per-recipient outbox dedupe keys.
 */
export async function runConversionReviewReminders(dateKey: string, now: Date): Promise<{ queued: number }> {
  const prefix = `${JOB_TYPES.CONVERSION_REVIEW_REMINDERS_DAILY}:${dateKey}:`;
  const horizon = utcMidnight(addDaysToKey(dateKey, CONVERSION_REVIEW_LEAD_DAYS + 1));

  const reviews = await prisma.conversionReview.findMany({
    where: { status: ConversionReviewStatus.SCHEDULED, scheduledFor: { lt: horizon } },
    select: {
      id: true,
      scheduledFor: true,
      employee: {
        select: {
          userId: true,
          user: { select: { name: true } },
          manager: { select: { user: { select: { id: true, name: true, email: true } } } },
        },
      },
    },
    orderBy: { scheduledFor: "asc" },
  });
  if (reviews.length === 0) {
    return { queued: 0 };
  }

  const items: ReminderItem[] = reviews.map((review) => ({
    reviewId: review.id,
    internUserId: review.employee.userId,
    internName: review.employee.user.name,
    scheduledFor: review.scheduledFor.toISOString(),
    state: conversionReviewState(review.scheduledFor, dateKey),
  }));

  const recipients = new Map<string, Recipient>();
  const addItem = (person: { id: string; name: string; email: string }, href: string, item: ReminderItem) => {
    if (person.id === item.internUserId) return;
    const recipient = recipients.get(person.id) ?? { ...person, href, items: new Map<string, ReminderItem>() };
    recipient.items.set(item.reviewId, item);
    recipients.set(person.id, recipient);
  };

  const hrAndAdmins = await prisma.user.findMany({
    where: { roles: { some: { role: { in: [Role.ADMIN, Role.HR] } } } },
    select: { id: true, name: true, email: true, roles: { select: { role: true } } },
  });
  for (const person of hrAndAdmins) {
    const roles = person.roles.map((r) => r.role);
    if (!roles.includes(Role.ADMIN)) {
      const permissions = await getUserPermissions(person.id, roles);
      if (!permissions.canEmployees) continue;
    }
    const href = `${staffPortalBase(roles)}/intern-reviews`;
    for (const item of items) addItem(person, href, item);
  }

  reviews.forEach((review, index) => {
    const manager = review.employee.manager?.user;
    if (manager) addItem(manager, "/dashboard", items[index]);
  });

  const emails: AutomationEmail[] = [...recipients.values()]
    .filter((recipient) => recipient.items.size > 0)
    .map((recipient) => ({
      recipientEmail: recipient.email,
      templateName: "CONVERSION_REVIEW_REMINDER",
      payload: {
        recipientName: recipient.name,
        items: [...recipient.items.values()].map((item) => ({
          internName: item.internName,
          scheduledFor: item.scheduledFor,
          state: item.state,
        })),
        href: recipient.href,
      },
      dedupeKey: `${prefix}${recipient.id}`,
    }));

  const result = await queueAutomationEmailsOnce(emails, { prefix, now });
  return { queued: result.queued };
}
