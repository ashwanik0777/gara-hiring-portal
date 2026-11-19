import { GraduationCap, ShieldCheck } from "lucide-react";
import { YEAR_OF_STUDY_OPTIONS } from "../applicant-details";
import { BUSINESS_TIME_ZONE } from "@/lib/time/business-time";
import type { RecruiterApplicationDetail } from "@/features/recruitment/types";

const CONSENT_DATE = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: BUSINESS_TIME_ZONE });

/**
 * Education details and consent of an application, for staff (one line in the header next to
 * the source). Shows only what the candidate gave; older applications have no consent record.
 */
export function ApplicantDetailsSummary({ details }: { details: RecruiterApplicationDetail["applicantDetails"] }) {
  const year = YEAR_OF_STUDY_OPTIONS.find((option) => option.value === details.yearOfStudy)?.label;
  const education = [
    details.collegeName ? `${details.collegeName}${details.collegePending ? " (pending approval)" : ""}` : null,
    details.branch,
    year,
    details.graduationYear ? `Graduating ${details.graduationYear}` : null,
  ].filter((part): part is string => Boolean(part));

  return (
    <>
      {education.length > 0 && (
        <span className="flex items-center gap-1.5">
          <GraduationCap className="h-3.5 w-3.5" aria-hidden="true" /> {education.join(" · ")}
        </span>
      )}
      {details.consentAt && (
        <span className="flex items-center gap-1.5" title={`Policy version ${details.consentVersion ?? "unknown"}`}>
          <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" /> Accepted Privacy Policy &amp; Terms on{" "}
          {CONSENT_DATE.format(details.consentAt)}
        </span>
      )}
    </>
  );
}
