import { z } from "zod";
import { COLLEGE_NAME_MAX } from "@/features/colleges/college-name";

/*
 * Applicant details asked on every apply form, outside the staff-editable form builder
 * (careers plan, 2026-11-19): college, branch, year of study, graduation year and consent to
 * the Privacy Policy and Terms. Client and server safe.
 */

/** Form field names (prefixed so they never collide with staff-defined form fields). */
export const APPLICANT_DETAIL_FIELDS = {
  collegeId: "std_college_id",
  collegeName: "std_college_name",
  branch: "std_branch",
  yearOfStudy: "std_year_of_study",
  graduationYear: "std_graduation_year",
  consent: "std_consent",
} as const;

export const APPLICANT_DETAIL_FIELD_NAMES: readonly string[] = Object.values(APPLICANT_DETAIL_FIELDS);

export const YEAR_OF_STUDY_OPTIONS = [
  { value: 1, label: "1st year" },
  { value: 2, label: "2nd year" },
  { value: 3, label: "3rd year" },
  { value: 4, label: "4th year" },
  { value: 5, label: "5th year" },
] as const;

/** Graduation years offered on the form, around the current year. */
export function graduationYearOptions(currentYear: number): number[] {
  const years: number[] = [];
  for (let year = currentYear + 6; year >= currentYear - 10; year--) years.push(year);
  return years;
}

export const CONSENT_REQUIRED_MESSAGE = "Please accept the Privacy Policy and Terms of Service to apply.";

const optionalText = (max: number) =>
  z
    .string()
    .max(max)
    .nullable()
    .transform((value) => {
      const trimmed = value?.replace(/\s+/g, " ").trim();
      return trimmed ? trimmed : null;
    });

export const applicantDetailsSchema = z.object({
  collegeId: z.uuid().nullable(),
  collegeName: optionalText(COLLEGE_NAME_MAX),
  branch: optionalText(100),
  yearOfStudy: z.number().int().min(1).max(6).nullable(),
  graduationYear: z.number().int().min(1950).max(2100).nullable(),
  consent: z.literal(true, CONSENT_REQUIRED_MESSAGE),
});

export type ApplicantDetails = z.output<typeof applicantDetailsSchema>;

function text(formData: FormData, name: string): string | null {
  const value = formData.get(name);
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function integer(formData: FormData, name: string): number | null {
  const value = text(formData, name);
  if (value === null) return null;
  return /^\d{1,4}$/.test(value.trim()) ? Number(value.trim()) : Number.NaN;
}

/** The raw applicant details of a submitted form, ready for applicantDetailsSchema. */
export function readApplicantDetails(formData: FormData) {
  const consent = formData.get(APPLICANT_DETAIL_FIELDS.consent);
  return {
    collegeId: text(formData, APPLICANT_DETAIL_FIELDS.collegeId),
    collegeName: text(formData, APPLICANT_DETAIL_FIELDS.collegeName),
    branch: text(formData, APPLICANT_DETAIL_FIELDS.branch),
    yearOfStudy: integer(formData, APPLICANT_DETAIL_FIELDS.yearOfStudy),
    graduationYear: integer(formData, APPLICANT_DETAIL_FIELDS.graduationYear),
    consent: consent === "on" || consent === "true",
  };
}

const ISSUE_FIELDS: Record<string, string> = {
  collegeId: APPLICANT_DETAIL_FIELDS.collegeName,
  collegeName: APPLICANT_DETAIL_FIELDS.collegeName,
  branch: APPLICANT_DETAIL_FIELDS.branch,
  yearOfStudy: APPLICANT_DETAIL_FIELDS.yearOfStudy,
  graduationYear: APPLICANT_DETAIL_FIELDS.graduationYear,
  consent: APPLICANT_DETAIL_FIELDS.consent,
};

const ISSUE_MESSAGES: Record<string, string> = {
  collegeId: "Choose your college from the list or type its full name.",
  collegeName: "Enter your college's full name.",
  branch: "Enter your branch (up to 100 characters).",
  yearOfStudy: "Choose your year of study.",
  graduationYear: "Choose your graduation year.",
  consent: CONSENT_REQUIRED_MESSAGE,
};

/** Field errors (by form field name) for invalid applicant details. */
export function applicantDetailIssues(error: z.ZodError): Array<{ field: string; message: string }> {
  const seen = new Set<string>();
  const issues: Array<{ field: string; message: string }> = [];
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "");
    const field = ISSUE_FIELDS[key];
    if (!field || seen.has(field)) continue;
    seen.add(field);
    issues.push({ field, message: ISSUE_MESSAGES[key] });
  }
  return issues;
}

/**
 * Details an internship application must include (internships are for students). Full-time
 * applicants may leave them out. Returns field errors; empty when complete.
 */
export function missingApplicantDetails(
  details: ApplicantDetails,
  openingType: "INTERNSHIP" | "FULL_TIME"
): Array<{ field: string; message: string }> {
  if (openingType !== "INTERNSHIP") return [];
  const missing: Array<{ field: string; message: string }> = [];
  if (!details.collegeId && !details.collegeName) {
    missing.push({ field: APPLICANT_DETAIL_FIELDS.collegeName, message: "Your college is required for internships." });
  }
  if (details.graduationYear === null) {
    missing.push({ field: APPLICANT_DETAIL_FIELDS.graduationYear, message: "Your graduation year is required for internships." });
  }
  return missing;
}
