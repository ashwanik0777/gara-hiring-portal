import { prisma } from "@/lib/db";
import { assertPermission, hasPermission, type AuthenticatedUser } from "@/lib/auth/guards";
import {
  AttendanceStatus,
  AttendanceEntryMethod,
  EmployeeStatus,
  RegularizationStatus,
  type Prisma,
} from "@prisma/client";
import {
  LogAttendanceInput,
  RequestRegularizationInput,
  ReviewRegularizationInput,
  ATTENDANCE_DEFAULT_PAGE_SIZE,
  ATTENDANCE_MAX_PAGE_SIZE,
} from "../schemas";
import type {
  AttendanceEmployeeOption,
  AttendanceHistoryPage,
  AttendanceListFilters,
  AttendanceRecordItem,
  AttendanceRecordView,
  AttendanceTodayCounts,
  AttendanceWindow,
  PageInfo,
} from "../types";
import {
  PolicyBlockedError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "@/lib/errors";
import {
  currentBusinessMonthKey,
  toUtcDateOnly,
  utcDateKey,
  utcMonthWindow,
} from "./attendance-dates";

/** Employee picker: first page size and hard cap. */
const EMPLOYEE_OPTION_LIMIT = 50;

const employeeSummarySelect = {
  id: true,
  userId: true,
  employeeCode: true,
  department: true,
  designation: true,
  status: true,
  user: { select: { name: true, email: true } },
} satisfies Prisma.EmployeeSelect;

type EmployeeSummary = Prisma.EmployeeGetPayload<{ select: typeof employeeSummarySelect }>;

type AttendanceRow = {
  id: string;
  employeeId: string;
  date: Date;
  checkInTime: Date | null;
  checkOutTime: Date | null;
  status: AttendanceStatus;
  entryMethod: AttendanceEntryMethod;
  notes: string | null;
};

/** Row columns the attendance tables render, with the employee summary for team views. */
const attendanceRecordSelect = {
  id: true,
  employeeId: true,
  date: true,
  checkInTime: true,
  checkOutTime: true,
  status: true,
  entryMethod: true,
  notes: true,
  employee: {
    select: {
      id: true,
      employeeCode: true,
      department: true,
      designation: true,
      user: { select: { name: true } },
    },
  },
} satisfies Prisma.AttendanceRecordSelect;

const ownRecordSelect = {
  id: true,
  employeeId: true,
  date: true,
  checkInTime: true,
  checkOutTime: true,
  status: true,
  entryMethod: true,
  notes: true,
} satisfies Prisma.AttendanceRecordSelect;

type ListQuery = Partial<AttendanceListFilters> & { page?: number; pageSize?: number };

/** Clamps page / page size and returns the matching Prisma `skip` / `take`. */
function pageArgs(page?: number, pageSize?: number) {
  const size = Math.min(
    Math.max(1, Math.trunc(pageSize ?? ATTENDANCE_DEFAULT_PAGE_SIZE)),
    ATTENDANCE_MAX_PAGE_SIZE
  );
  const current = Math.max(1, Math.trunc(page ?? 1));
  return { skip: (current - 1) * size, take: size, page: current, pageSize: size };
}

function toPageInfo(page: number, pageSize: number, total: number): PageInfo {
  return { page, pageSize, total, pageCount: Math.max(1, Math.ceil(total / pageSize)) };
}

/** Resolves the month being browsed (default: current month, business time zone). */
function resolveWindow(month?: string): AttendanceWindow & { startDate: Date; endDate: Date } {
  const key = month ?? currentBusinessMonthKey();
  const { start, endExclusive } = utcMonthWindow(key);
  return {
    month: key,
    start: start.toISOString(),
    endExclusive: endExclusive.toISOString(),
    startDate: start,
    endDate: endExclusive,
  };
}

type StatusGroup = { status: AttendanceStatus; _count: { _all: number } };

function todayCountsFromGroups(groups: StatusGroup[], dateKey: string): AttendanceTodayCounts {
  const count = (status: AttendanceStatus) =>
    groups.find((g) => g.status === status)?._count._all ?? 0;
  return {
    dateKey,
    present: count(AttendanceStatus.PRESENT) + count(AttendanceStatus.HALF_DAY),
    onLeaveOrAbsent: count(AttendanceStatus.ON_LEAVE) + count(AttendanceStatus.ABSENT),
  };
}

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code: unknown }).code === "P2002"
  );
}

