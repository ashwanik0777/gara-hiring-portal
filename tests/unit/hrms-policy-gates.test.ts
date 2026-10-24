import { describe, it, expect, vi, beforeEach } from "vitest";
import crypto from "node:crypto";
import { Role } from "@prisma/client";
import type { AuthenticatedUser } from "@/lib/auth/guards";
import { attendanceService } from "@/features/attendance/services/attendance-service";
import { leaveService } from "@/features/leave/services/leave-service";
import {
  payrollService,
  PAYROLL_PERIOD_TRANSITIONS,
  parsePayoutProfile,
  serializePayoutProfile,
} from "@/features/payroll/services/payroll-service";
import {
  LogAttendanceSchema,
  RequestRegularizationSchema,
  ReviewRegularizationSchema,
} from "@/features/attendance/schemas";
import {
  CreateLeaveRequestSchema,
  ReviewLeaveRequestSchema,
} from "@/features/leave/schemas";
import {
  BulkDisbursementSchema,
  CreatePayrollPeriodSchema,
  RecordDisbursementSchema,
  UpdateEmployeePayoutProfileSchema,
  UpdatePayrollPeriodStatusSchema,
} from "@/features/payroll/schemas";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  PolicyBlockedError,
  ValidationError,
} from "@/lib/errors";
import { loadAttendancePageData } from "@/features/attendance/services/attendance-page-data";
import { loadLeavePageData } from "@/features/leave/services/leave-page-data";

// ---------------------------------------------------------------------------
// Shared Prisma mock. Every model exposes the same set of vi.fn() methods;
// `$transaction` runs callbacks against the same mock object.
// ---------------------------------------------------------------------------
const { mockDb, resetMockDb } = vi.hoisted(() => {
  const model = () => ({
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
    create: vi.fn(),
    createMany: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    upsert: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn(),
    aggregate: vi.fn(),
    groupBy: vi.fn(),
  });
  const db = {
    user: model(),
    employee: model(),
    employmentHistory: model(),
    application: model(),
    jobOffer: model(),
    attendanceRecord: model(),
    attendanceRegularization: model(),
    leaveType: model(),
    leaveRequest: model(),
    payrollPeriod: model(),
    payrollRecord: model(),
    auditLog: model(),
    subAdminPermission: model(),
    $transaction: vi.fn(),
    $executeRaw: vi.fn(),
  };
  const reset = () => {
    for (const value of Object.values(db)) {
      if (typeof value === "function") {
        value.mockReset();
      } else {
        for (const fn of Object.values(value)) {
          fn.mockReset();
        }
      }
    }
    db.$transaction.mockImplementation(async (arg: unknown) => {
      if (typeof arg === "function") {
        return (arg as (tx: typeof db) => Promise<unknown>)(db);
      }
      return Promise.all(arg as Promise<unknown>[]);
    });
    // No custom SubAdminPermission row: role defaults apply (HR: canPayroll=false).
    db.subAdminPermission.findUnique.mockResolvedValue(null);
    db.auditLog.create.mockResolvedValue({ id: "audit-1" });
  };
  reset();
  return { mockDb: db, resetMockDb: reset };
});

vi.mock("@/lib/db", () => ({ prisma: mockDb }));

const adminUser: AuthenticatedUser = {
  id: "user-admin-1",
  email: "admin@example.test",
  name: "Test Admin",
  roles: [Role.ADMIN],
};
const hrUser: AuthenticatedUser = {
  id: "user-hr-1",
  email: "hr@example.test",
  name: "Test HR",
  roles: [Role.HR],
};
const managerUser: AuthenticatedUser = {
  id: "user-manager-1",
  email: "manager@example.test",
  name: "Test Manager",
  roles: [Role.MANAGER],
};
const internUser: AuthenticatedUser = {
  id: "user-intern-1",
  email: "intern@example.test",
  name: "Test Intern",
  roles: [Role.INTERN],
};
const candidateUser: AuthenticatedUser = {
  id: "user-candidate-1",
  email: "candidate@example.test",
  name: "Test Candidate",
  roles: [Role.CANDIDATE],
};

