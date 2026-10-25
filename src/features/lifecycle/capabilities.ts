import type { DashboardNavItem } from "@/components/dashboard/dashboard-shell";
import {
  EmployeeStatus,
  EvaluationStatus,
  Role,
} from "@/types/enums";
import type { LifecycleStage, PortalCapability } from "./types";

/*
 * Pure lifecycle rules (no database access) shared by the resolver, the portal shell,
 * page guards and tests. Product-owner decisions of 2026-10-25:
 * - Public signup creates candidates only.
 * - Internship: selection for the evaluation unlocks the evaluation workspace while the
 *   user is still a candidate; PASS + HR "Mark as joined" grants the INTERN role.
 * - Full time: an accepted offer + HR "Mark as joined" grants the EMPLOYEE role.
 * - After joining, candidate features are hidden and applications become read-only history.
 */

/** Enrollment statuses during which the user works in the evaluation workspace. */
export const ACTIVE_EVALUATION_STATUSES: readonly EvaluationStatus[] = [
  EvaluationStatus.PENDING_TRIGGER,
  EvaluationStatus.IN_PROGRESS,
  EvaluationStatus.UNDER_REVIEW,
  EvaluationStatus.EXTENDED,
  // Passed but not yet marked as joined: the result and next steps stay visible.
  EvaluationStatus.PASSED,
];

export interface LifecycleFacts {
  roles: readonly string[];
  /**
   * Status of the user's most recent internship enrollment that has not yet led to joining
   * (an enrollment whose application is HIRED is history, not an active evaluation).
   */
  enrollmentStatus: EvaluationStatus | null;
  /** Status of the user's employment record, if any. */
  employeeStatus: EmployeeStatus | null;
}

export function determineLifecycleStage(facts: LifecycleFacts): LifecycleStage {
  const exited = facts.employeeStatus === EmployeeStatus.EXITED;
  if (facts.roles.includes(Role.EMPLOYEE) && !exited) {
    return "EMPLOYEE";
  }
  if (facts.roles.includes(Role.INTERN) && !exited) {
    return "INTERN";
  }
  // A former intern/employee who re-applies and is selected again is in evaluation.
  if (facts.enrollmentStatus && ACTIVE_EVALUATION_STATUSES.includes(facts.enrollmentStatus)) {
    return "EVALUATION";
  }
  if (exited) {
    return "ALUMNI";
  }
  return "CANDIDATE";
}

const CANDIDATE_CAPABILITIES: PortalCapability[] = [
  "candidateOverview",
  "exploreOpenings",
  "applyToOpenings",
  "applications",
  "journey",
  "profile",
  "verifyCertificate",
  "help",
];

export const STAGE_CAPABILITIES: Record<LifecycleStage, readonly PortalCapability[]> = {
  CANDIDATE: CANDIDATE_CAPABILITIES,
  EVALUATION: [...CANDIDATE_CAPABILITIES, "evaluationWorkspace"],
  INTERN: [
    "internWorkspace",
    "evaluationWorkspace",
    "attendance",
    "leave",
    "payslips",
    "certificate",
    "journey",
    "profile",
    "verifyCertificate",
    "help",
  ],
  EMPLOYEE: ["employeeHome", "attendance", "leave", "payslips", "journey", "profile", "help"],
  // Product-owner decision (2026-10-25): people who exited re-join through normal hiring with
  // the same account, so candidate features return alongside their past history.
  ALUMNI: [...CANDIDATE_CAPABILITIES, "certificate"],
};

export function capabilitiesForStage(stage: LifecycleStage): PortalCapability[] {
  return [...STAGE_CAPABILITIES[stage]];
}

export function hasCapability(
  capabilities: readonly PortalCapability[],
  capability: PortalCapability
): boolean {
  return capabilities.includes(capability);
}

/** Applications can be managed only before joining; afterwards they are history. */
export function isApplicationsReadOnly(stage: LifecycleStage): boolean {
  return !STAGE_CAPABILITIES[stage].includes("applications");
}

export const STAGE_HOME_PATHS: Record<LifecycleStage, string> = {
  CANDIDATE: "/candidate/dashboard",
  EVALUATION: "/candidate/dashboard",
  INTERN: "/intern/dashboard",
  EMPLOYEE: "/hrms",
  ALUMNI: "/candidate/dashboard",
};

export const STAGE_PORTAL_BADGES: Record<LifecycleStage, string> = {
  CANDIDATE: "CANDIDATE PORTAL",
  EVALUATION: "EVALUATION STAGE",
  INTERN: "INTERN WORKSPACE",
  EMPLOYEE: "EMPLOYEE PORTAL",
  ALUMNI: "ALUMNI · WELCOME BACK",
};

export const STAGE_LABELS: Record<LifecycleStage, string> = {
  CANDIDATE: "Candidate",
  EVALUATION: "Evaluation",
  INTERN: "Intern",
  EMPLOYEE: "Employee",
  ALUMNI: "Alumni",
};

/** How long after reaching a stage the upgrade banner is shown. */
export const UPGRADE_ANNOUNCEMENT_MS = 14 * 24 * 60 * 60 * 1000;

/** Features announced in the upgrade banner when a stage is reached. */
export const STAGE_UNLOCKED_FEATURES: Partial<Record<LifecycleStage, string[]>> = {
  EVALUATION: ["Evaluation workspace", "Daily checkpoints", "Assigned tasks"],
  INTERN: ["Intern workspace", "Attendance", "Leave requests", "Payslips", "ID card & certificate"],
  EMPLOYEE: ["Employee home", "Attendance", "Leave requests", "Payslips"],
};

/**
 * Builds the self-service navigation for a stage. Every item maps to exactly one
 * capability, so a hidden feature never appears in the menu.
 */
export function buildSelfServiceNav(stage: LifecycleStage): DashboardNavItem[] {
  const caps = STAGE_CAPABILITIES[stage];
  const items: Array<[PortalCapability, DashboardNavItem]> = [
    ["candidateOverview", { label: "Dashboard", href: "/candidate/dashboard", iconName: "LayoutDashboard" }],
    ["employeeHome", { label: "Home", href: "/hrms", iconName: "House" }],
    ["internWorkspace", { label: "Workspace", href: "/intern/dashboard", iconName: "LayoutDashboard" }],
    [
      "evaluationWorkspace",
      stage === "INTERN"
        ? { label: "Evaluation Record", href: "/intern/dashboard#evaluation", iconName: "Award" }
        : { label: "Evaluation Workspace", href: "/intern/dashboard", iconName: "Award" },
    ],
    ["attendance", { label: "Attendance", href: "/hrms/attendance", iconName: "Clock" }],
    ["leave", { label: "Leave", href: "/hrms/leave", iconName: "CalendarDays" }],
    ["payslips", { label: "Payslips", href: "/hrms/payroll", iconName: "CreditCard" }],
    ["exploreOpenings", { label: "Explore Openings", href: "/careers", iconName: "Briefcase" }],
    [
      "journey",
      caps.includes("applications")
        ? { label: "My Applications", href: "/candidate/applications", iconName: "FileText" }
        : { label: "My Journey", href: "/candidate/applications", iconName: "History" },
    ],
    ["profile", { label: "My Profile", href: "/candidate/profile", iconName: "User" }],
    ["verifyCertificate", { label: "Verify Certificate", href: "/verify", iconName: "ShieldCheck" }],
    ["help", { label: "Support & Help", href: "/help", iconName: "HelpCircle" }],
  ];
  return items.filter(([capability]) => caps.includes(capability)).map(([, item]) => item);
}
