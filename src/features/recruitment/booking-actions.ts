"use server";

import { Role } from "@prisma/client";
import { revalidatePath } from "next/cache";
import type { ZodError } from "zod";
import { requireAuth, requirePermission } from "@/lib/auth/guards";
import { ConflictError, ForbiddenError, toActionError } from "@/lib/errors";
import { scheduleOutboxFlush } from "@/infrastructure/email/outbox-dispatch";
import { getLifecycleForUser, isStaffUser } from "@/features/lifecycle/services/lifecycle-service";
import { interviewBookingService } from "./services/interview-booking-service";
import {
  BookInterviewSlotSchema,
  CancelBookingRequestSchema,
  CreateBookingRequestSchema,
} from "./schemas";
import type { RecruitmentActionResult } from "./actions";

/** Staff roles that may offer interview times (the service also requires canInterviews). */
const BOOKING_STAFF_ROLES: Role[] = [Role.ADMIN, Role.HR, Role.MANAGER, Role.INTERVIEWER];

export type BookSlotActionResult =
  | { success: true; data: { requestId: string; applicationId: string } }
  /** `conflict`: the options changed (taken, withdrawn or already booked); refresh them. */
  | { success: false; error: string; conflict?: boolean };

function toFieldErrors(error: ZodError): Record<string, string> {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (key !== undefined && !fieldErrors[key.toString()]) {
      fieldErrors[key.toString()] = issue.message;
    }
  }
  return fieldErrors;
}

function revalidateBookingViews(applicationId: string, requestId?: string): void {
  for (const base of ["/admin/applications", "/subadmin/applications"]) {
    revalidatePath(`${base}/${applicationId}`);
  }
  revalidatePath("/admin/interviews");
  revalidatePath("/subadmin/interviews");
  revalidatePath("/candidate/dashboard");
  revalidatePath(`/candidate/applications/${applicationId}`);
  if (requestId) {
    revalidatePath(`/candidate/interviews/${requestId}`);
  }
}

/**
 * Staff: offer 2-8 interview times to the candidate (who books one in their portal).
 */
export async function createInterviewBookingRequestAction(
  input: unknown
): Promise<RecruitmentActionResult<{ requestId: string }>> {
  try {
    const user = await requirePermission("canInterviews", { roles: BOOKING_STAFF_ROLES });

    const validated = CreateBookingRequestSchema.safeParse(input);
    if (!validated.success) {
      return {
        success: false,
        error: "Please check the highlighted fields.",
        fieldErrors: toFieldErrors(validated.error),
      };
    }

    const result = await interviewBookingService.createBookingRequest(user, validated.data);
    scheduleOutboxFlush();

    revalidateBookingViews(result.applicationId, result.requestId);
    return { success: true, data: { requestId: result.requestId } };
  } catch (err: unknown) {
    return { success: false, error: toActionError(err, "We couldn't send the interview times. Please try again.") };
  }
}

/**
 * Staff: withdraw interview times the candidate has not booked yet.
 */
export async function cancelInterviewBookingRequestAction(
  input: unknown
): Promise<RecruitmentActionResult<null>> {
  try {
    const user = await requirePermission("canInterviews", { roles: BOOKING_STAFF_ROLES });

    const validated = CancelBookingRequestSchema.safeParse(input);
    if (!validated.success) {
      return {
        success: false,
        error: "Please check the highlighted fields.",
        fieldErrors: toFieldErrors(validated.error),
      };
    }

    const result = await interviewBookingService.cancelBookingRequest(user, validated.data);
    scheduleOutboxFlush();

    revalidateBookingViews(result.applicationId, result.requestId);
    return { success: true, data: null };
  } catch (err: unknown) {
    return { success: false, error: toActionError(err, "We couldn't cancel the request. Please try again.") };
  }
}

/**
 * Candidate: book one of the offered interview times. Ownership is enforced by the service;
 * staff accounts and users whose portal stage has no applications cannot book.
 */
export async function bookInterviewSlotAction(input: unknown): Promise<BookSlotActionResult> {
  try {
    const user = await requireAuth();
    if (isStaffUser(user)) {
      throw new ForbiddenError("Staff accounts cannot book candidate interviews.");
    }
    const lifecycle = await getLifecycleForUser(user);
    if (!lifecycle.capabilities.includes("applications")) {
      throw new ForbiddenError("Interview booking is not available for your account.");
    }

    const validated = BookInterviewSlotSchema.safeParse(input);
    if (!validated.success) {
      return { success: false, error: "Please choose one of the times shown.", conflict: true };
    }

    const result = await interviewBookingService.bookSlot(user, validated.data);
    scheduleOutboxFlush();

    revalidateBookingViews(result.applicationId, result.requestId);
    return { success: true, data: { requestId: result.requestId, applicationId: result.applicationId } };
  } catch (err: unknown) {
    return {
      success: false,
      error: toActionError(err, "We couldn't book that time. Please try again."),
      conflict: err instanceof ConflictError,
    };
  }
}