/** Custom SubAdminPermission row with every module flag set to `value`. */
function permissionRow(userId: string, value: boolean, overrides: Record<string, boolean> = {}) {
  return {
    id: `perm-${userId}`,
    userId,
    canApplications: value,
    canOpenings: value,
    canInterviews: value,
    canEvaluations: value,
    canEmployees: value,
    canAttendance: value,
    canLeave: value,
    canPayroll: value,
    canReports: value,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

beforeEach(() => {
  resetMockDb();
});

describe("Prompt 8A: Attendance Module Policy Gates & Validations (OD-006 / D-10)", () => {
  it("strictly throws PolicyBlockedError when attempting overtime or lateness deduction calculation", () => {
    expect(() => attendanceService.calculateLatenessOrOvertime()).toThrow(PolicyBlockedError);
    try {
      attendanceService.calculateLatenessOrOvertime();
    } catch (err: unknown) {
      expect(err).toBeInstanceOf(PolicyBlockedError);
      expect((err as PolicyBlockedError).decisionRef).toBe("OD-006");
    }
  });

  it("strictly throws PolicyBlockedError when attempting automatic attendance inference from timers", () => {
    expect(() => attendanceService.inferAttendanceFromTimers()).toThrow(PolicyBlockedError);
    try {
      attendanceService.inferAttendanceFromTimers();
    } catch (err: unknown) {
      expect(err).toBeInstanceOf(PolicyBlockedError);
      expect((err as PolicyBlockedError).decisionRef).toBe("OD-006");
    }
  });

  it("validates safe daily attendance logging schema", () => {
    const valid = LogAttendanceSchema.safeParse({
      employeeId: crypto.randomUUID(),
      date: "2026-04-15T00:00:00.000Z",
      checkInTime: "2026-04-15T04:00:00.000Z",
      checkOutTime: "2026-04-15T13:00:00.000Z",
      notes: "On-site Bangalore office",
    });

    expect(valid.success).toBe(true);
  });

  it("validates daily attendance logging with status options (PRESENT, HALF_DAY, ON_LEAVE)", () => {
    const halfDay = LogAttendanceSchema.safeParse({
      employeeId: crypto.randomUUID(),
      date: "2026-04-15T00:00:00.000Z",
      status: "HALF_DAY",
      checkInTime: "2026-04-15T04:00:00.000Z",
      checkOutTime: "2026-04-15T08:30:00.000Z",
      notes: "First half attended",
    });
    expect(halfDay.success).toBe(true);

    const onLeave = LogAttendanceSchema.safeParse({
      employeeId: crypto.randomUUID(),
      date: "2026-04-15T00:00:00.000Z",
      status: "ON_LEAVE",
      notes: "Casual leave approved",
    });
    expect(onLeave.success).toBe(true);
  });

  it("validates attendance regularization request schema", () => {
    const valid = RequestRegularizationSchema.safeParse({
      attendanceRecordId: crypto.randomUUID(),
      requestedCheckIn: "2026-04-15T04:00:00.000Z",
      requestedCheckOut: "2026-04-15T13:00:00.000Z",
      reason: "Forgot to punch out due to client meeting",
    });

    expect(valid.success).toBe(true);

    const invalid = RequestRegularizationSchema.safeParse({
      attendanceRecordId: crypto.randomUUID(),
      reason: "Bad", // < 5 characters
    });
    expect(invalid.success).toBe(false);
  });

  it("validates regularization review schema", () => {
    const valid = ReviewRegularizationSchema.safeParse({
      regularizationId: crypto.randomUUID(),
      status: "APPROVED",
      reviewNotes: "Verified with manager",
    });

    expect(valid.success).toBe(true);
  });
});

describe("Prompt 8B: Leave Module Policy Gates & Validations (OD-007 / D-11)", () => {
  it("strictly throws PolicyBlockedError when attempting leave balance accrual calculation", () => {
    expect(() => leaveService.calculateLeaveAccrualOrBalance()).toThrow(PolicyBlockedError);
    try {
      leaveService.calculateLeaveAccrualOrBalance();
    } catch (err: unknown) {
      expect(err).toBeInstanceOf(PolicyBlockedError);
      expect((err as PolicyBlockedError).decisionRef).toBe("OD-007");
    }
  });

  it("strictly throws PolicyBlockedError when attempting leave encashment calculation", () => {
    expect(() => leaveService.calculateLeaveEncashment()).toThrow(PolicyBlockedError);
    try {
      leaveService.calculateLeaveEncashment();
    } catch (err: unknown) {
      expect(err).toBeInstanceOf(PolicyBlockedError);
      expect((err as PolicyBlockedError).decisionRef).toBe("OD-007");
    }
  });

  it("validates safe leave request schema", () => {
    const valid = CreateLeaveRequestSchema.safeParse({
      employeeId: crypto.randomUUID(),
      leaveTypeId: crypto.randomUUID(),
      startDate: "2026-05-10T00:00:00.000Z",
      endDate: "2026-05-12T00:00:00.000Z",
      reason: "Attending family function",
    });

    expect(valid.success).toBe(true);
  });

  it("validates leave request review schema", () => {
    const valid = ReviewLeaveRequestSchema.safeParse({
      requestId: crypto.randomUUID(),
      status: "APPROVED",
      reviewNotes: "Work coverage confirmed",
    });

    expect(valid.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Attendance authorization, self-service integrity and policy removal
// (SEC-09, SEC-27, BUG-20, POL-11)
// ---------------------------------------------------------------------------

const internEmployee = {
  id: "emp-intern-1",
  userId: "user-intern-1",
  employeeCode: "EMP-T-001",
  department: "Engineering",
  designation: "Intern",
  status: "ACTIVE",
  user: { name: "Test Intern", email: "intern@example.test" },
};
const otherEmployee = {
  id: "emp-other-1",
  userId: "user-other-1",
  employeeCode: "EMP-T-002",
  department: "Engineering",
  designation: "Engineer",
  status: "ACTIVE",
  user: { name: "Other Employee", email: "other@example.test" },
};
const hrEmployee = {
  ...otherEmployee,
  id: "emp-hr-1",
  userId: "user-hr-1",
  employeeCode: "EMP-T-003",
  user: { name: "Test HR", email: "hr@example.test" },
};

function attendanceRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "att-1",
    employeeId: internEmployee.id,
    date: new Date("2026-10-24T00:00:00.000Z"),
    checkInTime: null,
    checkOutTime: null,
    status: "PRESENT",
    entryMethod: "WEB_PORTAL",
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe("Attendance self-service integrity (SEC-27, BUG-20)", () => {
  it("self check-in resolves the employee from the session and uses server time only", async () => {
    mockDb.employee.findUnique.mockResolvedValue(internEmployee);
    mockDb.attendanceRecord.findUnique.mockResolvedValue(null);
    mockDb.attendanceRecord.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) =>
      attendanceRow(data)
    );

    const before = Date.now();
    const record = await attendanceService.selfCheckIn(internUser);
    const after = Date.now();

    expect(mockDb.employee.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: internUser.id } })
    );
    const createArgs = mockDb.attendanceRecord.create.mock.calls[0][0].data;
    expect(createArgs.employeeId).toBe(internEmployee.id);
    expect(createArgs.status).toBe("PRESENT");
    expect(createArgs.entryMethod).toBe("WEB_PORTAL");
    expect(createArgs.checkOutTime).toBeUndefined();
    const checkInMs = (createArgs.checkInTime as Date).getTime();
    expect(checkInMs).toBeGreaterThanOrEqual(before);
    expect(checkInMs).toBeLessThanOrEqual(after);
    // Attendance day is the UTC calendar day of the server time.
    expect((createArgs.date as Date).toISOString()).toMatch(/T00:00:00\.000Z$/);
    expect(record.employeeId).toBe(internEmployee.id);
  });

  it("self check-in never overwrites an existing check-in", async () => {
    mockDb.employee.findUnique.mockResolvedValue(internEmployee);
    mockDb.attendanceRecord.findUnique.mockResolvedValue(
      attendanceRow({ checkInTime: new Date("2026-10-24T03:30:00.000Z") })
    );

    await expect(attendanceService.selfCheckIn(internUser)).rejects.toBeInstanceOf(ConflictError);
    expect(mockDb.attendanceRecord.updateMany).not.toHaveBeenCalled();
    expect(mockDb.attendanceRecord.create).not.toHaveBeenCalled();
  });

  it("self check-in never overrides a staff-set ABSENT or ON_LEAVE status", async () => {
    mockDb.employee.findUnique.mockResolvedValue(internEmployee);
    for (const status of ["ABSENT", "ON_LEAVE"]) {
      mockDb.attendanceRecord.findUnique.mockResolvedValueOnce(attendanceRow({ status }));
      await expect(attendanceService.selfCheckIn(internUser)).rejects.toBeInstanceOf(ConflictError);
    }
    expect(mockDb.attendanceRecord.updateMany).not.toHaveBeenCalled();
  });

  it("self check-in is refused for an exited employee record or a user without one", async () => {
    mockDb.employee.findUnique.mockResolvedValueOnce({ ...internEmployee, status: "EXITED" });
    await expect(attendanceService.selfCheckIn(internUser)).rejects.toBeInstanceOf(ForbiddenError);

    mockDb.employee.findUnique.mockResolvedValueOnce(null);
    await expect(attendanceService.selfCheckIn(candidateUser)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("self check-out uses a conditional write with server time and requires a prior check-in", async () => {
    mockDb.employee.findUnique.mockResolvedValue(internEmployee);
    mockDb.attendanceRecord.findUnique.mockResolvedValueOnce(attendanceRow());
    await expect(attendanceService.selfCheckOut(internUser)).rejects.toBeInstanceOf(ConflictError);

    mockDb.attendanceRecord.findUnique.mockResolvedValueOnce(
      attendanceRow({ checkInTime: new Date(Date.now() - 60_000) })
    );
    mockDb.attendanceRecord.updateMany.mockResolvedValueOnce({ count: 1 });
    const record = await attendanceService.selfCheckOut(internUser);

    const args = mockDb.attendanceRecord.updateMany.mock.calls[0][0];
    expect(args.where).toMatchObject({ id: "att-1", checkOutTime: null });
    expect(Object.keys(args.data)).toEqual(["checkOutTime"]);
    expect(record.checkOutTime).not.toBeNull();
  });
});

describe("Attendance staff entries require canAttendance and are audited (SEC-09, SEC-27)", () => {
  const staffInput = {
    employeeId: otherEmployee.id,
    date: "2026-10-20T00:00:00.000Z",
    checkInTime: "2026-10-20T03:30:00.000Z",
    checkOutTime: "2026-10-20T12:30:00.000Z",
    status: "PRESENT" as const,
    notes: "Corrected after manual verification",
  };

  it("HR with the default canAttendance permission records another employee's attendance with an audit entry", async () => {
    mockDb.employee.findUnique.mockResolvedValue(otherEmployee);
    mockDb.attendanceRecord.findUnique.mockResolvedValue(null);
    mockDb.attendanceRecord.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) =>
      attendanceRow({ ...data, id: "att-2" })
    );

    await attendanceService.recordAttendanceForEmployee(hrUser, staffInput);

    const data = mockDb.attendanceRecord.create.mock.calls[0][0].data;
    expect(data.entryMethod).toBe("MANUAL_ENTRY");
    expect(mockDb.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "ATTENDANCE_RECORD_CREATED",
          actorId: hrUser.id,
          resourceId: "att-2",
        }),
      })
    );
  });

  it("rejects staff without canAttendance (custom permission row) and non-staff users", async () => {
    mockDb.employee.findUnique.mockResolvedValue(otherEmployee);
    mockDb.subAdminPermission.findUnique.mockResolvedValueOnce(
      permissionRow(hrUser.id, true, { canAttendance: false })
    );
    await expect(
      attendanceService.recordAttendanceForEmployee(hrUser, staffInput)
    ).rejects.toBeInstanceOf(ForbiddenError);

    await expect(
      attendanceService.recordAttendanceForEmployee(internUser, staffInput)
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(mockDb.attendanceRecord.create).not.toHaveBeenCalled();
    expect(mockDb.attendanceRecord.update).not.toHaveBeenCalled();
  });

  it("staff cannot edit their own attendance through the staff path", async () => {
    mockDb.employee.findUnique.mockResolvedValue(hrEmployee);
    await expect(
      attendanceService.recordAttendanceForEmployee(hrUser, { ...staffInput, employeeId: hrEmployee.id })
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(mockDb.attendanceRecord.create).not.toHaveBeenCalled();
  });

  it("the team view is forbidden without canAttendance; the self view returns only own rows", async () => {
    await expect(attendanceService.getTeamAttendanceView(internUser)).rejects.toBeInstanceOf(
      ForbiddenError
    );

    mockDb.employee.findUnique.mockResolvedValue(internEmployee);
    mockDb.attendanceRecord.findMany.mockResolvedValue([attendanceRow()]);
    const pageData = await loadAttendancePageData(internUser, { allowSelfView: true });

    expect(pageData.view).toBe("self");
    expect(mockDb.employee.findMany).not.toHaveBeenCalled();
    expect(mockDb.attendanceRecord.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { employeeId: internEmployee.id } })
    );
  });

  it("staff-only pages render forbidden instead of team data for users without canAttendance", async () => {
    const pageData = await loadAttendancePageData(internUser, { allowSelfView: false });
    expect(pageData.view).toBe("forbidden");
    expect(mockDb.attendanceRecord.findMany).not.toHaveBeenCalled();
  });

  it("the staff schema rejects workflow-only statuses and inverted times", () => {
    expect(
      LogAttendanceSchema.safeParse({ ...staffInput, status: "REGULARIZATION_PENDING" }).success
    ).toBe(false);
    expect(
      LogAttendanceSchema.safeParse({
        ...staffInput,
        checkInTime: "2026-10-20T12:30:00.000Z",
        checkOutTime: "2026-10-20T03:30:00.000Z",
      }).success
    ).toBe(false);
  });
});

