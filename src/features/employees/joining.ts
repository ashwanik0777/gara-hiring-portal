/**
 * Shared, client-safe helpers for the "Mark as joined" flows (intern and full-time).
 * No database or server-only imports: the dialogs use the same date rule as the services.
 */

/**
 * Joining dates are calendar days (date inputs send YYYY-MM-DD, stored at UTC midnight).
 * A day counts as reached once it has begun in any time zone (UTC+14 is the earliest), so
 * staff ahead of UTC are not rejected on the joining day itself. This is a clock tolerance,
 * not an HR rule: "Mark as joined" records that the person has already joined.
 */
const EARLIEST_UTC_OFFSET_MS = 14 * 60 * 60 * 1000;

function utcCalendarDay(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

/** True when the joining date lies after the latest calendar day that has already begun. */
export function isFutureJoiningDate(joiningDate: Date, now: Date = new Date()): boolean {
  const latestStartedDay = utcCalendarDay(new Date(now.getTime() + EARLIEST_UTC_OFFSET_MS));
  return utcCalendarDay(joiningDate) > latestStartedDay;
}

/** Today's local date as a `YYYY-MM-DD` value for `<input type="date" max>`. */
export function todayDateInputValue(now: Date = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

/**
 * Prefill for the joining date field: the agreed date when it has already been reached,
 * otherwise empty so HR enters the actual first day (never a future date).
 */
export function joiningDatePrefill(agreedDate: Date | string | null | undefined, now: Date = new Date()): string {
  if (!agreedDate) return "";
  const parsed = new Date(agreedDate);
  if (Number.isNaN(parsed.getTime()) || isFutureJoiningDate(parsed, now)) return "";
  return parsed.toISOString().slice(0, 10);
}
