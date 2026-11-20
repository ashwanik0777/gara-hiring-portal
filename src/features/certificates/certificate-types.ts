/*
 * Certificate types (careers plan, 2026-11-19): the ID prefix and the wording printed on each.
 * Client and server safe. Codes look like GARA-IC-2026-7K2QXM; codes issued before this change
 * (GARA-CERT-YYYY-…) keep verifying.
 */

export type CertificateTypeKey = "INTERNSHIP_COMPLETION" | "TRAINING_COMPLETION" | "CAMPUS_AMBASSADOR";

export interface CertificateTypeDetails {
  /** Segment of the certificate ID after "GARA-". */
  prefix: string;
  /** Short label for screens and the verification page. */
  label: string;
  /** Heading printed on the certificate. */
  title: string;
  /** Sentence printed between the recipient's name and the programme. */
  statement: string;
}

export const CERTIFICATE_TYPES: Record<CertificateTypeKey, CertificateTypeDetails> = {
  INTERNSHIP_COMPLETION: {
    prefix: "IC",
    label: "Internship completion",
    title: "CERTIFICATE OF COMPLETION",
    statement: "for successfully completing the internship programme and fulfilling all required milestones in",
  },
  TRAINING_COMPLETION: {
    prefix: "TC",
    label: "Industrial Training completion",
    title: "CERTIFICATE OF TRAINING",
    statement: "for successfully completing the Industrial Training programme and meeting its pass criteria in",
  },
  CAMPUS_AMBASSADOR: {
    prefix: "CA",
    label: "Campus Ambassador",
    title: "CERTIFICATE OF RECOGNITION",
    statement: "for serving as a Campus Ambassador of",
  },
};

/** Characters of the random part: no 0/O, 1/I/L or other look-alikes. */
export const CERTIFICATE_CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
export const CERTIFICATE_CODE_RANDOM_LENGTH = 6;

/** GARA-{prefix}-{year}-{6 characters}, e.g. GARA-IC-2026-7K2QXM. `random` returns 0..n-1. */
export function formatCertificateCode(
  type: CertificateTypeKey,
  year: number,
  random: (max: number) => number
): string {
  let suffix = "";
  for (let i = 0; i < CERTIFICATE_CODE_RANDOM_LENGTH; i++) {
    suffix += CERTIFICATE_CODE_ALPHABET[random(CERTIFICATE_CODE_ALPHABET.length)];
  }
  return `GARA-${CERTIFICATE_TYPES[type].prefix}-${year}-${suffix}`;
}