describe("Attendance regularization review (POL-11, separation of duties)", () => {
  const regularization = {
    id: "reg-1",
    employeeId: otherEmployee.id,
    attendanceRecordId: "att-9",
    requestedCheckIn: new Date("2026-10-20T03:30:00.000Z"),
    requestedCheckOut: null,
    reason: "Forgot to punch in",
    status: "PENDING",
    attendanceRecord: attendanceRow({ id: "att-9", status: "ABSENT" }),
    employee: { userId: otherEmployee.userId },
  };

  it("rejecting a correction leaves the attendance record unchanged (no invented ABSENT)", async () => {
    mockDb.attendanceRegularization.findUnique.mockResolvedValue(regularization);
    mockDb.attendanceRegularization.updateMany.mockResolvedValue({ count: 1 });

    await attendanceService.reviewRegularization(hrUser, {
      regularizationId: "reg-1",
      status: "REJECTED",
      reviewNotes: null,
    });

    expect(mockDb.attendanceRecord.update).not.toHaveBeenCalled();
    expect(mockDb.attendanceRecord.updateMany).not.toHaveBeenCalled();
    expect(mockDb.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "ATTENDANCE_REGULARIZATION_REJECTED" }),
      })
    );
  });

  it("reviewers cannot review their own correction request and need canAttendance", async () => {
    mockDb.attendanceRegularization.findUnique.mockResolvedValue({
      ...regularization,
      employee: { userId: hrUser.id },
    });
    await expect(
      attendanceService.reviewRegularization(hrUser, { regularizationId: "reg-1", status: "APPROVED" })
    ).rejects.toBeInstanceOf(ForbiddenError);

    await expect(
      attendanceService.reviewRegularization(internUser, { regularizationId: "reg-1", status: "APPROVED" })
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(mockDb.attendanceRegularization.updateMany).not.toHaveBeenCalled();
  });

  it("a request already reviewed concurrently is rejected by the conditional update", async () => {
    mockDb.attendanceRegularization.findUnique.mockResolvedValue(regularization);
    mockDb.attendanceRegularization.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      attendanceService.reviewRegularization(hrUser, { regularizationId: "reg-1", status: "APPROVED" })
    ).rejects.toBeInstanceOf(ConflictError);
    expect(mockDb.attendanceRecord.update).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Leave authorization, approval integrity and attendance sync
// (SEC-10, SEC-13, SEC-05, BUG-10, POL-02)
// ---------------------------------------------------------------------------

const activeLeaveType = {
  id: "lt-1",
  code: "CUSTOM",
  name: "Custom Leave",
  description: null,
  isPaid: true,
  requiresApproval: true,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function leaveRequestRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "lr-1",
    employeeId: otherEmployee.id,
    leaveTypeId: activeLeaveType.id,
    startDate: new Date("2026-11-02T00:00:00.000Z"),
    endDate: new Date("2026-11-04T00:00:00.000Z"),
    reason: "Private medical appointment details",
    status: "PENDING",
    reviewNotes: null,
    reviewedById: null,
    reviewedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    employee: { id: otherEmployee.id, userId: otherEmployee.userId },
    leaveType: { code: activeLeaveType.code, name: activeLeaveType.name },
    ...overrides,
  };
}

describe("Leave catalogue seeding (SEC-10, OD-007)", () => {
  it("only ADMIN can load the suggested catalogue; reads never seed", async () => {
    await expect(leaveService.ensureDefaultLeaveTypes(hrUser)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(leaveService.ensureDefaultLeaveTypes(candidateUser)).rejects.toBeInstanceOf(
      ForbiddenError
    );

    mockDb.leaveType.findMany.mockResolvedValue([]);
    await leaveService.getLeaveTypes(true);
    expect(mockDb.leaveType.count).not.toHaveBeenCalled();
    expect(mockDb.leaveType.createMany).not.toHaveBeenCalled();
    expect(mockDb.leaveType.upsert).not.toHaveBeenCalled();

    mockDb.leaveType.count.mockResolvedValue(0);
    mockDb.leaveType.createMany.mockResolvedValue({ count: 6 });
    const result = await leaveService.ensureDefaultLeaveTypes(adminUser);
    expect(result.created).toBe(6);
    expect(mockDb.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "SEED_SUGGESTED_LEAVE_TYPES" }),
      })
    );
  });

  it("leave-type changes require ADMIN, or HR with canLeave", async () => {
    await expect(
      leaveService.toggleLeaveType(managerUser, activeLeaveType.id, false)
    ).rejects.toBeInstanceOf(ForbiddenError);
    mockDb.subAdminPermission.findUnique.mockResolvedValueOnce(
      permissionRow(hrUser.id, true, { canLeave: false })
    );
    await expect(
      leaveService.toggleLeaveType(hrUser, activeLeaveType.id, false)
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(mockDb.leaveType.update).not.toHaveBeenCalled();
  });
});

