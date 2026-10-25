"use server";

import { Role } from "@prisma/client";
import { revalidatePath } from "next/cache";
import type { ZodError } from "zod";
import { requireAuth, requirePermission } from "@/lib/auth/guards";
import { toActionError } from "@/lib/errors";
import { scheduleOutboxFlush } from "@/infrastructure/email/outbox-dispatch";
import { revalidateEvaluationViews } from "@/features/internship-evaluation/revalidate";
import { offerService } from "./services/offer-service";
import { employeeService } from "./services/employee-service";
import {
  CreateJobOfferSchema,
  OfferReferenceSchema,
  RevokeJobOfferSchema,
  CandidateOfferDecisionSchema,
  CreateEmployeeFromApplicationSchema,
  MarkInternJoinedSchema,
  UpdateEmployeeStatusSchema,
  AssignManagerSchema,
  UpdateOnboardingChecklistSchema,
  ProcessExitSchema,
} from "./schemas";

export type EmployeeActionResult<T = unknown> =
  | { success: true; data: T }
  | { success: false; error: string; fieldErrors?: Record<string, string> };

const EMPLOYEE_ADMIN_ROLES: Role[] = [Role.ADMIN, Role.HR];

/** Reads a text field; File values and missing fields become undefined so zod rejects them. */
function readText(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  return typeof value === "string" ? value : undefined;
}

/** Reads an optional text field; empty strings become null. */
function readOptionalText(formData: FormData, key: string): string | null | undefined {
  const value = formData.get(key);
  if (value === null || value === "") return null;
  return typeof value === "string" ? value : undefined;
}

function toFieldErrors(error: ZodError): Record<string, string> {
  const fieldErrors: Record<string, string> = {};
  error.issues.forEach((i) => {
    if (i.path[0]) fieldErrors[i.path[0].toString()] = i.message;
  });
  return fieldErrors;
}

function revalidateApplicationViews(applicationId: string): void {
  for (const base of ["/admin/applications", "/subadmin/applications", "/recruitment/applications"]) {
    revalidatePath(base);
    revalidatePath(`${base}/${applicationId}`);
  }
  revalidatePath("/candidate/applications");
  revalidatePath(`/candidate/applications/${applicationId}`);
}

function revalidateEmployeeViews(employeeId?: string): void {
  for (const base of ["/admin/employees", "/subadmin/employees", "/recruitment/employees"]) {
    revalidatePath(base);
    if (employeeId) {
      revalidatePath(`${base}/${employeeId}`);
    }
  }
}

/** Self-service portal homes whose navigation changes when a person joins. */
function revalidateJoinedPortals(): void {
  for (const path of ["/candidate/dashboard", "/intern/dashboard", "/hrms"]) {
    revalidatePath(path);
  }
}

export async function createJobOfferAction(
  formData: FormData
): Promise<EmployeeActionResult> {
  try {
    const user = await requirePermission("canEmployees", { roles: EMPLOYEE_ADMIN_ROLES });

    const validated = CreateJobOfferSchema.safeParse({
      applicationId: readText(formData, "applicationId"),
      department: readText(formData, "department"),
      designation: readText(formData, "designation"),
      expectedJoiningDate: readText(formData, "expectedJoiningDate"),
      location: readOptionalText(formData, "location"),
      termsSummary: readText(formData, "termsSummary"),
      notes: readOptionalText(formData, "notes"),
    });
    if (!validated.success) {
      return { success: false, error: "Validation failed", fieldErrors: toFieldErrors(validated.error) };
    }

    const offer = await offerService.createDraftOffer(user, validated.data);

    revalidateApplicationViews(validated.data.applicationId);
    return { success: true, data: offer };
  } catch (err: unknown) {
    return { success: false, error: toActionError(err, "Offer creation failed.") };
  }
}

/**
 * Extends a draft offer. The application to revalidate is derived from the offer on the
 * server, never taken from the client.
 */
export async function extendJobOfferAction(
  offerId: string
): Promise<EmployeeActionResult> {
  try {
    const user = await requirePermission("canEmployees", { roles: EMPLOYEE_ADMIN_ROLES });

    const validated = OfferReferenceSchema.safeParse({ offerId });
    if (!validated.success) {
      return { success: false, error: "Invalid offer reference" };
    }

    const result = await offerService.extendOffer(user, validated.data.offerId);
    scheduleOutboxFlush();

    revalidateApplicationViews(result.applicationId);
    return { success: true, data: null };
  } catch (err: unknown) {
    return { success: false, error: toActionError(err, "Offer extension failed.") };
  }
}

