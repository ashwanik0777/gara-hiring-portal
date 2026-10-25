"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/auth/guards";
import { getApplyBlockedReason } from "@/features/lifecycle/services/lifecycle-service";
import {
  applicationService,
  FILE_UPLOADS_DISABLED_MESSAGE,
} from "./services/application-service";
import { CandidateProfileSchema } from "./schemas";
import { ATTRIBUTION_FORM_FIELDS, resolveApplicationSource } from "./source-tracking";
import { formResponsesPayloadSchema } from "@/features/application-forms/schemas";
import { toActionError, ValidationError, ForbiddenError } from "@/lib/errors";
import { defaultRateLimiter, RATE_LIMIT_POLICIES } from "@/lib/security/rate-limit";
import { scheduleOutboxFlush } from "@/infrastructure/email/outbox-dispatch";
import { env } from "@/lib/env";

export type ApplicationActionResult<T = unknown> =
  | { success: true; data: T }
  | { success: false; error: string; fieldErrors?: Record<string, string> };

const MAX_RESUME_SIZE_BYTES = 5 * 1024 * 1024; // 5MB
const MAX_RESPONSES_PAYLOAD_LENGTH = 200_000; // characters of serialized JSON
const UNREADABLE_FORM_MESSAGE =
  "We couldn't read your answers. Please refresh the page and try again.";

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

    const blockedReason = await getApplyBlockedReason(user);
    if (blockedReason) {
      throw new ForbiddenError(blockedReason);
    }

    // Technical safeguard against submission floods (duplicate rules are pending OD-005).
    await defaultRateLimiter.enforce(user.id, RATE_LIMIT_POLICIES.APPLICATION_SUBMIT);

    const rawResponses = getStringField(formData, "responses") ?? "{}";
    if (rawResponses.length > MAX_RESPONSES_PAYLOAD_LENGTH) {
      return {
        success: false,
        error: "Your answers are too long. Please shorten them and try again.",
      };
    }

    let parsedResponses: unknown;
    try {
      parsedResponses = JSON.parse(rawResponses);
    } catch {
      return { success: false, error: UNREADABLE_FORM_MESSAGE };
    }

    const payload = SubmitApplicationPayloadSchema.safeParse({
      openingSlug: getStringField(formData, "openingSlug") ?? "",
      responses: parsedResponses,
    });
    if (!payload.success) {
      return { success: false, error: UNREADABLE_FORM_MESSAGE };
    }

    const resumeEntry = formData.get("resume");
    if (resumeEntry !== null && typeof resumeEntry === "string" && resumeEntry !== "") {
      return { success: false, error: UNREADABLE_FORM_MESSAGE };
    }
    const resumeFile = resumeEntry instanceof File && resumeEntry.size > 0 ? resumeEntry : null;

    // Link mode: documents are external share links; a file is never read or stored.
    if (resumeFile && env.DOCUMENT_STORAGE_MODE === "link") {
      return { success: false, error: FILE_UPLOADS_DISABLED_MESSAGE };
    }

    let resumeBuffer: Buffer | undefined;
    if (resumeFile) {
      // Enforce file size limit before loading into memory to prevent OOM
      if (resumeFile.size > MAX_RESUME_SIZE_BYTES) {
        return {
          success: false,
          error: "Your document is larger than 5MB. Please upload a smaller PDF.",
        };
      }
      resumeBuffer = Buffer.from(await resumeFile.arrayBuffer());
    }

    // Untrusted marketing attribution: normalized to an allow-listed code + plain-text detail.
    const attribution = resolveApplicationSource({
      heardFrom: getStringField(formData, ATTRIBUTION_FORM_FIELDS.heardFrom),
      source: getStringField(formData, ATTRIBUTION_FORM_FIELDS.source),
      utmSource: getStringField(formData, ATTRIBUTION_FORM_FIELDS.utm_source),
      utmCampaign: getStringField(formData, ATTRIBUTION_FORM_FIELDS.utm_campaign),
      referrerHost: getStringField(formData, ATTRIBUTION_FORM_FIELDS.ref),
    });

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
      attribution,
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
      careerInterest: getOptionalTrimmedField(formData, "careerInterest") || undefined,
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