describe("Leave review authorization (SEC-13, SEC-05)", () => {
  it("a reviewer cannot approve their own leave request, even as ADMIN", async () => {
    mockDb.leaveRequest.findUnique.mockResolvedValue(
      leaveRequestRow({ employee: { id: "emp-admin", userId: adminUser.id } })
    );
    await expect(
      leaveService.reviewLeaveRequest(adminUser, { requestId: "lr-1", status: "APPROVED" })
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(mockDb.leaveRequest.updateMany).not.toHaveBeenCalled();
  });

  it("requires canLeave: HR with the permission revoked and interns are refused", async () => {
    mockDb.subAdminPermission.findUnique.mockResolvedValueOnce(
      permissionRow(hrUser.id, true, { canLeave: false })
    );
    await expect(
      leaveService.reviewLeaveRequest(hrUser, { requestId: "lr-1", status: "APPROVED" })
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      leaveService.reviewLeaveRequest(internUser, { requestId: "lr-1", status: "REJECTED" })
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(leaveService.getAllLeaveRequests(internUser)).rejects.toBeInstanceOf(ForbiddenError);
    expect(mockDb.leaveRequest.findUnique).not.toHaveBeenCalled();
    expect(mockDb.leaveRequest.findMany).not.toHaveBeenCalled();
  });

  it("rejects a request that is no longer PENDING and loses the conditional update race", async () => {
    mockDb.leaveRequest.findUnique.mockResolvedValueOnce(leaveRequestRow({ status: "APPROVED" }));
    await expect(
      leaveService.reviewLeaveRequest(hrUser, { requestId: "lr-1", status: "REJECTED" })
    ).rejects.toBeInstanceOf(ConflictError);

    mockDb.leaveRequest.findUnique.mockResolvedValueOnce(leaveRequestRow());
    mockDb.leaveRequest.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(
      leaveService.reviewLeaveRequest(hrUser, { requestId: "lr-1", status: "APPROVED" })
    ).rejects.toBeInstanceOf(ConflictError);
    expect(mockDb.attendanceRecord.createMany).not.toHaveBeenCalled();
  });
});

describe("Leave approval → attendance sync (BUG-10)", () => {
  it("marks only unrecorded or ABSENT days as ON_LEAVE, skips PRESENT days and never copies the reason", async () => {
    mockDb.leaveRequest.findUnique.mockResolvedValue(leaveRequestRow());
    mockDb.leaveRequest.updateMany.mockResolvedValue({ count: 1 });
    mockDb.attendanceRecord.findMany.mockResolvedValue([
      {
        id: "att-present",
        date: new Date("2026-11-03T00:00:00.000Z"),
        status: "PRESENT",
        checkInTime: new Date("2026-11-03T03:30:00.000Z"),
      },
      {
        id: "att-absent",
        date: new Date("2026-11-04T00:00:00.000Z"),
        status: "ABSENT",
        checkInTime: null,
      },
    ]);
    mockDb.attendanceRecord.createMany.mockResolvedValue({ count: 1 });
    mockDb.attendanceRecord.updateMany.mockResolvedValue({ count: 1 });

    const result = await leaveService.reviewLeaveRequest(hrUser, {
      requestId: "lr-1",
      status: "APPROVED",
    });

    expect(result).toEqual({
      status: "APPROVED",
      attendanceDaysMarked: 2,
      skippedDates: ["2026-11-03"],
    });

    // Conditional PENDING → APPROVED transition inside the transaction.
    expect(mockDb.leaveRequest.updateMany.mock.calls[0][0].where).toEqual({
      id: "lr-1",
      status: "PENDING",
    });

    const created = mockDb.attendanceRecord.createMany.mock.calls[0][0];
    expect(created.skipDuplicates).toBe(true);
    expect(created.data).toHaveLength(1);
    expect((created.data[0].date as Date).toISOString()).toBe("2026-11-02T00:00:00.000Z");

    const updated = mockDb.attendanceRecord.updateMany.mock.calls[0][0];
    expect(updated.where.id).toEqual({ in: ["att-absent"] });
    expect(mockDb.attendanceRecord.upsert).not.toHaveBeenCalled();
    expect(mockDb.attendanceRecord.update).not.toHaveBeenCalled();

    const notes = [created.data[0].notes, updated.data.notes].join(" ");
    expect(notes).not.toContain("medical");
    expect(mockDb.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: "APPROVE_LEAVE" }) })
    );
  });

  it("refuses to approve legacy requests with an unbounded date range", async () => {
    mockDb.leaveRequest.findUnique.mockResolvedValue(
      leaveRequestRow({
        startDate: new Date("0001-01-01T00:00:00.000Z"),
        endDate: new Date("9999-12-31T00:00:00.000Z"),
      })
    );
    await expect(
      leaveService.reviewLeaveRequest(hrUser, { requestId: "lr-1", status: "APPROVED" })
    ).rejects.toBeInstanceOf(ValidationError);
    expect(mockDb.$transaction).not.toHaveBeenCalled();
  });
});