export async function candidateDecideOfferAction(
  formData: FormData
): Promise<EmployeeActionResult> {
  try {
    const user = await requireAuth();

    const validated = CandidateOfferDecisionSchema.safeParse({
      offerId: readText(formData, "offerId"),
      decision: readText(formData, "decision"),
      declineReason: readOptionalText(formData, "declineReason"),
    });
    if (!validated.success) {
      return { success: false, error: "Invalid offer decision parameters" };
    }

    const result = await offerService.candidateDecideOffer(user, validated.data);

    revalidateApplicationViews(result.applicationId);
    return { success: true, data: null };
  } catch (err: unknown) {
    return { success: false, error: toActionError(err, "Failed to process offer decision.") };
  }
}

/**
 * Revokes a draft or extended offer. The reason is validated and bounded; the application
 * to revalidate is derived from the offer on the server.
 */
export async function revokeJobOfferAction(
  offerId: string,
  reason?: string | null
): Promise<EmployeeActionResult> {
  try {
    const user = await requirePermission("canEmployees", { roles: EMPLOYEE_ADMIN_ROLES });

    const validated = RevokeJobOfferSchema.safeParse({ offerId, reason: reason ?? null });
    if (!validated.success) {
      return { success: false, error: "Validation failed", fieldErrors: toFieldErrors(validated.error) };
    }

    const result = await offerService.revokeOffer(user, validated.data);

    revalidateApplicationViews(result.applicationId);
    return { success: true, data: null };
  } catch (err: unknown) {
    return { success: false, error: toActionError(err, "Revoking offer failed.") };
  }
}

/**
 * Full-time "Mark as joined": requires an accepted offer; grants the EMPLOYEE role and queues
 * the EMPLOYEE_JOINED welcome email.
 */
export async function hireEmployeeFromApplicationAction(
  formData: FormData
): Promise<EmployeeActionResult> {
  try {
    const user = await requirePermission("canEmployees", { roles: EMPLOYEE_ADMIN_ROLES });

    const ecName = readOptionalText(formData, "emergencyContactName");
    const ecRel = readOptionalText(formData, "emergencyContactRelation");
    const ecPhone = readOptionalText(formData, "emergencyContactPhone");
    const emergencyContact =
      ecName || ecRel || ecPhone ? { name: ecName, relation: ecRel, phone: ecPhone } : null;

    const validated = CreateEmployeeFromApplicationSchema.safeParse({
      applicationId: readText(formData, "applicationId"),
      employeeCode: readText(formData, "employeeCode"),
      department: readText(formData, "department"),
      designation: readText(formData, "designation"),
      joiningDate: readText(formData, "joiningDate"),
      initialStatus: readText(formData, "initialStatus"),
      managerId: readOptionalText(formData, "managerId"),
      personalPhone: readOptionalText(formData, "personalPhone"),
      emergencyContact,
      internalNotes: readOptionalText(formData, "internalNotes"),
    });
    if (!validated.success) {
      return { success: false, error: "Validation failed", fieldErrors: toFieldErrors(validated.error) };
    }

    const employee = await employeeService.createEmployeeFromApplication(user, validated.data);
    scheduleOutboxFlush();

    revalidateApplicationViews(validated.data.applicationId);
    revalidateEmployeeViews(employee.id);
    revalidateJoinedPortals();
    return { success: true, data: employee };
  } catch (err: unknown) {
    return { success: false, error: toActionError(err, "Marking the employee as joined failed.") };
  }
}

/**
 * Intern "Mark as joined" (internship step 2): requires a PASSED evaluation; grants the INTERN
 * role and queues the INTERN_JOINED welcome email. ADMIN, or HR with canEmployees.
 */
