import { prisma } from "@/lib/db";
import { AuthenticatedUser } from "@/lib/auth/guards";
import { Role, AttendanceStatus, RegularizationStatus } from "@prisma/client";
import {
  LogAttendanceInput,
  RequestRegularizationInput,
  ReviewRegularizationInput,
} from "../schemas";
import { AttendanceRecordItem } from "../types";
import { PolicyBlockedError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";

const ATTENDANCE_ADMIN_ROLES: Role[] = [Role.ADMIN, Role.HR, Role.MANAGER];

export class AttendanceService {
  private assertAdminAccess(user: AuthenticatedUser): void {
    const isAuthorized = user.roles.some((r) => ATTENDANCE_ADMIN_ROLES.includes(r));
    if (!isAuthorized) {
      throw new ForbiddenError(
        "Attendance administration and regularization reviews require HR, Manager, or Admin authority."
      );
    }
  }

  /**
   * Safe operational recording of daily check-in/out timestamps.
   * Does NOT compute lateness penalties or overtime hours.
   */
  async recordDailyAttendance(
    user: AuthenticatedUser,
    input: LogAttendanceInput
  ): Promise<AttendanceRecordItem> {
    const employee = await prisma.employee.findUnique({
      where: { id: input.employeeId },
      include: { user: { select: { id: true, name: true, email: true } } },
    });

    if (!employee) {
      throw new NotFoundError("Employee record not found.");
    }

    const isStaffAdmin = user.roles.some((r) => ATTENDANCE_ADMIN_ROLES.includes(r));
    const isSelf = employee.userId === user.id;

    if (!isStaffAdmin && !isSelf) {
      throw new ForbiddenError("Not authorized to record attendance for another employee.");
    }

    const dateOnly = new Date(input.date);
    dateOnly.setUTCHours(0, 0, 0, 0);

    const record = await prisma.attendanceRecord.upsert({
      where: {
        employeeId_date: {
          employeeId: employee.id,
          date: dateOnly,
        },
      },
      create: {
        employeeId: employee.id,
        date: dateOnly,
        checkInTime: input.checkInTime ? new Date(input.checkInTime) : new Date(),
        checkOutTime: input.checkOutTime ? new Date(input.checkOutTime) : null,
        status: input.status,
        entryMethod: input.entryMethod,
        notes: input.notes?.trim() || null,
      },
      update: {
        checkInTime: input.checkInTime ? new Date(input.checkInTime) : undefined,
        checkOutTime: input.checkOutTime ? new Date(input.checkOutTime) : new Date(),
        status: input.status,
        notes: input.notes?.trim() || undefined,
      },
    });

    return {
      id: record.id,
      employeeId: employee.id,
      employeeName: employee.user.name,
      employeeCode: employee.employeeCode,
      date: record.date,
      checkInTime: record.checkInTime,
      checkOutTime: record.checkOutTime,
      status: record.status,
      entryMethod: record.entryMethod,
      notes: record.notes,
    };
  }

  /**
   * Safe retrieval of employee attendance logs.
   */
  async getEmployeeAttendanceHistory(
    user: AuthenticatedUser,
    employeeId: string
  ): Promise<AttendanceRecordItem[]> {
    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
      include: { user: { select: { id: true, name: true } } },
    });

    if (!employee) {
      throw new NotFoundError("Employee record not found.");
    }

    const isStaffAdmin = user.roles.some((r) => ATTENDANCE_ADMIN_ROLES.includes(r));
    const isSelf = employee.userId === user.id;

    if (!isStaffAdmin && !isSelf) {
      throw new ForbiddenError("Not authorized to view another employee's attendance logs.");
    }

    const records = await prisma.attendanceRecord.findMany({
      where: { employeeId },
      orderBy: { date: "desc" },
      take: 30,
    });

    return records.map((r) => ({
      id: r.id,
      employeeId: employee.id,
      employeeName: employee.user.name,
      employeeCode: employee.employeeCode,
      date: r.date,
      checkInTime: r.checkInTime,
      checkOutTime: r.checkOutTime,
      status: r.status,
      entryMethod: r.entryMethod,
      notes: r.notes,
    }));
  }

  /**
   * Safe request for attendance regularization (correction).
   */
  async requestAttendanceRegularization(
    user: AuthenticatedUser,
    input: RequestRegularizationInput
  ): Promise<void> {
    const record = await prisma.attendanceRecord.findUnique({
      where: { id: input.attendanceRecordId },
      include: { employee: true },
    });

    if (!record) {
      throw new NotFoundError("Attendance record not found.");
    }

    const isSelf = record.employee.userId === user.id;
    const isStaffAdmin = user.roles.some((r) => ATTENDANCE_ADMIN_ROLES.includes(r));

    if (!isSelf && !isStaffAdmin) {
      throw new ForbiddenError("Not authorized to request regularization for this record.");
    }

    await prisma.$transaction(async (tx) => {
      await tx.attendanceRegularization.create({
        data: {
          employeeId: record.employeeId,
          attendanceRecordId: record.id,
          requestedCheckIn: input.requestedCheckIn ? new Date(input.requestedCheckIn) : null,
          requestedCheckOut: input.requestedCheckOut ? new Date(input.requestedCheckOut) : null,
          reason: input.reason.trim(),
          status: RegularizationStatus.PENDING,
        },
      });

      await tx.attendanceRecord.update({
        where: { id: record.id },
        data: { status: AttendanceStatus.REGULARIZATION_PENDING },
      });
    });
  }

  /**
   * Review attendance regularization request.
   */
  async reviewRegularization(
    user: AuthenticatedUser,
    input: ReviewRegularizationInput
  ): Promise<void> {
    this.assertAdminAccess(user);

    const reg = await prisma.attendanceRegularization.findUnique({
      where: { id: input.regularizationId },
      include: { attendanceRecord: true },
    });

    if (!reg) {
      throw new NotFoundError("Regularization request not found.");
    }

    if (reg.status !== RegularizationStatus.PENDING) {
      throw new ValidationError("Regularization request has already been reviewed.");
    }

    await prisma.$transaction(async (tx) => {
      await tx.attendanceRegularization.update({
        where: { id: reg.id },
        data: {
          status: input.status as RegularizationStatus,
          reviewNotes: input.reviewNotes?.trim() || null,
          reviewedById: user.id,
          reviewedAt: new Date(),
        },
      });

      if (input.status === "APPROVED") {
        await tx.attendanceRecord.update({
          where: { id: reg.attendanceRecordId },
          data: {
            checkInTime: reg.requestedCheckIn || reg.attendanceRecord.checkInTime,
            checkOutTime: reg.requestedCheckOut || reg.attendanceRecord.checkOutTime,
            status: AttendanceStatus.PRESENT,
          },
        });
      } else {
        await tx.attendanceRecord.update({
          where: { id: reg.attendanceRecordId },
          data: { status: AttendanceStatus.PRESENT },
        });
      }
    });
  }

  // ---------------------------------------------------------------------------
  // EXPLICIT POLICY GATES (NON-NEGOTIABLE PRESERVATION OF OD-006 / D-10)
  // ---------------------------------------------------------------------------

  /**
   * POLICY BLOCKED: Calculates overtime, lateness deductions, or half-day penalties.
   * Throws PolicyBlockedError pending product owner policy approval.
   */
  calculateLatenessOrOvertime(): never {
    throw new PolicyBlockedError(
      "OD-006",
      "Attendance calculation, grace periods, lateness penalties, and overtime rules have not been approved by the product owner. Automatic deduction calculation is strictly disabled."
    );
  }

  /**
   * POLICY BLOCKED: Infers attendance from task timers or background activity.
   */
  inferAttendanceFromTimers(): never {
    throw new PolicyBlockedError(
      "OD-006",
      "Silently inferring employee attendance from task timers, ideation activity, or background telemetry is strictly prohibited by engineering policy."
    );
  }
}

export const attendanceService = new AttendanceService();