describe("Leave request validation (BUG-10)", () => {
  const baseInput = {
    employeeId: otherEmployee.id,
    leaveTypeId: activeLeaveType.id,
    startDate: "2026-11-02T00:00:00.000Z",
    endDate: "2026-11-04T00:00:00.000Z",
    reason: "Family function out of town",
  };
  const otherUser: AuthenticatedUser = {
    id: otherEmployee.userId,
    email: "other@example.test",
    name: "Other Employee",
    roles: [Role.EMPLOYEE],
  };

  it("rejects inverted and over-long ranges at the schema and service boundary", async () => {
    expect(
      CreateLeaveRequestSchema.safeParse({ ...baseInput, startDate: "2026-11-04", endDate: "2026-11-02" })
        .success
    ).toBe(false);
    expect(
      CreateLeaveRequestSchema.safeParse({
        ...baseInput,
        startDate: "0001-01-01T00:00:00.000Z",
        endDate: "9999-12-31T00:00:00.000Z",
      }).success
    ).toBe(false);

    mockDb.employee.findUnique.mockResolvedValue({ id: otherEmployee.id, userId: otherUser.id, status: "ACTIVE" });
    mockDb.leaveType.findUnique.mockResolvedValue(activeLeaveType);
    await expect(
      leaveService.submitLeaveRequest(otherUser, {
        ...baseInput,
        startDate: "2026-01-01T00:00:00.000Z",
        endDate: "2027-06-30T00:00:00.000Z",
      })
    ).rejects.toBeInstanceOf(ValidationError);
    expect(mockDb.leaveRequest.create).not.toHaveBeenCalled();
  });

  it("requires an active leave type", async () => {
    mockDb.employee.findUnique.mockResolvedValue({ id: otherEmployee.id, userId: otherUser.id, status: "ACTIVE" });
    mockDb.leaveType.findUnique.mockResolvedValue({ ...activeLeaveType, isActive: false });
    await expect(leaveService.submitLeaveRequest(otherUser, baseInput)).rejects.toBeInstanceOf(
      ValidationError
    );
  });

  it("rejects requests overlapping the employee's pending or approved leave", async () => {
    mockDb.employee.findUnique.mockResolvedValue({ id: otherEmployee.id, userId: otherUser.id, status: "ACTIVE" });
    mockDb.leaveType.findUnique.mockResolvedValue(activeLeaveType);
    mockDb.leaveRequest.findFirst.mockResolvedValue({ id: "lr-existing", status: "APPROVED" });

    await expect(leaveService.submitLeaveRequest(otherUser, baseInput)).rejects.toBeInstanceOf(
      ConflictError
    );
    const where = mockDb.leaveRequest.findFirst.mock.calls[0][0].where;
    expect(where.status).toEqual({ in: ["PENDING", "APPROVED"] });
    expect(mockDb.leaveRequest.create).not.toHaveBeenCalled();
  });

  it("employees cannot submit leave for someone else without canLeave", async () => {
    mockDb.employee.findUnique.mockResolvedValue({ id: otherEmployee.id, userId: otherUser.id, status: "ACTIVE" });
    await expect(leaveService.submitLeaveRequest(internUser, baseInput)).rejects.toBeInstanceOf(
      ForbiddenError
    );
    expect(mockDb.leaveRequest.create).not.toHaveBeenCalled();
  });

  it("the self view never loads other employees' requests", async () => {
    mockDb.employee.findUnique.mockResolvedValue({
      id: internEmployee.id,
      employeeCode: internEmployee.employeeCode,
      department: internEmployee.department,
      designation: internEmployee.designation,
      status: "ACTIVE",
      user: internEmployee.user,
    });
    mockDb.leaveRequest.findMany.mockResolvedValue([]);
    mockDb.leaveType.findMany.mockResolvedValue([]);

    const pageData = await loadLeavePageData(internUser, { allowSelfView: true });
    expect(pageData.view).toBe("self");
    expect(mockDb.leaveRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { employeeId: internEmployee.id } })
    );
    expect(mockDb.leaveRequest.count).not.toHaveBeenCalled();
  });
});

