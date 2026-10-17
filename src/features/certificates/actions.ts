"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/guards";
import { certificateService } from "./services/certificate-service";

export async function recordCompletionChecklistAction(formData: FormData) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: "Authentication required" };
    }

    const enrollmentId = formData.get("enrollmentId") as string;
    const isEligible = formData.get("isEligibleForCertificate") === "true";
    const completionNotes = formData.get("completionNotes") as string;
    const checklistJson = formData.get("checklistResponses") as string;

    if (!enrollmentId || !checklistJson) {
      return { success: false, error: "Enrollment ID and checklist responses are required" };
    }

    let checklistResponses: { id: string; label: string; completed: boolean; verifiedAt?: string }[];
    try {
      const parsed = JSON.parse(checklistJson);
      if (!Array.isArray(parsed)) {
        return { success: false, error: "Invalid checklist data format: expected an array" };
      }
      checklistResponses = parsed;
    } catch {
      return { success: false, error: "Invalid checklist data format" };
    }

    const completion = await certificateService.recordCompletionChecklist(
      user.id,
      user.roles,
      {
        enrollmentId,
        checklistResponses,
        isEligibleForCertificate: isEligible,
        completionNotes,
      }
    );

    revalidatePath(`/recruitment/evaluations/${enrollmentId}`);
    revalidatePath("/intern/dashboard");
    return { success: true, completion };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Operation failed";
    return { success: false, error: message };
  }
}

export async function issueCertificateAction(formData: FormData) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: "Authentication required" };
    }

    const enrollmentId = formData.get("enrollmentId") as string;
    const signatoryName = formData.get("signatoryName") as string;
    const signatoryTitle = formData.get("signatoryTitle") as string;

    if (!enrollmentId) {
      return { success: false, error: "Enrollment ID is required" };
    }

    const certificate = await certificateService.issueCertificate(
      user.id,
      user.roles,
      {
        enrollmentId,
        signatoryName,
        signatoryTitle,
      }
    );

    revalidatePath(`/recruitment/evaluations/${enrollmentId}`);
    revalidatePath("/intern/dashboard");
    return { success: true, certificate };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to issue certificate";
    return { success: false, error: message };
  }
}

export async function reissueCertificateAction(formData: FormData) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: "Authentication required" };
    }

    const certificateId = formData.get("certificateId") as string;
    const reason = formData.get("reason") as string;
    const signatoryName = formData.get("signatoryName") as string;
    const signatoryTitle = formData.get("signatoryTitle") as string;

    if (!certificateId || !reason) {
      return { success: false, error: "Certificate ID and reissue reason are required" };
    }

    const certificate = await certificateService.reissueCertificate(
      user.id,
      user.roles,
      {
        certificateId,
        reason,
        signatoryName,
        signatoryTitle,
      }
    );

    revalidatePath("/recruitment/evaluations");
    revalidatePath("/intern/dashboard");
    return { success: true, certificate };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to reissue certificate";
    return { success: false, error: message };
  }
}
