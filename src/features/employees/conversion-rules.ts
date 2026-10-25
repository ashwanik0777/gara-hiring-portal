import { addMonths, businessDateKey } from "@/lib/time/business-time";

/*
 * Client-safe constants and pure helpers for employment periods and the intern progress
 * review (product-owner decisions of 2026-10-25, round 3). No database or server-only
 * imports: dialogs, the review board and the services share the same rules.
 */

/** The progress review takes place 3 or 6 months after joining (or after an extension). */
export const REVIEW_PERIOD_MONTHS = [3, 6] as const;
export type ReviewPeriodMonths = (typeof REVIEW_PERIOD_MONTHS)[number];

export function isReviewPeriodMonths(value: unknown): value is ReviewPeriodMonths {
  return value === 3 || value === 6;
}

export const REVIEW_OUTCOMES = ["CONVERT", "EXTEND", "END_INTERNSHIP"] as const;
export type ReviewOutcome = (typeof REVIEW_OUTCOMES)[number];

export const REVIEW_OUTCOME_LABELS: Record<ReviewOutcome, string> = {
  CONVERT: "Offer full-time role",
  EXTEND: "Extend internship",
  END_INTERNSHIP: "End internship",
};

export type ConversionOfferState = "PENDING" | "ACCEPTED" | "DECLINED" | "WITHDRAWN";

export const CONVERSION_OFFER_LABELS: Record<ConversionOfferState, string> = {
  PENDING: "Awaiting the intern's answer",
  ACCEPTED: "Accepted",
  DECLINED: "Declined",
  WITHDRAWN: "Withdrawn",
};

export type PeriodStartReason = "JOINED" | "REJOINED" | "CONVERTED";
export type PeriodEndReason = "EXITED" | "CONVERTED";

export const PERIOD_START_LABELS: Record<PeriodStartReason, string> = {
  JOINED: "Joined",
  REJOINED: "Re-joined",
  CONVERTED: "Converted to full time",
};

export const PERIOD_END_LABELS: Record<PeriodEndReason, string> = {
  EXITED: "Exited",
  CONVERTED: "Converted to full time",
};

/** Idempotency key of the job that applies an accepted conversion on its effective date. */
export function conversionEffectiveDedupeKey(reviewId: string): string {
  return `conversion-effective:${reviewId}`;
}

/** Where a scheduled review stands relative to today (business calendar). */
export type ReviewDueState = "OVERDUE" | "DUE_THIS_WEEK" | "UPCOMING";

export const REVIEW_DUE_LABELS: Record<ReviewDueState, string> = {
  OVERDUE: "Overdue",
  DUE_THIS_WEEK: "Due this week",
  UPCOMING: "Upcoming",
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** Review and effective dates are calendar days stored at UTC midnight (like joining dates). */
export function calendarDayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Parses a `YYYY-MM-DD` calendar day into its stored form (UTC midnight). */
export function parseCalendarDay(key: string): Date {
  return new Date(`${key}T00:00:00.000Z`);
}

/**
 * Overdue: the review day has passed. Due this week: today or within the next six days.
 * Upcoming: later. "Today" is the business-time-zone date.
 */
export function classifyReviewDue(scheduledFor: Date, now: Date = new Date()): ReviewDueState {
  const todayKey = businessDateKey(now);
  const reviewKey = calendarDayKey(scheduledFor);
  if (reviewKey < todayKey) return "OVERDUE";
  const weekEndKey = calendarDayKey(new Date(parseCalendarDay(todayKey).getTime() + 6 * DAY_MS));
  return reviewKey <= weekEndKey ? "DUE_THIS_WEEK" : "UPCOMING";
}

/** First review: joining day + N months. */
export function firstReviewDate(joiningDate: Date, months: ReviewPeriodMonths): Date {
  return addMonths(parseCalendarDay(calendarDayKey(joiningDate)), months);
}

/** After an extension: the decision day (business calendar) + N months. */
export function nextReviewDate(now: Date, months: ReviewPeriodMonths): Date {
  return addMonths(parseCalendarDay(businessDateKey(now)), months);
}

/** True when the calendar day has already begun in the business time zone (today or past). */
export function isCalendarDayReached(dayKey: string, now: Date = new Date()): boolean {
  return dayKey <= businessDateKey(now);
}

/** True when the calendar day lies before today (business time zone). */
export function isCalendarDayPast(dayKey: string, now: Date = new Date()): boolean {
  return dayKey < businessDateKey(now);
}
