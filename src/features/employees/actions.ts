"use server";

import { requireAuth } from "@/lib/auth/guards";
import { offerService } from "./services/offer-service";
import { employeeService } from "./services/employee-service";
import {
  CreateJobOfferSchema,
  CandidateOfferDecisionSchema,
  CreateEmployeeFromApplicationSchema,
  DirectCreateEmployeeSchema,
  UpdateEmployeeStatusSchema,
  AssignManagerSchema,
  UpdateOnboardingChecklistSchema,
  UploadEmployeeDocumentSchema,
  ProcessExitSchema,
} from "./schemas";
import { ValidationError, ForbiddenError, NotFoundError } from "@/lib/errors";
import { revalidatePath } from "next/cache";

export type EmployeeActionResult<T = unknown> =
  | { success: true; data: T }
  | { success: false; error: string; fieldErrors?: Record<string, string> };

export async function createJobOfferAction(
  formData: FormData
): Promise<EmployeeActionResult> {
  try {
    const user = await requireAuth();

    const raw = {
      applicationId: formData.get("applicationId") as string,
      department: formData.get("department") as string,
      designation: formData.get("designation") as string,
      expectedJoiningDate: formData.get("expectedJoiningDate") as string,
      location: (formData.get("location") as string) || null,
      termsSummary: formData.get("termsSummary") as string,
      notes: (formData.get("notes") as string) || null,
    };

    const validated = CreateJobOfferSchema.safeParse(raw);
    if (!validated.success) {
      const fieldErrors: Record<string, string> = {};
      validated.error.issues.forEach((i) => {
        if (i.path[0]) fieldErrors[i.path[0].toString()] = i.message;
      });
      return { success: false, error: "Validation failed", fieldErrors };
    }

    const offer = await offerService.createDraftOffer(user, validated.data);

    revalidatePath(`/recruitment/applications/${validated.data.applicationId}`);
    return { success: true, data: offer };
  } catch (err: unknown) {
    if (err instanceof ValidationError || err instanceof ForbiddenError || err instanceof NotFoundError) {
      return { success: false, error: err.message };
    }
    const message = err instanceof Error ? err.message : "Offer creation failed";
    return { success: false, error: message };
  }
}

export async function extendJobOfferAction(
  offerId: string,
  applicationId: string
): Promise<EmployeeActionResult> {
  try {
    const user = await requireAuth();
    await offerService.extendOffer(user, offerId);

    revalidatePath(`/recruitment/applications/${applicationId}`);
    revalidatePath("/recruitment/applications");
    return { success: true, data: null };
  } catch (err: unknown) {
    if (err instanceof ValidationError || err instanceof ForbiddenError || err instanceof NotFoundError) {
      return { success: false, error: err.message };
    }
    const message = err instanceof Error ? err.message : "Offer extension failed";
    return { success: false, error: message };
  }
}

export async function candidateDecideOfferAction(
  formData: FormData
): Promise<EmployeeActionResult> {
  try {
    const user = await requireAuth();

    const raw = {
      offerId: formData.get("offerId") as string,
      decision: formData.get("decision") as "ACCEPT" | "DECLINE",
      declineReason: (formData.get("declineReason") as string) || null,
    };

    const validated = CandidateOfferDecisionSchema.safeParse(raw);
    if (!validated.success) {
      return { success: false, error: "Invalid offer decision parameters" };
    }

    await offerService.candidateDecideOffer(user, validated.data);

    revalidatePath("/candidate/applications");
    return { success: true, data: null };
  } catch (err: unknown) {
    if (err instanceof ValidationError || err instanceof ForbiddenError || err instanceof NotFoundError) {
      return { success: false, error: err.message };
    }
    const message = err instanceof Error ? err.message : "Failed to process offer decision";
    return { success: false, error: message };
  }
}

export async function revokeJobOfferAction(
  offerId: string,
  applicationId: string,
  reason?: string
): Promise<EmployeeActionResult> {
  try {
    const user = await requireAuth();
    await offerService.revokeOffer(user, offerId, reason);

    revalidatePath(`/recruitment/applications/${applicationId}`);
    return { success: true, data: null };
  } catch (err: unknown) {
    if (err instanceof ValidationError || err instanceof ForbiddenError || err instanceof NotFoundError) {
      return { success: false, error: err.message };
    }
    const message = err instanceof Error ? err.message : "Revoking offer failed";
    return { success: false, error: message };
  }
}