function toEmployeeOption(employee: EmployeeSummary): AttendanceEmployeeOption {
  return {
    id: employee.id,
    employeeCode: employee.employeeCode,
    name: employee.user.name,
    email: employee.user.email,
    department: employee.department,
    designation: employee.designation,
  };
}

function toRecordItem(record: AttendanceRow, employee: EmployeeSummary): AttendanceRecordItem {
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

function toRecordView(
  record: AttendanceRow,
  employee: Pick<EmployeeSummary, "id" | "employeeCode" | "department" | "designation"> & {
    user: { name: string };
  }
): AttendanceRecordView {
  return {
    id: record.id,
    employeeId: employee.id,
    employeeName: employee.user.name,
    employeeCode: employee.employeeCode,
    department: employee.department,
    designation: employee.designation,
    date: record.date.toISOString(),
    checkInTime: record.checkInTime ? record.checkInTime.toISOString() : null,
    checkOutTime: record.checkOutTime ? record.checkOutTime.toISOString() : null,
    status: record.status,
    entryMethod: record.entryMethod,
    notes: record.notes,
  };
}

function statusLabel(status: AttendanceStatus): string {
  return status.replace(/_/g, " ").toLowerCase();
}

export class AttendanceService {
  /** Staff team view and edits of other employees' attendance require `canAttendance`. */
  async canManageAttendance(user: AuthenticatedUser): Promise<boolean> {
    return hasPermission(user, "canAttendance");
  }

  private async findOwnEmployee(user: AuthenticatedUser): Promise<EmployeeSummary | null> {
    return prisma.employee.findUnique({
      where: { userId: user.id },
      select: employeeSummarySelect,
    });
  }

  private async requireOwnActiveEmployee(user: AuthenticatedUser): Promise<EmployeeSummary> {
    const employee = await this.findOwnEmployee(user);
    if (!employee) {
      throw new NotFoundError("No employee record is linked to your account.");
    }
    if (employee.status === EmployeeStatus.EXITED) {
      throw new ForbiddenError("Attendance cannot be recorded for an exited employee record.");
    }
    return employee;
  }

  /**
   * Non-exited employees for the staff entry form (requires `canAttendance`). Bounded to
   * EMPLOYEE_OPTION_LIMIT rows; `search` narrows by name, code or department and `total`
   * tells the picker whether more employees exist than were returned.
   */
  async getEmployeeOptions(
    user: AuthenticatedUser,
    options: { search?: string; take?: number } = {}
  ): Promise<{ options: AttendanceEmployeeOption[]; total: number }> {
    await assertPermission(user, "canAttendance");

    const take = Math.min(Math.max(1, Math.trunc(options.take ?? EMPLOYEE_OPTION_LIMIT)), EMPLOYEE_OPTION_LIMIT);
    const search = options.search?.trim();
    const where: Prisma.EmployeeWhereInput = {
      status: { not: EmployeeStatus.EXITED },
      ...(search
        ? {
            OR: [
              { user: { name: { contains: search, mode: "insensitive" } } },
              { employeeCode: { contains: search, mode: "insensitive" } },
              { department: { contains: search, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const [employees, total] = await Promise.all([
      prisma.employee.findMany({
        where,
        select: employeeSummarySelect,
        orderBy: { employeeCode: "asc" },
        take,
      }),
      prisma.employee.count({ where }),
    ]);

    return { options: employees.map(toEmployeeOption), total };
  }

  /**
   * Team view for staff with `canAttendance`: one page of records inside an explicit
   * month window (default: current month in the business time zone), today's counts
   * from the database and a bounded employee picker.
   */
  async getTeamAttendanceView(
    user: AuthenticatedUser,
    query: ListQuery = {}
  ): Promise<{
    employees: AttendanceEmployeeOption[];
    employeesTotal: number;
    records: AttendanceRecordView[];
    page: PageInfo;
    filters: AttendanceListFilters;
    window: AttendanceWindow;
    todayCounts: AttendanceTodayCounts;
    pendingRegularizationCount: number;
    selfEmployeeId: string | null;
  }> {
    await assertPermission(user, "canAttendance");

    const window = resolveWindow(query.month);
    const { skip, take, page, pageSize } = pageArgs(query.page, query.pageSize);
    const search = query.search?.trim();
    const where: Prisma.AttendanceRecordWhereInput = {
      date: { gte: window.startDate, lt: window.endDate },
      ...(query.status ? { status: query.status } : {}),
      ...(query.employeeId ? { employeeId: query.employeeId } : {}),
      ...(search
        ? {
            employee: {
              OR: [
                { user: { name: { contains: search, mode: "insensitive" } } },
                { employeeCode: { contains: search, mode: "insensitive" } },
                { department: { contains: search, mode: "insensitive" } },
              ],
            },
          }
        : {}),
    };
    const today = toUtcDateOnly(new Date());

    const [employeeOptions, records, total, todayGroups, pendingRegularizationCount, selfEmployee] =
      await Promise.all([
        this.getEmployeeOptions(user),
        prisma.attendanceRecord.findMany({
          where,
          select: attendanceRecordSelect,
          orderBy: [{ date: "desc" }, { employee: { employeeCode: "asc" } }],
          skip,
          take,
        }),
        prisma.attendanceRecord.count({ where }),
        prisma.attendanceRecord.groupBy({
          by: ["status"],
          where: { date: today },
          _count: { _all: true },
        }),
        prisma.attendanceRegularization.count({
          where: { status: RegularizationStatus.PENDING },
        }),
        prisma.employee.findUnique({ where: { userId: user.id }, select: { id: true } }),
      ]);

    return {
      employees: employeeOptions.options,
      employeesTotal: employeeOptions.total,
      records: records.map((r) => toRecordView(r, r.employee)),
      page: toPageInfo(page, pageSize, total),
      filters: {
        month: window.month,
        status: query.status,
        search: search || undefined,
        employeeId: query.employeeId,
      },
      window: { month: window.month, start: window.start, endExclusive: window.endExclusive },
      todayCounts: todayCountsFromGroups(todayGroups as StatusGroup[], utcDateKey(today)),
      pendingRegularizationCount,
      selfEmployeeId: selfEmployee?.id ?? null,
    };
  }

  /**
   * Self view: only the signed-in user's own employee record and attendance rows, one
   * page of the month being browsed plus today's row (needed for check-in / check-out).
   */
  async getSelfAttendanceView(
    user: AuthenticatedUser,
    query: { month?: string; page?: number; pageSize?: number } = {}
  ): Promise<{
    employee: AttendanceEmployeeOption | null;
    records: AttendanceRecordView[];
    page: PageInfo;
    filters: AttendanceListFilters;
    window: AttendanceWindow;
    todayRecord: AttendanceRecordView | null;
  }> {
    const window = resolveWindow(query.month);
    const { skip, take, page, pageSize } = pageArgs(query.page, query.pageSize);
    const filters: AttendanceListFilters = { month: window.month };
    const windowView = { month: window.month, start: window.start, endExclusive: window.endExclusive };

    const employee = await this.findOwnEmployee(user);
    if (!employee) {
      return {
        employee: null,
        records: [],
        page: toPageInfo(page, pageSize, 0),
        filters,
        window: windowView,
        todayRecord: null,
      };
    }

    const where: Prisma.AttendanceRecordWhereInput = {
      employeeId: employee.id,
      date: { gte: window.startDate, lt: window.endDate },
    };

    const [records, total, todayRow] = await Promise.all([
      prisma.attendanceRecord.findMany({
        where,
        select: ownRecordSelect,
        orderBy: { date: "desc" },
        skip,
        take,
      }),
      prisma.attendanceRecord.count({ where }),
      prisma.attendanceRecord.findUnique({
        where: { employeeId_date: { employeeId: employee.id, date: toUtcDateOnly(new Date()) } },
        select: ownRecordSelect,
      }),
    ]);

    return {
      employee: toEmployeeOption(employee),
      records: records.map((r) => toRecordView(r, employee)),
      page: toPageInfo(page, pageSize, total),
      filters,
      window: windowView,
      todayRecord: todayRow ? toRecordView(todayRow, employee) : null,
    };
  }

  /**
   * Self-service check-in for today's UTC calendar day. Uses server time only, never
   * overwrites an existing check-in and never overrides a status recorded by staff.
   */
  async selfCheckIn(user: AuthenticatedUser): Promise<AttendanceRecordView> {
    const employee = await this.requireOwnActiveEmployee(user);
    const now = new Date();
    const date = toUtcDateOnly(now);

    try {
      const record = await prisma.$transaction(async (tx) => {
        const existing = await tx.attendanceRecord.findUnique({
          where: { employeeId_date: { employeeId: employee.id, date } },
        });

        if (!existing) {
          return tx.attendanceRecord.create({
            data: {
              employeeId: employee.id,
              date,
              checkInTime: now,
              status: AttendanceStatus.PRESENT,
              entryMethod: AttendanceEntryMethod.WEB_PORTAL,
            },
          });
        }

        if (existing.checkInTime) {
          throw new ConflictError("You have already checked in today.");
        }
        if (existing.status !== AttendanceStatus.PRESENT) {
          throw new ConflictError(
            `Today's attendance has already been recorded as ${statusLabel(existing.status)}. Contact your supervisor for corrections.`
          );
        }

        // Conditional write: fails if the row changed after it was read.
        const updated = await tx.attendanceRecord.updateMany({
          where: { id: existing.id, checkInTime: null, status: AttendanceStatus.PRESENT },
          data: { checkInTime: now },
        });
        if (updated.count !== 1) {
          throw new ConflictError("Today's attendance changed while checking in. Reload and try again.");
        }
        return { ...existing, checkInTime: now };
      });

      return toRecordView(record, employee);
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictError("You have already checked in today.");
      }
      throw err;
    }
  }

  /**
   * Self-service check-out for today's UTC calendar day, using server time only.
   */
  async selfCheckOut(user: AuthenticatedUser): Promise<AttendanceRecordView> {
    const employee = await this.requireOwnActiveEmployee(user);
    const now = new Date();
    const date = toUtcDateOnly(now);

    const record = await prisma.$transaction(async (tx) => {
      const existing = await tx.attendanceRecord.findUnique({
        where: { employeeId_date: { employeeId: employee.id, date } },
      });

      if (!existing || !existing.checkInTime) {
        throw new ConflictError("You have not checked in today.");
      }
      if (existing.checkOutTime) {
        throw new ConflictError("You have already checked out today.");
      }
      if (
        existing.status === AttendanceStatus.ABSENT ||
        existing.status === AttendanceStatus.ON_LEAVE
      ) {
        throw new ConflictError(
          `Today's attendance has been recorded as ${statusLabel(existing.status)}. Contact your supervisor for corrections.`
        );
      }

      const updated = await tx.attendanceRecord.updateMany({
        where: { id: existing.id, checkOutTime: null, checkInTime: { not: null } },
        data: { checkOutTime: now },
      });
      if (updated.count !== 1) {
        throw new ConflictError("Today's attendance changed while checking out. Reload and try again.");
      }
      return { ...existing, checkOutTime: now };
    });

    return toRecordView(record, employee);
  }

  /**
   * Staff entry or correction of another employee's attendance. Requires `canAttendance`,
   * is recorded as a manual entry and is audit logged with the previous values.
   */
  async recordAttendanceForEmployee(
    user: AuthenticatedUser,
    input: LogAttendanceInput
  ): Promise<AttendanceRecordView> {
    await assertPermission(user, "canAttendance");

    const employee = await prisma.employee.findUnique({
      where: { id: input.employeeId },
      select: employeeSummarySelect,
    });
    if (!employee) {
      throw new NotFoundError("Employee record not found.");
    }
    if (employee.userId === user.id) {
      throw new ForbiddenError(
        "Use self check-in for your own attendance. Corrections to your own record must be made by another authorized staff member."
      );
    }
    if (employee.status === EmployeeStatus.EXITED) {
      throw new ValidationError("Attendance cannot be recorded for an exited employee record.");
    }

    const date = toUtcDateOnly(new Date(input.date));
    const checkInTime = input.checkInTime ? new Date(input.checkInTime) : null;
    const checkOutTime = input.checkOutTime ? new Date(input.checkOutTime) : null;
    if (checkOutTime && !checkInTime) {
      throw new ValidationError("A check-out time requires a check-in time.");
    }
    if (checkInTime && checkOutTime && checkOutTime <= checkInTime) {
      throw new ValidationError("Check-out time must be after check-in time.");
    }

    const data = {
      checkInTime,
      checkOutTime,
      status: input.status,
      entryMethod: AttendanceEntryMethod.MANUAL_ENTRY,
      notes: input.notes?.trim() || null,
    };

    const record = await prisma.$transaction(async (tx) => {
      const existing = await tx.attendanceRecord.findUnique({
        where: { employeeId_date: { employeeId: employee.id, date } },
      });

      const saved = existing
        ? await tx.attendanceRecord.update({ where: { id: existing.id }, data })
        : await tx.attendanceRecord.create({ data: { employeeId: employee.id, date, ...data } });

      await tx.auditLog.create({
        data: {
          actorId: user.id,
          actorRole: user.roles[0] ?? null,
          action: existing ? "ATTENDANCE_RECORD_UPDATED" : "ATTENDANCE_RECORD_CREATED",
          resourceType: "AttendanceRecord",
          resourceId: saved.id,
          diffPayload: {
            employeeId: employee.id,
            date: date.toISOString(),
            previous: existing
              ? {
                  status: existing.status,
                  checkInTime: existing.checkInTime?.toISOString() ?? null,
                  checkOutTime: existing.checkOutTime?.toISOString() ?? null,
                  entryMethod: existing.entryMethod,
                }
              : null,
            next: {
              status: data.status,
              checkInTime: checkInTime?.toISOString() ?? null,
              checkOutTime: checkOutTime?.toISOString() ?? null,
              entryMethod: data.entryMethod,
            },
          },
        },
      });

      return saved;
    });

    return toRecordView(record, employee);
  }

  /**
   * Attendance history of one employee: the employee themself, or staff with `canAttendance`.
   * One page inside a month window (default: current month, business time zone).
   */
  async getEmployeeAttendanceHistory(
    user: AuthenticatedUser,
    employeeId: string,
    query: { month?: string; page?: number; pageSize?: number } = {}
  ): Promise<AttendanceHistoryPage> {
    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
      select: employeeSummarySelect,
    });

    if (!employee) {
      throw new NotFoundError("Employee record not found.");
    }

    if (employee.userId !== user.id) {
      await assertPermission(user, "canAttendance");
    }

    const window = resolveWindow(query.month);
    const { skip, take, page, pageSize } = pageArgs(query.page, query.pageSize);
    const where: Prisma.AttendanceRecordWhereInput = {
      employeeId,
      date: { gte: window.startDate, lt: window.endDate },
    };

    const [records, total] = await Promise.all([
      prisma.attendanceRecord.findMany({
        where,
        select: ownRecordSelect,
        orderBy: { date: "desc" },
        skip,
        take,
      }),
      prisma.attendanceRecord.count({ where }),
    ]);

    return {
      items: records.map((r) => toRecordItem(r, employee)),
      page: toPageInfo(page, pageSize, total),
    };
  }

  /**
   * Request for attendance regularization (correction) by the employee or by staff with
   * `canAttendance`. The attendance row itself is not modified until a reviewer approves.
   */
  async requestAttendanceRegularization(
    user: AuthenticatedUser,
    input: RequestRegularizationInput
  ): Promise<void> {
    const record = await prisma.attendanceRecord.findUnique({
      where: { id: input.attendanceRecordId },
      include: { employee: { select: { id: true, userId: true } } },
    });

    if (!record) {
      throw new NotFoundError("Attendance record not found.");
    }

    if (record.employee.userId !== user.id) {
      await assertPermission(user, "canAttendance");
    }

    const pending = await prisma.attendanceRegularization.findFirst({
      where: { attendanceRecordId: record.id, status: RegularizationStatus.PENDING },
      select: { id: true },
    });
    if (pending) {
      throw new ConflictError("A correction request for this day is already pending review.");
    }

    await prisma.attendanceRegularization.create({
      data: {
        employeeId: record.employeeId,
        attendanceRecordId: record.id,
        requestedCheckIn: input.requestedCheckIn ? new Date(input.requestedCheckIn) : null,
        requestedCheckOut: input.requestedCheckOut ? new Date(input.requestedCheckOut) : null,
        reason: input.reason.trim(),
        status: RegularizationStatus.PENDING,
      },
    });
  }

  /**
   * Review of an attendance regularization request (requires `canAttendance`; reviewers
   * cannot review their own request). Approval applies the requested times; rejection
   * leaves the attendance row unchanged (no status is inferred, OD-006).
   */
  async reviewRegularization(
    user: AuthenticatedUser,
    input: ReviewRegularizationInput
  ): Promise<void> {
    await assertPermission(user, "canAttendance");

    const reg = await prisma.attendanceRegularization.findUnique({
      where: { id: input.regularizationId },
      include: {
        attendanceRecord: true,
        employee: { select: { userId: true } },
      },
    });

    if (!reg) {
      throw new NotFoundError("Regularization request not found.");
    }
    if (reg.employee.userId === user.id) {
      throw new ForbiddenError("You cannot review a correction request for your own attendance.");
    }
    if (reg.status !== RegularizationStatus.PENDING) {
      throw new ConflictError("Regularization request has already been reviewed.");
    }

    const nextStatus =
      input.status === "APPROVED" ? RegularizationStatus.APPROVED : RegularizationStatus.REJECTED;

    await prisma.$transaction(async (tx) => {
      const updated = await tx.attendanceRegularization.updateMany({
        where: { id: reg.id, status: RegularizationStatus.PENDING },
        data: {
          status: nextStatus,
          reviewNotes: input.reviewNotes?.trim() || null,
          reviewedById: user.id,
          reviewedAt: new Date(),
        },
      });
      if (updated.count !== 1) {
        throw new ConflictError("Regularization request has already been reviewed.");
      }

      if (nextStatus === RegularizationStatus.APPROVED) {
        await tx.attendanceRecord.update({
          where: { id: reg.attendanceRecordId },
          data: {
            checkInTime: reg.requestedCheckIn || reg.attendanceRecord.checkInTime,
            checkOutTime: reg.requestedCheckOut || reg.attendanceRecord.checkOutTime,
            status: AttendanceStatus.PRESENT,
          },
        });
      }

      await tx.auditLog.create({
        data: {
          actorId: user.id,
          actorRole: user.roles[0] ?? null,
          action:
            nextStatus === RegularizationStatus.APPROVED
              ? "ATTENDANCE_REGULARIZATION_APPROVED"
              : "ATTENDANCE_REGULARIZATION_REJECTED",
          resourceType: "AttendanceRegularization",
          resourceId: reg.id,
          diffPayload: {
            attendanceRecordId: reg.attendanceRecordId,
            previousStatus: reg.status,
            nextStatus,
          },
        },
      });
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
