import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

type Db = Prisma.TransactionClient | typeof prisma;

export interface AutomationEmail {
  recipientEmail: string;
  templateName: string;
  payload: Prisma.InputJsonObject;
  /** Unique per recipient and occurrence, e.g. `STAFF_DAILY_DIGEST:2026-10-26:<userId>`. */
  dedupeKey: string;
}

/**
 * Queues automation emails at most once per dedupe key.
 *
 * Job handlers must be idempotent: a handler that crashes after queueing email but before
 * the runner marks the job done runs again. Each outbox row stores its key in the unique
 * `NotificationOutbox.dedupeKey` column and rows are inserted with `skipDuplicates`
 * (`ON CONFLICT DO NOTHING`), so the database itself guarantees a single copy even when
 * two runs overlap.
 */
export async function queueAutomationEmailsOnce(
  emails: readonly AutomationEmail[],
  options: { prefix: string; now: Date; db?: Db }
): Promise<{ queued: number; skipped: number }> {
  if (emails.length === 0) {
    return { queued: 0, skipped: 0 };
  }
  for (const email of emails) {
    if (!email.dedupeKey.startsWith(options.prefix)) {
      throw new Error(`Automation email dedupe key "${email.dedupeKey}" is outside prefix "${options.prefix}"`);
    }
  }

  const db = options.db ?? prisma;
  const result = await db.notificationOutbox.createMany({
    data: emails.map((email) => ({
      recipientEmail: email.recipientEmail,
      templateName: email.templateName,
      // Also kept in the payload so a delivered email can be traced back to its occurrence.
      payload: { ...email.payload, dedupeKey: email.dedupeKey },
      dedupeKey: email.dedupeKey,
      status: "PENDING",
    })),
    skipDuplicates: true,
  });

  return { queued: result.count, skipped: emails.length - result.count };
}
