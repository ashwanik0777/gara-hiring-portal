"use server";

import { requireAuth } from "@/lib/auth/guards";
import { toActionError } from "@/lib/errors";
import { certificateService } from "./services/certificate-service";
import {
  IssueCertificateSchema,
  RecordCompletionSchema,
  ReissueCertificateSchema,
} from "./schemas";
import { parseInput, readFormFields } from "@/features/internship-evaluation/form-input";
import { revalidateEvaluationViews } from "@/features/internship-evaluation/revalidate";

export type CertificateActionResult<T = null> =
  | { success: true; data: T }
  | { success: false; error: string };

export async function recordCompletionChecklistAction(
  formData: FormData
): Promise<CertificateActionResult<{ status: string }>> {
  try {
    const user = await requireAuth();
    const input = parseInput(
      RecordCompletionSchema,
      readFormFields(formData, [
        "enrollmentId",
        "isEligibleForCertificate",
        "completionNotes",
        "checklistResponses",
      ])
    );

    const completion = await certificateService.recordCompletionChecklist(user, input);

    revalidateEvaluationViews(input.enrollmentId);
    return { success: true, data: { status: completion.status } };
  } catch (error: unknown) {
    return { success: false, error: toActionError(error, "Failed to record completion checklist") };
  }
}

export async function issueCertificateAction(
  formData: FormData
): Promise<CertificateActionResult<{ certificateId: string; verificationCode: string }>> {
  try {
    const user = await requireAuth();
    const input = parseInput(
      IssueCertificateSchema,
      readFormFields(formData, ["enrollmentId", "signatoryName", "signatoryTitle"])
    );

    const certificate = await certificateService.issueCertificate(user, input);

    revalidateEvaluationViews(input.enrollmentId);
    return {
      success: true,
      data: { certificateId: certificate.id, verificationCode: certificate.verificationCode },
    };
  } catch (error: unknown) {
    return { success: false, error: toActionError(error, "Failed to issue certificate") };
  }
}

export async function reissueCertificateAction(
  formData: FormData
): Promise<CertificateActionResult<{ verificationCode: string }>> {
  try {
    const user = await requireAuth();
    const input = parseInput(
      ReissueCertificateSchema,
      readFormFields(formData, ["certificateId", "reason", "signatoryName", "signatoryTitle"])
    );

    const certificate = await certificateService.reissueCertificate(user, input);

    revalidateEvaluationViews(certificate.enrollmentId);
    return { success: true, data: { verificationCode: certificate.verificationCode } };
  } catch (error: unknown) {
    return { success: false, error: toActionError(error, "Failed to reissue certificate") };
  }
}
