/**
 * Client-safe Enums matching Prisma Schema.
 * 
 * IMPORTANT: Client components ("use client") must import enums from this file
 * rather than "@prisma/client" directly. Importing "@prisma/client" in browser
 * bundles causes webpack failures because Prisma is a server-side runtime.
 */

export const Role = {
  CANDIDATE: "CANDIDATE",
  INTERN: "INTERN",
  EMPLOYEE: "EMPLOYEE",
  MENTOR: "MENTOR",
  INTERVIEWER: "INTERVIEWER",
  HR: "HR",
  MANAGER: "MANAGER",
  ADMIN: "ADMIN",
} as const;
export type Role = (typeof Role)[keyof typeof Role];

export const EmployeeStatus = {
  PROBATION: "PROBATION",
  ACTIVE: "ACTIVE",
  ON_LEAVE: "ON_LEAVE",
  EXITED: "EXITED",
} as const;
export type EmployeeStatus = (typeof EmployeeStatus)[keyof typeof EmployeeStatus];

export const OpeningType = {
  INTERNSHIP: "INTERNSHIP",
  FULL_TIME: "FULL_TIME",
} as const;
export type OpeningType = (typeof OpeningType)[keyof typeof OpeningType];

export const WorkplaceType = {
  REMOTE: "REMOTE",
  HYBRID: "HYBRID",
  ON_SITE: "ON_SITE",
} as const;
export type WorkplaceType = (typeof WorkplaceType)[keyof typeof WorkplaceType];

export const OpeningStatus = {
  DRAFT: "DRAFT",
  PUBLISHED: "PUBLISHED",
  PAUSED: "PAUSED",
  CLOSED: "CLOSED",
} as const;
export type OpeningStatus = (typeof OpeningStatus)[keyof typeof OpeningStatus];

export const ApplicationStatus = {
  DRAFT: "DRAFT",
  SUBMITTED: "SUBMITTED",
  SCREENING: "SCREENING",
  SHORTLISTED: "SHORTLISTED",
  INTERVIEW_SCHEDULED: "INTERVIEW_SCHEDULED",
  INTERVIEWED: "INTERVIEWED",
  EVALUATION_SELECTED: "EVALUATION_SELECTED",
  OFFERED: "OFFERED",
  OFFER_ACCEPTED: "OFFER_ACCEPTED",
  HIRED: "HIRED",
  REJECTED: "REJECTED",
  WITHDRAWN: "WITHDRAWN",
  ARCHIVED: "ARCHIVED",
} as const;
export type ApplicationStatus = (typeof ApplicationStatus)[keyof typeof ApplicationStatus];

export const InterviewStatus = {
  SCHEDULED: "SCHEDULED",
  COMPLETED: "COMPLETED",
  CANCELLED: "CANCELLED",
  RESCHEDULED: "RESCHEDULED",
} as const;
export type InterviewStatus = (typeof InterviewStatus)[keyof typeof InterviewStatus];

export const InterviewRecommendation = {
  STRONG_HIRE: "STRONG_HIRE",
  HIRE: "HIRE",
  HOLD: "HOLD",
  NO_HIRE: "NO_HIRE",
} as const;
export type InterviewRecommendation = (typeof InterviewRecommendation)[keyof typeof InterviewRecommendation];

export const EvaluationStatus = {
  PENDING_TRIGGER: "PENDING_TRIGGER",
  IN_PROGRESS: "IN_PROGRESS",
  UNDER_REVIEW: "UNDER_REVIEW",
  PASSED: "PASSED",
  FAILED: "FAILED",
  EXTENDED: "EXTENDED",
} as const;
export type EvaluationStatus = (typeof EvaluationStatus)[keyof typeof EvaluationStatus];

export const CheckpointStatus = {
  PENDING: "PENDING",
  SUBMITTED: "SUBMITTED",
  REVIEWED: "REVIEWED",
  BLOCKED: "BLOCKED",
} as const;
export type CheckpointStatus = (typeof CheckpointStatus)[keyof typeof CheckpointStatus];

export const OnboardingStatus = {
  PENDING: "PENDING",
  IN_PROGRESS: "IN_PROGRESS",
  COMPLETED: "COMPLETED",
} as const;
export type OnboardingStatus = (typeof OnboardingStatus)[keyof typeof OnboardingStatus];

