import {
  ApplicationStatus,
  EmployeeStatus,
  EmploymentType,
  OpeningType,
  EvaluationStatus,
  CheckpointStatus,
  OnboardingStatus,
  IdCardStatus,
  CompletionStatus,
  CertificateStatus,
  TaskPriority,
  TaskStatus,
  SubmissionReviewStatus,
} from "@prisma/client";

export {
  EvaluationStatus,
  CheckpointStatus,
  OnboardingStatus,
  IdCardStatus,
  CompletionStatus,
  CertificateStatus,
  TaskPriority,
  TaskStatus,
  SubmissionReviewStatus,
};

export interface WorkingDayCalendarConfig {
  /**
   * Day numbers: 0 = Sun, 1 = Mon, ..., 6 = Sat.
   * Default: [1, 2, 3, 4, 5] (Monday to Friday).
   */
  workingDaysOfWeek: number[];
  /**
   * Array of holiday date strings in 'YYYY-MM-DD' format.
   */
  holidays: string[];
  /**
   * Optional timezone (e.g. 'Asia/Kolkata').
   */
  timezone?: string;
}

export interface CheckpointItem {
  id: string;
  dayNumber: number;
  title: string;
  description?: string | null;
  submissionNotes?: string | null;
  supervisorFeedback?: string | null;
  status: CheckpointStatus;
  reviewedAt?: Date | null;
}

export interface OnboardingChecklistItem {
  id: string;
  label: string;
  description?: string;
  required: boolean;
  completed: boolean;
  verifiedAt?: string | null;
  verifiedBy?: string | null;
  verifiedById?: string | null;
}

export interface EvaluationEnrollmentListItem {
  id: string;
  referenceCode: string;
  candidateName: string;
  candidateEmail: string;
  openingTitle: string;
  openingDepartment: string;
  supervisorName: string | null;
  status: EvaluationStatus;
  startDate: Date | null;
  endDate: Date | null;
  reviewedCheckpoints: number;
  totalCheckpoints: number;
  idCardNumber: string | null;
  /** True once HR marked the person as joined from this application. */
  joined: boolean;
  /** Employment type recorded at joining (null when not joined or for legacy records). */
  joinedEmploymentType: EmploymentType | null;
}

/** Staff member who may be assigned to supervise an internship evaluation. */
export interface SupervisorOption {
  id: string;
  name: string;
  email: string;
  roles: string[];
}

export interface EvaluationEnrollmentDetail {
  id: string;
  applicationId: string;
  /** Current recruitment stage of the linked application (HIRED once marked as joined). */
  applicationStatus: ApplicationStatus;
  openingType: OpeningType;
  /** The intern's user id (staff view; used to exclude them from supervisor choices). */
  internUserId: string;
  /** The person's employment record, if any (joined from this application or otherwise). */
  employment: {
    id: string;
    employeeCode: string;
    status: EmployeeStatus;
    employmentType: EmploymentType | null;
    /** Start of the period this application opened, else the record's joining date. */
    joiningDate: Date;
    /** True when the person joined from this application (also after a later re-join). */
    viaThisApplication: boolean;
  } | null;
  referenceCode: string;
  candidateName: string;
  candidateEmail: string;
  openingTitle: string;
  openingDepartment: string;
  supervisor?: {
    id: string;
    name: string;
    email: string;
  } | null;
  startDate?: Date | null;
  endDate?: Date | null;
  workingDaysTarget: number;
  status: EvaluationStatus;
  finalReviewNotes?: string | null;
  checkpoints: CheckpointItem[];
  onboarding?: {
    id: string;
    status: OnboardingStatus;
    checklistItems: OnboardingChecklistItem[];
    completedAt?: Date | null;
  } | null;
  idCard?: {
    id: string;
    cardNumber?: string | null;
    status: IdCardStatus;
    approvedAt?: Date | null;
    issuedAt?: Date | null;
  } | null;
  tasks?: {
    id: string;
    enrollmentId: string;
    title: string;
    description: string;
    priority: TaskPriority;
    dueDate?: Date | null;
    status: TaskStatus;
    changeRequestNotes?: string | null;
    assignedBy: { id: string; name: string; email: string };
    createdAt: Date;
    updatedAt: Date;
    submissions: {
      id: string;
      versionNumber: number;
      submissionNotes: string;
      deliverableUrls?: string[] | null;
      status: SubmissionReviewStatus;
      supervisorFeedback?: string | null;
      reviewedAt?: Date | null;
      submittedAt: Date;
      reviewedBy?: { id: string; name: string } | null;
    }[];
  }[];
  completion?: {
    id: string;
    status: CompletionStatus;
    checklistResponses: { id: string; label: string; completed: boolean }[] | null;
    isEligibleForCertificate: boolean;
    completionNotes?: string | null;
  } | null;
  certificate?: {
    id: string;
    verificationCode: string;
    enrollmentId: string;
    recipientName: string;
    programmeTitle: string;
    issueDate: Date;
    completionDate: Date;
    signatoryTitle: string;
    signatoryName: string;
    status: CertificateStatus;
    qrPayloadUrl: string;
    versionNumber: number;
    pdfStorageKey?: string | null;
    createdAt: Date;
  } | null;
}
