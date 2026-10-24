"use server";

import { revalidatePath } from "next/cache";
import { requireAuth, requirePermission } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { toActionError, ValidationError } from "@/lib/errors";
import { ApplicationStatus, OfferStatus, Role } from "@prisma/client";
import { attendanceService } from "./services/attendance-service";
import { EnsureEmployeeForUserSchema, LogAttendanceSchema } from "./schemas";
import type { AttendanceRecordView } from "./types";

type AttendanceActionResult =
  | { success: true; record: AttendanceRecordView }
  | { success: false; error: string };

function revalidateAttendancePages() {
  revalidatePath("/admin/attendance");
  revalidatePath("/subadmin/attendance");
  revalidatePath("/hrms/attendance");
}

/**
 * Staff entry or correction of another employee's attendance.
 * Requires `canAttendance`; audit logged by the service.
 */
export async function recordAttendanceAction(rawInput: unknown): Promise<AttendanceActionResult> {
  try {
    const user = await requireAuth();

    const parsed = LogAttendanceSchema.safeParse(rawInput);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message || "Invalid input data" };
    }

    const record = await attendanceService.recordAttendanceForEmployee(user, parsed.data);
    revalidateAttendancePages();
    return { success: true, record };
  } catch (error) {
    return { success: false, error: toActionError(error, "Failed to record attendance.") };
  }
}

/**
 * Self-service check-in for the signed-in employee. Takes no client input: the
 * employee, date, time, status and entry method are all determined on the server.
 */
export async function selfCheckInAction(): Promise<AttendanceActionResult> {
  try {
    const user = await requireAuth();
    const record = await attendanceService.selfCheckIn(user);
    revalidateAttendancePages();
    return { success: true, record };
  } catch (error) {
    return { success: false, error: toActionError(error, "Check-in failed.") };
  }
}

/**
 * Self-service check-out for the signed-in employee (server time only).
 */
export async function selfCheckOutAction(): Promise<AttendanceActionResult> {
  try {
    const user = await requireAuth();
    const record = await attendanceService.selfCheckOut(user);
    revalidateAttendancePages();
    return { success: true, record };
  } catch (error) {
    return { success: false, error: toActionError(error, "Check-out failed.") };
  }
}

/**
 * Looks up the employee record of a user. Restricted to ADMIN/HR with `canEmployees`.
 *
 * This action never creates employee records: hiring belongs to the Employees module,
 * which requires an accepted offer and records employment history, roles and audit
 * entries. Users without an accepted hire path are refused outright.
 */
export async function ensureEmployeeForUserAction(
  rawUserId: unknown
): Promise<{ success: true; employeeId: string } | { success: false; error: string }> {
  try {
    await requirePermission("canEmployees", { roles: [Role.ADMIN, Role.HR] });

    const parsed = EnsureEmployeeForUserSchema.safeParse(rawUserId);
    if (!parsed.success) {
      return { success: false, error: "Invalid user ID format." };
    }
    const userId = parsed.data;

    const existing = await prisma.employee.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (existing) {
      return { success: true, employeeId: existing.id };
    }

    const acceptedHire = await prisma.application.findFirst({
      where: {
        candidate: { userId },
        status: ApplicationStatus.OFFER_ACCEPTED,
        jobOffer: { status: OfferStatus.ACCEPTED },
      },
      select: { id: true },
    });
    if (!acceptedHire) {
      throw new ValidationError(
        "This user has no accepted job offer, so an employee record cannot be created for them."
      );
    }

    throw new ValidationError(
      "Create the employee record from the accepted application in the Employees module so onboarding, employment history and audit entries are recorded."
    );
  } catch (error) {
    return { success: false, error: toActionError(error, "Failed to resolve the employee profile.") };
  }
}