export async function hireEmployeeFromApplicationAction(
  formData: FormData
): Promise<EmployeeActionResult> {
  try {
    const user = await requireAuth();

    let emergencyContact = null;
    const ecName = formData.get("emergencyContactName") as string;
    const ecRel = formData.get("emergencyContactRelation") as string;
    const ecPhone = formData.get("emergencyContactPhone") as string;
    if (ecName && ecPhone) {
      emergencyContact = { name: ecName, relation: ecRel || "Family", phone: ecPhone };
    }

    const raw = {
      applicationId: formData.get("applicationId") as string,
      employeeCode: formData.get("employeeCode") as string,
      department: formData.get("department") as string,
      designation: formData.get("designation") as string,
      joiningDate: formData.get("joiningDate") as string,
      managerId: (formData.get("managerId") as string) || null,
      personalPhone: (formData.get("personalPhone") as string) || null,
      emergencyContact,
      internalNotes: (formData.get("internalNotes") as string) || null,
    };

    const validated = CreateEmployeeFromApplicationSchema.safeParse(raw);
    if (!validated.success) {
      const fieldErrors: Record<string, string> = {};
      validated.error.issues.forEach((i) => {
        if (i.path[0]) fieldErrors[i.path[0].toString()] = i.message;
      });
      return { success: false, error: "Validation failed", fieldErrors };
    }

    const employee = await employeeService.createEmployeeFromApplication(user, validated.data);

    revalidatePath(`/recruitment/applications/${validated.data.applicationId}`);
    revalidatePath("/recruitment/employees");
    return { success: true, data: employee };
  } catch (err: unknown) {
    if (err instanceof ValidationError || err instanceof ForbiddenError || err instanceof NotFoundError) {
      return { success: false, error: err.message };
    }
    const message = err instanceof Error ? err.message : "Employee hiring failed";
    return { success: false, error: message };
  }
}

export async function directCreateEmployeeAction(
  formData: FormData
): Promise<EmployeeActionResult> {
  try {
    const user = await requireAuth();

    const raw = {
      userId: formData.get("userId") as string,
      employeeCode: formData.get("employeeCode") as string,
      department: formData.get("department") as string,
      designation: formData.get("designation") as string,
      joiningDate: formData.get("joiningDate") as string,
      managerId: (formData.get("managerId") as string) || null,
      personalPhone: (formData.get("personalPhone") as string) || null,
      internalNotes: (formData.get("internalNotes") as string) || null,
    };

    const validated = DirectCreateEmployeeSchema.safeParse(raw);
    if (!validated.success) {
      const fieldErrors: Record<string, string> = {};
      validated.error.issues.forEach((i) => {
        if (i.path[0]) fieldErrors[i.path[0].toString()] = i.message;
      });
      return { success: false, error: "Validation failed", fieldErrors };
    }

    const employee = await employeeService.createDirectEmployee(user, validated.data);

    revalidatePath("/recruitment/employees");
    return { success: true, data: employee };
  } catch (err: unknown) {
    if (err instanceof ValidationError || err instanceof ForbiddenError || err instanceof NotFoundError) {
      return { success: false, error: err.message };
    }
    const message = err instanceof Error ? err.message : "Direct employee creation failed";
    return { success: false, error: message };
  }
}

export async function updateEmployeeStatusAction(
  formData: FormData
): Promise<EmployeeActionResult> {
  try {
    const user = await requireAuth();

    const raw = {
      employeeId: formData.get("employeeId") as string,
      toStatus: formData.get("toStatus") as string,
      remarks: (formData.get("remarks") as string) || null,
    };

    const validated = UpdateEmployeeStatusSchema.safeParse(raw);
    if (!validated.success) {
      return { success: false, error: "Validation failed" };
    }

    await employeeService.updateEmployeeStatus(user, validated.data);

    revalidatePath(`/recruitment/employees/${validated.data.employeeId}`);
    revalidatePath("/recruitment/employees");
    return { success: true, data: null };
  } catch (err: unknown) {
    if (err instanceof ValidationError || err instanceof ForbiddenError || err instanceof NotFoundError) {
      return { success: false, error: err.message };
    }
    const message = err instanceof Error ? err.message : "Status update failed";
    return { success: false, error: message };
  }
}

