import { Role } from "@/types/enums";
import {
  Briefcase,
  Calendar,
  Award,
  UserCheck,
  Clock,
  CalendarDays,
  CreditCard,
  BarChart3,
  FileText,
  type LucideIcon,
} from "lucide-react";
import type { SubAdminPermissionFlags } from "../types";

export type StaffRole = "HR" | "MANAGER" | "INTERVIEWER" | "MENTOR";

export const STAFF_ROLE_OPTIONS: StaffRole[] = [Role.HR, Role.MANAGER, Role.INTERVIEWER, Role.MENTOR];

export const MODULE_CONFIGS: Array<{
  key: keyof SubAdminPermissionFlags;
  label: string;
  desc: string;
  icon: LucideIcon;
}> = [
  { key: "canApplications", label: "Applications", desc: "Candidate applications & hiring pipeline", icon: FileText },
  { key: "canOpenings", label: "Job Openings", desc: "Create and publish job postings", icon: Briefcase },
  { key: "canInterviews", label: "Interviews", desc: "Schedule rounds and interview feedback", icon: Calendar },
  { key: "canEvaluations", label: "Evaluations", desc: "7-day review scores & assessments", icon: Award },
  { key: "canEmployees", label: "Employees", desc: "Staff directory and intern records", icon: UserCheck },
  { key: "canAttendance", label: "Attendance", desc: "Daily shift punches & logs", icon: Clock },
  { key: "canLeave", label: "Leave Requests", desc: "Time-off requests & approvals", icon: CalendarDays },
  { key: "canPayroll", label: "Payroll", desc: "Disbursements & salary periods", icon: CreditCard },
  { key: "canReports", label: "Analytics & Reports", desc: "Metrics export & audit trail", icon: BarChart3 },
];

/** Baseline permission presets offered when a role is picked in the forms (UI defaults only). */
export const ROLE_PRESETS: Record<StaffRole, SubAdminPermissionFlags> = {
  HR: {
    canApplications: true,
    canOpenings: true,
    canInterviews: true,
    canEvaluations: true,
    canEmployees: true,
    canAttendance: true,
    canLeave: true,
    canPayroll: false,
    canReports: true,
  },
  MANAGER: {
    canApplications: true,
    canOpenings: false,
    canInterviews: true,
    canEvaluations: true,
    canEmployees: true,
    canAttendance: true,
    canLeave: true,
    canPayroll: false,
    canReports: true,
  },
  INTERVIEWER: {
    canApplications: true,
    canOpenings: false,
    canInterviews: true,
    canEvaluations: true,
    canEmployees: false,
    canAttendance: false,
    canLeave: false,
    canPayroll: false,
    canReports: false,
  },
  MENTOR: {
    canApplications: true,
    canOpenings: false,
    canInterviews: true,
    canEvaluations: true,
    canEmployees: false,
    canAttendance: true,
    canLeave: false,
    canPayroll: false,
    canReports: false,
  },
};

export const ALL_MODULES: SubAdminPermissionFlags = {
  canApplications: true,
  canOpenings: true,
  canInterviews: true,
  canEvaluations: true,
  canEmployees: true,
  canAttendance: true,
  canLeave: true,
  canPayroll: true,
  canReports: true,
};

export const NO_MODULES: SubAdminPermissionFlags = {
  canApplications: false,
  canOpenings: false,
  canInterviews: false,
  canEvaluations: false,
  canEmployees: false,
  canAttendance: false,
  canLeave: false,
  canPayroll: false,
  canReports: false,
};

export function initialsOf(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function isStaffRole(role: string): role is StaffRole {
  return (STAFF_ROLE_OPTIONS as string[]).includes(role);
}
