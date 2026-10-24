"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/auth/guards";
import { applicationService } from "./services/application-service";
import { CandidateProfileSchema } from "./schemas";
import { formResponsesPayloadSchema } from "@/features/application-forms/schemas";
import { toActionError, ValidationError } from "@/lib/errors";
import { defaultRateLimiter, RATE_LIMIT_POLICIES } from "@/lib/security/rate-limit";
import { scheduleOutboxFlush } from "@/infrastructure/email/outbox-dispatch";

export type ApplicationActionResult<T = unknown> =
  | { success: true; data: T }
  | { success: false; error: string; fieldErrors?: Record<string, string> };

const MAX_RESUME_SIZE_BYTES = 5 * 1024 * 1024; // 5MB
const MAX_RESPONSES_PAYLOAD_LENGTH = 200_000; // characters of serialized JSON

const SubmitApplicationPayloadSchema = z.object({
  openingSlug: z
    .string()
    .min(1, "Opening slug is required")
    .max(150)
    .regex(/^[a-z0-9-]+$/, "Invalid opening reference"),
  responses: formResponsesPayloadSchema,
});

function getStringField(formData: FormData, key: string): string | null {
  const value = formData.get(key);
  return typeof value === "string" ? value : null;
}

function getOptionalTrimmedField(formData: FormData, key: string): string | null {
  const value = getStringField(formData, key);
  return value && value.trim() !== "" ? value.trim() : null;
}

function toFieldErrors(err: ValidationError): Record<string, string> | undefined {
  const fieldErrors: Record<string, string> = {};
  if (Array.isArray(err.issues)) {
    for (const item of err.issues) {
      if (typeof item === "object" && item !== null && "field" in item && "message" in item) {
        fieldErrors[String((item as { field: string }).field)] = String(
          (item as { message: string }).message
        );
      }
    }
  }
  return Object.keys(fieldErrors).length > 0 ? fieldErrors : undefined;
}

/**
 * Server Action for candidate application submission.
 * Authenticates, rate limits, validates the payload shape, and delegates per-field
 * validation, upload and persistence to the application service.
 */
export async function submitApplicationAction(
  formData: FormData
): Promise<ApplicationActionResult<{ applicationId: string; referenceCode: string }>> {
  try {
    const user = await requireAuth();

    // Technical safeguard against submission floods (duplicate rules are pending OD-005).
    await defaultRateLimiter.enforce(user.id, RATE_LIMIT_POLICIES.APPLICATION_SUBMIT);

    const rawResponses = getStringField(formData, "responses") ?? "{}";
    if (rawResponses.length > MAX_RESPONSES_PAYLOAD_LENGTH) {
      return { success: false, error: "Application payload is too large" };
    }

    let parsedResponses: unknown;
    try {
      parsedResponses = JSON.parse(rawResponses);
    } catch {
      return { success: false, error: "Invalid form payload format" };
    }

    const payload = SubmitApplicationPayloadSchema.safeParse({
      openingSlug: getStringField(formData, "openingSlug") ?? "",
      responses: parsedResponses,
    });
    if (!payload.success) {
      return {
        success: false,
        error: payload.error.issues[0]?.message ?? "Invalid application payload",
      };
    }

    const resumeEntry = formData.get("resume");
    if (resumeEntry !== null && typeof resumeEntry === "string" && resumeEntry !== "") {
      return { success: false, error: "Invalid document upload" };
    }
    const resumeFile = resumeEntry instanceof File && resumeEntry.size > 0 ? resumeEntry : null;

    let resumeBuffer: Buffer | undefined;
    if (resumeFile) {
      // Enforce file size limit before loading into memory to prevent OOM
      if (resumeFile.size > MAX_RESUME_SIZE_BYTES) {
        return { success: false, error: "Document size exceeds the maximum limit of 5MB" };
      }
      resumeBuffer = Buffer.from(await resumeFile.arrayBuffer());
    }

    const result = await applicationService.submitApplication({
      userId: user.id,
      openingSlug: payload.data.openingSlug,
      responses: payload.data.responses,
      resumeFile:
        resumeFile && resumeBuffer
          ? {
              name: resumeFile.name,
              size: resumeFile.size,
              type: resumeFile.type,
              buffer: resumeBuffer,
            }
          : undefined,
    });

    // The confirmation email was queued in the same transaction.
    scheduleOutboxFlush();

    revalidatePath("/candidate/dashboard");
    revalidatePath("/candidate/applications");
    revalidatePath(`/careers/${payload.data.openingSlug}`);

    return { success: true, data: result };
  } catch (err: unknown) {
    if (err instanceof ValidationError) {
      return {
        success: false,
        error: toActionError(err),
        fieldErrors: toFieldErrors(err),
      };
    }
    return {
      success: false,
      error: toActionError(err, "Submission failed. Please try again later."),
    };
  }
}

/**
 * Server Action for updating the signed-in user's own candidate profile.
 */
export async function updateCandidateProfileAction(
  formData: FormData
): Promise<ApplicationActionResult> {
  try {
    const user = await requireAuth();

    const rawData = {
      phone: getOptionalTrimmedField(formData, "phone"),
      location: getOptionalTrimmedField(formData, "location"),
      currentOrganization: getOptionalTrimmedField(formData, "currentOrganization"),
      highestEducation: getOptionalTrimmedField(formData, "highestEducation"),
      linkedinUrl: getOptionalTrimmedField(formData, "linkedinUrl"),
      githubUrl: getOptionalTrimmedField(formData, "githubUrl"),
      portfolioUrl: getOptionalTrimmedField(formData, "portfolioUrl"),
    };

    const validated = CandidateProfileSchema.safeParse(rawData);
    if (!validated.success) {
      const fieldErrors: Record<string, string> = {};
      validated.error.issues.forEach((issue) => {
        if (issue.path[0]) fieldErrors[issue.path[0].toString()] = issue.message;
      });
      return { success: false, error: "Validation failed", fieldErrors };
    }

    await applicationService.updateCandidateProfile(user.id, validated.data);

    revalidatePath("/candidate/profile");
    revalidatePath("/candidate/dashboard");

    return { success: true, data: null };
  } catch (err: unknown) {
    return { success: false, error: toActionError(err, "Profile update failed. Please try again.") };
  }
}
