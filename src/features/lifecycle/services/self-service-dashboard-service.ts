import { cache } from "react";
import { prisma } from "@/lib/db";
import { toUtcDateOnly, utcDateKey } from "@/features/attendance/services/attendance-dates";
import {
  ApplicationStatus,
  AttendanceStatus,
  CareerInterest,
  CertificateStatus,
  CheckpointStatus,
  EmployeeStatus,
  EmploymentType,
  EvaluationStatus,
  IdCardStatus,
  InterviewStatus,
  LeaveRequestStatus,
  OfferStatus,
  OpeningStatus,
  OpeningType,
  PayrollStatus,
  ProgressCadence,
  SubmissionReviewStatus,
  TaskPriority,
  TaskStatus,
  WorkplaceType,
} from "@/types/enums";
import {
  CLOSED_APPLICATION_STATUSES,
  computeProfileCompleteness,
  openingTypesForInterest,
  parseChecklistProgress,
  safeMeetingLink,
  type ChecklistProgressItem,
  type ProfileCompleteness,
} from "./journey-progress";

/*
 * Read-only queries behind the self-service dashboards (candidate, evaluation / intern
 * workspace, employee home). Rules for every function here:
 * - The caller passes the signed-in user's id from the page guard; it is never taken
 *   from the client, and every query filters on it (directly or through a relation).
 * - Only fields the dashboards render are selected: no internal notes, interview
 *   feedback, staff identities or emails, payout/bank details, amounts or storage keys.
 */

// -----------------------------------------------------------------------------
// Candidate dashboard
// -----------------------------------------------------------------------------

export interface DashboardApplication {
  id: string;
  referenceCode: string;
  status: ApplicationStatus;
  createdAt: string;
  updatedAt: string;
  opening: {
    title: string;
    slug: string;
    department: string;
    type: OpeningType;
    location: string;
  };
}

