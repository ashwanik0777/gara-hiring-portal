"use server";

import { requireAuth } from "@/lib/auth/guards";
import { applicationService } from "./services/application-service";
import { CandidateProfileSchema } from "./schemas";
import { ValidationError } from "@/lib/errors";
import { revalidatePath } from "next/cache";

export type ApplicationActionResult<T = unknown> =
  | { success: true; data: T }
  | { success: false; error: string; fieldErrors?: Record<string, string> };

/**
 * Server Action for candidate application submission.
 * Validates session, schema, file limits, and saves to database.
 */
export async function submitApplicationAction(
  formData: FormData
): Promise<ApplicationActionResult<{ applicationId: string; referenceCode: string }>> {
  try {
    const user = await requireAuth();

    const openingSlug = formData.get("openingSlug") as string;
    const rawResponses = formData.get("responses") as string;
    const resumeFile = formData.get("resume") as File | null;

    if (!openingSlug) {
      return { success: false, error: "Opening slug is required" };
    }

    let responses: Record<string, unknown> = {};
    if (rawResponses) {
      try {
        responses = JSON.parse(rawResponses);
      } catch {
        return { success: false, error: "Invalid form payload format" };
      }
    }

    let resumeBuffer: Buffer | undefined;
    if (resumeFile && resumeFile.size > 0) {
      // Enforce file size limit before loading into memory to prevent OOM
      const MAX_RESUME_SIZE = 5 * 1024 * 1024; // 5MB
      if (resumeFile.size > MAX_RESUME_SIZE) {
        return { success: false, error: "Resume file size exceeds the maximum limit of 5MB" };
      }
      const bytes = await resumeFile.arrayBuffer();
      resumeBuffer = Buffer.from(bytes);
    }

    const result = await applicationService.submitApplication({
      userId: user.id,
      openingSlug,
      responses,
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

    revalidatePath("/candidate/dashboard");
    revalidatePath(`/careers/${openingSlug}`);

    return { success: true, data: result };
  } catch (err: unknown) {
    if (err instanceof ValidationError) {
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
      return {
        success: false,
        error: err.message,
        fieldErrors: Object.keys(fieldErrors).length > 0 ? fieldErrors : undefined,
      };
    }

    const message = err instanceof Error ? err.message : "Submission failed";
    return { success: false, error: message };
  }
}

/**
 * Server Action for updating candidate profile.
 */
export async function updateCandidateProfileAction(
  formData: FormData
): Promise<ApplicationActionResult> {
  try {
    const user = await requireAuth();

    const rawData = {
      phone: (formData.get("phone") as string) || null,
      location: (formData.get("location") as string) || null,
      currentOrganization: (formData.get("currentOrganization") as string) || null,
      highestEducation: (formData.get("highestEducation") as string) || null,
      linkedinUrl: (formData.get("linkedinUrl") as string) || null,
      githubUrl: (formData.get("githubUrl") as string) || null,
      portfolioUrl: (formData.get("portfolioUrl") as string) || null,
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
    const message = err instanceof Error ? err.message : "Profile update failed";
    return { success: false, error: message };
  }
}
