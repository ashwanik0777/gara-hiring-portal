import { CAMPUS_AMBASSADOR_POLICY } from "@/config/site";

/*
 * Campus Ambassador rules shared by pages and server (pure, no database access).
 */

/** Referral codes avoid look-alike characters (no 0/O, 1/I/L). */
export const REFERRAL_CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
export const REFERRAL_CODE_PATTERN = /^GARA-[A-Z2-9]{7}$/;
export const REFERRAL_COOKIE = "gara_ref";

/**
 * "GARA-RAHU7K2": up to four letters of the first name (padded from the alphabet) and three
 * random characters. `random(max)` must be a CSPRNG in production.
 */
export function buildReferralCode(name: string, random: (max: number) => number): string {
  const letters = name
    .toUpperCase()
    .replace(/[^A-Z]/g, "")
    .split("")
    .filter((letter) => REFERRAL_CODE_ALPHABET.includes(letter))
    .slice(0, 4)
    .join("");
  let code = letters;
  while (code.length < 7) code += REFERRAL_CODE_ALPHABET[random(REFERRAL_CODE_ALPHABET.length)];
  return `GARA-${code}`;
}

export function normalizeReferralCode(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const code = value.trim().toUpperCase();
  return REFERRAL_CODE_PATTERN.test(code) ? code : null;
}

/** Student discount for a fee, rounded down to whole rupees. */
export function referralDiscountPaise(feePaise: number, percent: number = CAMPUS_AMBASSADOR_POLICY.studentDiscountPercent): number {
  if (percent <= 0) return 0;
  const raw = Math.floor((feePaise * percent) / 100);
  return Math.min(feePaise - 100, raw - (raw % 100));
}

/** TDS on a payout (null while the rule is not decided). */
export function payoutTdsPaise(grossPaise: number, tdsPercent: number | null = CAMPUS_AMBASSADOR_POLICY.tdsPercent): number | null {
  if (tdsPercent === null) return null;
  return Math.floor((grossPaise * tdsPercent) / 100);
}

/** UPI IDs: "name@bank". */
export const UPI_ID_PATTERN = /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z][a-zA-Z0-9]{1,63}$/;

/** "ra•••@okaxis" for display. */
export function maskUpiId(upiId: string): string {
  const [name, handle] = upiId.split("@");
  return `${name.slice(0, 2)}${"•".repeat(Math.max(3, Math.min(6, name.length - 2)))}@${handle}`;
}

export interface CommissionLike {
  status: string;
  payableAt: Date;
  payoutId: string | null;
  enrollmentStatus: string;
}

/** Earned but not yet payable, payable now, or paid (reversed ones are not counted). */
export function commissionBucket(commission: CommissionLike, now: Date): "pending" | "payable" | "processing" | "paid" | "reversed" {
  if (commission.status === "REVERSED") return "reversed";
  if (commission.status === "PAID") return "paid";
  if (commission.payoutId) return "processing";
  // A refund request keeps the commission on hold until it is decided.
  if (commission.payableAt.getTime() > now.getTime() || commission.enrollmentStatus === "REFUND_REQUESTED") return "pending";
  return "payable";
}
