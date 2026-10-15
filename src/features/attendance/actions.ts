"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/guards";
import { attendanceService } from "./services/attendance-service";
import { LogAttendanceSchema } from "./schemas";
import { prisma } from "@/lib/db";
import { AttendanceStatus, AttendanceEntryMethod, EmployeeStatus } from "@prisma/client";

export async function recordAttendanceAction(rawInput: {
  employeeId: string;
  date: string;
  checkInTime?: string | null;
  checkOutTime?: string | null;
  status?: AttendanceStatus;
  entryMethod?: AttendanceEntryMethod;
  notes?: string | null;
}) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: "Authentication required to record attendance." };
    }

    const parsed = LogAttendanceSchema.safeParse(rawInput);
    if (!parsed.success) {
      const firstError = parsed.error.issues[0]?.message || "Invalid input data";
      return { success: false, error: firstError };
    }

    const record = await attendanceService.recordDailyAttendance(user, parsed.data);

    revalidatePath("/admin/attendance");
    revalidatePath("/subadmin/attendance");
    revalidatePath("/hrms/attendance");

    return { success: true, record };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to record attendance";
    return { success: false, error: message };
  }
}

export async function ensureEmployeeForUserAction(userId: string) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: "Authentication required" };
    }

    // Check if target user has employee profile
    const existing = await prisma.employee.findUnique({
      where: { userId },
      select: { id: true, employeeCode: true },
    });

    if (existing) {
      return { success: true, employeeId: existing.id };
    }

    // Generate new employee code
    const count = await prisma.employee.count();
    const employeeCode = `EMP-${String(count + 1).padStart(4, "0")}`;

    const newEmp = await prisma.employee.create({
      data: {
        userId,
        employeeCode,
        designation: "Staff Member",
        department: "Operations",
        joiningDate: new Date(),
        status: EmployeeStatus.ACTIVE,
      },
      select: { id: true, employeeCode: true },
    });

    revalidatePath("/admin/attendance");
    revalidatePath("/subadmin/attendance");
    revalidatePath("/hrms/attendance");

    return { success: true, employeeId: newEmp.id };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create employee profile";
    return { success: false, error: message };
  }
}
