import type { Role } from "@/types/enums";

export interface SubAdminPermissionFlags {
  canApplications: boolean;
  canOpenings: boolean;
  canInterviews: boolean;
  canEvaluations: boolean;
  canEmployees: boolean;
  canAttendance: boolean;
  canLeave: boolean;
  canPayroll: boolean;
  canReports: boolean;
}

export interface SubAdminItem {
  id: string;
  name: string;
  email: string;
  role: Role;
  createdAt: string;
  permissions: SubAdminPermissionFlags;
}

/** Database-level page of a list: 1-based page, bounded page size and the total count. */
export interface PageInfo {
  page: number;
  pageSize: number;
  total: number;
  pageCount: number;
}

/** Summary counts of the sub-admin directory, computed in PostgreSQL. */
export interface SubAdminStats {
  total: number;
  hrCount: number;
  /** Managers, mentors and interviewers. */
  reviewerCount: number;
  /** Accounts whose custom permission row grants four or more modules. */
  multiModuleCount: number;
}

export interface SubAdminListPage {
  items: SubAdminItem[];
  page: PageInfo;
  stats: SubAdminStats;
  search?: string;
}
