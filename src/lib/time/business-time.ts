/**
 * Business-calendar helpers. Reminders and digests are scheduled in the company's local
 * time zone (default Asia/Kolkata, override with APP_TIMEZONE), while everything is stored
 * as UTC instants.
 */

export const BUSINESS_TIME_ZONE = process.env.APP_TIMEZONE || "Asia/Kolkata";

interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

function zonedParts(instant: Date, timeZone: string): ZonedParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(instant);
  const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)?.value);
  return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour"), minute: get("minute") };
}

/** Offset of the zone from UTC at the given instant, in minutes (e.g. +330 for IST). */
function zoneOffsetMinutes(instant: Date, timeZone: string): number {
  const p = zonedParts(instant, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
  return Math.round((asUtc - Math.floor(instant.getTime() / 60000) * 60000) / 60000);
}

/** "YYYY-MM-DD" of the instant in the business time zone. */
export function businessDateKey(instant: Date, timeZone = BUSINESS_TIME_ZONE): string {
  const p = zonedParts(instant, timeZone);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

/**
 * The UTC instant of a wall-clock time on the given business date (`YYYY-MM-DD`).
 * Example: atBusinessTime("2026-10-26", 9, 0) → 2026-10-26T03:30:00Z for Asia/Kolkata.
 */
export function atBusinessTime(
  dateKey: string,
  hour: number,
  minute = 0,
  timeZone = BUSINESS_TIME_ZONE
): Date {
  const [year, month, day] = dateKey.split("-").map(Number);
  const guess = new Date(Date.UTC(year, month - 1, day, hour, minute));
  const offset = zoneOffsetMinutes(guess, timeZone);
  return new Date(guess.getTime() - offset * 60000);
}

/** Next occurrence (today or tomorrow, business time) of a wall-clock time after `now`. */
export function nextBusinessTime(now: Date, hour: number, minute = 0, timeZone = BUSINESS_TIME_ZONE): Date {
  const today = atBusinessTime(businessDateKey(now, timeZone), hour, minute, timeZone);
  if (today.getTime() > now.getTime()) {
    return today;
  }
  const tomorrowKey = businessDateKey(new Date(now.getTime() + 24 * 60 * 60 * 1000), timeZone);
  return atBusinessTime(tomorrowKey, hour, minute, timeZone);
}

/** Adds calendar months (clamped to the month's last day), keeping the time of day. */
export function addMonths(date: Date, months: number): Date {
  const result = new Date(date.getTime());
  const targetMonth = result.getUTCMonth() + months;
  result.setUTCDate(1);
  result.setUTCMonth(targetMonth);
  const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(date.getUTCDate(), lastDay));
  return result;
}
