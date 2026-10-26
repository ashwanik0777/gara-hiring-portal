import {
  ApplicationStatus,
  EmploymentType,
  EvaluationStatus,
  InterviewStatus,
  InterviewRecommendation,
} from "@prisma/client";
import { FormSchemaDefinition } from "@/features/application-forms/types";

export { ApplicationStatus, InterviewStatus, InterviewRecommendation };

// -----------------------------------------------------------------------------
// Application queue (paginated list)
// -----------------------------------------------------------------------------

/** Applications per queue page; also the most a "select page" bulk action can include. */
export const RECRUITMENT_QUEUE_PAGE_SIZE = 50;

export interface QueuePagination {
  /** 1-based page number; anything that is not a positive integer means page 1. */
  page?: number;
  /** Rows per page, capped at RECRUITMENT_QUEUE_PAGE_SIZE. */
  pageSize?: number;
}

/** One row of the staff application queue: only the columns the list renders. */
export interface RecruitmentQueueItem {
  id: string;
  referenceCode: string;
  status: ApplicationStatus;
  createdAt: Date;
  opening: {
    title: string;
    department: string;
  };
  candidate: {
    fullName: string;
    email: string;
    phone: string | null;
    location: string | null;
  };
  /** Most recent interview round visible to the viewer (interviewers: their own rounds only). */
  latestInterview: {
    id: string;
    roundName: string;
    scheduledAt: Date;
    status: InterviewStatus;
  } | null;
}

