"use server";

import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/auth/guards";
import { toActionError } from "@/lib/errors";
import { attendanceService } from "./services/attendance-service";
import { LogAttendanceSchema } from "./schemas";
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
