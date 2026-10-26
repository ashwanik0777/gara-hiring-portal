"use server";

import { revalidatePath } from "next/cache";
import { requireAuth, requireRole } from "@/lib/auth/guards";
import { toActionError } from "@/lib/errors";
import { Role } from "@prisma/client";
import { leaveService } from "./services/leave-service";
import {
  CreateLeaveRequestSchema,
  ReviewLeaveRequestSchema,
  CreateLeaveTypeSchema,
  ToggleLeaveTypeSchema,
  EmployeeOptionSearchSchema,
  EmployeeLeaveSummarySchema,
} from "./schemas";
import type {
  EmployeeLeaveSummary,
  EmployeeOptionsResult,
  LeaveRequestItem,
  LeaveReviewResult,
  LeaveTypeItem,
} from "./types";

type ActionResult<T = undefined> =
  | (T extends undefined ? { success: true } : { success: true; data: T })
  | { success: false; error: string };

function firstIssue(issues: { message: string }[]): string {
  return issues.map((i) => i.message).join(", ") || "Invalid input data";
}

function revalidateLeavePages(includeAttendance = false) {
  revalidatePath("/admin/leave");
  revalidatePath("/subadmin/leave");
  revalidatePath("/hrms/leave");
  if (includeAttendance) {
    revalidatePath("/admin/attendance");
    revalidatePath("/subadmin/attendance");
    revalidatePath("/hrms/attendance");
  }
}

/**
 * Approves or rejects a pending leave request. Requires `canLeave`; reviewers cannot
 * review their own request (enforced in the service).
 */
export async function reviewLeaveRequestAction(
  rawInput: unknown
): Promise<ActionResult<LeaveReviewResult>> {
  try {
    const user = await requireAuth();

    const parsed = ReviewLeaveRequestSchema.safeParse(rawInput);
    if (!parsed.success) {
      return { success: false, error: firstIssue(parsed.error.issues) };
    }

    const data = await leaveService.reviewLeaveRequest(user, parsed.data);
    revalidateLeavePages(true);
    return { success: true, data };
  } catch (err: unknown) {
    return { success: false, error: toActionError(err, "Failed to review leave request.") };
  }
}

/**
 * Submits a leave request for oneself, or on behalf of another employee with `canLeave`.
 */
export async function createLeaveRequestAction(
  rawInput: unknown
): Promise<ActionResult<LeaveRequestItem>> {
  try {
    const user = await requireAuth();

    const parsed = CreateLeaveRequestSchema.safeParse(rawInput);
    if (!parsed.success) {
      return { success: false, error: firstIssue(parsed.error.issues) };
    }

    const data = await leaveService.submitLeaveRequest(user, parsed.data);
    revalidateLeavePages();
    return { success: true, data };
  } catch (err: unknown) {
    return { success: false, error: toActionError(err, "Failed to submit leave request.") };
  }
}

/**
 * Creates a leave category. Requires ADMIN, or HR holding `canLeave`.
 */
export async function createLeaveTypeAction(
  rawInput: unknown
): Promise<ActionResult<LeaveTypeItem>> {
  try {
    const user = await requireAuth();

    const parsed = CreateLeaveTypeSchema.safeParse(rawInput);
    if (!parsed.success) {
      return { success: false, error: firstIssue(parsed.error.issues) };
    }

    const data = await leaveService.createLeaveType(user, parsed.data);
    revalidateLeavePages();
    return { success: true, data };
  } catch (err: unknown) {
    return { success: false, error: toActionError(err, "Failed to create leave type.") };
  }
}

/**
 * Activates or deactivates a leave category. Requires ADMIN, or HR holding `canLeave`.
 */
export async function toggleLeaveTypeAction(rawInput: unknown): Promise<ActionResult> {
  try {
    const user = await requireAuth();

    const parsed = ToggleLeaveTypeSchema.safeParse(rawInput);
    if (!parsed.success) {
      return { success: false, error: firstIssue(parsed.error.issues) };
    }

    await leaveService.toggleLeaveType(user, parsed.data.id, parsed.data.isActive);
    revalidateLeavePages();
    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: toActionError(err, "Failed to toggle leave category status.") };
  }
}

/**
 * Loads the suggested leave-type catalogue when no categories exist. ADMIN only.
 * The catalogue is pending product-owner approval (OD-007).
 */
export async function seedDefaultLeaveTypesAction(): Promise<ActionResult<{ created: number }>> {
  try {
    const user = await requireRole([Role.ADMIN]);
    const data = await leaveService.ensureDefaultLeaveTypes(user);
    revalidateLeavePages();
    return { success: true, data };
  } catch (err: unknown) {
    return { success: false, error: toActionError(err, "Failed to load the suggested leave categories.") };
  }
}

/**
 * Employee picker search for the on-behalf leave form (requires `canLeave`, enforced by
 * the service). Returns at most one bounded page of non-exited employees.
 */
export async function searchLeaveEmployeeOptionsAction(
  rawInput: unknown
): Promise<ActionResult<EmployeeOptionsResult>> {
  try {
    const user = await requireAuth();

    const parsed = EmployeeOptionSearchSchema.safeParse(rawInput);
    if (!parsed.success) {
      return { success: false, error: firstIssue(parsed.error.issues) };
    }

    const data = await leaveService.getEmployeeOptions(user, { search: parsed.data.query });
    return { success: true, data };
  } catch (err: unknown) {
    return { success: false, error: toActionError(err, "Failed to search employees.") };
  }
}

/**
 * Recorded leave days of one employee for the details dialog (the employee themself, or
 * staff with `canLeave`). No balances are calculated (OD-007).
 */
export async function getEmployeeLeaveSummaryAction(
  rawInput: unknown
): Promise<ActionResult<EmployeeLeaveSummary>> {
  try {
    const user = await requireAuth();

    const parsed = EmployeeLeaveSummarySchema.safeParse(rawInput);
    if (!parsed.success) {
      return { success: false, error: firstIssue(parsed.error.issues) };
    }

    const data = await leaveService.getEmployeeLeaveSummary(
      user,
      parsed.data.employeeId,
      parsed.data.excludeRequestId
    );
    return { success: true, data };
  } catch (err: unknown) {
    return { success: false, error: toActionError(err, "Failed to load the leave summary.") };
  }
}