describe("Prompt 8C: Payroll Module Policy Gates & Validations (OD-008 / D-12)", () => {
  it("strictly throws PolicyBlockedError when attempting gross/net salary calculation", () => {
    expect(() => payrollService.calculateGrossNetSalary()).toThrow(PolicyBlockedError);
    try {
      payrollService.calculateGrossNetSalary();
    } catch (err: unknown) {
      expect(err).toBeInstanceOf(PolicyBlockedError);
      expect((err as PolicyBlockedError).decisionRef).toBe("OD-008");
    }
  });

  it("strictly throws PolicyBlockedError when attempting statutory tax calculation", () => {
    expect(() => payrollService.calculateStatutoryTaxes()).toThrow(PolicyBlockedError);
    try {
      payrollService.calculateStatutoryTaxes();
    } catch (err: unknown) {
      expect(err).toBeInstanceOf(PolicyBlockedError);
      expect((err as PolicyBlockedError).decisionRef).toBe("OD-008");
    }
  });

  it("validates safe payroll period creation schema", () => {
    const valid = CreatePayrollPeriodSchema.safeParse({
      code: "2026-04",
      startDate: "2026-04-01T00:00:00.000Z",
      endDate: "2026-04-30T00:00:00.000Z",
      notes: "April 2026 monthly payroll cycle",
    });

    expect(valid.success).toBe(true);
  });

  it("validates safe disbursement tracking schema", () => {
    const valid = RecordDisbursementSchema.safeParse({
      payrollRecordId: crypto.randomUUID(),
      disbursementReference: "HDFC-NEFT-20260430001",
      notes: "Salary transferred via corporate net banking",
    });

    expect(valid.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Payroll authorization, integrity and data-safety (SEC-06, SEC-16, BUG-08, POL-03, POL-04)
// ---------------------------------------------------------------------------

const PERIOD_ID = "11111111-1111-4111-8111-111111111111";
const RECORD_ID = "22222222-2222-4222-8222-222222222222";
const EMPLOYEE_ID = "33333333-3333-4333-8333-333333333333";
const FULL_ACCOUNT = "000011112222";
const FULL_PAN = "QWERT9876Z";

const paidProfileNotes = `Confidential HR note.\n\nPAYROLL_PROFILE:${JSON.stringify({
  isPaid: true,
  employmentType: "INTERN",
  stipendAmount: 12000,
  bankName: "Test Bank } Branch",
  accountNumber: FULL_ACCOUNT,
  ifscCode: "TEST0000001",
  accountHolderName: "Test Holder",
  panNumber: FULL_PAN,
})}`;

function employeeRow(internalNotes: string | null) {
  return {
    id: EMPLOYEE_ID,
    employeeCode: "EMP-0001",
    department: "Engineering",
    designation: "Intern",
    joiningDate: new Date("2026-01-01T00:00:00.000Z"),
    internalNotes,
    user: { name: "Test Employee", email: "employee@example.test" },
  };
}

function primeDashboard(internalNotes: string | null, disbursedAmount: number | null = null) {
  mockDb.payrollPeriod.findMany.mockResolvedValue([
    {
      id: PERIOD_ID,
      code: "2026-04",
      startDate: new Date("2026-04-01T00:00:00.000Z"),
      endDate: new Date("2026-04-30T00:00:00.000Z"),
      status: "FINALIZED",
      notes: null,
      records: [{ id: RECORD_ID, status: "PAID" }],
    },
  ]);
  mockDb.employee.findMany.mockResolvedValue([employeeRow(internalNotes)]);
  mockDb.payrollRecord.findMany.mockResolvedValue([
    {
      id: RECORD_ID,
      payrollPeriodId: PERIOD_ID,
      employeeId: EMPLOYEE_ID,
      status: "PAID",
      disbursementReference: "BANK-REF-1",
      disbursedAt: new Date("2026-04-30T00:00:00.000Z"),
      disbursedAmount: disbursedAmount === null ? null : { toNumber: () => disbursedAmount },
      notes: null,
      finalizedAt: null,
      createdAt: new Date("2026-04-01T00:00:00.000Z"),
      finalizedBy: null,
      employee: employeeRow(internalNotes),
    },
  ]);
}

describe("Payroll authorization (canPayroll required, ADMIN passes)", () => {
  it("forbids HR without canPayroll from reading the payroll dashboard", async () => {
    await expect(payrollService.getPayrollDashboardData(hrUser)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(mockDb.payrollPeriod.findMany).not.toHaveBeenCalled();
    expect(mockDb.employee.findMany).not.toHaveBeenCalled();
  });

  it("forbids HR without canPayroll from editing payout profiles or recording disbursements", async () => {
    await expect(
      payrollService.updateEmployeePayoutProfile(hrUser, {
        employeeId: EMPLOYEE_ID,
        isPaid: true,
        accountNumber: "999988887777",
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      payrollService.recordDisbursement(hrUser, {
        payrollRecordId: RECORD_ID,
        disbursementReference: "BANK-REF-1",
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      payrollService.bulkDisburseRecords(hrUser, {
        periodId: PERIOD_ID,
        disbursementReference: "BANK-BATCH-1",
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mockDb.employee.update).not.toHaveBeenCalled();
    expect(mockDb.payrollRecord.updateMany).not.toHaveBeenCalled();
    expect(await payrollService.canManagePayroll(hrUser)).toBe(false);
  });

  it("forbids MANAGER, INTERN and CANDIDATE even when a canPayroll flag is present", async () => {
    mockDb.subAdminPermission.findUnique.mockResolvedValue(permissionRow(managerUser.id, true));
    for (const user of [managerUser, internUser, candidateUser]) {
      await expect(payrollService.getPayrollDashboardData(user)).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
      expect(await payrollService.canManagePayroll(user)).toBe(false);
    }
  });

  it("allows HR holding canPayroll and ADMIN", async () => {
    primeDashboard(null);
    mockDb.subAdminPermission.findUnique.mockResolvedValue(permissionRow(hrUser.id, true));
    await expect(payrollService.getPayrollDashboardData(hrUser)).resolves.toBeDefined();
    expect(await payrollService.canManagePayroll(hrUser)).toBe(true);
    await expect(payrollService.getPayrollDashboardData(adminUser)).resolves.toBeDefined();
    expect(await payrollService.canManagePayroll(adminUser)).toBe(true);
  });
});

describe("Payroll data safety (no fake defaults, server-side masking, no side effects on read)", () => {
  it("never invents bank details, PAN or stipend amounts when payout data is missing", async () => {
    primeDashboard(null);
    const data = await payrollService.getPayrollDashboardData(adminUser);

    const record = data.records[0];
    expect(record.isPaid).toBeNull();
    expect(record.stipendAmount).toBeNull();
    expect(record.bankName).toBeNull();
    expect(record.accountNumberMasked).toBeNull();
    expect(record.ifscCode).toBeNull();
    expect(record.panMasked).toBeNull();
    expect(record.employmentType).toBeNull();
    expect(data.stats.totalDisbursedAmount).toBe(0);
    expect(data.stats.paidRecordsWithoutAmount).toBe(1);
    expect(data.stats.totalUnconfiguredWorkforce).toBe(1);

    const serialized = JSON.stringify(data);
    for (const fake of ["50100482910482", "HDFC0000123", "ABCDE1234F", "HDFC Bank", "25000", "45000", "35000"]) {
      expect(serialized).not.toContain(fake);
    }
  });

  it("masks account numbers and PANs to the last four characters before data leaves the server", async () => {
    primeDashboard(paidProfileNotes, 12000);
    const data = await payrollService.getPayrollDashboardData(adminUser);

    expect(data.records[0].accountNumberMasked).toBe("•••• 2222");
    expect(data.records[0].panMasked).toBe("•••• 876Z");
    expect(data.employees[0].accountNumberMasked).toBe("•••• 2222");
    expect(data.records[0].bankName).toBe("Test Bank } Branch");
    expect(data.stats.totalDisbursedAmount).toBe(12000);

    const serialized = JSON.stringify(data);
    expect(serialized).not.toContain(FULL_ACCOUNT);
    expect(serialized).not.toContain(FULL_PAN);
    expect(serialized).not.toContain("Confidential HR note");
  });

  it("reports PAID amounts from the disbursement snapshot, not the current payout profile", async () => {
    // Profile now says 12000, but 9000 was recorded when the payment was made.
    primeDashboard(paidProfileNotes, 9000);
    const snapshot = await payrollService.getPayrollDashboardData(adminUser);
    expect(snapshot.records[0].stipendAmount).toBe(9000);
    expect(snapshot.stats.totalDisbursedAmount).toBe(9000);

    // Legacy PAID rows without a snapshot are counted, never back-filled from the profile.
    primeDashboard(paidProfileNotes, null);
    const legacy = await payrollService.getPayrollDashboardData(adminUser);
    expect(legacy.stats.totalDisbursedAmount).toBe(0);
    expect(legacy.stats.paidRecordsWithoutAmount).toBe(1);
  });

  it("does not create payroll periods or enroll employees when the dashboard is loaded", async () => {
    mockDb.payrollPeriod.findMany.mockResolvedValue([]);
    mockDb.employee.findMany.mockResolvedValue([employeeRow(paidProfileNotes)]);
    const data = await payrollService.getPayrollDashboardData(adminUser);

    expect(data.activePeriod).toBeNull();
    expect(mockDb.payrollPeriod.create).not.toHaveBeenCalled();
    expect(mockDb.payrollRecord.create).not.toHaveBeenCalled();
    expect(mockDb.payrollRecord.createMany).not.toHaveBeenCalled();
  });

  it("parses payout blocks whose values contain braces and preserves surrounding notes", () => {
    const parsed = parsePayoutProfile(paidProfileNotes);
    expect(parsed?.bankName).toBe("Test Bank } Branch");
    expect(parsed?.accountNumber).toBe(FULL_ACCOUNT);

    const rewritten = serializePayoutProfile(paidProfileNotes, { ...parsed, bankName: "New } Bank" });
    expect(rewritten.startsWith("Confidential HR note.")).toBe(true);
    expect(rewritten.match(/PAYROLL_PROFILE:/g)).toHaveLength(1);
    expect(parsePayoutProfile(rewritten)?.bankName).toBe("New } Bank");
    expect(parsePayoutProfile("PAYROLL_PROFILE:{broken")).toBeNull();
    expect(parsePayoutProfile("no profile here")).toBeNull();
  });

  it("shows the self-service view only the signed-in employee's own records, masked", async () => {
    mockDb.employee.findUnique.mockResolvedValue({ ...employeeRow(paidProfileNotes), user: { name: "Test Intern" } });
    mockDb.payrollRecord.findMany.mockResolvedValue([]);

    const overview = await payrollService.getMyPayrollOverview(internUser);

    expect(mockDb.employee.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: internUser.id } })
    );
    expect(mockDb.payrollRecord.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { employeeId: EMPLOYEE_ID } })
    );
    expect(overview.payout?.accountNumberMasked).toBe("•••• 2222");
    expect(JSON.stringify(overview)).not.toContain(FULL_ACCOUNT);
  });
});

describe("Payroll period status machine (BUG-08)", () => {
  it("defines PAID and VOID as terminal and never allows a manual move to PAID", () => {
    expect(PAYROLL_PERIOD_TRANSITIONS.PAID).toEqual([]);
    expect(PAYROLL_PERIOD_TRANSITIONS.VOID).toEqual([]);
    expect(PAYROLL_PERIOD_TRANSITIONS.DRAFT).not.toContain("PAID");
    expect(
      UpdatePayrollPeriodStatusSchema.safeParse({ periodId: PERIOD_ID, status: "PAID" }).success
    ).toBe(false);
  });

  it.each([
    ["PAID", "DRAFT"],
    ["PAID", "VOID"],
    ["VOID", "FINALIZED"],
    ["VOID", "DRAFT"],
  ] as const)("rejects %s -> %s", async (from, to) => {
    mockDb.payrollPeriod.findUnique.mockResolvedValue({ id: PERIOD_ID, code: "2026-04", status: from, notes: null });
    await expect(
      payrollService.updatePayrollPeriodStatus(adminUser, { periodId: PERIOD_ID, status: to })
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(mockDb.payrollPeriod.updateMany).not.toHaveBeenCalled();
    expect(mockDb.payrollRecord.updateMany).not.toHaveBeenCalled();
  });

  it("finalizes a DRAFT period with a conditional update and writes an audit log", async () => {
    mockDb.payrollPeriod.findUnique.mockResolvedValue({ id: PERIOD_ID, code: "2026-04", status: "DRAFT", notes: null });
    mockDb.payrollPeriod.updateMany.mockResolvedValue({ count: 1 });
    mockDb.payrollRecord.updateMany.mockResolvedValue({ count: 3 });

    const result = await payrollService.updatePayrollPeriodStatus(adminUser, {
      periodId: PERIOD_ID,
      status: "FINALIZED",
    });

    expect(result.affectedRecords).toBe(3);
    expect(mockDb.payrollPeriod.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: PERIOD_ID, status: "DRAFT" } })
    );
    expect(mockDb.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "PAYROLL_PERIOD_STATUS_CHANGED", actorId: adminUser.id }),
      })
    );
  });

  it("rejects the transition when another request changed the period concurrently", async () => {
    mockDb.payrollPeriod.findUnique.mockResolvedValue({ id: PERIOD_ID, code: "2026-04", status: "DRAFT", notes: null });
    mockDb.payrollPeriod.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      payrollService.updatePayrollPeriodStatus(adminUser, { periodId: PERIOD_ID, status: "FINALIZED" })
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("refuses to reopen or void a period that already has recorded disbursements", async () => {
    mockDb.payrollPeriod.findUnique.mockResolvedValue({ id: PERIOD_ID, code: "2026-04", status: "FINALIZED", notes: null });
    mockDb.payrollPeriod.updateMany.mockResolvedValue({ count: 1 });
    mockDb.payrollRecord.count.mockResolvedValue(1);
    await expect(
      payrollService.updatePayrollPeriodStatus(adminUser, { periodId: PERIOD_ID, status: "VOID" })
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(mockDb.payrollRecord.updateMany).not.toHaveBeenCalled();
  });
});

describe("Payroll disbursement integrity (SEC-16, POL-04)", () => {
  it("requires a staff-entered reference for bulk disbursement", () => {
    expect(BulkDisbursementSchema.safeParse({ periodId: PERIOD_ID }).success).toBe(false);
    expect(
      BulkDisbursementSchema.safeParse({ periodId: PERIOD_ID, disbursementReference: "  " }).success
    ).toBe(false);
    expect(
      BulkDisbursementSchema.safeParse({ periodId: PERIOD_ID, disbursementReference: "=HYPERLINK()" })
        .success
    ).toBe(false);
  });

  it("rejects bulk disbursement for a non-existent period", async () => {
    mockDb.payrollPeriod.findUnique.mockResolvedValue(null);
    await expect(
      payrollService.bulkDisburseRecords(adminUser, { periodId: PERIOD_ID, disbursementReference: "BANK-BATCH-1" })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(mockDb.payrollRecord.updateMany).not.toHaveBeenCalled();
  });

  it("rejects bulk disbursement unless the period is FINALIZED (DRAFT records are never paid)", async () => {
    mockDb.payrollPeriod.findUnique.mockResolvedValue({ id: PERIOD_ID, code: "2026-04" });
    mockDb.payrollPeriod.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      payrollService.bulkDisburseRecords(adminUser, { periodId: PERIOD_ID, disbursementReference: "BANK-BATCH-1" })
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(mockDb.payrollRecord.findMany).not.toHaveBeenCalled();
    expect(mockDb.payrollRecord.updateMany).not.toHaveBeenCalled();
  });

  it("pays only FINALIZED records of paid employees with the entered reference, atomically", async () => {
    mockDb.payrollPeriod.findUnique.mockResolvedValue({ id: PERIOD_ID, code: "2026-04" });
    mockDb.payrollPeriod.updateMany.mockResolvedValue({ count: 1 });
    mockDb.payrollRecord.findMany.mockResolvedValue([
      { id: RECORD_ID, employee: { internalNotes: paidProfileNotes } },
      { id: "44444444-4444-4444-8444-444444444444", employee: { internalNotes: null } },
    ]);
    mockDb.payrollRecord.updateMany.mockResolvedValue({ count: 1 });
    mockDb.payrollRecord.count.mockResolvedValue(1);

    const result = await payrollService.bulkDisburseRecords(adminUser, {
      periodId: PERIOD_ID,
      disbursementReference: "BANK-BATCH-1",
    });

    expect(result).toEqual({ updatedCount: 1, skippedNotPaidCount: 1, periodPaid: false });
    expect(mockDb.payrollRecord.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { payrollPeriodId: PERIOD_ID, status: "FINALIZED" } })
    );
    // One conditional update per eligible record, each snapshotting that record's amount
    expect(mockDb.payrollRecord.updateMany).toHaveBeenCalledTimes(1);
    const updateArgs = mockDb.payrollRecord.updateMany.mock.calls[0][0];
    expect(updateArgs.where).toEqual({ id: RECORD_ID, status: "FINALIZED" });
    expect(updateArgs.data.disbursementReference).toBe("BANK-BATCH-1");
    expect(updateArgs.data).toHaveProperty("disbursedAmount");
    expect(mockDb.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "PAYROLL_BULK_DISBURSEMENT_RECORDED" }),
      })
    );
  });

  it("rolls back the whole batch when a record was disbursed concurrently (no double payment)", async () => {
    mockDb.payrollPeriod.findUnique.mockResolvedValue({ id: PERIOD_ID, code: "2026-04" });
    mockDb.payrollPeriod.updateMany.mockResolvedValue({ count: 1 });
    mockDb.payrollRecord.findMany.mockResolvedValue([
      { id: RECORD_ID, employee: { internalNotes: paidProfileNotes } },
    ]);
    mockDb.payrollRecord.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      payrollService.bulkDisburseRecords(adminUser, { periodId: PERIOD_ID, disbursementReference: "BANK-BATCH-1" })
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(mockDb.auditLog.create).not.toHaveBeenCalled();
  });

  it("rejects single disbursement of a DRAFT record and duplicate disbursement of a PAID record", async () => {
    mockDb.payrollRecord.findUnique.mockResolvedValue({
      id: RECORD_ID,
      payrollPeriodId: PERIOD_ID,
      employeeId: EMPLOYEE_ID,
      status: "DRAFT",
      notes: null,
      payrollPeriod: { id: PERIOD_ID, code: "2026-04" },
      employee: { internalNotes: paidProfileNotes },
    });
    await expect(
      payrollService.recordDisbursement(adminUser, { payrollRecordId: RECORD_ID, disbursementReference: "BANK-REF-1" })
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });

    mockDb.payrollRecord.findUnique.mockResolvedValue({
      id: RECORD_ID,
      payrollPeriodId: PERIOD_ID,
      employeeId: EMPLOYEE_ID,
      status: "PAID",
      notes: null,
      payrollPeriod: { id: PERIOD_ID, code: "2026-04" },
      employee: { internalNotes: paidProfileNotes },
    });
    await expect(
      payrollService.recordDisbursement(adminUser, { payrollRecordId: RECORD_ID, disbursementReference: "BANK-REF-1" })
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(mockDb.payrollRecord.updateMany).not.toHaveBeenCalled();
  });

  it("enrolls only employees explicitly configured as paid, into DRAFT periods only", async () => {
    mockDb.payrollPeriod.findUnique.mockResolvedValue({ id: PERIOD_ID, code: "2026-04", records: [] });
    mockDb.payrollPeriod.updateMany.mockResolvedValue({ count: 1 });
    mockDb.employee.findMany.mockResolvedValue([
      { id: EMPLOYEE_ID, internalNotes: paidProfileNotes },
      { id: "55555555-5555-4555-8555-555555555555", internalNotes: null },
    ]);
    mockDb.payrollRecord.createMany.mockResolvedValue({ count: 1 });

    const result = await payrollService.generatePayrollRecordsForPeriod(adminUser, PERIOD_ID);

    expect(result).toEqual({ enrolledCount: 1, skippedUnconfiguredCount: 1 });
    expect(mockDb.payrollRecord.createMany.mock.calls[0][0].data).toEqual([
      { payrollPeriodId: PERIOD_ID, employeeId: EMPLOYEE_ID, status: "DRAFT" },
    ]);

    mockDb.payrollPeriod.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      payrollService.generatePayrollRecordsForPeriod(adminUser, PERIOD_ID)
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });
});

