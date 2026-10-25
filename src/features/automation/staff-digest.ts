import { BUSINESS_TIME_ZONE, atBusinessTime } from "@/lib/time/business-time";
import { getActionCenter } from "./services/action-center-service";
import { JOB_TYPES } from "./job-types";
import { queueAutomationEmailsOnce, type AutomationEmail } from "./outbox-once";
import { listStaffMembers } from "./staff-recipients";

/** "Monday, 26 October 2026" for a business date key. */
export function digestDateLabel(dateKey: string): string {
  return atBusinessTime(dateKey, 12).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: BUSINESS_TIME_ZONE,
  });
}

/**
 * STAFF_DAILY_DIGEST (09:30 business time): one email per staff member (ADMIN, HR, MANAGER,
 * INTERVIEWER, MENTOR) listing the Action Center sections with pending items. The Action
 * Center applies each person's own role and permissions; people with nothing pending get
 * no email. If any section cannot be loaded the job fails and retries, so nobody receives an
 * incomplete digest; per-recipient outbox dedupe keys keep a retried day from double-sending.
 */
export async function runStaffDailyDigest(dateKey: string, now: Date): Promise<{ queued: number }> {
  const prefix = `${JOB_TYPES.STAFF_DAILY_DIGEST}:${dateKey}:`;
  const dateLabel = digestDateLabel(dateKey);
  const emails: AutomationEmail[] = [];

  for (const member of await listStaffMembers()) {
    const center = await getActionCenter(member, { now, includeItems: false });
    const unavailable = center.sections.filter((section) => section.status === "unavailable");
    if (unavailable.length > 0) {
      throw new Error(`Daily digest data unavailable (${unavailable.map((section) => section.key).join(", ")})`);
    }
    const sections = center.sections.flatMap((section) =>
      section.status === "ok" && section.count > 0
        ? [{ title: section.title, count: section.count, href: section.href }]
        : []
    );
    if (sections.length === 0) continue;
    emails.push({
      recipientEmail: member.email,
      templateName: "STAFF_DAILY_DIGEST",
      payload: { recipientName: member.name, dateLabel, sections },
      dedupeKey: `${prefix}${member.id}`,
    });
  }

  const result = await queueAutomationEmailsOnce(emails, { prefix, now });
  return { queued: result.queued };
}
