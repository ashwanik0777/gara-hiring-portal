"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/guards";
import { attendanceService } from "./services/attendance-service";
import { LogAttendanceSchema } from "./schemas";
import { prisma } from "@/lib/db";
import { AttendanceStatus, AttendanceEntryMethod, EmployeeStatus, Role } from "@prisma/client";

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

    // Authorization: only ADMIN or HR can create employee profiles
    const staffRoles: Role[] = [Role.ADMIN, Role.HR, Role.MANAGER];
    const isStaff = user.roles.some((r) => staffRoles.includes(r as Role));
    if (!isStaff) {
      return { success: false, error: "You do not have permission to manage employee profiles." };
    }

    // Validate userId format to prevent injection
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!userId || !uuidRegex.test(userId)) {
      return { success: false, error: "Invalid user ID format." };
    }

    // Check if target user has employee profile
    const existing = await prisma.employee.findUnique({
      where: { userId },
      select: { id: true, employeeCode: true },
    });

    if (existing) {
      return { success: true, employeeId: existing.id };
    }

    // Verify the target user actually exists
    const targetUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!targetUser) {
      return { success: false, error: "Target user not found." };
    }

    // Use transaction for race-condition-safe employee code generation
    const newEmp = await prisma.$transaction(async (tx) => {
      const count = await tx.employee.count();
      const employeeCode = `EMP-${String(count + 1).padStart(4, "0")}`;

      const emp = await tx.employee.create({
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

      // Audit log
      await tx.auditLog.create({
        data: {
          actorId: user.id,
          actorRole: user.roles[0] || "ADMIN",
          action: "EMPLOYEE_PROFILE_CREATED",
          resourceType: "EMPLOYEE",
          resourceId: emp.id,
          diffPayload: { targetUserId: userId, employeeCode },
        },
      });

      return emp;
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
