import { prisma } from "@/lib/db";
import { AuthenticatedUser } from "@/lib/auth/guards";
import {
  AiProviderAdapter,
  sanitizeQueryForAiProvider,
} from "@/infrastructure/ai/ai-provider.interface";
import {
  FAQ_KNOWLEDGE_VERSION,
  APPROVED_FAQ_KNOWLEDGE_BASE,
} from "@/infrastructure/ai/faq-knowledge-base";
import {
  PortalAssistantProvider,
  defaultPortalAssistantProvider,
} from "@/infrastructure/ai/portal-assistant-provider";
import { AskChatbotInput, AskChatbotSchema } from "../schemas";
import { ChatbotReply } from "../types";
import {
  ForbiddenError,
  UnauthorizedError,
  ValidationError,
} from "@/lib/errors";

const PERSONAL_STATUS_PATTERNS: RegExp[] = [
  /\bmy\s+(application|applications|status|evaluation|onboarding|certificate|offer|interview|id\s+card)\b/i,
  /\bstatus\s+of\s+my\b/i,
  /\b(did\s+i\s+pass|am\s+i\s+selected|am\s+i\s+shortlisted|is\s+my\s+certificate)\b/i,
  /\bcheck\s+my\s+(application|status|evaluation|certificate)\b/i,
];

