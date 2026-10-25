import {
  EmployeeStatus,
  EmploymentType,
  OfferStatus,
  ApplicationStatus,
  Role,
} from "@prisma/client";

import type {
  ConversionOfferState,
  PeriodEndReason,
  PeriodStartReason,
  ReviewDueState,
  ReviewOutcome,
} from "./conversion-rules";

export { EmployeeStatus, EmploymentType, OfferStatus, ApplicationStatus, Role };

export interface EmergencyContact {
  name: string;
  relation: string;
  phone: string;
}

export interface OnboardingChecklistItem {
  id: string;
  label: string;
  completed: boolean;
  completedAt?: string | null;
}

export interface PublicEmployeeDirectoryItem {
  id: string;
  employeeCode: string;
  name: string;
  email: string;
  department: string;
  designation: string;
  joiningDate: Date;
  status: EmployeeStatus;
  /** How the person joined; null for records created before the field existed. */
  employmentType: EmploymentType | null;
  avatar?: string | null;
  manager?: {
    id: string;
    employeeCode: string;
    name: string;
    designation: string;
  } | null;
}

export interface EmploymentHistoryItem {
  id: string;
  changeType: string;
  previousValue?: string | null;
  newValue: string;
  effectiveDate: Date;
  remarks?: string | null;
  changedBy?: {
    id: string;
    name: string;
    email: string;
  } | null;
}

export interface EmployeeDocumentItem {
  id: string;
  documentType: string;
  title: string;
  storageKey: string;
  mimeType: string;
  fileSizeBytes: number;
  isConfidential: boolean;
  uploadedAt: Date;
  uploadedBy: {
    id: string;
    name: string;
  };
}

export interface EmployeeExitItem {
  id: string;
  /** Employment period this exit closed (null for legacy rows without a period). */
  periodId: string | null;
  resignationDate?: Date | null;
  lastWorkingDate: Date;
  reason?: string | null;
  clearanceChecklist?: Record<string, unknown> | null;
  exitInterviewNotes?: string | null;
  status: string;
  processedBy?: {
    id: string;
    name: string;
  } | null;
}

export interface ConfidentialEmployeeDetail extends PublicEmployeeDirectoryItem {
  personalPhone?: string | null;
  emergencyContact?: EmergencyContact | null;
  internalNotes?: string | null;
  application?: {
    id: string;
    referenceCode: string;
    openingTitle: string;
  } | null;
  onboardingChecklist?: OnboardingChecklistItem[] | null;
  employmentHistories: EmploymentHistoryItem[];
  secureDocuments: EmployeeDocumentItem[];
  directReports: Array<{
    id: string;
    employeeCode: string;
    name: string;
    designation: string;
    department: string;
  }>;
  /** Exit records, newest first (one per employment period). */
  exitRecords: EmployeeExitItem[];
  /** Employment periods (joining, re-joining, conversion), oldest first. */
  employmentPeriods: EmploymentPeriodItem[];
}

/** One stint of employment on the same employee record. */
export interface EmploymentPeriodItem {
  id: string;
  employmentType: EmploymentType | null;
  designation: string;
  department: string;
  startDate: Date;
  /** null while the period is current. */
  endDate: Date | null;
  startReason: PeriodStartReason;
  endReason: PeriodEndReason | null;
}

export interface JobOfferDetail {
  id: string;
  applicationId: string;
  referenceCode: string;
  candidateName: string;
  candidateEmail: string;
  openingTitle: string;
  status: OfferStatus;
  expectedJoiningDate: Date;
  department: string;
  designation: string;
  location?: string | null;
  termsSummary: string;
  extendedBy?: {
    id: string;
    name: string;
    email: string;
  } | null;
  extendedAt?: Date | null;
  decisionAt?: Date | null;
  declineReason?: string | null;
  notes?: string | null; // Confidential internal notes
  createdAt: Date;
  /**
   * Staff view only: the candidate's existing employee record. An EXITED record is reused
   * when the person re-joins; any other status blocks a new joining.
   */
  candidateEmployment?: { employeeCode: string; status: EmployeeStatus } | null;
  /** Electronic acceptance evidence; null unless the offer was accepted with a typed signature. */
  signature?: OfferSignatureView | null;
  /**
   * Candidate view of an EXTENDED offer only: SHA-256 of the letter as issued. The accept form
   * sends it back so the server can confirm the candidate accepts the letter they reviewed.
   */
  letterHash?: string | null;
}

/** Typed-signature evidence recorded when a candidate accepted an offer electronically. */
export interface OfferSignatureView {
  signedName: string;
  signedAt: Date;
  /** SHA-256 (hex) of the offer letter bytes the candidate accepted. */
  documentHash: string;
  /** Staff view only: the signer's browser (truncated). */
  userAgent?: string | null;
  /** Staff view only: whether a keyed hash of the signer's IP was recorded (never the address). */
  ipHashRecorded?: boolean;
  /** Staff view only: whether the letter regenerated now is byte-identical to the accepted one. */
  documentMatches?: boolean | null;
}

/** Active employee who may be chosen as reporting manager when someone joins. */
export interface ReportingManagerOption {
  id: string;
  employeeCode: string;
  name: string;
  designation: string;
}

export interface EmployeeDirectoryFilters {
  department?: string;
  status?: EmployeeStatus;
  search?: string;
}

/** A scheduled or decided intern progress review, as shown on the staff review board. */
export interface InternReviewItem {
  id: string;
  employeeId: string;
  employeeCode: string;
  internName: string;
  internEmail: string;
  designation: string;
  department: string;
  employeeStatus: EmployeeStatus;
  employmentType: EmploymentType | null;
  /** Start of the internship period the review belongs to. */
  periodStartDate: Date | null;
  reviewPeriodMonths: number;
  scheduledFor: Date;
  status: "SCHEDULED" | "COMPLETED" | "CANCELLED";
  dueState: ReviewDueState | null;
  outcome: ReviewOutcome | null;
  decidedAt: Date | null;
  reviewerName: string | null;
  sharedSummary: string | null;
  /** Staff with decision authority only; null otherwise. */
  internalNotes: string | null;
  proposedDesignation: string | null;
  proposedDepartment: string | null;
  proposedEffectiveDate: Date | null;
  proposedInitialStatus: EmployeeStatus | null;
  offerStatus: ConversionOfferState | null;
  offerRespondedAt: Date | null;
  convertedAt: Date | null;
}

export interface InternReviewBoard {
  overdue: InternReviewItem[];
  dueThisWeek: InternReviewItem[];
  upcoming: InternReviewItem[];
  recentDecisions: InternReviewItem[];
  /** ADMIN, or HR with canEmployees: may record outcomes and read internal notes. */
  canRecord: boolean;
}

/** Result of recording a review outcome. */
export interface ReviewOutcomeResult {
  reviewId: string;
  employeeId: string;
  outcome: ReviewOutcome;
  /** The next review created by an EXTEND outcome. */
  nextReviewId: string | null;
  nextReviewDate: Date | null;
}

/** Result of the intern's answer to a conversion offer. */
export interface ConversionResponseResult {
  decision: "ACCEPT" | "DECLINE";
  /** True when the conversion took effect immediately (effective date today or past). */
  converted: boolean;
  /** True when the conversion was scheduled for the effective date. */
  scheduled: boolean;
  effectiveDate: Date | null;
}
