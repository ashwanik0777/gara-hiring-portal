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
  /**
   * True only when the record shows a PASSED evaluation, every evaluation checkpoint reviewed
   * and an approved completion decision. Used to decide whether that claim may be displayed.
   */
  evaluationRequirementsFulfilled?: boolean;
  error?: string;
}

export interface IssueCertificateInput {
  enrollmentId: string;
  /** Entered explicitly by the issuer; no default signatory is assumed (OD-009). */
  signatoryName: string;
  signatoryTitle: string;
}

export interface ReissueCertificateInput {
  certificateId: string;
  reason: string;
  signatoryName?: string;
  signatoryTitle?: string;
}

export interface CompletionChecklistInput {
  enrollmentId: string;
  /** Only ids and completion flags are accepted; labels come from the server-side template. */
  checklistResponses: {
    id: string;
    completed: boolean;
  }[];
  isEligibleForCertificate: boolean;
  completionNotes?: string;
}
