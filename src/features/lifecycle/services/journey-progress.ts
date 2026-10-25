import { z } from "zod";
import {
  ApplicationStatus,
  CareerInterest,
  OpeningType,
} from "@/types/enums";

/*
 * Pure helpers for the self-service dashboards (no database access, no React), so the
 * journey stepper, recommendations and completeness hints can be unit tested and stay
 * honest: every value they produce is derived from recorded data only.
 */

/** Applications that ended without joining. */
export const CLOSED_APPLICATION_STATUSES: readonly ApplicationStatus[] = [
  ApplicationStatus.REJECTED,
  ApplicationStatus.WITHDRAWN,
  ApplicationStatus.ARCHIVED,
];

export function isClosedApplicationStatus(status: string): boolean {
  return (CLOSED_APPLICATION_STATUSES as readonly string[]).includes(status);
}

// -----------------------------------------------------------------------------
// Journey stepper
// -----------------------------------------------------------------------------

export type JourneyStepKey = "APPLIED" | "SCREENING" | "SHORTLISTED" | "INTERVIEW" | "DECISION" | "JOINED";
export type JourneyStepState = "complete" | "current" | "upcoming" | "stopped";
export type JourneyOutcome = "in_progress" | "joined" | "rejected" | "withdrawn" | "archived";

export interface JourneyStep {
  key: JourneyStepKey;
  label: string;
  state: JourneyStepState;
  /** When the application first reached this step (from the status history), if recorded. */
  reachedAt: string | null;
}

export interface JourneyProgress {
  steps: JourneyStep[];
  outcome: JourneyOutcome;
}

const STEP_KEYS: readonly JourneyStepKey[] = [
  "APPLIED",
  "SCREENING",
  "SHORTLISTED",
  "INTERVIEW",
  "DECISION",
  "JOINED",
];

/** Step each (non-closed) application status belongs to. */
const STATUS_STEP_INDEX: Partial<Record<ApplicationStatus, number>> = {
  [ApplicationStatus.DRAFT]: 0,
  [ApplicationStatus.SUBMITTED]: 0,
  [ApplicationStatus.SCREENING]: 1,
  [ApplicationStatus.SHORTLISTED]: 2,
  [ApplicationStatus.INTERVIEW_SCHEDULED]: 3,
  [ApplicationStatus.INTERVIEWED]: 3,
  [ApplicationStatus.EVALUATION_SELECTED]: 4,
  [ApplicationStatus.OFFERED]: 4,
  // Offer accepted: the decision is made and joining is the open step.
  [ApplicationStatus.OFFER_ACCEPTED]: 5,
  [ApplicationStatus.HIRED]: 5,
};

export function stepIndexForStatus(status: string): number | null {
  const index = STATUS_STEP_INDEX[status as ApplicationStatus];
  return index === undefined ? null : index;
}

/**
 * Ranks applications by how far they progressed, so the dashboard can feature the most
 * advanced one. Closed applications rank below every active one.
 */
export function journeyRank(status: string): number {
  if (isClosedApplicationStatus(status)) {
    return -1;
  }
  const index = stepIndexForStatus(status) ?? 0;
  // A joined application ranks above one that is still waiting to join.
  return status === ApplicationStatus.HIRED ? index + 1 : index;
}

function decisionLabel(status: string, openingType: string): string {
  if (status === ApplicationStatus.EVALUATION_SELECTED) return "Evaluation";
  if (status === ApplicationStatus.OFFERED || status === ApplicationStatus.OFFER_ACCEPTED) return "Offer";
  return openingType === OpeningType.INTERNSHIP ? "Evaluation" : "Offer";
}

function stepLabel(key: JourneyStepKey, status: string, openingType: string): string {
  switch (key) {
    case "APPLIED":
      return "Applied";
    case "SCREENING":
      return "Screening";
    case "SHORTLISTED":
      return "Shortlisted";
    case "INTERVIEW":
      return "Interview";
    case "DECISION":
      return decisionLabel(status, openingType);
    case "JOINED":
      return "Joined";
  }
}

export interface JourneyInput {
  status: string;
  openingType: string;
  createdAt: string;
  /** Status history (oldest first): only the target status and its timestamp. */
  history: ReadonlyArray<{ toStatus: string; createdAt: string }>;
}

/**
 * Builds the Applied → Screening → Shortlisted → Interview → Evaluation/Offer → Joined
 * stepper from the application's real status. Closed applications show where they
 * stopped (the last open stage recorded in the history) instead of pretending progress.
 */