describe("Payroll payout profile updates", () => {
  it("marking an employee unpaid never deletes payroll records and is audited without full identifiers", async () => {
    mockDb.employee.findUnique.mockResolvedValue({ id: EMPLOYEE_ID, internalNotes: paidProfileNotes });
    mockDb.employee.update.mockResolvedValue({});
    mockDb.payrollRecord.count.mockResolvedValue(2);

    const result = await payrollService.updateEmployeePayoutProfile(adminUser, {
      employeeId: EMPLOYEE_ID,
      isPaid: false,
    });

    expect(result.openRecordCount).toBe(2);
    expect(mockDb.payrollRecord.deleteMany).not.toHaveBeenCalled();
    expect(mockDb.payrollRecord.create).not.toHaveBeenCalled();
    const savedNotes: string = mockDb.employee.update.mock.calls[0][0].data.internalNotes;
    expect(parsePayoutProfile(savedNotes)?.isPaid).toBe(false);
    expect(parsePayoutProfile(savedNotes)?.accountNumber).toBe(FULL_ACCOUNT);

    const audit = JSON.stringify(mockDb.auditLog.create.mock.calls[0][0]);
    expect(audit).toContain("PAYROLL_PAYOUT_PROFILE_UPDATED");
    expect(audit).not.toContain(FULL_ACCOUNT);
    expect(audit).not.toContain(FULL_PAN);
  });

  it("validates payout profile input (explicit paid flag, identifier format)", () => {
    expect(UpdateEmployeePayoutProfileSchema.safeParse({ employeeId: EMPLOYEE_ID }).success).toBe(false);
    expect(
      UpdateEmployeePayoutProfileSchema.safeParse({
        employeeId: EMPLOYEE_ID,
        isPaid: true,
        accountNumber: "12<script>",
      }).success
    ).toBe(false);
    const ok = UpdateEmployeePayoutProfileSchema.safeParse({
      employeeId: EMPLOYEE_ID,
      isPaid: true,
      accountNumber: "0000 1111 2222",
      panNumber: "",
    });
    expect(ok.success && ok.data.accountNumber).toBe(FULL_ACCOUNT);
    expect(ok.success && ok.data.panNumber).toBeNull();
  });
});
