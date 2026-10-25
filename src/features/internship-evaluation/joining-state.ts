import { EmploymentType, EvaluationStatus } from "@/types/enums";

/**
 * Staff-facing label for where an internship candidate is between selection and joining.
 * Pure and client-safe; shared by the application detail pages and the evaluation cockpit.
 */
export type InternJourneyState =
  | "SELECTED"
  | "PASSED_AWAITING_JOINING"
  | "JOINED"
  | "JOINED_AS_EMPLOYEE"
  | "NOT_PASSED";

export const INTERN_JOURNEY_LABELS: Record<InternJourneyState, string> = {
  SELECTED: "Selected for evaluation",
  PASSED_AWAITING_JOINING: "Evaluation passed — awaiting joining",
  JOINED: "Joined as intern",
  JOINED_AS_EMPLOYEE: "Joined as employee",
  NOT_PASSED: "Evaluation not passed",
};

export function getInternJourneyState(facts: {
  evaluationStatus: EvaluationStatus;
  /**
   * Employment type of the record created from this application when the person was marked
   * as joined; undefined while not joined, null for records that predate the field.
   */
  joinedAs?: EmploymentType | null;
}): InternJourneyState {
  if (facts.joinedAs === EmploymentType.FULL_TIME) return "JOINED_AS_EMPLOYEE";
  if (facts.joinedAs !== undefined) return "JOINED";
  if (facts.evaluationStatus === EvaluationStatus.PASSED) return "PASSED_AWAITING_JOINING";
  if (facts.evaluationStatus === EvaluationStatus.FAILED) return "NOT_PASSED";
  return "SELECTED";
}
