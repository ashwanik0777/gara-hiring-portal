import { CertificateStatus, CompletionStatus } from "@/types/enums";
import type { CertificateTypeKey } from "./certificate-types";

export { CertificateStatus, CompletionStatus };

export interface CertificateDetail {
  id: string;
  verificationCode: string;
  /** Internship enrollment; null for a training certificate. */
  enrollmentId: string | null;
  /** Industrial Training enrollment; null for an internship certificate. */
  trainingEnrollmentId?: string | null;
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
  type: CertificateTypeKey;
  collegeName: string | null;
  domain: string | null;
  periodStart: Date | null;
  projectTitle: string | null;
  grade: string | null;
  secondSignatoryName: string | null;
  secondSignatoryTitle: string | null;
  revokedAt?: Date | null;
  reissueHistory?: {
    id: string;
    previousCode: string;
    newCode: string;
    reason: string;
    createdAt: Date;
  }[];
}

/**
 * What anyone with a certificate ID may see (careers plan, 2026-11-19): status, name,
 * programme, dates and issue date only. Never email, phone, notes or a revocation reason.
 */
export interface PublicCertificateVerificationResult {
  valid: boolean;
  status?: CertificateStatus;
  verificationCode?: string;
  /** Label of the certificate type, e.g. "Internship completion". */
  typeLabel?: string;
  recipientName?: string;
  programmeTitle?: string;
  /** Start of the recognised period (YYYY-MM-DD); absent on older certificates. */
  periodStart?: string;
  issueDate?: string;
  completionDate?: string;
  /** Set for revoked certificates (YYYY-MM-DD). */
  revokedOn?: string;
  error?: string;
}

export interface IssueCertificateInput {
  enrollmentId: string;
  /** Entered by the issuer (prefilled from CERTIFICATE_SIGNATORIES when configured). */
  signatoryName: string;
  signatoryTitle: string;
  /** Optional second signatory: both or neither. */
  secondSignatoryName?: string | null;
  secondSignatoryTitle?: string | null;
  /** Optional details printed on the certificate. */
  projectTitle?: string | null;
  grade?: string | null;
  /** Start of the internship (YYYY-MM-DD); the evaluation start date when omitted. */
  periodStart?: string | null;
}

export interface RevokeCertificateInput {
  certificateId: string;
  reason: string;
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