export function buildJourneyProgress(input: JourneyInput): JourneyProgress {
  const history = [...input.history].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  const reachedAt: Array<string | null> = STEP_KEYS.map(() => null);
  reachedAt[0] = input.createdAt;
  for (const entry of history) {
    const index = stepIndexForStatus(entry.toStatus);
    if (index !== null && index > 0 && reachedAt[index] === null) {
      reachedAt[index] = entry.createdAt;
    }
  }

  const closed = isClosedApplicationStatus(input.status);
  let outcome: JourneyOutcome = "in_progress";
  let activeIndex: number;

  if (closed) {
    outcome =
      input.status === ApplicationStatus.REJECTED
        ? "rejected"
        : input.status === ApplicationStatus.WITHDRAWN
          ? "withdrawn"
          : "archived";
    const lastOpen = [...history].reverse().find((entry) => stepIndexForStatus(entry.toStatus) !== null);
    activeIndex = lastOpen ? (stepIndexForStatus(lastOpen.toStatus) ?? 0) : 0;
  } else {
    activeIndex = stepIndexForStatus(input.status) ?? 0;
    if (input.status === ApplicationStatus.HIRED) {
      outcome = "joined";
    }
  }

  const steps = STEP_KEYS.map((key, index): JourneyStep => {
    let state: JourneyStepState;
    if (index < activeIndex) {
      state = "complete";
    } else if (index === activeIndex) {
      state = closed ? "stopped" : outcome === "joined" ? "complete" : "current";
    } else {
      state = "upcoming";
    }
    return {
      key,
      label: stepLabel(key, input.status, input.openingType),
      state,
      reachedAt: state === "upcoming" ? null : reachedAt[index],
    };
  });

  return { steps, outcome };
}

// -----------------------------------------------------------------------------
// Recommendations, links and profile hints
// -----------------------------------------------------------------------------

/** Opening types matching what the candidate said they are looking for. */
export function openingTypesForInterest(interest: CareerInterest | null): OpeningType[] {
  switch (interest) {
    case CareerInterest.JOB:
      return [OpeningType.FULL_TIME];
    case CareerInterest.INTERNSHIP:
      return [OpeningType.INTERNSHIP];
    default:
      return [OpeningType.FULL_TIME, OpeningType.INTERNSHIP];
  }
}

export const CAREER_INTEREST_LABELS: Record<CareerInterest, string> = {
  JOB: "Looking for a full-time job",
  INTERNSHIP: "Looking for an internship",
  BOTH: "Open to jobs and internships",
};

/** Returns the link only when it is an absolute http(s) URL; anything else is dropped. */
export function safeMeetingLink(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw.trim());
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

/** Candidate profile fields counted by the completeness hint (all exist in CandidateProfile). */
export const PROFILE_COMPLETENESS_FIELDS = [
  { key: "careerInterest", label: "What you are looking for" },
  { key: "phone", label: "Phone number" },
  { key: "location", label: "Current location" },
  { key: "highestEducation", label: "Highest education" },
  { key: "currentOrganization", label: "College or organization" },
  { key: "linkedinUrl", label: "LinkedIn profile" },
  { key: "githubUrl", label: "GitHub profile" },
  { key: "portfolioUrl", label: "Portfolio" },
] as const;

export type ProfileCompletenessKey = (typeof PROFILE_COMPLETENESS_FIELDS)[number]["key"];

export interface ProfileCompleteness {
  completed: number;
  total: number;
  missing: string[];
}

export function computeProfileCompleteness(
  profile: Partial<Record<ProfileCompletenessKey, string | null>> | null
): ProfileCompleteness {
  const missing: string[] = [];
  for (const field of PROFILE_COMPLETENESS_FIELDS) {
    const value = profile?.[field.key];
    if (typeof value !== "string" || value.trim() === "") {
      missing.push(field.label);
    }
  }
  const total = PROFILE_COMPLETENESS_FIELDS.length;
  return { completed: total - missing.length, total, missing };
}

const ChecklistItemSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  completed: z.boolean(),
});

export interface ChecklistProgressItem {
  id: string;
  label: string;
  completed: boolean;
}

/**
 * Reads a stored onboarding checklist (JSON) defensively: malformed entries are skipped
 * and a missing checklist stays empty (never replaced by defaults that were not recorded).
 */
export function parseChecklistProgress(value: unknown): ChecklistProgressItem[] {
  if (!Array.isArray(value)) return [];
  const items: ChecklistProgressItem[] = [];
  for (const entry of value) {
    const parsed = ChecklistItemSchema.safeParse(entry);
    if (parsed.success) {
      items.push({ id: parsed.data.id, label: parsed.data.label, completed: parsed.data.completed });
    }
  }
  return items;
}
