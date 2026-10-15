import {
  AiAssistantQuery,
  AiAssistantResponse,
  AiProviderAdapter,
  FaqKnowledgeEntry,
} from "./ai-provider.interface";
import {
  APPROVED_FAQ_KNOWLEDGE_BASE,
  FAQ_KNOWLEDGE_VERSION,
} from "./faq-knowledge-base";

const PROMPT_INJECTION_PATTERNS: RegExp[] = [
  /ignore\s+(all\s+)?(previous|prior|above)\s+(instructions|rules|prompts)/i,
  /disregard\s+(all\s+)?(previous|prior|system)/i,
  /system\s+(override|prompt|instruction)/i,
  /reveal\s+(your\s+)?(system\s+prompt|hidden\s+instructions|internal\s+notes)/i,
  /jailbreak/i,
  /you\s+are\s+now\s+(in\s+)?developer\s+mode/i,
  /dump\s+(the\s+)?(database|users|candidates|passwords|secrets)/i,
  /list\s+all\s+(candidate|employee|user)\s+(emails|phones|records|resumes)/i,
  /show\s+(me\s+)?(internal\s+notes|private\s+feedback|confidential)/i,
  /select\s+\*\s+from\s+/i,
  /drop\s+table\s+/i,
];

export type ExternalModelCompletionFn = (
  query: AiAssistantQuery,
  groundingFaqs: FaqKnowledgeEntry[]
) => Promise<string>;

export class PortalAssistantProvider implements AiProviderAdapter {
  public readonly providerName: string;
  private readonly externalCompletionFn?: ExternalModelCompletionFn;

  constructor(options?: {
    providerName?: string;
    externalCompletionFn?: ExternalModelCompletionFn;
  }) {
    this.providerName =
      options?.providerName ?? "gara-approved-faq-adapter-v1";
    this.externalCompletionFn = options?.externalCompletionFn;
  }

  public isExternalModelConfigured(): boolean {
    return typeof this.externalCompletionFn === "function";
  }

  public static detectPromptInjection(text: string): boolean {
    return PROMPT_INJECTION_PATTERNS.some((pattern) => pattern.test(text));
  }

  public static matchApprovedFaqs(question: string): FaqKnowledgeEntry[] {
    const normalized = question.toLowerCase();

    const scored = APPROVED_FAQ_KNOWLEDGE_BASE.map((entry) => {
      let score = 0;
      for (const keyword of entry.keywords) {
        if (normalized.includes(keyword.toLowerCase())) {
          score += keyword.includes(" ") ? 3 : 2;
        }
      }

      const questionWords = entry.question
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, "")
        .split(/\s+/)
        .filter((w) => w.length > 3);

      for (const word of questionWords) {
        if (normalized.includes(word)) {
          score += 1;
        }
      }

      return { entry, score };
    })
      .filter((item) => item.score >= 2)
      .sort((a, b) => b.score - a.score);

    return scored.slice(0, 2).map((s) => s.entry);
  }

  public async answerPortalQuestion(
    query: AiAssistantQuery
  ): Promise<AiAssistantResponse> {
    const text = query.sanitizedQuestion.trim();

    if (PortalAssistantProvider.detectPromptInjection(text)) {
      return {
        answer:
          "Security policy violation: Prompt-override, system-inspection, and bulk-data requests are blocked. I can only assist with GARA Innovation portal workflows, published programme rules, and your own authorized status.",
        intent: "PROMPT_INJECTION_BLOCKED",
        matchedFaqIds: [],
        knowledgeVersion: FAQ_KNOWLEDGE_VERSION,
        providerName: this.providerName,
        fallbackUsed: false,
      };
    }

    const matchedFaqs = PortalAssistantProvider.matchApprovedFaqs(text);

    if (matchedFaqs.length === 0) {
      return {
        answer:
          "I can only answer questions related to the GARA Innovation portal, recruitment applications, the 7-working-day supervised internship evaluation, onboarding, progress reporting, and certificate verification. Please ask a portal-related question or browse the approved FAQs below.",
        intent: "OUT_OF_SCOPE",
        matchedFaqIds: [],
        knowledgeVersion: FAQ_KNOWLEDGE_VERSION,
        providerName: this.providerName,
        fallbackUsed: false,
      };
    }

    // If an external AI model adapter has been explicitly injected (future OD-011 approval or adapter resilience test),
    // attempt grounded completion and fall back gracefully to the approved FAQ text on failure.
    if (this.externalCompletionFn) {
      try {
        const externalText = await this.externalCompletionFn(query, matchedFaqs);
        if (externalText && externalText.trim().length > 0) {
          return {
            answer: externalText.trim(),
            intent: "FAQ_KNOWLEDGE",
            matchedFaqIds: matchedFaqs.map((f) => f.id),
            knowledgeVersion: FAQ_KNOWLEDGE_VERSION,
            providerName: this.providerName,
            fallbackUsed: false,
            relatedPath: matchedFaqs[0]?.relatedPath,
          };
        }
      } catch {
        // Provider failure: gracefully fall back to deterministic approved FAQ entry
        const primary = matchedFaqs[0];
        return {
          answer: primary.answer,
          intent: "FAQ_KNOWLEDGE",
          matchedFaqIds: matchedFaqs.map((f) => f.id),
          knowledgeVersion: FAQ_KNOWLEDGE_VERSION,
          providerName: "gara-approved-faq-fallback",
          fallbackUsed: true,
          relatedPath: primary.relatedPath,
        };
      }
    }

    const primary = matchedFaqs[0];
    return {
      answer: primary.answer,
      intent: "FAQ_KNOWLEDGE",
      matchedFaqIds: matchedFaqs.map((f) => f.id),
      knowledgeVersion: FAQ_KNOWLEDGE_VERSION,
      providerName: this.providerName,
      fallbackUsed: false,
      relatedPath: primary.relatedPath,
    };
  }
}

export const defaultPortalAssistantProvider = new PortalAssistantProvider();
