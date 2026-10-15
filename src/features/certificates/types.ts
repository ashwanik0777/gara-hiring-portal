import { CertificateStatus, CompletionStatus } from "@prisma/client";

export { CertificateStatus, CompletionStatus };

export interface CertificateDetail {
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
  reissueHistory?: {
    id: string;
    previousCode: string;
    newCode: string;
    reason: string;
    createdAt: Date;
  }[];
}

export interface PublicCertificateVerificationResult {
  valid: boolean;
  status?: CertificateStatus;
  verificationCode?: string;
  recipientName?: string;
  programmeTitle?: string;
  issueDate?: string;
  completionDate?: string;
  signatoryTitle?: string;
  signatoryName?: string;
  error?: string;
}

export interface IssueCertificateInput {
  enrollmentId: string;
  signatoryName?: string;
  signatoryTitle?: string;
}

export interface ReissueCertificateInput {
  certificateId: string;
  reason: string;
  signatoryName?: string;
  signatoryTitle?: string;
}

export interface CompletionChecklistInput {
  enrollmentId: string;
  checklistResponses: {
    id: string;
    label: string;
    completed: boolean;
    verifiedAt?: string;
  }[];
  isEligibleForCertificate: boolean;
  completionNotes?: string;
}
