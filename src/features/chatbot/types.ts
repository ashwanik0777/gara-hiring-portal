import { AssistantIntentCategory } from "@/infrastructure/ai/ai-provider.interface";

export interface PersonalApplicationStatusItem {
  referenceCode: string;
  openingTitle: string;
  status: string;
  submittedAt: Date;
}

export interface PersonalEvaluationStatusItem {
  programmeTitle: string;
  evaluationStatus: string;
  workingDaysTarget: number;
  onboardingStatus: string | null;
  idCardStatus: string | null;
  certificateVerificationCode: string | null;
  certificateStatus: string | null;
}

export interface ChatbotReply {
  answer: string;
  intent: AssistantIntentCategory;
  matchedFaqIds: string[];
  knowledgeVersion: string;
  providerName: string;
  fallbackUsed: boolean;
  relatedPath?: string;
  personalStatusData?: {
    applications: PersonalApplicationStatusItem[];
    evaluations: PersonalEvaluationStatusItem[];
  };
}
