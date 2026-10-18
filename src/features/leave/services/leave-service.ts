import { prisma } from "@/lib/db";
import { AuthenticatedUser } from "@/lib/auth/guards";
import { Role, LeaveRequestStatus, AttendanceStatus, AttendanceEntryMethod } from "@/types/enums";
import {
  CreateLeaveRequestInput,
  ReviewLeaveRequestInput,
  CreateLeaveTypeInput,
} from "../schemas";
import { LeaveTypeItem, LeaveRequestItem, LeaveStats, EmployeeOption } from "../types";
import { PolicyBlockedError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";

const LEAVE_ADMIN_ROLES: Role[] = [Role.ADMIN, Role.HR, Role.MANAGER];

export const DEFAULT_LEAVE_TYPES = [
  {
    code: "CASUAL",
    name: "Casual Leave (CL)",
    description: "For personal appointments, short travels, family commitments, or unplanned personal matters.",
    isPaid: true,
    requiresApproval: true,
  },
  {
    code: "SICK",
    name: "Medical & Sick Leave (SL)",
    description: "For temporary illness, health emergencies, medical appointments, or hospitalizations.",
    isPaid: true,
    requiresApproval: true,
  },
  {
    code: "EARNED",
    name: "Privilege / Earned Leave (PL)",
    description: "Planned annual vacations, holidays, and extended leaves for rest and rejuvenation.",
    isPaid: true,
    requiresApproval: true,
  },
  {
    code: "PARENTAL",
    name: "Maternity & Paternity Leave",
    description: "Statutory parental leaves for new and expecting parents during childbirth or adoption.",
    isPaid: true,
    requiresApproval: true,
  },
  {
    code: "BEREAVEMENT",
    name: "Bereavement Leave",
    description: "Compassionate leave granted in the unfortunate event of loss of an immediate family member.",
    isPaid: true,
    requiresApproval: true,
  },
  {
    code: "UNPAID",
    name: "Leave Without Pay (LWP)",
    description: "Unpaid time off when standard leave allowances have been fully utilized.",
    isPaid: false,
    requiresApproval: true,
  },
];

export class LeaveService {
  private assertAdminAccess(user: AuthenticatedUser): void {
    const isAuthorized = user.roles.some((r) => LEAVE_ADMIN_ROLES.includes(r));
    if (!isAuthorized) {
      throw new ForbiddenError(
        "Leave management and approvals require HR, Manager, or Admin authority."
      );
    }
  }

  /**
   * Seeds default leave categories into PostgreSQL if none exist.
   */
  async ensureDefaultLeaveTypes(): Promise<void> {
    const count = await prisma.leaveType.count();
    if (count > 0) return;

    for (const def of DEFAULT_LEAVE_TYPES) {
      await prisma.leaveType.upsert({
        where: { code: def.code },
        update: {},
        create: {
          code: def.code,
          name: def.name,
          description: def.description,
          isPaid: def.isPaid,
          requiresApproval: def.requiresApproval,
          isActive: true,
        },
      });
    }
  }

  /**
   * Retrieves leave types configured in the platform with usage count.
   */
  async getLeaveTypes(includeInactive: boolean = false): Promise<LeaveTypeItem[]> {
    await this.ensureDefaultLeaveTypes();

    const types = await prisma.leaveType.findMany({
      where: includeInactive ? {} : { isActive: true },
      include: {
        _count: {
          select: { leaveRequests: true },
        },
      },
      orderBy: { name: "asc" },
    });

    return types.map((t) => ({
      id: t.id,
      code: t.code,
      name: t.name,
      description: t.description,
      isPaid: t.isPaid,
      requiresApproval: t.requiresApproval,
      isActive: t.isActive,
      createdAt: t.createdAt.toISOString(),
      _count: t._count,
    }));
  }

  /**
   * Creates a new custom leave category in the database.
   */
  async createLeaveType(
    user: AuthenticatedUser,
    input: CreateLeaveTypeInput
  ): Promise<LeaveTypeItem> {
    this.assertAdminAccess(user);

    const normalizedCode = input.code.trim().toUpperCase();
    const existing = await prisma.leaveType.findUnique({
      where: { code: normalizedCode },
    });

    if (existing) {
      throw new ValidationError(`Leave type code "${normalizedCode}" already exists.`);
    }

    const created = await prisma.leaveType.create({
      data: {
        code: normalizedCode,
        name: input.name.trim(),
        description: input.description?.trim() || null,
        isPaid: input.isPaid ?? true,
        requiresApproval: input.requiresApproval ?? true,
        isActive: true,
      },
    });

    // Record audit log
    await prisma.auditLog.create({
      data: {
        actorId: user.id,
        actorRole: user.roles[0] || "ADMIN",
        action: "CREATE_LEAVE_TYPE",
        resourceType: "LeaveType",
        resourceId: created.id,
        diffPayload: { code: created.code, name: created.name, isPaid: created.isPaid },
      },
    }).catch(() => null);

    return {
      id: created.id,
      code: created.code,
      name: created.name,
      description: created.description,
      isPaid: created.isPaid,
      requiresApproval: created.requiresApproval,
      isActive: created.isActive,
      createdAt: created.createdAt.toISOString(),
    };
  }

  /**
   * Toggles the active status of a leave type.
   */
  async toggleLeaveType(
    user: AuthenticatedUser,
    id: string,
    isActive: boolean
  ): Promise<void> {
    this.assertAdminAccess(user);

    const type = await prisma.leaveType.findUnique({ where: { id } });
    if (!type) throw new NotFoundError("Leave type not found.");

    await prisma.leaveType.update({
      where: { id },
      data: { isActive },
    });

    await prisma.auditLog.create({
      data: {
        actorId: user.id,
        actorRole: user.roles[0] || "ADMIN",
        action: isActive ? "ENABLE_LEAVE_TYPE" : "DISABLE_LEAVE_TYPE",
        resourceType: "LeaveType",
        resourceId: id,
        diffPayload: { previous: type.isActive, next: isActive },
      },
    }).catch(() => null);
  }

  /**
   * Retrieves high-level leave metrics for admin dashboard.
   */
  async getLeaveStats(): Promise<LeaveStats> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [totalRequests, pendingCount, approvedCount, rejectedCount, activeToday] =
      await Promise.all([
        prisma.leaveRequest.count(),
        prisma.leaveRequest.count({
          where: { status: LeaveRequestStatus.PENDING },
        }),
        prisma.leaveRequest.count({
          where: { status: LeaveRequestStatus.APPROVED },
        }),
        prisma.leaveRequest.count({
          where: { status: LeaveRequestStatus.REJECTED },
        }),
        prisma.leaveRequest.count({
          where: {
            status: LeaveRequestStatus.APPROVED,
            startDate: { lte: new Date() },
            endDate: { gte: today },
          },
        }),
      ]);

    const paidLeavesCount = await prisma.leaveRequest.count({
      where: {
        status: LeaveRequestStatus.APPROVED,
        leaveType: { isPaid: true },
      },
    });

    return {
      totalRequests,
      pendingCount,
      approvedCount,
      rejectedCount,
      onLeaveTodayCount: activeToday,
      paidLeavesCount,
    };
  }

  /**
   * Retrieves all leave requests for admin review with employee & reviewer details.
   */
  async getAllLeaveRequests(
    user: AuthenticatedUser,
    filters?: {
      status?: LeaveRequestStatus;
      leaveTypeId?: string;
      employeeId?: string;
    }
  ): Promise<LeaveRequestItem[]> {
    this.assertAdminAccess(user);

    const whereClause: Record<string, unknown> = {};
    if (filters?.status) whereClause.status = filters.status;
    if (filters?.leaveTypeId) whereClause.leaveTypeId = filters.leaveTypeId;
    if (filters?.employeeId) whereClause.employeeId = filters.employeeId;

    const requests = await prisma.leaveRequest.findMany({
      where: whereClause,
      include: {
        employee: {
          select: {
            id: true,
            employeeCode: true,
            department: true,
            designation: true,
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        },
        leaveType: {
          select: {
            id: true,
            code: true,
            name: true,
            isPaid: true,
          },
        },
        reviewedBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return requests.map((r) => {
      const startMs = new Date(r.startDate).getTime();
      const endMs = new Date(r.endDate).getTime();
      const diffDays = Math.max(1, Math.round((endMs - startMs) / (1000 * 60 * 60 * 24)) + 1);

      return {
        id: r.id,
        employeeId: r.employeeId,
        employeeName: r.employee?.user?.name || "Unknown Employee",
        employeeCode: r.employee?.employeeCode || "N/A",
        employeeDepartment: r.employee?.department || "General",
        employeeDesignation: r.employee?.designation || "Staff",
        employeeEmail: r.employee?.user?.email,
        leaveTypeId: r.leaveTypeId,
        leaveTypeCode: r.leaveType?.code || "LEAVE",
        leaveTypeName: r.leaveType?.name || "General Leave",
        isPaid: r.leaveType?.isPaid ?? true,
        startDate: r.startDate.toISOString(),
        endDate: r.endDate.toISOString(),
        durationDays: diffDays,
        reason: r.reason,
        status: r.status as LeaveRequestStatus,
        reviewNotes: r.reviewNotes,
        reviewedById: r.reviewedById,
        reviewedByName: r.reviewedBy?.name || null,
        reviewedAt: r.reviewedAt ? r.reviewedAt.toISOString() : null,
        createdAt: r.createdAt.toISOString(),
      };
    });
  }

  /**
   * Safe submission of a leave request without automatic balance deduction.
   */
  async submitLeaveRequest(
    user: AuthenticatedUser,
    input: CreateLeaveRequestInput
  ): Promise<LeaveRequestItem> {
    const employee = await prisma.employee.findUnique({
      where: { id: input.employeeId },
      include: { user: { select: { id: true, name: true, email: true } } },
    });

    if (!employee) {
      throw new NotFoundError("Employee record not found.");
    }

    const isSelf = employee.userId === user.id;
    const isStaffAdmin = user.roles.some((r) => LEAVE_ADMIN_ROLES.includes(r));

    if (!isSelf && !isStaffAdmin) {
      throw new ForbiddenError("Not authorized to submit leave on behalf of another employee.");
    }

    const leaveType = await prisma.leaveType.findUnique({
      where: { id: input.leaveTypeId },
    });

    if (!leaveType) {
      throw new NotFoundError("Leave type not found.");
    }

    const start = new Date(input.startDate);
    const end = new Date(input.endDate);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      throw new ValidationError("Invalid date values provided.");
    }

    if (end < start) {
      throw new ValidationError("End date cannot precede start date.");
    }

    const request = await prisma.leaveRequest.create({
      data: {
        employeeId: employee.id,
        leaveTypeId: leaveType.id,
        startDate: start,
        endDate: end,
        reason: input.reason.trim(),
        status: LeaveRequestStatus.PENDING,
      },
      include: {
        leaveType: true,
      },
    });

    const diffDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1);

    // Audit log
    await prisma.auditLog.create({
      data: {
        actorId: user.id,
        actorRole: user.roles[0] || "ADMIN",
        action: "SUBMIT_LEAVE_REQUEST",
        resourceType: "LeaveRequest",
        resourceId: request.id,
        diffPayload: {
          employeeId: employee.id,
          leaveType: leaveType.code,
          startDate: start,
          endDate: end,
          durationDays: diffDays,
        },
      },
    }).catch(() => null);

    return {
      id: request.id,
      employeeId: employee.id,
      employeeName: employee.user.name,
      employeeCode: employee.employeeCode,
      employeeDepartment: employee.department,
      employeeDesignation: employee.designation,
      employeeEmail: employee.user.email,
      leaveTypeId: leaveType.id,
      leaveTypeCode: leaveType.code,
      leaveTypeName: leaveType.name,
      isPaid: leaveType.isPaid,
      startDate: request.startDate.toISOString(),
      endDate: request.endDate.toISOString(),
      durationDays: diffDays,
      reason: request.reason,
      status: request.status as LeaveRequestStatus,
      reviewNotes: request.reviewNotes,
      reviewedById: null,
      reviewedByName: null,
      reviewedAt: null,
      createdAt: request.createdAt.toISOString(),
    };
  }

  /**
   * Safe review (Approval or Rejection) of an employee leave request.
   */
  async reviewLeaveRequest(
    user: AuthenticatedUser,
    input: ReviewLeaveRequestInput
  ): Promise<void> {
    this.assertAdminAccess(user);

    const req = await prisma.leaveRequest.findUnique({
      where: { id: input.requestId },
      include: {
        employee: { select: { id: true, userId: true, user: { select: { name: true } } } },
        leaveType: true,
      },
    });

    if (!req) {
      throw new NotFoundError("Leave request not found.");
    }

    if (req.status !== LeaveRequestStatus.PENDING) {
      throw new ValidationError("Leave request has already been finalized.");
    }

    const targetStatus = input.status as LeaveRequestStatus;

    await prisma.leaveRequest.update({
      where: { id: req.id },
      data: {
        status: targetStatus,
        reviewNotes: input.reviewNotes?.trim() || null,
        reviewedById: user.id,
        reviewedAt: new Date(),
      },
    });

    // If APPROVED, synchronize with attendance records so the employee is marked ON_LEAVE
    if (targetStatus === LeaveRequestStatus.APPROVED) {
      try {
        const curDate = new Date(req.startDate);
        const stopDate = new Date(req.endDate);

        while (curDate <= stopDate) {
          const dateOnly = new Date(curDate);
          dateOnly.setHours(0, 0, 0, 0);

          await prisma.attendanceRecord.upsert({
            where: {
              employeeId_date: {
                employeeId: req.employeeId,
                date: dateOnly,
              },
            },
            update: {
              status: AttendanceStatus.ON_LEAVE,
              notes: `Approved Leave: ${req.leaveType.name} (${req.reason.slice(0, 60)})`,
            },
            create: {
              employeeId: req.employeeId,
              date: dateOnly,
              status: AttendanceStatus.ON_LEAVE,
              entryMethod: AttendanceEntryMethod.WEB_PORTAL,
              notes: `Approved Leave: ${req.leaveType.name} (${req.reason.slice(0, 60)})`,
            },
          });

          curDate.setDate(curDate.getDate() + 1);
        }
      } catch (attendanceSyncError) {
        console.warn("[LeaveService] Attendance sync warning:", attendanceSyncError);
      }
    }

    // Record audit log
    await prisma.auditLog.create({
      data: {
        actorId: user.id,
        actorRole: user.roles[0] || "ADMIN",
        action: targetStatus === LeaveRequestStatus.APPROVED ? "APPROVE_LEAVE" : "REJECT_LEAVE",
        resourceType: "LeaveRequest",
        resourceId: req.id,
        diffPayload: {
          employeeId: req.employeeId,
          leaveType: req.leaveType.code,
          previousStatus: req.status,
          nextStatus: targetStatus,
          reviewNotes: input.reviewNotes?.trim() || null,
        },
      },
    }).catch(() => null);
  }

  /**
   * Retrieves active employees for the leave assignment dropdown.
   */
  async getEmployeeOptions(): Promise<EmployeeOption[]> {
    const raw = await prisma.employee.findMany({
      where: { status: "ACTIVE" },
      select: {
        id: true,
        employeeCode: true,
        department: true,
        designation: true,
        user: { select: { name: true, email: true } },
      },
      orderBy: { employeeCode: "asc" },
    });

    return raw.map((e) => ({
      id: e.id,
      employeeCode: e.employeeCode,
      name: e.user.name,
      email: e.user.email,
      department: e.department,
      designation: e.designation,
    }));
  }

  // ---------------------------------------------------------------------------
  // EXPLICIT POLICY GATES (NON-NEGOTIABLE PRESERVATION OF OD-007 / D-11)
  // ---------------------------------------------------------------------------

  /**
   * POLICY BLOCKED: Calculates leave accruals, carry-forward limits, and current balance.
   * Throws PolicyBlockedError pending product owner policy approval.
   */
  calculateLeaveAccrualOrBalance(): never {
    throw new PolicyBlockedError(
      "OD-007",
      "Leave balance calculation, accrual formulas, carry-forward limits, and proration policies have not been approved by the product owner. Balance computation is strictly disabled."
    );
  }

  /**
   * POLICY BLOCKED: Encashment or statutory payouts.
   */
  calculateLeaveEncashment(): never {
    throw new PolicyBlockedError(
      "OD-007",
      "Leave encashment and statutory payout formulas are unapproved."
    );
  }
}

export const leaveService = new LeaveService();
