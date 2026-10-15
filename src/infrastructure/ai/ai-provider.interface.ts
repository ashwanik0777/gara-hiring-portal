export type AssistantIntentCategory =
  | "FAQ_KNOWLEDGE"
  | "PERSONAL_STATUS"
  | "OUT_OF_SCOPE"
  | "PROMPT_INJECTION_BLOCKED";

export interface FaqKnowledgeEntry {
  id: string;
  version: string;
  category:
    | "ACCOUNT_AND_ACCESS"
    | "APPLICATION_PROCESS"
    | "SUPERVISED_EVALUATION"
    | "INTERNSHIP_ONBOARDING"
    | "PROGRESS_AND_TASKS"
    | "CERTIFICATES"
    | "FULL_TIME_AND_HRMS";
  question: string;
  answer: string;
  keywords: string[];
  relatedPath?: string;
}

export interface AiAssistantQuery {
  /**
   * Sanitized user question text.
   * Must NEVER contain resumes, employee documents, payroll figures, or private evaluation notes.
   */
  sanitizedQuestion: string;
  /**
   * Approved knowledge base version used as grounding context.
   */
  knowledgeBaseVersion: string;
}

export interface AiAssistantResponse {
  answer: string;
  intent: AssistantIntentCategory;
  matchedFaqIds: string[];
  knowledgeVersion: string;
  providerName: string;
  fallbackUsed: boolean;
  relatedPath?: string;
}

/**
 * Replaceable adapter interface for the GARA Portal Assistant (OD-011).
 * Do not embed provider-specific SDK calls outside `src/infrastructure/ai/`.
 */
export interface AiProviderAdapter {
  readonly providerName: string;
  isExternalModelConfigured(): boolean;
  answerPortalQuestion(query: AiAssistantQuery): Promise<AiAssistantResponse>;
}

/**
 * Redacts email addresses, phone numbers, and storage keys from free-text queries
 * so that personal identifiers are never forwarded to an AI provider.
 */
export function sanitizeQueryForAiProvider(rawInput: string): string {
  return rawInput
    .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, "[REDACTED_EMAIL]")
    .replace(/\b(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g, "[REDACTED_PHONE]")
    .replace(/\bprivate\/[a-zA-Z0-9/_.-]+\b/gi, "[REDACTED_STORAGE_KEY]")
    .trim();
}
