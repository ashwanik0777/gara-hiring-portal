"use server";

import { Role } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import type { ZodError } from "zod";
import { requireAuth, requirePermission } from "@/lib/auth/guards";
import { toActionError, ValidationError } from "@/lib/errors";
import { getClientIpHash } from "@/lib/security/client-ip";
import { scheduleOutboxFlush } from "@/infrastructure/email/outbox-dispatch";
import { revalidateEvaluationViews } from "@/features/internship-evaluation/revalidate";
import { offerService } from "./services/offer-service";
import { employeeService } from "./services/employee-service";
import { conversionService } from "./services/conversion-service";
import type { ConversionResponseResult, ReviewOutcomeResult } from "./types";
import {
  ConversionOfferResponseSchema,
  RecordReviewOutcomeSchema,
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

/** Shown when some fields are invalid; the field messages explain what to fix. */
const CHECK_FIELDS_MESSAGE = "Please check the highlighted fields and try again.";

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

function revalidateInternReviewViews(): void {
  for (const path of ["/admin/intern-reviews", "/subadmin/intern-reviews"]) {
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
      return { success: false, error: CHECK_FIELDS_MESSAGE, fieldErrors: toFieldErrors(validated.error) };
    }

    const offer = await offerService.createDraftOffer(user, validated.data);

    revalidateApplicationViews(validated.data.applicationId);
    return { success: true, data: offer };
  } catch (err: unknown) {
    return { success: false, error: toActionError(err, "We couldn't save the offer. Please try again.") };
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
      return { success: false, error: "This offer could not be found. Please reload the page." };
    }

    const result = await offerService.extendOffer(user, validated.data.offerId);
    scheduleOutboxFlush();

    revalidateApplicationViews(result.applicationId);
    return { success: true, data: null };
  } catch (err: unknown) {
    return { success: false, error: toActionError(err, "We couldn't extend the offer. Please try again.") };
  }
}

/** Fields of the accept form a candidate can correct; other problems need a page reload. */
const SIGNATURE_FIELDS = new Set(["signedName", "consent"]);

/** Field errors carried by a service ValidationError (`issues: [{ path, message }]`). */
function fieldErrorsFromIssues(issues: readonly unknown[]): Record<string, string> | undefined {
  const fieldErrors: Record<string, string> = {};
  for (const issue of issues) {
    if (!issue || typeof issue !== "object") continue;
    const { path, message } = issue as { path?: unknown; message?: unknown };
    const field = Array.isArray(path) ? path[0] : undefined;
    if (typeof field === "string" && typeof message === "string") {
      fieldErrors[field] = message;
    }
  }
  return Object.keys(fieldErrors).length > 0 ? fieldErrors : undefined;
}

/**
 * The signed-in candidate answers their own extended offer. Accepting is an electronic
 * signature: the typed full legal name, explicit consent and the hash of the letter they
 * reviewed are required, and the IP hash and browser are recorded as evidence. Declining
 * needs no signature. Ownership and state are enforced by the service.
 */
