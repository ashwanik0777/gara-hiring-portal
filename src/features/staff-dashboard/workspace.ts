import { Role } from "@prisma/client";
import type { SubAdminPermissions } from "@/lib/auth/permissions";
import { RECRUITMENT_STAFF_ROLES } from "@/features/recruitment/services/application-access";
import {
  EVALUATION_DECISION_ROLES,
  EVALUATION_SUPERVISOR_ROLES,
} from "@/features/internship-evaluation/services/enrollment-access";
import { PAYROLL_STAFF_ROLES } from "@/features/payroll/roles";

/**
 * Staff workspaces of the sub-admin portal. Each staff role gets its own overview, and a
 * person holding several roles sees the union of their workspaces, most senior first.
 */
export type StaffWorkspace = "HR" | "MANAGER" | "INTERVIEWER" | "MENTOR";

const WORKSPACE_ORDER: readonly StaffWorkspace[] = ["HR", "MANAGER", "INTERVIEWER", "MENTOR"];

export const STAFF_WORKSPACE_DETAILS: Record<StaffWorkspace, { title: string; badge: string; summary: string }> = {
  HR: {
    title: "HR workspace",
    badge: "HR",
    summary: "Hiring pipeline, today's interviews, evaluations and who is away today.",
  },
  MANAGER: {
    title: "Manager workspace",
    badge: "Manager",
    summary: "Your team today, the interviews you run and the interns you supervise.",
  },
  INTERVIEWER: {
    title: "Interviewer workspace",
    badge: "Interviewer",
    summary: "Your upcoming interviews and the feedback you still need to submit.",
  },
  MENTOR: {
    title: "Mentor workspace",
    badge: "Mentor",
    summary: "The interns you supervise and the work waiting for your review.",
  },
};

/**
 * Workspaces a staff member holds. ADMIN is shown the HR workspace: administrators have
 * their own console at /admin and only reach this portal by opening it directly.
 */
export function getStaffWorkspaces(roles: readonly Role[]): StaffWorkspace[] {
  const held = new Set<StaffWorkspace>();
  if (roles.includes(Role.ADMIN) || roles.includes(Role.HR)) held.add("HR");
  if (roles.includes(Role.MANAGER)) held.add("MANAGER");
  if (roles.includes(Role.INTERVIEWER)) held.add("INTERVIEWER");
  if (roles.includes(Role.MENTOR)) held.add("MENTOR");
  return WORKSPACE_ORDER.filter((workspace) => held.has(workspace));
}

export type StaffModuleKey =
  | "applications"
  | "openings"
  | "interviews"
  | "evaluations"
  | "employees"
  | "internReviews"
  | "attendance"
  | "leave"
  | "payroll"
  | "reports";

export interface StaffModule {
  key: StaffModuleKey;
  label: string;
  description: string;
  /** Path below the portal root, e.g. "/applications". */
  path: string;
  /** Icon name understood by the dashboard shell navigation. */
  iconName: string;
}

/** Staff modules in navigation order. */
export const STAFF_MODULES: readonly StaffModule[] = [
  { key: "applications", label: "Applications", description: "Screen candidates and move stages", path: "/applications", iconName: "FileText" },
  { key: "openings", label: "Job Openings", description: "Openings and application forms", path: "/openings", iconName: "Briefcase" },
  { key: "interviews", label: "Interviews", description: "Schedules, invites and feedback", path: "/interviews", iconName: "Calendar" },
  { key: "evaluations", label: "Evaluations", description: "7-working-day internship evaluations", path: "/evaluations", iconName: "Award" },
  { key: "employees", label: "Employees", description: "Employee records and joining", path: "/employees", iconName: "UserCheck" },
  { key: "internReviews", label: "Intern Reviews", description: "Progress reviews and conversions", path: "/intern-reviews", iconName: "CheckCircle2" },
  { key: "attendance", label: "Attendance", description: "Attendance records and corrections", path: "/attendance", iconName: "Clock" },
  { key: "leave", label: "Leave Management", description: "Review leave requests", path: "/leave", iconName: "CalendarDays" },
  { key: "payroll", label: "Payroll", description: "Payroll periods and payslips", path: "/payroll", iconName: "CreditCard" },
  { key: "reports", label: "Analytics & Reports", description: "Funnel, sources and exports", path: "/reports", iconName: "BarChart3" },
];

function holdsAnyRole(roles: readonly Role[], allowed: readonly Role[]): boolean {
  return roles.includes(Role.ADMIN) || roles.some((role) => allowed.includes(role));
}

const EVALUATION_STAFF_ROLES: readonly Role[] = [...EVALUATION_DECISION_ROLES, ...EVALUATION_SUPERVISOR_ROLES];

/**
 * Modules a staff member can actually open: the granular permission together with the role
 * each module's service requires, so navigation and dashboards never offer a page that
 * would refuse the user (for example a mentor holding `canApplications`).
 */
export function getStaffModuleAccess(
  roles: readonly Role[],
  permissions: SubAdminPermissions
): Record<StaffModuleKey, boolean> {
  return {
    applications: permissions.canApplications && holdsAnyRole(roles, RECRUITMENT_STAFF_ROLES),
    openings: permissions.canOpenings,
    interviews: permissions.canInterviews && holdsAnyRole(roles, RECRUITMENT_STAFF_ROLES),
    evaluations: permissions.canEvaluations && holdsAnyRole(roles, EVALUATION_STAFF_ROLES),
    employees: permissions.canEmployees,
    internReviews: permissions.canEmployees,
    attendance: permissions.canAttendance,
    leave: permissions.canLeave,
    payroll: permissions.canPayroll && holdsAnyRole(roles, PAYROLL_STAFF_ROLES),
    reports: permissions.canReports,
  };
}

/** The modules from `STAFF_MODULES` that the access map allows, in navigation order. */
export function listAccessibleStaffModules(access: Record<StaffModuleKey, boolean>): StaffModule[] {
  return STAFF_MODULES.filter((module) => access[module.key]);
}
