"use server";

import { headers } from "next/headers";
import { getCurrentUser } from "@/lib/auth/guards";
import { RateLimitError, toActionError } from "@/lib/errors";
import {
  defaultRateLimiter,
  RATE_LIMIT_POLICIES,
} from "@/lib/security/rate-limit";
import { getClientIpHash } from "@/lib/security/client-ip";
import { AskChatbotSchema } from "./schemas";
import { chatbotService } from "./services/chatbot-service";

export async function askPortalChatbotAction(rawInput: unknown) {
  try {
    const parsed = AskChatbotSchema.safeParse(rawInput);
    if (!parsed.success) {
      return {
        success: false as const,
        error: {
          code: "VALIDATION_ERROR",
          message: parsed.error.issues[0]?.message ?? "Invalid question input.",
        },
      };
    }

    const sessionUser = await getCurrentUser();
    // Temporary-password sessions get guest answers until a permanent password is set.
    const user = sessionUser && !sessionUser.mustChangePassword ? sessionUser : null;
    // Signed-in users are limited per account; guests per keyed client-IP hash
    // (never a shared bucket, never the raw IP).
    const actorIdentifier = user
      ? `user:${user.id}`
      : `guest:${getClientIpHash(await headers(), "chatbot")}`;

    await defaultRateLimiter.enforce(actorIdentifier, RATE_LIMIT_POLICIES.CHATBOT);

    const reply = await chatbotService.askQuestion(user, parsed.data);
    return {
      success: true as const,
      data: reply,
    };
  } catch (error) {
    return {
      success: false as const,
      error: {
        code: error instanceof RateLimitError ? error.code : "CHATBOT_ERROR",
        message: toActionError(
          error,
          "The assistant is unavailable right now. Please try again later."
        ),
      },
    };
  }
}