export async function candidateDecideOfferAction(
  formData: FormData
): Promise<EmployeeActionResult<{ decision: "ACCEPT" | "DECLINE" }>> {
  try {
    const user = await requireAuth();

    const consent = readText(formData, "consent");
    const validated = CandidateOfferDecisionSchema.safeParse({
      offerId: readText(formData, "offerId"),
      decision: readText(formData, "decision"),
      declineReason: readOptionalText(formData, "declineReason"),
      signedName: readText(formData, "signedName"),
      consent: consent === "true" || consent === "on",
      letterHash: readText(formData, "letterHash"),
    });
    if (!validated.success) {
      const fieldErrors = Object.fromEntries(
        Object.entries(toFieldErrors(validated.error)).filter(([field]) => SIGNATURE_FIELDS.has(field))
      );
      const onlySignatureProblems = validated.error.issues.every(
        (issue) => typeof issue.path[0] === "string" && SIGNATURE_FIELDS.has(issue.path[0])
      );
      return onlySignatureProblems
        ? { success: false, error: CHECK_FIELDS_MESSAGE, fieldErrors }
        : { success: false, error: "We couldn't record your answer. Please reload the page and try again." };
    }

    let applicationId: string;
    if (validated.data.decision === "ACCEPT") {
      const requestHeaders = await headers();
      const result = await offerService.acceptOfferElectronically(user, validated.data, {
        ipHash: getClientIpHash(requestHeaders, "offer-esign"),
        userAgent: requestHeaders.get("user-agent"),
      });
      // The acceptance queued a confirmation email.
      scheduleOutboxFlush();
      applicationId = result.applicationId;
    } else {
      const result = await offerService.declineOffer(user, validated.data);
      applicationId = result.applicationId;
    }

    revalidateApplicationViews(applicationId);
    return { success: true, data: { decision: validated.data.decision } };
  } catch (err: unknown) {
    if (err instanceof ValidationError) {
      const fieldErrors = fieldErrorsFromIssues(err.issues);
      if (fieldErrors) {
        return { success: false, error: err.message, fieldErrors };
      }
    }
    return { success: false, error: toActionError(err, "We couldn't record your answer. Please try again.") };
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
      return { success: false, error: CHECK_FIELDS_MESSAGE, fieldErrors: toFieldErrors(validated.error) };
    }

    const result = await offerService.revokeOffer(user, validated.data);

    revalidateApplicationViews(result.applicationId);
    return { success: true, data: null };
  } catch (err: unknown) {
    return { success: false, error: toActionError(err, "We couldn't revoke the offer. Please try again.") };
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
      return { success: false, error: CHECK_FIELDS_MESSAGE, fieldErrors: toFieldErrors(validated.error) };
    }

    const employee = await employeeService.createEmployeeFromApplication(user, validated.data);
    scheduleOutboxFlush();

    revalidateApplicationViews(validated.data.applicationId);
    revalidateEmployeeViews(employee.id);
    revalidateJoinedPortals();
    return { success: true, data: employee };
  } catch (err: unknown) {
    return { success: false, error: toActionError(err, "We couldn't mark the employee as joined. Please try again.") };
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
      reviewAfterMonths: readText(formData, "reviewAfterMonths"),
    });
    if (!validated.success) {
      return { success: false, error: CHECK_FIELDS_MESSAGE, fieldErrors: toFieldErrors(validated.error) };
    }

    const result = await employeeService.createEmployeeFromInternship(user, validated.data);
    scheduleOutboxFlush();

    revalidateEvaluationViews(result.enrollmentId);
    revalidateApplicationViews(result.applicationId);
    revalidateEmployeeViews(result.employeeId);
    revalidateJoinedPortals();
    revalidateInternReviewViews();
    return { success: true, data: { employeeId: result.employeeId } };
  } catch (err: unknown) {
    return { success: false, error: toActionError(err, "We couldn't mark the intern as joined. Please try again.") };
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
      return { success: false, error: CHECK_FIELDS_MESSAGE, fieldErrors: toFieldErrors(validated.error) };
    }

    await employeeService.updateEmployeeStatus(user, validated.data);

    revalidateEmployeeViews(validated.data.employeeId);
    return { success: true, data: null };
  } catch (err: unknown) {
    return { success: false, error: toActionError(err, "We couldn't update the status. Please try again.") };
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
      return { success: false, error: CHECK_FIELDS_MESSAGE, fieldErrors: toFieldErrors(validated.error) };
    }

    await employeeService.assignManager(user, validated.data);

    revalidateEmployeeViews(validated.data.employeeId);
    return { success: true, data: null };
  } catch (err: unknown) {
    return { success: false, error: toActionError(err, "We couldn't update the reporting manager. Please try again.") };
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
      return { success: false, error: "We couldn't update this checklist item. Please reload the page and try again." };
    }

    await employeeService.updateOnboardingChecklist(user, validated.data);

    revalidateEmployeeViews(validated.data.employeeId);
    return { success: true, data: null };
  } catch (err: unknown) {
    return { success: false, error: toActionError(err, "We couldn't update the checklist. Please try again.") };
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
      return { success: false, error: CHECK_FIELDS_MESSAGE, fieldErrors: toFieldErrors(validated.error) };
    }

    await employeeService.processEmployeeExit(user, validated.data);

    revalidateEmployeeViews(validated.data.employeeId);
    revalidateInternReviewViews();
    revalidateJoinedPortals();
    return { success: true, data: null };
  } catch (err: unknown) {
    return { success: false, error: toActionError(err, "We couldn't record the exit. Please try again.") };
  }
}

/**
 * Records the outcome of an intern progress review (CONVERT / EXTEND / END_INTERNSHIP).
 * ADMIN, or HR with canEmployees; never for one's own internship (enforced by the service).
 */
export async function recordInternReviewOutcomeAction(
  formData: FormData
): Promise<EmployeeActionResult<ReviewOutcomeResult>> {
  try {
    const user = await requirePermission("canEmployees", { roles: EMPLOYEE_ADMIN_ROLES });

    const validated = RecordReviewOutcomeSchema.safeParse({
      reviewId: readText(formData, "reviewId"),
      outcome: readText(formData, "outcome"),
      internalNotes: readOptionalText(formData, "internalNotes"),
      sharedSummary: readOptionalText(formData, "sharedSummary"),
      proposedDesignation: readText(formData, "proposedDesignation"),
      proposedDepartment: readText(formData, "proposedDepartment"),
      effectiveDate: readText(formData, "effectiveDate"),
      initialStatus: readText(formData, "initialStatus"),
      nextReviewAfterMonths: readText(formData, "nextReviewAfterMonths"),
    });
    if (!validated.success) {
      return { success: false, error: CHECK_FIELDS_MESSAGE, fieldErrors: toFieldErrors(validated.error) };
    }

    const result = await conversionService.recordReviewOutcome(user, validated.data);
    scheduleOutboxFlush();

    revalidateInternReviewViews();
    revalidateEmployeeViews(result.employeeId);
    revalidatePath("/intern/dashboard");
    return { success: true, data: result };
  } catch (err: unknown) {
    return { success: false, error: toActionError(err, "We couldn't save the review outcome. Please try again.") };
  }
}

/**
 * The signed-in intern accepts or declines their own full-time conversion offer. Any signed-in
 * user may call it, but the service only finds reviews of the caller's own employee record.
 */
export async function respondToConversionOfferAction(
  formData: FormData
): Promise<EmployeeActionResult<ConversionResponseResult>> {
  try {
    const user = await requireAuth();

    const validated = ConversionOfferResponseSchema.safeParse({
      reviewId: readText(formData, "reviewId"),
      decision: readText(formData, "decision"),
    });
    if (!validated.success) {
      return { success: false, error: "We couldn't record your answer. Please reload the page and try again." };
    }

    const result = await conversionService.respondToOffer(user, validated.data);
    if (result.converted) {
      scheduleOutboxFlush();
    }

    revalidateJoinedPortals();
    revalidateInternReviewViews();
    revalidateEmployeeViews();
    return { success: true, data: result };
  } catch (err: unknown) {
    return { success: false, error: toActionError(err, "We couldn't record your answer. Please try again.") };
  }
}
