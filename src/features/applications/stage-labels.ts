import { ApplicationStatus } from "@/types/enums";

/** Human-readable application stage names (client-safe). */
export const APPLICATION_STAGE_LABELS: Record<ApplicationStatus, string> = {
  [ApplicationStatus.DRAFT]: "Draft",
  [ApplicationStatus.SUBMITTED]: "Submitted",
  [ApplicationStatus.SCREENING]: "Screening",
  [ApplicationStatus.SHORTLISTED]: "Shortlisted",
  [ApplicationStatus.INTERVIEW_SCHEDULED]: "Interview scheduled",
  [ApplicationStatus.INTERVIEWED]: "Interviewed",
  [ApplicationStatus.EVALUATION_SELECTED]: "Selected for evaluation",
  [ApplicationStatus.OFFERED]: "Offer extended",
  [ApplicationStatus.OFFER_ACCEPTED]: "Offer accepted",
  [ApplicationStatus.HIRED]: "Hired",
  [ApplicationStatus.REJECTED]: "Rejected",
  [ApplicationStatus.WITHDRAWN]: "Withdrawn",
  [ApplicationStatus.ARCHIVED]: "Archived",
};

/** Label for a stored status string; unknown values are shown as-is in readable form. */
export function describeApplicationStage(status: string): string {
  return status in APPLICATION_STAGE_LABELS
    ? APPLICATION_STAGE_LABELS[status as ApplicationStatus]
    : status.replace(/_/g, " ").toLowerCase();
}
