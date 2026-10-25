import { z } from "zod";
import { logger } from "@/lib/logging/logger";
import { businessDateKey } from "@/lib/time/business-time";
import { JOB_TYPES, type JobType } from "./job-types";

/**
 * When the recurring jobs run, in business time (product-owner decision 2026-10-25, round 3:
 * reminders at 09:00, staff digest at 09:30).
 */
export const DAILY_JOBS: ReadonlyArray<{ type: JobType; hour: number; minute: number }> = [
  { type: JOB_TYPES.CHECKPOINT_REMINDERS_DAILY, hour: 9, minute: 0 },
  { type: JOB_TYPES.CONVERSION_REVIEW_REMINDERS_DAILY, hour: 9, minute: 0 },
  { type: JOB_TYPES.STAFF_DAILY_DIGEST, hour: 9, minute: 30 },
];

/** Interview reminders go out 24 hours and 1 hour before the interview. */
export const INTERVIEW_REMINDER_LEADS = [
  { leadTime: "24h", offsetMs: 24 * 60 * 60 * 1000 },
  { leadTime: "1h", offsetMs: 60 * 60 * 1000 },
] as const;

export type InterviewReminderLeadTime = (typeof INTERVIEW_REMINDER_LEADS)[number]["leadTime"];

/** Agreed lead time for intern progress-review reminders ("due within 7 days"). */
export const CONVERSION_REVIEW_LEAD_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;
const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * `YYYY-MM-DD` of a calendar-day value. Calendar days (evaluation start dates, review dates,
 * effective dates, leave dates) are stored at UTC midnight, so the UTC date is the day itself.
 */
export function calendarDayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** UTC midnight of a `YYYY-MM-DD` key (the stored form of that calendar day). */
export function utcMidnight(dateKey: string): Date {
  return new Date(`${dateKey}T00:00:00.000Z`);
}

/** Adds whole calendar days to a `YYYY-MM-DD` key. */
export function addDaysToKey(dateKey: string, days: number): string {
  return calendarDayKey(new Date(utcMidnight(dateKey).getTime() + days * DAY_MS));
}

/** Whole days from `fromKey` to `toKey` (negative when `toKey` is earlier). */
export function daysBetweenKeys(fromKey: string, toKey: string): number {
  return Math.round((utcMidnight(toKey).getTime() - utcMidnight(fromKey).getTime()) / DAY_MS);
}

const DailyJobPayloadSchema = z.object({
  dateKey: z.string().regex(DATE_KEY_PATTERN),
});

/**
 * Business date a daily job was queued for, or null when the job should do nothing: a
 * malformed payload, or a run that slipped past its business day (e.g. the server was down).
 * A late run never sends yesterday's reminders; the next day's job covers the new day.
 */
export function readDailyJobDate(type: JobType, payload: unknown, now: Date): string | null {
  const parsed = DailyJobPayloadSchema.safeParse(payload);
  if (!parsed.success) {
    logger.warn("Daily automation job has an invalid payload; skipping", { type });
    return null;
  }
  const today = businessDateKey(now);
  if (parsed.data.dateKey !== today) {
    logger.info("Daily automation job ran outside its business day; skipping", {
      type,
      dateKey: parsed.data.dateKey,
      today,
    });
    return null;
  }
  return parsed.data.dateKey;
}