const CROSS_CANDIDATE_PATTERNS: RegExp[] = [
  /\b(another|other)\s+(candidate|applicant|intern|employee)('s|s)?\s+(status|application|evaluation|resume|notes|email)/i,
  /\bstatus\s+of\s+(candidate|applicant|user)\b/i,
];

const EMAIL_EXTRACTION_REGEX =
  /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const REFERENCE_CODE_REGEX = /\b(?:GARA-APP|APP)-[A-Z0-9-]+\b/gi;

export class ChatbotService {
  private readonly aiProvider: AiProviderAdapter;

  constructor(aiProvider: AiProviderAdapter = defaultPortalAssistantProvider) {
    this.aiProvider = aiProvider;
  }

  public getApprovedFaqs() {
    return {
      version: FAQ_KNOWLEDGE_VERSION,
      entries: APPROVED_FAQ_KNOWLEDGE_BASE,
    };
  }

  private isPersonalStatusQuery(question: string): boolean {
    if (PERSONAL_STATUS_PATTERNS.some((pattern) => pattern.test(question))) {
      return true;
    }
    if (REFERENCE_CODE_REGEX.test(question)) {
      REFERENCE_CODE_REGEX.lastIndex = 0;
      return true;
    }
    return false;
  }

  /**
   * Processes a portal chatbot query with strict server-side authorization,
   * prompt-injection defense, and PII isolation.
   */
  public async askQuestion(
    user: AuthenticatedUser | null,
    rawInput: AskChatbotInput
  ): Promise<ChatbotReply> {
    const parsed = AskChatbotSchema.safeParse(rawInput);
    if (!parsed.success) {
      throw new ValidationError(
        parsed.error.issues[0]?.message ?? "Invalid question input.",
        parsed.error.issues
      );
    }

    const question = parsed.data.question;

    // 1. Prompt-injection defense (checked first before any DB or adapter logic)
    if (PortalAssistantProvider.detectPromptInjection(question)) {
      return {
        answer:
          "Security policy violation: Prompt-override, system-inspection, and bulk-data requests are blocked. I can only assist with GARA Innovation portal workflows, published programme rules, and your own authorized status.",
        intent: "PROMPT_INJECTION_BLOCKED",
        matchedFaqIds: [],
        knowledgeVersion: FAQ_KNOWLEDGE_VERSION,
        providerName: this.aiProvider.providerName,
        fallbackUsed: false,
      };
    }

    // 2. Detect explicit cross-candidate lookup phrases
    if (CROSS_CANDIDATE_PATTERNS.some((pattern) => pattern.test(question))) {
      throw new ForbiddenError(
        "Cross-candidate status lookups are strictly prohibited. You may only query your own authenticated records."
      );
    }

    // 3. Detect email references that belong to another person
    const mentionedEmails = question.match(EMAIL_EXTRACTION_REGEX) ?? [];
    if (mentionedEmails.length > 0) {
      if (!user) {
        throw new UnauthorizedError(
          "Authentication required to query account-specific status."
        );
      }
      const normalizedUserEmail = user.email.toLowerCase();
      const hasForeignEmail = mentionedEmails.some(
        (email) => email.toLowerCase() !== normalizedUserEmail
      );
      if (hasForeignEmail) {
        throw new ForbiddenError(
          "Cross-candidate status lookups are strictly prohibited. You may only query your own authenticated account."
        );
      }
    }

    // 4. Handle personal status queries server-side using ONLY authenticated user.id
    const mentionedRefCodes = question.match(REFERENCE_CODE_REGEX) ?? [];
    if (this.isPersonalStatusQuery(question) || mentionedEmails.length > 0) {
      if (!user) {
        throw new UnauthorizedError(
          "Please sign in to your GARA Innovation portal account to check your personal application, evaluation, or certificate status."
        );
      }

      // Query ONLY this authenticated user's candidate applications (excluding internalNotes & resumeStorageKey)
      const applications = await prisma.application.findMany({
        where: {
          candidate: {
            userId: user.id,
          },
        },
        select: {
          referenceCode: true,
          status: true,
          createdAt: true,
          opening: {
            select: {
              title: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
      });

      // If the user cited a specific reference code, verify ownership strictly
      if (mentionedRefCodes.length > 0) {
        const ownedCodes = new Set(
          applications.map((a) => a.referenceCode.toUpperCase())
        );
        const unauthorizedRef = mentionedRefCodes.some(
          (code) => !ownedCodes.has(code.toUpperCase())
        );
        if (unauthorizedRef) {
          throw new ForbiddenError(
            "Cross-candidate status lookups are strictly prohibited. You do not have permission to view that application reference code."
          );
        }
      }

      // Query ONLY this authenticated user's internship enrollments (excluding finalReviewNotes)
      const enrollments = await prisma.internshipEnrollment.findMany({
        where: {
          userId: user.id,
        },
        select: {
          status: true,
          workingDaysTarget: true,
          application: {
            select: {
              opening: {
                select: {
                  title: true,
                },
              },
            },
          },
          onboarding: {
            select: {
              status: true,
            },
          },
          idCard: {
            select: {
              status: true,
            },
          },
          certificate: {
            select: {
              verificationCode: true,
              status: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
      });

      const appItems = applications.map((app) => ({
        referenceCode: app.referenceCode,
        openingTitle: app.opening.title,
        status: app.status,
        submittedAt: app.createdAt,
      }));

      const evalItems = enrollments.map((enr) => ({
        programmeTitle: enr.application.opening.title,
        evaluationStatus: enr.status,
        workingDaysTarget: enr.workingDaysTarget,
        onboardingStatus: enr.onboarding?.status ?? null,
        idCardStatus: enr.idCard?.status ?? null,
        certificateVerificationCode: enr.certificate?.verificationCode ?? null,
        certificateStatus: enr.certificate?.status ?? null,
      }));

      const summaryParts: string[] = [];
      if (appItems.length === 0 && evalItems.length === 0) {
        summaryParts.push(
          `No active applications or internship enrollments were found for your account (${user.name}). You can apply for open roles on the Careers page.`
        );
      } else {
        if (appItems.length > 0) {
          const appDesc = appItems
            .map(
              (a) => `${a.openingTitle} (${a.referenceCode}): ${a.status}`
            )
            .join("; ");
          summaryParts.push(`Your Applications: ${appDesc}.`);
        }
        if (evalItems.length > 0) {
          const evalDesc = evalItems
            .map(
              (e) =>
                `${e.programmeTitle} — Evaluation: ${e.evaluationStatus} (${e.workingDaysTarget}-working-day track)` +
                (e.onboardingStatus ? `, Onboarding: ${e.onboardingStatus}` : "") +
                (e.certificateVerificationCode
                  ? `, Certificate: ${e.certificateStatus} (${e.certificateVerificationCode})`
                  : "")
            )
            .join("; ");
          summaryParts.push(`Your Internship Lifecycle: ${evalDesc}.`);
        }
      }

      return {
        answer: summaryParts.join(" "),
        intent: "PERSONAL_STATUS",
        matchedFaqIds: [],
        knowledgeVersion: FAQ_KNOWLEDGE_VERSION,
        providerName: "gara-authorized-status-resolver",
        fallbackUsed: false,
        relatedPath: "/candidate/applications",
        personalStatusData: {
          applications: appItems,
          evaluations: evalItems,
        },
      };
    }

    // 5. General Portal / FAQ query: sanitize PII before passing to replaceable AI adapter
    const sanitizedQuestion = sanitizeQueryForAiProvider(question);
    const response = await this.aiProvider.answerPortalQuestion({
      sanitizedQuestion,
      knowledgeBaseVersion: FAQ_KNOWLEDGE_VERSION,
    });

    return {
      answer: response.answer,
      intent: response.intent,
      matchedFaqIds: response.matchedFaqIds,
      knowledgeVersion: response.knowledgeVersion,
      providerName: response.providerName,
      fallbackUsed: response.fallbackUsed,
      relatedPath: response.relatedPath,
    };
  }
}

export const chatbotService = new ChatbotService();
