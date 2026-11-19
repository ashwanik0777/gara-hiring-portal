import { OpeningType, WorkplaceType } from "@/types/enums";
import { BUSINESS_TIME_ZONE, atBusinessTime, businessDateKey } from "@/lib/time/business-time";

/*
 * Careers listing rules shared by the public pages, the staff form and the apply flow
 * (product owner plan, 2026-11-19). Pure functions only, safe for client and server.
 */

/** Opening slugs that would collide with fixed routes under /careers. */
export const RESERVED_OPENING_SLUGS: readonly string[] = ["tracks"];

export const MAX_SKILLS = 20;
export const MAX_SKILL_LENGTH = 40;

/** True for a real calendar date written as "YYYY-MM-DD" (rejects 2026-02-31). */
export function isValidDateKey(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/** "YYYY-MM-DD" of the day after the given date key. */
function nextDateKey(dateKey: string): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + 1));
  return next.toISOString().slice(0, 10);
}

/**
 * The application deadline for a chosen last date: applications stay open for the whole of
 * that day in the business time zone (the instant just before the next day starts).
 */
export function deadlineFromDateKey(dateKey: string): Date {
  return new Date(atBusinessTime(nextDateKey(dateKey), 0, 0).getTime() - 1);
}

/** The last date ("YYYY-MM-DD", business time zone) of a stored deadline, for form inputs. */
export function dateKeyFromDeadline(deadline: Date): string {
  return businessDateKey(deadline);
}

/** True once the deadline has passed; openings without a deadline stay open. */
export function isApplicationWindowClosed(deadline: Date | null | undefined, now: Date): boolean {
  return deadline != null && now.getTime() > deadline.getTime();
}

const DEADLINE_FORMAT = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: BUSINESS_TIME_ZONE,
});

/** "30 Nov 2026" in the business time zone. */
export function formatDeadline(deadline: Date): string {
  return DEADLINE_FORMAT.format(deadline);
}

/** Splits, trims and de-duplicates skills (case-insensitive), keeping the first spelling. */
export function normalizeSkills(input: readonly string[] | string | null | undefined): string[] {
  const parts = typeof input === "string" ? input.split(",") : (input ?? []);
  const seen = new Set<string>();
  const skills: string[] = [];
  for (const part of parts) {
    const skill = part.replace(/\s+/g, " ").trim();
    const key = skill.toLowerCase();
    if (!skill || seen.has(key)) continue;
    seen.add(key);
    skills.push(skill);
  }
  return skills;
}

export const WORKPLACE_LABELS: Record<WorkplaceType, string> = {
  [WorkplaceType.REMOTE]: "Remote",
  [WorkplaceType.HYBRID]: "Hybrid",
  [WorkplaceType.ON_SITE]: "On-site",
};

export const OPENING_TYPE_LABELS: Record<OpeningType, string> = {
  [OpeningType.INTERNSHIP]: "Internship",
  [OpeningType.FULL_TIME]: "Full-time",
};

/** URL values of the /careers filters (readable, stable, never the enum names). */
export const TYPE_FILTERS = [
  { value: "internship", label: "Internships", type: OpeningType.INTERNSHIP },
  { value: "full-time", label: "Full-time", type: OpeningType.FULL_TIME },
] as const;

export const MODE_FILTERS = [
  { value: "remote", label: "Remote", workplaceType: WorkplaceType.REMOTE },
  { value: "hybrid", label: "Hybrid", workplaceType: WorkplaceType.HYBRID },
  { value: "on-site", label: "On-site", workplaceType: WorkplaceType.ON_SITE },
] as const;

export interface CareersFilters {
  /** URL value of the type filter ("internship" | "full-time"), when valid. */
  type?: (typeof TYPE_FILTERS)[number]["value"];
  /** URL value of the mode filter ("remote" | "hybrid" | "on-site"), when valid. */
  mode?: (typeof MODE_FILTERS)[number]["value"];
}

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** Reads the filters from search params; unknown values are ignored, never echoed back. */
export function parseCareersFilters(params: Record<string, string | string[] | undefined>): CareersFilters {
  const type = TYPE_FILTERS.find((filter) => filter.value === firstValue(params.type))?.value;
  const mode = MODE_FILTERS.find((filter) => filter.value === firstValue(params.mode))?.value;
  return { ...(type ? { type } : {}), ...(mode ? { mode } : {}) };
}

/** Whether an opening matches the filters. */
export function matchesCareersFilters(
  opening: { type: OpeningType; workplaceType: WorkplaceType },
  filters: CareersFilters
): boolean {
  const type = TYPE_FILTERS.find((filter) => filter.value === filters.type)?.type;
  const workplaceType = MODE_FILTERS.find((filter) => filter.value === filters.mode)?.workplaceType;
  return (!type || opening.type === type) && (!workplaceType || opening.workplaceType === workplaceType);
}
