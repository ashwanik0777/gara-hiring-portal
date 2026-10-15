import { prisma } from "@/lib/db";
import { AuthenticatedUser } from "@/lib/auth/guards";
import { Role, LeaveRequestStatus } from "@prisma/client";
import {
  CreateLeaveRequestInput,
  ReviewLeaveRequestInput,
} from "../schemas";
import { LeaveTypeItem, LeaveRequestItem } from "../types";
import { PolicyBlockedError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";

const LEAVE_ADMIN_ROLES: Role[] = [Role.ADMIN, Role.HR, Role.MANAGER];

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
   * Retrieves active leave types configured in the platform.
   */
  async getLeaveTypes(): Promise<LeaveTypeItem[]> {
    const types = await prisma.leaveType.findMany({
      where: { isActive: true },
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
    }));
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
      include: { user: { select: { id: true, name: true } } },
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

    return {
      id: request.id,
      employeeId: employee.id,
      employeeName: employee.user.name,
      employeeCode: employee.employeeCode,
      leaveTypeId: leaveType.id,
      leaveTypeCode: leaveType.code,
      leaveTypeName: leaveType.name,
      startDate: request.startDate,
      endDate: request.endDate,
      reason: request.reason,
      status: request.status,
      reviewNotes: request.reviewNotes,
      reviewedByName: null,
      reviewedAt: null,
      createdAt: request.createdAt,
    };
  }

  /**
   * Safe review of an employee leave request.
   */
  async reviewLeaveRequest(
    user: AuthenticatedUser,
    input: ReviewLeaveRequestInput
  ): Promise<void> {
    this.assertAdminAccess(user);

    const req = await prisma.leaveRequest.findUnique({
      where: { id: input.requestId },
    });

    if (!req) {
      throw new NotFoundError("Leave request not found.");
    }

    if (req.status !== LeaveRequestStatus.PENDING) {
      throw new ValidationError("Leave request has already been finalized.");
    }

    await prisma.leaveRequest.update({
      where: { id: req.id },
      data: {
        status: input.status as LeaveRequestStatus,
        reviewNotes: input.reviewNotes?.trim() || null,
        reviewedById: user.id,
        reviewedAt: new Date(),
      },
    });
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
