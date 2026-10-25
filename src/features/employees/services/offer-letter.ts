import { OfferStatus } from "@prisma/client";
import {
  buildOfferLetterPdf,
  formatLetterDay,
  sha256Hex,
} from "@/infrastructure/pdf/offer-letter-pdf-generator";
import type { OfferLetterPdfPayload } from "@/infrastructure/pdf/types";
import { BUSINESS_TIME_ZONE } from "@/lib/time/business-time";

/** Offer fields an offer letter is built from (a subset of the JobOffer row and relations). */
export interface OfferLetterSource {
  id: string;
  status: OfferStatus;
  expectedJoiningDate: Date;
  department: string;
  designation: string;
  location: string | null;
  termsSummary: string;
  extendedAt: Date | null;
  decisionAt: Date | null;
  signedName: string | null;
  signedAt: Date | null;
  signedDocumentHash: string | null;
  extendedBy: { name: string } | null;
  application: {
    referenceCode: string;
    candidate: { user: { name: string } };
  };
}

/**
 * "AS_ISSUED": the letter exactly as the candidate reviews it while the offer is open — the
 * document whose SHA-256 is recorded at acceptance. "CURRENT": the letter for download now,
 * with the acceptance block or a neutral status line.
 */
export type OfferLetterVariant = "AS_ISSUED" | "CURRENT";

/** Longest user agent kept as signature evidence. */
export const SIGNATURE_USER_AGENT_MAX_LENGTH = 300;

function statusNote(offer: OfferLetterSource, timeZone: string): string | null {
  switch (offer.status) {
    case OfferStatus.DRAFT:
      return "Draft. This offer has not been extended to the candidate.";
    case OfferStatus.REVOKED:
      return "This offer was revoked and is no longer open.";
    case OfferStatus.EXPIRED:
      return "This offer has expired.";
    case OfferStatus.DECLINED:
      return offer.decisionAt
        ? `This offer was declined on ${formatLetterDay(offer.decisionAt, timeZone)}.`
        : "This offer was declined.";
    case OfferStatus.ACCEPTED:
      // Offers accepted before electronic signatures were recorded have no evidence block.
      if (offer.signedName && offer.signedAt && offer.signedDocumentHash) return null;
      return offer.decisionAt
        ? `This offer was accepted on ${formatLetterDay(offer.decisionAt, timeZone)} through the candidate portal.`
        : "This offer was accepted through the candidate portal.";
    default:
      return null;
  }
}

export function buildOfferLetterPayload(
  offer: OfferLetterSource,
  variant: OfferLetterVariant,
  timeZone: string = BUSINESS_TIME_ZONE
): OfferLetterPdfPayload {
  const base: OfferLetterPdfPayload = {
    offerReference: offer.application.referenceCode,
    issuedAt: offer.extendedAt,
    candidateName: offer.application.candidate.user.name,
    designation: offer.designation,
    department: offer.department,
    location: offer.location,
    expectedJoiningDate: offer.expectedJoiningDate,
    termsSummary: offer.termsSummary,
    extendedByName: offer.extendedBy?.name ?? null,
    timeZone,
    statusNote: null,
    acceptance: null,
  };
  if (variant === "AS_ISSUED") {
    return base;
  }
  const signed =
    offer.status === OfferStatus.ACCEPTED && offer.signedName && offer.signedAt && offer.signedDocumentHash
      ? { signedName: offer.signedName, signedAt: offer.signedAt, documentHash: offer.signedDocumentHash }
      : null;
  return { ...base, statusNote: statusNote(offer, timeZone), acceptance: signed };
}

export function renderOfferLetter(
  offer: OfferLetterSource,
  variant: OfferLetterVariant,
  timeZone: string = BUSINESS_TIME_ZONE
): Buffer {
  return buildOfferLetterPdf(buildOfferLetterPayload(offer, variant, timeZone));
}

/** SHA-256 of the letter as issued: the hash recorded when the candidate accepts. */
export function offerLetterHash(offer: OfferLetterSource, timeZone: string = BUSINESS_TIME_ZONE): string {
  return sha256Hex(renderOfferLetter(offer, "AS_ISSUED", timeZone));
}

/** Attachment file name built from the reference (only safe characters). */
export function offerLetterFilename(offer: OfferLetterSource): string {
  const safeReference = offer.application.referenceCode.replace(/[^a-zA-Z0-9_-]/g, "") || "offer";
  return `GARA_Offer_Letter_${safeReference}.pdf`;
}

/** User agent kept as evidence: control characters removed, bounded length. */
export function cleanSignatureUserAgent(value: string | null | undefined): string | null {
  if (!value) return null;
  const cleaned = Array.from(value)
    .filter((char) => {
      const code = char.codePointAt(0) ?? 0;
      return code >= 0x20 && code !== 0x7f;
    })
    .join("")
    .trim();
  return cleaned ? cleaned.slice(0, SIGNATURE_USER_AGENT_MAX_LENGTH) : null;
}
