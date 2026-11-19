/** Display helpers shared by the attendance server and client components. */

/** "2026-10" → "October 2026" (UTC, matching how attendance days are stored). */
export function formatMonthLabel(month: string): string {
  const [year, m] = month.split("-").map(Number);
  return new Date(Date.UTC(year, m - 1, 1)).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}