export const IdCardStatus = {
  PENDING_APPROVAL: "PENDING_APPROVAL",
  APPROVED: "APPROVED",
  ISSUED: "ISSUED",
  REVOKED: "REVOKED",
} as const;
export type IdCardStatus = (typeof IdCardStatus)[keyof typeof IdCardStatus];

export const TaskPriority = {
  LOW: "LOW",
  MEDIUM: "MEDIUM",
  HIGH: "HIGH",
  URGENT: "URGENT",
} as const;
export type TaskPriority = (typeof TaskPriority)[keyof typeof TaskPriority];

export const TaskStatus = {
  ASSIGNED: "ASSIGNED",
  IN_PROGRESS: "IN_PROGRESS",
  SUBMITTED: "SUBMITTED",
  REVISION_REQUESTED: "REVISION_REQUESTED",
  COMPLETED: "COMPLETED",
  BLOCKED: "BLOCKED",
} as const;
export type TaskStatus = (typeof TaskStatus)[keyof typeof TaskStatus];

export const SubmissionReviewStatus = {
  PENDING: "PENDING",
  APPROVED: "APPROVED",
  REVISION_REQUESTED: "REVISION_REQUESTED",
} as const;
export type SubmissionReviewStatus = (typeof SubmissionReviewStatus)[keyof typeof SubmissionReviewStatus];

export const ProgressCadence = {
  WEEKLY: "WEEKLY",
  BIWEEKLY: "BIWEEKLY",
  MILESTONE: "MILESTONE",
  CHECKPOINT: "CHECKPOINT",
} as const;
export type ProgressCadence = (typeof ProgressCadence)[keyof typeof ProgressCadence];

export const CompletionStatus = {
  IN_PROGRESS: "IN_PROGRESS",
  PENDING_REVIEW: "PENDING_REVIEW",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
} as const;
export type CompletionStatus = (typeof CompletionStatus)[keyof typeof CompletionStatus];

export const CertificateStatus = {
  ACTIVE: "ACTIVE",
  REVOKED: "REVOKED",
  SUPERSEDED: "SUPERSEDED",
} as const;
export type CertificateStatus = (typeof CertificateStatus)[keyof typeof CertificateStatus];

export const OfferStatus = {
  DRAFT: "DRAFT",
  EXTENDED: "EXTENDED",
  ACCEPTED: "ACCEPTED",
  DECLINED: "DECLINED",
  EXPIRED: "EXPIRED",
  REVOKED: "REVOKED",
} as const;
export type OfferStatus = (typeof OfferStatus)[keyof typeof OfferStatus];

export const AttendanceStatus = {
  PRESENT: "PRESENT",
  ABSENT: "ABSENT",
  HALF_DAY: "HALF_DAY",
  ON_LEAVE: "ON_LEAVE",
  REGULARIZATION_PENDING: "REGULARIZATION_PENDING",
} as const;
export type AttendanceStatus = (typeof AttendanceStatus)[keyof typeof AttendanceStatus];

export const AttendanceEntryMethod = {
  WEB_PORTAL: "WEB_PORTAL",
  MANUAL_ENTRY: "MANUAL_ENTRY",
  SYSTEM_IMPORT: "SYSTEM_IMPORT",
} as const;
export type AttendanceEntryMethod = (typeof AttendanceEntryMethod)[keyof typeof AttendanceEntryMethod];

export const RegularizationStatus = {
  PENDING: "PENDING",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
} as const;
export type RegularizationStatus = (typeof RegularizationStatus)[keyof typeof RegularizationStatus];

export const LeaveRequestStatus = {
  PENDING: "PENDING",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
  CANCELLED: "CANCELLED",
} as const;
export type LeaveRequestStatus = (typeof LeaveRequestStatus)[keyof typeof LeaveRequestStatus];

export const PayrollStatus = {
  DRAFT: "DRAFT",
  FINALIZED: "FINALIZED",
  PAID: "PAID",
  VOID: "VOID",
} as const;
export type PayrollStatus = (typeof PayrollStatus)[keyof typeof PayrollStatus];

export const CareerInterest = {
  JOB: "JOB",
  INTERNSHIP: "INTERNSHIP",
  BOTH: "BOTH",
} as const;
export type CareerInterest = (typeof CareerInterest)[keyof typeof CareerInterest];

export const EmploymentType = {
  FULL_TIME: "FULL_TIME",
  INTERN: "INTERN",
} as const;
export type EmploymentType = (typeof EmploymentType)[keyof typeof EmploymentType];
