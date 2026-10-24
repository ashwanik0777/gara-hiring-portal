import {
  ApplicationStatus,
  InterviewStatus,
  InterviewRecommendation,
} from "@prisma/client";
import { FormSchemaDefinition } from "@/features/application-forms/types";

export { ApplicationStatus, InterviewStatus, InterviewRecommendation };

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
  formVersion: {
    versionNumber: number;
    schemaDefinition: FormSchemaDefinition;
  };
  submittedResponses: Record<string, unknown>;
  resumeStorageKey: string;
  resumeDownloadUrl: string;
  statusHistory: RecruiterStatusHistoryItem[];
  interviewSchedules: InterviewScheduleItem[];
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
