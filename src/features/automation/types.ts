/** Kinds of pending work shown in the staff Action Center and the daily digest. */
export type ActionCenterSectionKey =
  | "applicationsAwaitingScreening"
  | "interviewsAwaitingFeedback"
  | "checkpointsAwaitingReview"
  | "evaluationsAwaitingDecision"
  | "passedAwaitingJoining"
  | "offersAwaitingResponse"
  | "acceptedOffersAwaitingJoining"
  | "internReviewsDue"
  | "conversionsPendingEffectiveDate"
  | "leaveRequestsPending"
  | "regularizationsPending";

export interface ActionCenterItem {
  id: string;
  /** Who or what the item is about (e.g. the candidate's name). */
  label: string;
  /** Short context line (e.g. "Engineer · applied 24 Oct 2026"). */
  detail: string;
  href: string;
  /** Marks items that are past their date (e.g. an overdue review). */
  overdue?: boolean;
}

interface ActionCenterSectionBase {
  key: ActionCenterSectionKey;
  title: string;
  description: string;
  /** App-relative link to the page where the work is done. */
  href: string;
}

export type ActionCenterSection =
  | (ActionCenterSectionBase & { status: "ok"; count: number; items: ActionCenterItem[] })
  | (ActionCenterSectionBase & { status: "unavailable" });

export interface ActionCenterResult {
  /** Only the sections the viewer is permitted to act on, in display order. */
  sections: ActionCenterSection[];
  /** Sum of the counts of the sections that loaded. */
  totalCount: number;
}