/** The user's own (non-archived) applications, newest first. Memoized per request. */
export const listOwnApplications = cache(async (userId: string): Promise<DashboardApplication[]> => {
  const rows = await prisma.application.findMany({
    where: { candidate: { userId }, isArchived: false },
    select: {
      id: true,
      referenceCode: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      opening: { select: { title: true, slug: true, department: true, type: true, location: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return rows.map((row) => ({
    id: row.id,
    referenceCode: row.referenceCode,
    status: row.status as ApplicationStatus,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    opening: {
      title: row.opening.title,
      slug: row.opening.slug,
      department: row.opening.department,
      type: row.opening.type as OpeningType,
      location: row.opening.location,
    },
  }));
});

/** Stage history of one of the user's own applications (target status and time only). */
export async function getOwnApplicationHistory(
  userId: string,
  applicationId: string
): Promise<Array<{ toStatus: string; createdAt: string }>> {
  const rows = await prisma.applicationStatusHistory.findMany({
    where: { applicationId, application: { candidate: { userId } } },
    select: { toStatus: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  return rows.map((row) => ({ toStatus: row.toStatus, createdAt: row.createdAt.toISOString() }));
}

export interface UpcomingInterview {
  id: string;
  roundNumber: number;
  roundName: string;
  scheduledAt: string;
  durationMinutes: number;
  status: InterviewStatus;
  /** Present only when the stored link is an http(s) URL. */
  meetingLink: string | null;
  application: { id: string; referenceCode: string; openingTitle: string };
}

/** Keeps an interview that is under way visible for a while after its start time. */
const INTERVIEW_IN_PROGRESS_WINDOW_MS = 2 * 60 * 60 * 1000;

/** Scheduled interviews for the user's own open applications, soonest first. */
export async function getUpcomingInterviews(
  userId: string,
  now: Date = new Date(),
  limit = 5
): Promise<UpcomingInterview[]> {
  const rows = await prisma.interviewSchedule.findMany({
    where: {
      application: {
        candidate: { userId },
        isArchived: false,
        status: { notIn: [...CLOSED_APPLICATION_STATUSES] },
      },
      status: { in: [InterviewStatus.SCHEDULED, InterviewStatus.RESCHEDULED] },
      scheduledAt: { gte: new Date(now.getTime() - INTERVIEW_IN_PROGRESS_WINDOW_MS) },
    },
    select: {
      id: true,
      roundNumber: true,
      roundName: true,
      scheduledAt: true,
      durationMinutes: true,
      status: true,
      meetingLink: true,
      application: { select: { id: true, referenceCode: true, opening: { select: { title: true } } } },
    },
    orderBy: { scheduledAt: "asc" },
    take: limit,
  });

  return rows.map((row) => ({
    id: row.id,
    roundNumber: row.roundNumber,
    roundName: row.roundName,
    scheduledAt: row.scheduledAt.toISOString(),
    durationMinutes: row.durationMinutes,
    status: row.status as InterviewStatus,
    meetingLink: safeMeetingLink(row.meetingLink),
    application: {
      id: row.application.id,
      referenceCode: row.application.referenceCode,
      openingTitle: row.application.opening.title,
    },
  }));
}

export interface PendingOffer {
  id: string;
  designation: string;
  department: string;
  expectedJoiningDate: string;
  extendedAt: string | null;
  application: { id: string; referenceCode: string; openingTitle: string };
}

/** Offers extended to the user that still await their decision. */
export async function getOffersAwaitingDecision(userId: string): Promise<PendingOffer[]> {
  const rows = await prisma.jobOffer.findMany({
    where: { status: OfferStatus.EXTENDED, application: { candidate: { userId } } },
    select: {
      id: true,
      designation: true,
      department: true,
      expectedJoiningDate: true,
      extendedAt: true,
      application: { select: { id: true, referenceCode: true, opening: { select: { title: true } } } },
    },
    orderBy: { extendedAt: "desc" },
  });

  return rows.map((row) => ({
    id: row.id,
    designation: row.designation,
    department: row.department,
    expectedJoiningDate: row.expectedJoiningDate.toISOString(),
    extendedAt: row.extendedAt?.toISOString() ?? null,
    application: {
      id: row.application.id,
      referenceCode: row.application.referenceCode,
      openingTitle: row.application.opening.title,
    },
  }));
}

export interface RecommendedOpening {
  id: string;
  title: string;
  slug: string;
  department: string;
  type: OpeningType;
  location: string;
  workplaceType: WorkplaceType;
}

/**
 * Published openings matching the candidate's career interest that they have not
 * applied to yet (JOB → full time, INTERNSHIP → internships, BOTH / not set → both).
 */
export async function getRecommendedOpenings(
  userId: string,
  interest: CareerInterest | null,
  limit = 6
): Promise<RecommendedOpening[]> {
  const rows = await prisma.opening.findMany({
    where: {
      status: OpeningStatus.PUBLISHED,
      type: { in: openingTypesForInterest(interest) },
      applications: { none: { candidate: { userId } } },
    },
    select: {
      id: true,
      title: true,
      slug: true,
      department: true,
      type: true,
      location: true,
      workplaceType: true,
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    slug: row.slug,
    department: row.department,
    type: row.type as OpeningType,
    location: row.location,
    workplaceType: row.workplaceType as WorkplaceType,
  }));
}

/** How many CandidateProfile details the user has filled in. */
export async function getProfileCompleteness(userId: string): Promise<ProfileCompleteness> {
  const profile = await prisma.candidateProfile.findUnique({
    where: { userId },
    select: {
      careerInterest: true,
      phone: true,
      location: true,
      highestEducation: true,
      currentOrganization: true,
      linkedinUrl: true,
      githubUrl: true,
      portfolioUrl: true,
    },
  });
  return computeProfileCompleteness(profile);
}

export interface CheckpointProgress {
  total: number;
  submitted: number;
  reviewed: number;
}

export function summarizeCheckpoints(statuses: ReadonlyArray<{ status: string }>): CheckpointProgress {
  return {
    total: statuses.length,
    submitted: statuses.filter(
      (c) => c.status === CheckpointStatus.SUBMITTED || c.status === CheckpointStatus.REVIEWED
    ).length,
    reviewed: statuses.filter((c) => c.status === CheckpointStatus.REVIEWED).length,
  };
}

/** Checkpoint counts of the user's own evaluation enrollment. */
export async function getOwnCheckpointProgress(userId: string, enrollmentId: string): Promise<CheckpointProgress> {
  const rows = await prisma.evaluationCheckpoint.findMany({
    where: { enrollmentId, enrollment: { userId } },
    select: { status: true },
  });
  return summarizeCheckpoints(rows);
}

// -----------------------------------------------------------------------------
// Evaluation / intern workspace
// -----------------------------------------------------------------------------

export interface WorkspaceTask {
  id: string;
  enrollmentId: string;
  title: string;
  description: string;
  priority: TaskPriority;
  dueDate: Date | null;
  status: TaskStatus;
  changeRequestNotes: string | null;
  assignedBy: { name: string };
  createdAt: Date;
  updatedAt: Date;
  submissions: Array<{
    id: string;
    versionNumber: number;
    submissionNotes: string;
    deliverableUrls: string[] | null;
    status: SubmissionReviewStatus;
    supervisorFeedback: string | null;
    reviewedAt: Date | null;
    submittedAt: Date;
    reviewedBy: { name: string } | null;
  }>;
}

export interface EvaluationWorkspace {
  id: string;
  status: EvaluationStatus;
  startDate: string | null;
  endDate: string | null;
  workingDaysTarget: number;
  evaluatedAt: string | null;
  referenceCode: string;
  opening: { title: string; department: string; type: OpeningType };
  supervisorName: string | null;
  checkpoints: Array<{
    id: string;
    dayNumber: number;
    title: string;
    description: string | null;
    submissionNotes: string | null;
    supervisorFeedback: string | null;
    status: CheckpointStatus;
  }>;
  tasks: WorkspaceTask[];
  progressReports: Array<{
    id: string;
    cadence: ProgressCadence;
    periodIdentifier: string;
    summary: string;
    learnings: string | null;
    blockers: string | null;
    supervisorFeedback: string | null;
    submittedAt: string;
  }>;
  certificate: {
    id: string;
    verificationCode: string;
    recipientName: string;
    programmeTitle: string;
    completionDate: Date;
    signatoryName: string;
    signatoryTitle: string;
    status: CertificateStatus;
  } | null;
  idCard: {
    cardNumber: string | null;
    status: IdCardStatus;
    approvedAt: string | null;
    issuedAt: string | null;
  } | null;
}

function toDeliverableUrls(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  return value.filter((item): item is string => typeof item === "string");
}

/**
 * The user's most recent internship enrollment with everything the workspace renders.
 * Staff appear by display name only; the final review notes stay internal.
 */
export async function getOwnEvaluationWorkspace(userId: string): Promise<EvaluationWorkspace | null> {
  const enrollment = await prisma.internshipEnrollment.findFirst({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      status: true,
      startDate: true,
      endDate: true,
      workingDaysTarget: true,
      evaluatedAt: true,
      application: {
        select: {
          referenceCode: true,
          opening: { select: { title: true, department: true, type: true } },
        },
      },
      supervisor: { select: { name: true } },
      checkpoints: {
        select: {
          id: true,
          dayNumber: true,
          title: true,
          description: true,
          submissionNotes: true,
          supervisorFeedback: true,
          status: true,
        },
        orderBy: { dayNumber: "asc" },
      },
      tasks: {
        select: {
          id: true,
          enrollmentId: true,
          title: true,
          description: true,
          priority: true,
          dueDate: true,
          status: true,
          changeRequestNotes: true,
          createdAt: true,
          updatedAt: true,
          assignedBy: { select: { name: true } },
          submissions: {
            select: {
              id: true,
              versionNumber: true,
              submissionNotes: true,
              deliverableUrls: true,
              status: true,
              supervisorFeedback: true,
              reviewedAt: true,
              submittedAt: true,
              reviewedBy: { select: { name: true } },
            },
            orderBy: { versionNumber: "desc" },
          },
        },
        orderBy: { createdAt: "desc" },
      },
      progressReports: {
        select: {
          id: true,
          cadence: true,
          periodIdentifier: true,
          summary: true,
          learnings: true,
          blockers: true,
          supervisorFeedback: true,
          submittedAt: true,
        },
        orderBy: { submittedAt: "desc" },
      },
      certificate: {
        select: {
          id: true,
          verificationCode: true,
          recipientName: true,
          programmeTitle: true,
          completionDate: true,
          signatoryName: true,
          signatoryTitle: true,
          status: true,
        },
      },
      idCard: { select: { cardNumber: true, status: true, approvedAt: true, issuedAt: true } },
    },
  });

  if (!enrollment) return null;

  return {
    id: enrollment.id,
    status: enrollment.status as EvaluationStatus,
    startDate: enrollment.startDate?.toISOString() ?? null,
    endDate: enrollment.endDate?.toISOString() ?? null,
    workingDaysTarget: enrollment.workingDaysTarget,
    evaluatedAt: enrollment.evaluatedAt?.toISOString() ?? null,
    referenceCode: enrollment.application.referenceCode,
    opening: {
      title: enrollment.application.opening.title,
      department: enrollment.application.opening.department,
      type: enrollment.application.opening.type as OpeningType,
    },
    supervisorName: enrollment.supervisor?.name ?? null,
    checkpoints: enrollment.checkpoints.map((c) => ({ ...c, status: c.status as CheckpointStatus })),
    tasks: enrollment.tasks.map((t) => ({
      id: t.id,
      enrollmentId: t.enrollmentId,
      title: t.title,
      description: t.description,
      priority: t.priority as TaskPriority,
      dueDate: t.dueDate,
      status: t.status as TaskStatus,
      changeRequestNotes: t.changeRequestNotes,
      assignedBy: { name: t.assignedBy.name },
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
      submissions: t.submissions.map((s) => ({
        id: s.id,
        versionNumber: s.versionNumber,
        submissionNotes: s.submissionNotes,
        deliverableUrls: toDeliverableUrls(s.deliverableUrls),
        status: s.status as SubmissionReviewStatus,
        supervisorFeedback: s.supervisorFeedback,
        reviewedAt: s.reviewedAt,
        submittedAt: s.submittedAt,
        reviewedBy: s.reviewedBy ? { name: s.reviewedBy.name } : null,
      })),
    })),
    progressReports: enrollment.progressReports.map((r) => ({
      id: r.id,
      cadence: r.cadence as ProgressCadence,
      periodIdentifier: r.periodIdentifier,
      summary: r.summary,
      learnings: r.learnings,
      blockers: r.blockers,
      supervisorFeedback: r.supervisorFeedback,
      submittedAt: r.submittedAt.toISOString(),
    })),
    certificate: enrollment.certificate
      ? { ...enrollment.certificate, status: enrollment.certificate.status as CertificateStatus }
      : null,
    idCard: enrollment.idCard
      ? {
          cardNumber: enrollment.idCard.cardNumber,
          status: enrollment.idCard.status as IdCardStatus,
          approvedAt: enrollment.idCard.approvedAt?.toISOString() ?? null,
          issuedAt: enrollment.idCard.issuedAt?.toISOString() ?? null,
        }
      : null,
  };
}

// -----------------------------------------------------------------------------
// HR self-service (interns and employees)
// -----------------------------------------------------------------------------

export interface TodayAttendance {
  /** `YYYY-MM-DD` of today's UTC calendar day (attendance rows are keyed by UTC day). */
  dateKey: string;
  record: {
    status: AttendanceStatus;
    checkInTime: string | null;
    checkOutTime: string | null;
  } | null;
}

/** Today's attendance row of the user's own employee record, if one was recorded. */
export async function getTodayAttendance(userId: string, now: Date = new Date()): Promise<TodayAttendance> {
  const date = toUtcDateOnly(now);
  const record = await prisma.attendanceRecord.findFirst({
    where: { date, employee: { userId } },
    select: { status: true, checkInTime: true, checkOutTime: true },
  });

  return {
    dateKey: utcDateKey(now),
    record: record
      ? {
          status: record.status as AttendanceStatus,
          checkInTime: record.checkInTime?.toISOString() ?? null,
          checkOutTime: record.checkOutTime?.toISOString() ?? null,
        }
      : null,
  };
}

export interface OwnEmploymentProfile {
  employeeCode: string;
  designation: string;
  department: string;
  joiningDate: string;
  status: EmployeeStatus;
  employmentType: EmploymentType | null;
  reportingManagerName: string | null;
  onboarding: ChecklistProgressItem[];
}

/** The user's own employment record: summary fields, manager name and onboarding progress. */
export const getOwnEmploymentProfile = cache(async (userId: string): Promise<OwnEmploymentProfile | null> => {
  const employee = await prisma.employee.findUnique({
    where: { userId },
    select: {
      employeeCode: true,
      designation: true,
      department: true,
      joiningDate: true,
      status: true,
      employmentType: true,
      manager: { select: { user: { select: { name: true } } } },
      onboardingChecklist: true,
    },
  });

  if (!employee) return null;

  return {
    employeeCode: employee.employeeCode,
    designation: employee.designation,
    department: employee.department,
    joiningDate: employee.joiningDate.toISOString(),
    status: employee.status as EmployeeStatus,
    employmentType: (employee.employmentType as EmploymentType | null) ?? null,
    reportingManagerName: employee.manager?.user.name ?? null,
    onboarding: parseChecklistProgress(employee.onboardingChecklist),
  };
});

export interface OwnLeaveSummary {
  pending: number;
  approved: number;
}

/** Counts of the user's own leave requests (no balances: entitlements are not configured, OD-007). */
export async function getOwnLeaveSummary(userId: string): Promise<OwnLeaveSummary> {
  const [pending, approved] = await Promise.all([
    prisma.leaveRequest.count({ where: { employee: { userId }, status: LeaveRequestStatus.PENDING } }),
    prisma.leaveRequest.count({ where: { employee: { userId }, status: LeaveRequestStatus.APPROVED } }),
  ]);
  return { pending, approved };
}

export interface OwnPayrollRecordSummary {
  id: string;
  status: PayrollStatus;
  periodCode: string;
  periodStartDate: string;
  periodEndDate: string;
}

/** The user's latest payroll records: period and status only (no amounts or references). */
export async function getOwnLatestPayrollRecords(userId: string, limit = 3): Promise<OwnPayrollRecordSummary[]> {
  const rows = await prisma.payrollRecord.findMany({
    where: { employee: { userId } },
    select: {
      id: true,
      status: true,
      payrollPeriod: { select: { code: true, startDate: true, endDate: true } },
    },
    orderBy: { payrollPeriod: { startDate: "desc" } },
    take: limit,
  });

  return rows.map((row) => ({
    id: row.id,
    status: row.status as PayrollStatus,
    periodCode: row.payrollPeriod.code,
    periodStartDate: row.payrollPeriod.startDate.toISOString(),
    periodEndDate: row.payrollPeriod.endDate.toISOString(),
  }));
}
