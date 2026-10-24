/**
 * Internship completion checklist used for completion decisions.
 *
 * These are the items the platform already presented in the completion panel; they are now the
 * single server-side source of truth so clients cannot submit an empty or altered checklist.
 * The final certificate eligibility checklist is still pending product-owner approval (OD-009).
 * Client-safe: no server-only imports.
 */
export interface CompletionChecklistTemplateItem {
  id: string;
  label: string;
  required: boolean;
}

export const COMPLETION_CHECKLIST_TEMPLATE: readonly CompletionChecklistTemplateItem[] = [
  { id: "chk_tasks", label: "All assigned core project tasks reviewed and approved", required: true },
  { id: "chk_presentation", label: "Final internship project presentation delivered", required: true },
  { id: "chk_code_review", label: "Code artifacts merged and documentation committed", required: true },
  { id: "chk_exit_survey", label: "Exit interview and feedback survey completed", required: true },
];

/** Maximum lengths for public / printed certificate fields. */
export const SIGNATORY_FIELD_MAX_LENGTH = 120;
export const VERIFICATION_CODE_MAX_LENGTH = 64;