export async function markInternJoinedAction(
  formData: FormData
): Promise<EmployeeActionResult<{ employeeId: string }>> {
  try {
    const user = await requirePermission("canEmployees", { roles: EMPLOYEE_ADMIN_ROLES });

    const validated = MarkInternJoinedSchema.safeParse({
      enrollmentId: readText(formData, "enrollmentId"),
      employeeCode: readText(formData, "employeeCode"),
      department: readText(formData, "department"),
      designation: readText(formData, "designation"),
      joiningDate: readText(formData, "joiningDate"),
      initialStatus: readText(formData, "initialStatus"),
      managerId: readOptionalText(formData, "managerId"),
    });
    if (!validated.success) {
      return { success: false, error: "Validation failed", fieldErrors: toFieldErrors(validated.error) };
    }

    const result = await employeeService.createEmployeeFromInternship(user, validated.data);
    scheduleOutboxFlush();

    revalidateEvaluationViews(result.enrollmentId);
    revalidateApplicationViews(result.applicationId);
    revalidateEmployeeViews(result.employeeId);
    revalidateJoinedPortals();
    return { success: true, data: { employeeId: result.employeeId } };
  } catch (err: unknown) {
    return { success: false, error: toActionError(err, "Marking the intern as joined failed.") };
  }
}

export async function updateEmployeeStatusAction(
  formData: FormData
): Promise<EmployeeActionResult> {
  try {
    const user = await requirePermission("canEmployees", { roles: EMPLOYEE_ADMIN_ROLES });

    const validated = UpdateEmployeeStatusSchema.safeParse({
      employeeId: readText(formData, "employeeId"),
      toStatus: readText(formData, "toStatus"),
      remarks: readOptionalText(formData, "remarks"),
    });
    if (!validated.success) {
      return { success: false, error: "Validation failed", fieldErrors: toFieldErrors(validated.error) };
    }

    await employeeService.updateEmployeeStatus(user, validated.data);

    revalidateEmployeeViews(validated.data.employeeId);
    return { success: true, data: null };
  } catch (err: unknown) {
    return { success: false, error: toActionError(err, "Status update failed.") };
  }
}

export async function assignEmployeeManagerAction(
  formData: FormData
): Promise<EmployeeActionResult> {
  try {
    const user = await requirePermission("canEmployees", { roles: EMPLOYEE_ADMIN_ROLES });

    const validated = AssignManagerSchema.safeParse({
      employeeId: readText(formData, "employeeId"),
      managerId: readOptionalText(formData, "managerId"),
      remarks: readOptionalText(formData, "remarks"),
    });
    if (!validated.success) {
      return { success: false, error: "Validation failed", fieldErrors: toFieldErrors(validated.error) };
    }

    await employeeService.assignManager(user, validated.data);

    revalidateEmployeeViews(validated.data.employeeId);
    return { success: true, data: null };
  } catch (err: unknown) {
    return { success: false, error: toActionError(err, "Manager assignment failed.") };
  }
}

export async function updateEmployeeChecklistAction(
  employeeId: string,
  itemId: string,
  completed: boolean
): Promise<EmployeeActionResult> {
  try {
    const user = await requirePermission("canEmployees", { roles: EMPLOYEE_ADMIN_ROLES });

    const validated = UpdateOnboardingChecklistSchema.safeParse({
      employeeId,
      itemId,
      completed,
    });
    if (!validated.success) {
      return { success: false, error: "Invalid checklist parameters" };
    }

    await employeeService.updateOnboardingChecklist(user, validated.data);

    revalidateEmployeeViews(validated.data.employeeId);
    return { success: true, data: null };
  } catch (err: unknown) {
    return { success: false, error: toActionError(err, "Checklist update failed.") };
  }
}

export async function processEmployeeExitAction(
  formData: FormData
): Promise<EmployeeActionResult> {
  try {
    const user = await requirePermission("canEmployees", { roles: EMPLOYEE_ADMIN_ROLES });

    const validated = ProcessExitSchema.safeParse({
      employeeId: readText(formData, "employeeId"),
      lastWorkingDate: readText(formData, "lastWorkingDate"),
      resignationDate: readOptionalText(formData, "resignationDate"),
      reason: readOptionalText(formData, "reason"),
      exitInterviewNotes: readOptionalText(formData, "exitInterviewNotes"),
    });
    if (!validated.success) {
      return { success: false, error: "Exit validation failed", fieldErrors: toFieldErrors(validated.error) };
    }

    await employeeService.processEmployeeExit(user, validated.data);

    revalidateEmployeeViews(validated.data.employeeId);
    return { success: true, data: null };
  } catch (err: unknown) {
    return { success: false, error: toActionError(err, "Exit processing failed.") };
  }
}
