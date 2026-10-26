import { cache } from "react";
import {
  ApplicationStatus,
  EvaluationStatus,
  InterviewStatus,
  LeaveRequestStatus,
  OpeningStatus,
  Role,
} from "@prisma/client";
import { prisma } from "@/lib/db";
import type { AuthenticatedUser } from "@/lib/auth/guards";
import { logger } from "@/lib/logging/logger";
import { registrationAnalyticsService } from "@/features/reports/services/registration-analytics-service";
import { getUniqueVisitorCount } from "./visitor-service";

/*
 * Figures for the administrator overview (/admin). Every number comes from a grouped or
 * counted query, the loaders are memoised per request with React `cache()` so the
 * streamed sections share one round trip, and a failed query yields "unavailable"
 * rather than a fake zero.
 */

export const UNAVAILABLE = "unavailable" as const;

/** A dashboard figure: a number, or "unavailable" when its query failed. */
export type OverviewMetric = number | typeof UNAVAILABLE;

/** Runs one overview query; a failure is logged and reported as "unavailable". */
export async function loadOverviewMetric<T>(
  label: string,
  query: () => Promise<T>
): Promise<T | typeof UNAVAILABLE> {
  try {
    return await query();
  } catch (error) {
    logger.error(`Admin overview query failed: ${label}`, error);
    return UNAVAILABLE;
  }
}

const TOP_DEPARTMENTS_LIMIT = 4;
const RECENT_APPLICATIONS_LIMIT = 5;
const RECENT_OPENINGS_LIMIT = 4;
const STAFF_ROLES_COUNTED: Role[] = [Role.HR, Role.MANAGER, Role.INTERVIEWER, Role.MENTOR, Role.ADMIN];

/** Today's inclusive window in server time (attendance and leave are compared against it). */
function todayWindow(now = new Date()): { start: Date; end: Date } {
  return {
    start: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0),
    end: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999),
  };
}

// ─── Recruitment pipeline ─────────────────────────────────────────────────────

export interface RecruitmentOverview {
  total: number;
  submitted: number;
  screening: number;
  shortlisted: number;
  /** INTERVIEW_SCHEDULED + INTERVIEWED */
  interviewing: number;
  inEvaluation: number;
  /** OFFERED + OFFER_ACCEPTED + HIRED */
  hired: number;
}

/** One `groupBy` over application statuses replaces seven separate counts. */
export const getRecruitmentOverview = cache(
  async (): Promise<RecruitmentOverview | typeof UNAVAILABLE> =>
    loadOverviewMetric("application pipeline", async () => {
      const groups = await prisma.application.groupBy({
        by: ["status"],
        _count: { _all: true },
      });
      const count = (...statuses: ApplicationStatus[]) =>
        groups
          .filter((group) => statuses.includes(group.status))
          .reduce((sum, group) => sum + group._count._all, 0);
      return {
        total: groups.reduce((sum, group) => sum + group._count._all, 0),
        submitted: count(ApplicationStatus.SUBMITTED),
        screening: count(ApplicationStatus.SCREENING),
        shortlisted: count(ApplicationStatus.SHORTLISTED),
        interviewing: count(ApplicationStatus.INTERVIEW_SCHEDULED, ApplicationStatus.INTERVIEWED),
        inEvaluation: count(ApplicationStatus.EVALUATION_SELECTED),
        hired: count(ApplicationStatus.OFFERED, ApplicationStatus.OFFER_ACCEPTED, ApplicationStatus.HIRED),
      };
    })
);

// ─── Workforce ────────────────────────────────────────────────────────────────

export interface WorkforceOverview {
  totalEmployees: OverviewMetric;
  fullTime: OverviewMetric;
  interns: OverviewMetric;
  /** Largest departments first (at most TOP_DEPARTMENTS_LIMIT). */
  topDepartments: Array<{ department: string; count: number }> | typeof UNAVAILABLE;
}

/** Department headcount from a `groupBy` plus one count of intern designations. */
export const getWorkforceOverview = cache(async (): Promise<WorkforceOverview> => {
  const [departmentGroups, interns] = await Promise.all([
    loadOverviewMetric("employees by department", () =>
      prisma.employee.groupBy({ by: ["department"], _count: { _all: true } })
    ),
    loadOverviewMetric("intern headcount", () =>
      prisma.employee.count({
        where: {
          OR: [
            { designation: { contains: "intern", mode: "insensitive" } },
            { department: { contains: "intern", mode: "insensitive" } },
          ],
        },
      })
    ),
  ]);

  if (departmentGroups === UNAVAILABLE) {
    return { totalEmployees: UNAVAILABLE, fullTime: UNAVAILABLE, interns, topDepartments: UNAVAILABLE };
  }

  const totals = new Map<string, number>();
  for (const group of departmentGroups) {
    const key = group.department || "General";
    totals.set(key, (totals.get(key) ?? 0) + group._count._all);
  }
  const totalEmployees = Array.from(totals.values()).reduce((sum, count) => sum + count, 0);

  return {
    totalEmployees,
    fullTime: interns === UNAVAILABLE ? UNAVAILABLE : Math.max(totalEmployees - interns, 0),
    interns,
    topDepartments: Array.from(totals.entries())
      .map(([department, count]) => ({ department, count }))
      .sort((a, b) => b.count - a.count || a.department.localeCompare(b.department))
      .slice(0, TOP_DEPARTMENTS_LIMIT),
  };
});

// ─── Module counts ────────────────────────────────────────────────────────────