export async function assignEmployeeManagerAction(
  formData: FormData
): Promise<EmployeeActionResult> {
  try {
    const user = await requireAuth();

    const raw = {
      employeeId: formData.get("employeeId") as string,
      managerId: (formData.get("managerId") as string) || null,
      remarks: (formData.get("remarks") as string) || null,
    };

    const validated = AssignManagerSchema.safeParse(raw);
    if (!validated.success) {
      return { success: false, error: "Validation failed" };
    }

    await employeeService.assignManager(user, validated.data);

    revalidatePath(`/recruitment/employees/${validated.data.employeeId}`);
    revalidatePath("/recruitment/employees");
    return { success: true, data: null };
  } catch (err: unknown) {
    if (err instanceof ValidationError || err instanceof ForbiddenError || err instanceof NotFoundError) {
      return { success: false, error: err.message };
    }
    const message = err instanceof Error ? err.message : "Manager assignment failed";
    return { success: false, error: message };
  }
}

export async function updateEmployeeChecklistAction(
  employeeId: string,
  itemId: string,
  completed: boolean
): Promise<EmployeeActionResult> {
  try {
    const user = await requireAuth();

    const validated = UpdateOnboardingChecklistSchema.safeParse({
      employeeId,
      itemId,
      completed,
    });
    if (!validated.success) {
      return { success: false, error: "Invalid checklist parameters" };
    }

    await employeeService.updateOnboardingChecklist(user, validated.data);

    revalidatePath(`/recruitment/employees/${employeeId}`);
    return { success: true, data: null };
  } catch (err: unknown) {
    if (err instanceof ValidationError || err instanceof ForbiddenError || err instanceof NotFoundError) {
      return { success: false, error: err.message };
    }
    const message = err instanceof Error ? err.message : "Checklist update failed";
    return { success: false, error: message };
  }
}

export async function addEmployeeDocumentAction(
  formData: FormData
): Promise<EmployeeActionResult> {
  try {
    const user = await requireAuth();

    const raw = {
      employeeId: formData.get("employeeId") as string,
      documentType: formData.get("documentType") as string,
      title: formData.get("title") as string,
      storageKey: formData.get("storageKey") as string,
      mimeType: formData.get("mimeType") as string,
      fileSizeBytes: Number(formData.get("fileSizeBytes") || "1024"),
      isConfidential: true,
    };

    const validated = UploadEmployeeDocumentSchema.safeParse(raw);
    if (!validated.success) {
      return { success: false, error: "Document metadata invalid" };
    }

    await employeeService.addEmployeeDocument(user, validated.data);

    revalidatePath(`/recruitment/employees/${validated.data.employeeId}`);
    return { success: true, data: null };
  } catch (err: unknown) {
    if (err instanceof ValidationError || err instanceof ForbiddenError || err instanceof NotFoundError) {
      return { success: false, error: err.message };
    }
    const message = err instanceof Error ? err.message : "Document upload failed";
    return { success: false, error: message };
  }
}

export async function processEmployeeExitAction(
  formData: FormData
): Promise<EmployeeActionResult> {
  try {
    const user = await requireAuth();

    const raw = {
      employeeId: formData.get("employeeId") as string,
      lastWorkingDate: formData.get("lastWorkingDate") as string,
      resignationDate: (formData.get("resignationDate") as string) || null,
      reason: (formData.get("reason") as string) || null,
      exitInterviewNotes: (formData.get("exitInterviewNotes") as string) || null,
    };

    const validated = ProcessExitSchema.safeParse(raw);
    if (!validated.success) {
      return { success: false, error: "Exit validation failed" };
    }

    await employeeService.processEmployeeExit(user, validated.data);

    revalidatePath(`/recruitment/employees/${validated.data.employeeId}`);
    revalidatePath("/recruitment/employees");
    return { success: true, data: null };
  } catch (err: unknown) {
    if (err instanceof ValidationError || err instanceof ForbiddenError || err instanceof NotFoundError) {
      return { success: false, error: err.message };
    }
    const message = err instanceof Error ? err.message : "Exit processing failed";
    return { success: false, error: message };
  }
}
