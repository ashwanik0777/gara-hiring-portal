import { z } from "zod";
import { UPI_ID_PATTERN } from "./policy";

const optionalText = (label: string, max: number) =>
  z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? null : value),
    z.string().trim().max(max, `${label} can have at most ${max} characters`).nullable().optional()
  );

/** Indian mobile numbers: 10 digits starting 6–9, with an optional +91 / 0. */
export function normalizeIndianPhone(value: string): string | null {
  const digits = value.replace(/[\s()-]/g, "").replace(/^(\+91|91|0)(?=\d{10}$)/, "");
  return /^[6-9]\d{9}$/.test(digits) ? digits : null;
}

export const ambassadorApplicationSchema = z.object({
  phone: z
    .string()
    .trim()
    .refine((value) => normalizeIndianPhone(value) !== null, "Enter a 10-digit Indian mobile number")
    .transform((value) => normalizeIndianPhone(value) as string),
  collegeId: z.preprocess((value) => (value === "" ? null : value), z.uuid().nullable().optional()),
  collegeName: optionalText("College", 200),
  branch: optionalText("Branch", 120),
  yearOfStudy: z.preprocess((value) => (value === "" || value === null || value === undefined ? null : value), z.coerce.number().int().min(1).max(6).nullable()),
  motivation: z.string().trim().min(20, "Tell us why in at least 20 characters").max(2000, "At most 2,000 characters"),
  socialReach: optionalText("Communities and reach", 1000),
  pastExperience: optionalText("Past experience", 1000),
  consent: z.literal(true, "Please accept the Privacy Policy, the Terms and the ambassador rules"),
});

export const ambassadorDecisionSchema = z
  .object({
    ambassadorId: z.uuid(),
    decision: z.enum(["APPROVE", "REJECT", "DEACTIVATE"]),
    role: z.enum(["LEAD", "ASSOCIATE"]).optional(),
    note: optionalText("Note", 1000),
  })
  .refine((value) => value.decision !== "APPROVE" || Boolean(value.role), { path: ["role"], message: "Choose Lead or Associate" })
  .refine((value) => value.decision === "APPROVE" || Boolean(value.note && value.note.length >= 5), {
    path: ["note"],
    message: "Give a reason of at least 5 characters",
  });

export const upiSchema = z.object({
  upiId: z.string().trim().max(320).regex(UPI_ID_PATTERN, "Enter a UPI ID like name@bank"),
});

export const manualPayoutSchema = z.object({
  ambassadorId: z.uuid(),
  utr: z.string().trim().regex(/^[A-Za-z0-9]{8,30}$/, "Enter the bank's UTR reference (8–30 letters and digits)"),
  tdsRupees: z.preprocess((value) => (value === "" || value === undefined ? 0 : value), z.coerce.number().min(0).max(1_000_000)),
});

export const ambassadorCertificateSchema = z.object({
  ambassadorId: z.uuid(),
  periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter the last day of the role"),
  signatoryName: z.string().trim().min(2).max(120),
  signatoryTitle: z.string().trim().min(2).max(120),
});
