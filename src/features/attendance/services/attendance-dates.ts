/**
 * UTC calendar-day helpers shared by attendance and the leave → attendance sync.
 *
 * Attendance rows are keyed by a UTC calendar day (`date` stored at 00:00:00.000Z).
 * Every caller normalises through these helpers so local-time `setHours` and
 * `setUTCHours` are never mixed.
 */

export const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Returns the UTC calendar day (00:00:00.000Z) that contains `value`. */
export function toUtcDateOnly(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

/** `YYYY-MM-DD` key of the UTC calendar day that contains `value`. */
export function utcDateKey(value: Date): string {
  return toUtcDateOnly(value).toISOString().slice(0, 10);
}

/** Number of UTC calendar days in the inclusive range [start, end]. */
export function inclusiveUtcDaySpan(start: Date, end: Date): number {
  return Math.round((toUtcDateOnly(end).getTime() - toUtcDateOnly(start).getTime()) / MS_PER_DAY) + 1;
}

/**
 * Lists every UTC calendar day in the inclusive range [start, end].
 * Callers must bound the range before calling (see MAX_LEAVE_REQUEST_SPAN_DAYS).
 */
export function listUtcDays(start: Date, end: Date): Date[] {
  const days: Date[] = [];
  const first = toUtcDateOnly(start).getTime();
  const last = toUtcDateOnly(end).getTime();
  for (let ms = first; ms <= last; ms += MS_PER_DAY) {
    days.push(new Date(ms));
  }
  return days;
}
