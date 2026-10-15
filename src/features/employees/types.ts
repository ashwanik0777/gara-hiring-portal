import {
  EmployeeStatus,
  OfferStatus,
  ApplicationStatus,
  Role,
} from "@prisma/client";

export { EmployeeStatus, OfferStatus, ApplicationStatus, Role };

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
  exitRecord?: EmployeeExitItem | null;
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
}

export interface EmployeeDirectoryFilters {
  department?: string;
  status?: EmployeeStatus;
  search?: string;
}