export interface RecruitmentQueuePage {
  items: RecruitmentQueueItem[];
  /** Applications matching the filters across all pages. */
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

// -----------------------------------------------------------------------------
// Interview board (windowed, paginated list + aggregate statistics)
// -----------------------------------------------------------------------------

export const INTERVIEW_BOARD_PAGE_SIZE = 50;
/** Default board window: sessions from this many days ago ... */
export const INTERVIEW_BOARD_PAST_DAYS = 30;
/** ... up to this many days ahead. */
export const INTERVIEW_BOARD_FUTURE_DAYS = 60;

/** "window" lists recent and upcoming sessions; "all" lists every session, paginated. */
export type InterviewBoardRange = "window" | "all";

export interface InterviewBoardOptions {
  order?: "asc" | "desc";
  range?: InterviewBoardRange;
  page?: number;
  pageSize?: number;
  /** Reference time for the default window (injectable for tests). */
  now?: Date;
}

/** One session of the staff interview board: only the columns the board renders. */
export interface InterviewBoardItem {
  id: string;
  applicationId: string;
  roundNumber: number;
  roundName: string;
  scheduledAt: Date;
  durationMinutes: number;
  meetingLink: string | null;
  status: InterviewStatus;
  icsSequence: number;
  /** The candidate booked this session from offered times. */
  selfScheduled: boolean;
  candidateName: string;
  openingTitle: string;
  openingDepartment: string;
  interviewerName: string | null;
  /** Recommendation on this session; interviewer-scoped viewers only see their own. */
  feedback: { recommendation: InterviewRecommendation } | null;
}

export interface InterviewBoardPage {
  items: InterviewBoardItem[];
  /** Sessions matching the range across all pages. */
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
  range: InterviewBoardRange;
  /** Bounds applied to `scheduledAt` (inclusive from, exclusive to); null for range "all". */
  window: { from: Date; to: Date } | null;
}

/** All-time counts for the board's KPI cards, limited to the sessions the viewer may see. */
export interface InterviewBoardStats {
  total: number;
  /** SCHEDULED + RESCHEDULED. */
  upcoming: number;
  /** COMPLETED (feedback submission completes a session). */
  completed: number;
  /** HIRE + STRONG_HIRE recommendations (own feedback only for interviewer-scoped viewers). */
  positive: number;
}

// -----------------------------------------------------------------------------
// Application detail (staff cockpit)
// -----------------------------------------------------------------------------

/** Base of the staff application detail projection. */
export interface RecruiterApplicationItem {
  id: string;
  referenceCode: string;
  status: ApplicationStatus;
  createdAt: Date;
  updatedAt: Date;
  opening: {
    id: string;
    title: string;
    slug: string;
    department: string;
    type: string;
    location: string;
  };
  candidate: {
    id: string;
    userId: string;
    fullName: string;
    email: string;
    phone?: string | null;
    location?: string | null;
  };
  assignedRecruiter?: {
    id: string;
    name: string;
    email: string;
  } | null;
  latestInterview?: {
    id: string;
    roundName: string;
    scheduledAt: Date;
    status: InterviewStatus;
    interviewerName?: string | null;
  } | null;
}

export interface RecruiterStatusHistoryItem {
  id: string;
  fromStatus: string;
  toStatus: string;
  internalNotes?: string | null; // CONFIDENTIAL - visible to staff only (omitted for interviewer-scoped views)
  candidateMessage?: string | null;
  createdAt: Date;
  actor?: {
    id: string;
    name: string;
    /** Null when the viewer may not see staff email addresses (interviewer-scoped view). */
    email: string | null;
  } | null;
}

export interface InterviewScheduleItem {
  id: string;
  roundNumber: number;
  roundName: string;
  scheduledAt: Date;
  durationMinutes: number;
  meetingLink?: string | null;
  status: InterviewStatus;
  interviewer?: {
    id: string;
    name: string;
    email: string;
  } | null;
  scheduledBy: {
    id: string;
    name: string;
  };
  rescheduleReason?: string | null;
  cancellationReason?: string | null;
  feedback?: {
    id: string;
    recommendation: InterviewRecommendation;
    ratings: Record<string, unknown>;
    summaryNotes: string; // Confidential evaluation notes
    submittedAt: Date;
    interviewerId: string;
    interviewerName: string;
  } | null;
}

export interface RecruiterApplicationDetail extends RecruiterApplicationItem {
  /**
   * True when the viewer is interviewer-scoped: internal notes, staff emails, other
   * interviewers' rounds and feedback are omitted from this projection.
   */
  restrictedView: boolean;
  /** Stored source code (see `src/features/applications/source-tracking.ts`); null for legacy rows. */
  source: string | null;
  /** Plain-text campaign detail recorded with the source (utm values, referrer host). */
  sourceDetail: string | null;
  formVersion: {
    versionNumber: number;
    schemaDefinition: FormSchemaDefinition;
  };
  submittedResponses: Record<string, unknown>;
  resumeStorageKey: string;
  resumeDownloadUrl: string;
  statusHistory: RecruiterStatusHistoryItem[];
  interviewSchedules: InterviewScheduleItem[];
  /** Internship evaluation enrollment; null when none exists or for interviewer-scoped views. */
  evaluation: {
    enrollmentId: string;
    status: EvaluationStatus;
    supervisorId: string | null;
    supervisorName: string | null;
  } | null;
  /** Employee record created when the person was marked as joined; null until then. */
  joinedEmployee: {
    id: string;
    employeeCode: string;
    employmentType: EmploymentType | null;
    joiningDate: Date;
  } | null;
}

/**
 * Staff member who may be assigned to conduct an interview round
 * (holds INTERVIEWER, MANAGER, HR or ADMIN).
 */
export interface InterviewerOption {
  id: string;
  name: string;
  email: string;
  roles: string[];
}

export interface QueueFilters {
  status?: ApplicationStatus;
  openingId?: string;
  assignedRecruiterId?: string;
  search?: string;
}

// -----------------------------------------------------------------------------
// Candidate self-scheduling (booking requests)
// -----------------------------------------------------------------------------

export type BookingRequestStatus = "PENDING" | "BOOKED" | "CANCELLED";
export type BookingSlotStatus = "OPEN" | "BOOKED" | "RELEASED";

export interface BookingSlotView {
  id: string;
  /** ISO start time. */
  startsAt: string;
  status: BookingSlotStatus;
  /** True when the start time has already passed. */
  isPast: boolean;
}

/** Staff projection of a booking request (application detail page). */
export interface StaffBookingRequestView {
  id: string;
  applicationId: string;
  roundNumber: number;
  roundName: string;
  durationMinutes: number;
  meetingLink: string | null;
  status: BookingRequestStatus;
  interviewerName: string | null;
  createdAt: string;
  slots: BookingSlotView[];
  /** OPEN options whose start time is still in the future. */
  openSlotCount: number;
  /** Pending, but every offered time has passed without a booking. */
  noTimesLeft: boolean;
  bookedInterview: { id: string; scheduledAt: string; status: InterviewStatus } | null;
  /** The viewer may cancel this request (pending and within their scope). */
  canCancel: boolean;
}

/** Pending booking request shown on the staff interview board. */
export interface StaffBookingBoardItem extends StaffBookingRequestView {
  candidateName: string;
  openingTitle: string;
  openingDepartment: string;
}
