/**
 * Client-safe helpers for offer letters and electronic acceptance (no server imports).
 */

/** Wording of the consent checkbox; the same text is recorded in the acceptance audit log. */
export const OFFER_ESIGN_CONSENT_TEXT =
  "I have read the offer letter and agree to accept it electronically";

/** Longest typed signature accepted (matches the longest account name we expect). */
export const OFFER_SIGNED_NAME_MAX_LENGTH = 150;

/** Download path of an offer letter (authorization is enforced by the route). */
export function offerLetterDownloadPath(offerId: string): string {
  return `/api/offers/${encodeURIComponent(offerId)}/letter`;
}

/** Typed name as stored: Unicode-normalized, runs of whitespace collapsed, trimmed. */
export function cleanSignedName(value: string): string {
  return value.normalize("NFC").replace(/\s+/gu, " ").trim();
}

/** Comparison key for a name: case- and whitespace-insensitive. */
export function normalizeSignatureName(value: string): string {
  return cleanSignedName(value).normalize("NFKC").toLowerCase();
}

/** True when the typed signature matches the account name (ignoring case and spacing). */
export function signatureNamesMatch(typed: string, accountName: string): boolean {
  const key = normalizeSignatureName(typed);
  return key.length > 0 && key === normalizeSignatureName(accountName);
}
