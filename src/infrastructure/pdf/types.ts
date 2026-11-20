export interface CertificatePdfPayload {
  recipientName: string;
  programmeTitle: string;
  completionDate: string;
  issueDate: string;
  verificationCode: string;
  verificationUrl: string;
  signatoryName: string;
  signatoryTitle: string;
  // Optional details (Phase 5). Lines whose values are missing are not printed.
  /** Company name in the header (registered name once confirmed); "GARA INNOVATION" by default. */
  companyName?: string;
  /** Statutory line at the bottom, e.g. "CIN: … · Udyam Registration No.: …". */
  companyFacts?: string | null;
  /** Heading; "CERTIFICATE OF COMPLETION" by default. */
  title?: string;
  /** Sentence before the programme; the internship sentence by default. */
  statement?: string;
  collegeName?: string | null;
  domain?: string | null;
  periodStart?: string | null;
  projectTitle?: string | null;
  grade?: string | null;
  secondSignatoryName?: string | null;
  secondSignatoryTitle?: string | null;
}

export interface PdfGeneratorService {
  generateCertificatePdf(payload: CertificatePdfPayload): Promise<Buffer>;
}

/** Electronic acceptance shown on an accepted offer letter. */
export interface OfferLetterAcceptance {
  signedName: string;
  signedAt: Date;
  /** SHA-256 (hex) of the letter as issued, i.e. the exact bytes the candidate accepted. */
  documentHash: string;
}

/**
 * Data for an offer letter. Every field comes from the JobOffer record; the generator adds
 * only neutral fixed wording and never adds legal, salary or probation terms (OD-020).
 */
export interface OfferLetterPdfPayload {
  /** Shown as the offer reference (one offer per application, so the application reference). */
  offerReference: string;
  /** When the offer was extended; null while it is a draft. */
  issuedAt: Date | null;
  candidateName: string;
  designation: string;
  department: string;
  location: string | null;
  /** Calendar day stored at UTC midnight. */
  expectedJoiningDate: Date;
  /** Staff-written terms summary, reproduced as written. */
  termsSummary: string;
  extendedByName: string | null;
  /** IANA time zone for instants (issue date, acceptance time). */
  timeZone: string;
  /** Neutral status line for letters that are not open for a response (e.g. "declined on ..."). */
  statusNote?: string | null;
  acceptance?: OfferLetterAcceptance | null;
  // Optional wording for other letter kinds (internship offer letters, Phase 5). Full-time
  // offer letters leave these unset and keep their original wording.
  /** Letterhead name; "GARA INNOVATION" by default. */
  companyName?: string;
  /** Statutory lines under the letterhead (CIN, Udyam number, registered office). */
  companyFacts?: string[];
  /** Heading; "Offer letter" by default. */
  title?: string;
  /** Opening sentence; "This letter confirms the offer described below." by default. */
  introLine?: string;
  /** Label of the joining date row; "Expected joining date" by default. */
  joiningDateLabel?: string;
  /** Extra rows after the joining date, e.g. tenure and stipend. */
  extraDetails?: Array<{ label: string; value: string }>;
  /** Heading of the terms block; "Terms summary" by default. */
  termsHeading?: string;
  /** Printed signatory block. */
  signatory?: { name: string; title: string } | null;
  /** Replaces the closing portal hint when set. */
  closingNote?: string | null;
}
