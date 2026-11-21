import { BUSINESS_TIME_ZONE } from "@/lib/time/business-time";

const DAY = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: BUSINESS_TIME_ZONE });
const DAY_TIME = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
  timeZone: BUSINESS_TIME_ZONE,
});

/** "5 Jan 2027" in India time. */
export function formatBatchDay(date: Date): string {
  return DAY.format(date);
}

/** "5 Jan, 7:00 pm" in India time. */
export function formatBatchDayTime(date: Date): string {
  return DAY_TIME.format(date);
}

const PARTS = new Intl.DateTimeFormat("en-IN", {
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
  timeZone: BUSINESS_TIME_ZONE,
});

/** The pieces of a date block in India time: { weekday: "Fri", day: "27", month: "Nov", time: "7:00 pm" }. */
export function batchDateParts(date: Date): { weekday: string; day: string; month: string; time: string } {
  const parts = Object.fromEntries(PARTS.formatToParts(date).map((part) => [part.type, part.value]));
  return {
    weekday: parts.weekday ?? "",
    day: parts.day ?? "",
    month: parts.month ?? "",
    time: `${parts.hour ?? ""}:${parts.minute ?? ""} ${(parts.dayPeriod ?? "").toLowerCase()}`.trim(),
  };
}
