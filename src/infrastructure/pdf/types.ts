export interface CertificatePdfPayload {
  recipientName: string;
  programmeTitle: string;
  completionDate: string;
  issueDate: string;
  verificationCode: string;
  verificationUrl: string;
  signatoryName: string;
  signatoryTitle: string;
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
}