export interface OperationsOverview {
  activeOpenings: OverviewMetric;
  scheduledInterviews: OverviewMetric;
  activeEvaluations: OverviewMetric;
  pendingLeaves: OverviewMetric;
  todayAttendance: OverviewMetric;
  todayOnLeave: OverviewMetric;
  subAdminCount: OverviewMetric;
  /** Code of the latest payroll period; null when none exists. */
  latestPayrollCode: string | null | typeof UNAVAILABLE;
}

/** Indexed counts for the module tiles, each failing independently. */
export const getOperationsOverview = cache(async (): Promise<OperationsOverview> => {
  const { start, end } = todayWindow();
  const [
    activeOpenings,
    scheduledInterviews,
    activeEvaluations,
    pendingLeaves,
    todayAttendance,
    todayOnLeave,
    subAdminCount,
    latestPayroll,
  ] = await Promise.all([
    loadOverviewMetric("published openings", () =>
      prisma.opening.count({ where: { status: OpeningStatus.PUBLISHED } })
    ),
    loadOverviewMetric("scheduled interviews", () =>
      prisma.interviewSchedule.count({ where: { status: InterviewStatus.SCHEDULED } })
    ),
    loadOverviewMetric("active evaluations", () =>
      prisma.internshipEnrollment.count({ where: { status: EvaluationStatus.IN_PROGRESS } })
    ),
    loadOverviewMetric("pending leave requests", () =>
      prisma.leaveRequest.count({ where: { status: LeaveRequestStatus.PENDING } })
    ),
    loadOverviewMetric("attendance today", () =>
      prisma.attendanceRecord.count({
        where: { date: { gte: start, lte: end }, status: "PRESENT" },
      })
    ),
    loadOverviewMetric("on leave today", () =>
      prisma.leaveRequest.count({
        where: {
          status: LeaveRequestStatus.APPROVED,
          startDate: { lte: end },
          endDate: { gte: start },
        },
      })
    ),
    loadOverviewMetric("staff accounts", () =>
      prisma.userRole.count({ where: { role: { in: STAFF_ROLES_COUNTED } } })
    ),
    loadOverviewMetric("latest payroll period", () =>
      prisma.payrollPeriod.findFirst({
        orderBy: { startDate: "desc" },
        select: { code: true },
      })
    ),
  ]);

  return {
    activeOpenings,
    scheduledInterviews,
    activeEvaluations,
    pendingLeaves,
    todayAttendance,
    todayOnLeave,
    subAdminCount,
    latestPayrollCode: latestPayroll === UNAVAILABLE ? UNAVAILABLE : latestPayroll?.code ?? null,
  };
});

// ─── Recent activity ──────────────────────────────────────────────────────────

export interface RecentApplicationItem {
  id: string;
  status: ApplicationStatus;
  createdAt: Date;
  candidateName: string | null;
  openingTitle: string;
}

export interface RecentOpeningItem {
  id: string;
  title: string;
  department: string;
  type: string;
  applicationCount: number;
}

export interface RecentActivityOverview {
  recentApplications: RecentApplicationItem[] | typeof UNAVAILABLE;
  recentOpenings: RecentOpeningItem[] | typeof UNAVAILABLE;
  /** null when the visitor count could not be read. */
  totalVisitors: number | null;
}

/** The latest applications and openings, selecting only the columns the feed renders. */
export const getRecentActivityOverview = cache(async (): Promise<RecentActivityOverview> => {
  const [applications, openings, totalVisitors] = await Promise.all([
    loadOverviewMetric("recent applications", () =>
      prisma.application.findMany({
        take: RECENT_APPLICATIONS_LIMIT,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          status: true,
          createdAt: true,
          opening: { select: { title: true } },
          candidate: { select: { user: { select: { name: true } } } },
        },
      })
    ),
    loadOverviewMetric("recent openings", () =>
      prisma.opening.findMany({
        take: RECENT_OPENINGS_LIMIT,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          title: true,
          department: true,
          type: true,
          _count: { select: { applications: true } },
        },
      })
    ),
    getUniqueVisitorCount(),
  ]);

  return {
    recentApplications:
      applications === UNAVAILABLE
        ? UNAVAILABLE
        : applications.map((app) => ({
            id: app.id,
            status: app.status,
            createdAt: app.createdAt,
            candidateName: app.candidate.user.name,
            openingTitle: app.opening.title,
          })),
    recentOpenings:
      openings === UNAVAILABLE
        ? UNAVAILABLE
        : openings.map((opening) => ({
            id: opening.id,
            title: opening.title,
            department: opening.department,
            type: opening.type,
            applicationCount: opening._count.applications,
          })),
    totalVisitors,
  };
});

// ─── Registrations ────────────────────────────────────────────────────────────

export interface RegistrationOverview {
  /** Candidate accounts ever created (staff accounts are never counted). */
  total: number;
  job: number;
  internship: number;
  both: number;
  notChosen: number;
  /** Registrants without a submitted (non-draft) application yet. */
  notApplied: number;
  /** Signed up today or in the previous 6 days (business time). */
  newLastSevenDays: number;
}

/**
 * Sign-up figures for the overview card: one grouped query, gated by `canReports` in the
 * service (ADMIN always passes). A failure reads "unavailable", never 0.
 */
export const getRegistrationOverview = cache(
  async (user: AuthenticatedUser): Promise<RegistrationOverview | typeof UNAVAILABLE> =>
    loadOverviewMetric("registrations", async () => {
      const summary = await registrationAnalyticsService.getRegistrationSummary(user);
      return {
        total: summary.total,
        job: summary.byInterest.JOB,
        internship: summary.byInterest.INTERNSHIP,
        both: summary.byInterest.BOTH,
        notChosen: summary.byInterest.NOT_CHOSEN,
        notApplied: summary.notApplied,
        newLastSevenDays: summary.newLastSevenDays,
      };
    })
);
