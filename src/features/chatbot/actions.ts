"use server";

import { headers } from "next/headers";
import { getCurrentUser } from "@/lib/auth/guards";
import { toSafeErrorResponse } from "@/lib/errors";
import {
  defaultRateLimiter,
  RATE_LIMIT_POLICIES,
} from "@/lib/security/rate-limit";
import { AskChatbotInput } from "./schemas";
import { chatbotService } from "./services/chatbot-service";

export async function askPortalChatbotAction(input: AskChatbotInput) {
  try {
    const user = await getCurrentUser();
    const reqHeaders = await headers();
    const actorIdentifier =
      user?.id ??
      reqHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      "guest-ip";

    await defaultRateLimiter.enforce(
      actorIdentifier,
      RATE_LIMIT_POLICIES.CHATBOT
    );

    const reply = await chatbotService.askQuestion(user, input);
    return {
      success: true as const,
      data: reply,
    };
  } catch (error) {
    return toSafeErrorResponse(error);
  }
}
