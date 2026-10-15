import { z } from "zod";

export const AskChatbotSchema = z.object({
  question: z
    .string()
    .trim()
    .min(2, "Please enter a question of at least 2 characters.")
    .max(500, "Questions are limited to 500 characters."),
});

export type AskChatbotInput = z.infer<typeof AskChatbotSchema>;
