import type { CareerInterest, EmployeeStatus, EmploymentType, EvaluationStatus } from "@/types/enums";

/**
 * Where a non-staff user is in the hiring-to-employment lifecycle.
 * - CANDIDATE: signed up, browsing and applying.
 * - EVALUATION: selected for the supervised internship evaluation (still a candidate).
 * - INTERN: passed the evaluation and marked as joined by HR (INTERN role).
 * - EMPLOYEE: accepted an offer and marked as joined by HR (EMPLOYEE role).
 * - ALUMNI: former intern or employee whose employment record has exited.
 */
export type LifecycleStage = "CANDIDATE" | "EVALUATION" | "INTERN" | "EMPLOYEE" | "ALUMNI";

/** Features of the self-service portal that a stage unlocks. */
export type PortalCapability =
  | "candidateOverview"
  | "exploreOpenings"
  | "applyToOpenings"
  | "applications"
  | "journey"
  | "profile"
  | "evaluationWorkspace"
  | "internWorkspace"
  | "employeeHome"
  | "attendance"
  | "leave"
  | "payslips"
  | "certificate"
  | "verifyCertificate"
  | "help";

export interface LifecycleEnrollmentSummary {
  id: string;
  status: EvaluationStatus;
  openingTitle: string;
  startDate: string | null;
  endDate: string | null;
}

export interface LifecycleEmploymentSummary {
  id: string;
  employeeCode: string;
  status: EmployeeStatus;
  employmentType: EmploymentType | null;
  designation: string;
  department: string;
  joiningDate: string;
}

export interface LifecycleState {
  stage: LifecycleStage;
  capabilities: PortalCapability[];
  /** Applications stay visible after joining, but only as read-only history. */
  applicationsReadOnly: boolean;
  careerInterest: CareerInterest | null;
  enrollment: LifecycleEnrollmentSummary | null;
  employment: LifecycleEmploymentSummary | null;
  /** When the current INTERN / EMPLOYEE role was granted (drives the upgrade banner). */
  upgradedAt: string | null;
  /** True while the upgrade is recent enough to announce (see UPGRADE_ANNOUNCEMENT_MS). */
  recentlyUpgraded: boolean;
  homePath: string;
}
