import { prisma } from "@/lib/db";
import { assertPermission, hasPermission, type AuthenticatedUser } from "@/lib/auth/guards";
import {
  AttendanceEntryMethod,
  AttendanceStatus,
  EmployeeStatus,
  LeaveRequestStatus,
  Role,
  type Prisma,
} from "@prisma/client";
import {
  CreateLeaveRequestInput,
  ReviewLeaveRequestInput,
  CreateLeaveTypeInput,
  MAX_LEAVE_REQUEST_SPAN_DAYS,
  LEAVE_DEFAULT_PAGE_SIZE,
  LEAVE_MAX_PAGE_SIZE,
} from "../schemas";
import type {
  LeaveTypeItem,
  LeaveRequestItem,
  LeaveStats,
  EmployeeOption,
  EmployeeOptionsResult,
  EmployeeLeaveSummary,
  LeaveCalendar,
  LeaveListFilters,
  LeaveRequestPage,
  LeaveReviewResult,
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
  inclusiveUtcDaySpan,
  listUtcDays,
  toUtcDateOnly,
  utcDateKey,
} from "@/features/attendance/services/attendance-dates";

/** Roles that may manage the leave-type catalogue (together with `canLeave`). */
const LEAVE_CATALOGUE_ROLES: Role[] = [Role.ADMIN, Role.HR];

/**
 * Suggested leave-type catalogue. NOT APPROVED (OD-007 / POL-13): names, paid flags and
 * descriptions are pending product-owner approval. It is only inserted when an ADMIN
 * explicitly runs the seeding action; it is never seeded automatically.
 */
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

/** Statuses that block an overlapping new request for the same employee. */
const OPEN_LEAVE_STATUSES: LeaveRequestStatus[] = [
  LeaveRequestStatus.PENDING,
  LeaveRequestStatus.APPROVED,
];

/** Only the columns the leave screens render (no wide includes). */
const leaveRequestSelect = {
  id: true,
  employeeId: true,
  leaveTypeId: true,
  startDate: true,
  endDate: true,
  reason: true,
  status: true,
  reviewNotes: true,
  reviewedById: true,
  reviewedAt: true,
  createdAt: true,
  employee: {
    select: {
      id: true,
      employeeCode: true,
      department: true,
      designation: true,
      user: { select: { id: true, name: true, email: true } },
    },
  },
  leaveType: { select: { id: true, code: true, name: true, isPaid: true } },
  reviewedBy: { select: { id: true, name: true } },
} satisfies Prisma.LeaveRequestSelect;

type LeaveRequestRow = Prisma.LeaveRequestGetPayload<{ select: typeof leaveRequestSelect }>;

const employeeOptionSelect = {
  id: true,
  employeeCode: true,
  department: true,
  designation: true,
  user: { select: { name: true, email: true } },
} satisfies Prisma.EmployeeSelect;

/** Approved leave shown on the calendar tab: at most this many rows per list. */
const CALENDAR_LIMIT = 50;
const UPCOMING_WINDOW_DAYS = 14;
/** Employee picker: first page size and hard cap. */
const EMPLOYEE_OPTION_LIMIT = 50;

function toLeaveRequestItem(r: LeaveRequestRow, viewerId: string): LeaveRequestItem {
  return {
    id: r.id,
    employeeId: r.employeeId,
    employeeName: r.employee.user.name,
    employeeCode: r.employee.employeeCode,
    employeeDepartment: r.employee.department,
    employeeDesignation: r.employee.designation,
    employeeEmail: r.employee.user.email,
    leaveTypeId: r.leaveTypeId,
    leaveTypeCode: r.leaveType.code,
    leaveTypeName: r.leaveType.name,
    isPaid: r.leaveType.isPaid,
    startDate: r.startDate.toISOString(),
    endDate: r.endDate.toISOString(),
    durationDays: Math.max(1, inclusiveUtcDaySpan(r.startDate, r.endDate)),
    reason: r.reason,
    status: r.status,
    reviewNotes: r.reviewNotes,
    reviewedById: r.reviewedById,
    reviewedByName: r.reviewedBy?.name ?? null,
    reviewedAt: r.reviewedAt ? r.reviewedAt.toISOString() : null,
    createdAt: r.createdAt.toISOString(),
    isOwnRequest: r.employee.user.id === viewerId,
  };
}

function toLeaveTypeItem(t: {
  id: string;
  code: string;
  name: string;
  description: string | null;
  isPaid: boolean;
  requiresApproval: boolean;
  isActive: boolean;
  createdAt: Date;
  _count?: { leaveRequests: number };
}): LeaveTypeItem {
  return {
    id: t.id,
    code: t.code,
    name: t.name,
    description: t.description,
    isPaid: t.isPaid,
    requiresApproval: t.requiresApproval,
    isActive: t.isActive,
    createdAt: t.createdAt.toISOString(),
    _count: t._count,
  };
}

function toEmployeeOption(e: Prisma.EmployeeGetPayload<{ select: typeof employeeOptionSelect }>): EmployeeOption {
  return {
    id: e.id,
    employeeCode: e.employeeCode,
    name: e.user.name,
    email: e.user.email,
    department: e.department,
    designation: e.designation,
  };
}

/** Clamps page / page size and returns the matching Prisma `skip` / `take`. */
function pageArgs(page?: number, pageSize?: number) {
  const size = Math.min(Math.max(1, Math.trunc(pageSize ?? LEAVE_DEFAULT_PAGE_SIZE)), LEAVE_MAX_PAGE_SIZE);
  const current = Math.max(1, Math.trunc(page ?? 1));
  return { skip: (current - 1) * size, take: size, page: current, pageSize: size };
}

function toPageInfo(page: number, pageSize: number, total: number): PageInfo {
  return { page, pageSize, total, pageCount: Math.max(1, Math.ceil(total / pageSize)) };
}

/** Prisma `where` for the list filters the leave screens expose. */
function buildLeaveWhere(filters: LeaveListFilters & { employeeId?: string }): Prisma.LeaveRequestWhereInput {
  const where: Prisma.LeaveRequestWhereInput = {};
  if (filters.status) where.status = filters.status;
  if (filters.leaveTypeId) where.leaveTypeId = filters.leaveTypeId;
  if (filters.employeeId) where.employeeId = filters.employeeId;
  const search = filters.search?.trim();
  if (search) {
    where.OR = [
      { employee: { user: { name: { contains: search, mode: "insensitive" } } } },
      { employee: { employeeCode: { contains: search, mode: "insensitive" } } },
      { employee: { department: { contains: search, mode: "insensitive" } } },
      { leaveType: { name: { contains: search, mode: "insensitive" } } },
      { reason: { contains: search, mode: "insensitive" } },
    ];
  }
  return where;
}

type StatusGroup = { status: LeaveRequestStatus; _count: { _all: number } };

function statsFromGroups(
  groups: StatusGroup[],
  onLeaveTodayCount: number,
  paidLeavesCount: number
): LeaveStats {
  const count = (status: LeaveRequestStatus) =>
    groups.find((g) => g.status === status)?._count._all ?? 0;
  return {
    totalRequests: groups.reduce((sum, g) => sum + g._count._all, 0),
    pendingCount: count(LeaveRequestStatus.PENDING),
    approvedCount: count(LeaveRequestStatus.APPROVED),
    rejectedCount: count(LeaveRequestStatus.REJECTED),
    onLeaveTodayCount,
    paidLeavesCount,
  };
}

const EMPTY_STATS: LeaveStats = {
  totalRequests: 0,
  pendingCount: 0,
  approvedCount: 0,
  rejectedCount: 0,
  onLeaveTodayCount: 0,
  paidLeavesCount: 0,
};

export class LeaveService {
  /** Team view, reviews and on-behalf submissions require `canLeave`. */
  async canManageLeave(user: AuthenticatedUser): Promise<boolean> {
    return hasPermission(user, "canLeave");
  }

  /** Leave-type catalogue changes require ADMIN, or HR holding `canLeave`. */
  async canManageLeaveTypes(user: AuthenticatedUser): Promise<boolean> {
    if (user.roles.includes(Role.ADMIN)) return true;
    if (!user.roles.some((r) => LEAVE_CATALOGUE_ROLES.includes(r))) return false;
    return hasPermission(user, "canLeave");
  }

  private async assertCatalogueAccess(user: AuthenticatedUser): Promise<void> {
    await assertPermission(user, "canLeave", { roles: LEAVE_CATALOGUE_ROLES });
  }

  /**
   * Inserts the suggested (unapproved, OD-007) leave-type catalogue when no leave types
   * exist. ADMIN only, explicit action only, audit logged.
   */
  async ensureDefaultLeaveTypes(user: AuthenticatedUser): Promise<{ created: number }> {
    if (!user.roles.includes(Role.ADMIN)) {
      throw new ForbiddenError("Only administrators can load the suggested leave categories.");
    }

    return prisma.$transaction(async (tx) => {
      const count = await tx.leaveType.count();
      if (count > 0) {
        throw new ConflictError("Leave categories already exist; the suggested catalogue was not loaded.");
      }

      const result = await tx.leaveType.createMany({
        data: DEFAULT_LEAVE_TYPES.map((def) => ({ ...def, isActive: true })),
        skipDuplicates: true,
      });

      await tx.auditLog.create({
        data: {
          actorId: user.id,
          actorRole: user.roles[0] ?? null,
          action: "SEED_SUGGESTED_LEAVE_TYPES",
          resourceType: "LeaveType",
          resourceId: "catalogue",
          diffPayload: {
            codes: DEFAULT_LEAVE_TYPES.map((d) => d.code),
            approvalStatus: "PENDING_OD_007",
          },
        },
      });

      return { created: result.count };
    });
  }

  /**
   * Leave types configured in the platform with usage count. Never seeds data.
   */
  async getLeaveTypes(includeInactive: boolean = false): Promise<LeaveTypeItem[]> {
    const types = await prisma.leaveType.findMany({
      where: includeInactive ? {} : { isActive: true },
      include: { _count: { select: { leaveRequests: true } } },
      orderBy: { name: "asc" },
    });
    return types.map(toLeaveTypeItem);
  }

  /**
   * Creates a new leave category (ADMIN, or HR with `canLeave`). Audit logged.
   */
  async createLeaveType(
    user: AuthenticatedUser,
    input: CreateLeaveTypeInput
  ): Promise<LeaveTypeItem> {
    await this.assertCatalogueAccess(user);

    const normalizedCode = input.code.trim().toUpperCase();

    return prisma.$transaction(async (tx) => {
      const existing = await tx.leaveType.findUnique({ where: { code: normalizedCode } });
      if (existing) {
        throw new ConflictError(`Leave type code "${normalizedCode}" already exists.`);
      }

      const created = await tx.leaveType.create({
        data: {
          code: normalizedCode,
          name: input.name.trim(),
          description: input.description?.trim() || null,
          isPaid: input.isPaid ?? true,
          requiresApproval: input.requiresApproval ?? true,
          isActive: true,
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: user.id,
          actorRole: user.roles[0] ?? null,
          action: "CREATE_LEAVE_TYPE",
          resourceType: "LeaveType",
          resourceId: created.id,
          diffPayload: { code: created.code, name: created.name, isPaid: created.isPaid },
        },
      });

      return toLeaveTypeItem(created);
    });
  }

  /**
   * Toggles the active status of a leave type (ADMIN, or HR with `canLeave`). Audit logged.
   */
  async toggleLeaveType(
    user: AuthenticatedUser,
    id: string,
    isActive: boolean
  ): Promise<void> {
    await this.assertCatalogueAccess(user);

    await prisma.$transaction(async (tx) => {
      const type = await tx.leaveType.findUnique({ where: { id } });
      if (!type) throw new NotFoundError("Leave type not found.");

      await tx.leaveType.update({ where: { id }, data: { isActive } });

      await tx.auditLog.create({
        data: {
          actorId: user.id,
          actorRole: user.roles[0] ?? null,
          action: isActive ? "ENABLE_LEAVE_TYPE" : "DISABLE_LEAVE_TYPE",
          resourceType: "LeaveType",
          resourceId: id,
          diffPayload: { previous: type.isActive, next: isActive },
        },
      });
    });
  }

  /** Counts by status pushed to PostgreSQL (`groupBy` / `count`); no rows are loaded. */
  private async loadStats(scope: Prisma.LeaveRequestWhereInput): Promise<LeaveStats> {
    const today = toUtcDateOnly(new Date());
    const [groups, onLeaveTodayCount, paidLeavesCount] = await Promise.all([
      prisma.leaveRequest.groupBy({ by: ["status"], where: scope, _count: { _all: true } }),
      prisma.leaveRequest.count({
        where: {
          ...scope,
          status: LeaveRequestStatus.APPROVED,
          startDate: { lte: today },
          endDate: { gte: today },
        },
      }),
      prisma.leaveRequest.count({
        where: { ...scope, status: LeaveRequestStatus.APPROVED, leaveType: { isPaid: true } },
      }),
    ]);
    return statsFromGroups(groups as StatusGroup[], onLeaveTodayCount, paidLeavesCount);
  }

  /** Approved leave overlapping today and starting within the next 14 days, bounded. */
  private async loadCalendar(
    scope: Prisma.LeaveRequestWhereInput,
    viewerId: string
  ): Promise<LeaveCalendar> {
    const today = toUtcDateOnly(new Date());
    const horizon = new Date(today.getTime() + UPCOMING_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    const [onLeaveToday, upcoming] = await Promise.all([
      prisma.leaveRequest.findMany({
        where: {
          ...scope,
          status: LeaveRequestStatus.APPROVED,
          startDate: { lte: today },
          endDate: { gte: today },
        },
        select: leaveRequestSelect,
        orderBy: { endDate: "asc" },
        take: CALENDAR_LIMIT,
      }),
      prisma.leaveRequest.findMany({
        where: {
          ...scope,
          status: LeaveRequestStatus.APPROVED,
          startDate: { gt: today, lte: horizon },
        },
        select: leaveRequestSelect,
        orderBy: { startDate: "asc" },
        take: CALENDAR_LIMIT,
      }),
    ]);
    return {
      onLeaveToday: onLeaveToday.map((r) => toLeaveRequestItem(r, viewerId)),
      upcoming: upcoming.map((r) => toLeaveRequestItem(r, viewerId)),
    };
  }

  /**
   * Organisation-wide leave counts (requires `canLeave`). No balances are computed (OD-007).
   */
  async getLeaveStats(user: AuthenticatedUser): Promise<LeaveStats> {
    await assertPermission(user, "canLeave");
    return this.loadStats({});
  }

  /** Organisation-wide calendar lists (requires `canLeave`). */
  async getLeaveCalendar(user: AuthenticatedUser): Promise<LeaveCalendar> {
    await assertPermission(user, "canLeave");
    return this.loadCalendar({}, user.id);
  }

  /**
   * One page of leave requests for review (requires `canLeave`). Filters, page and page
   * size (at most LEAVE_MAX_PAGE_SIZE) come from the URL; the total is counted in the
   * same round trip.
   */
  async getAllLeaveRequests(
    user: AuthenticatedUser,
    query: LeaveListFilters & { employeeId?: string; page?: number; pageSize?: number } = {}
  ): Promise<LeaveRequestPage> {
    await assertPermission(user, "canLeave");

    const where = buildLeaveWhere(query);
    const { skip, take, page, pageSize } = pageArgs(query.page, query.pageSize);

    const [rows, total] = await Promise.all([
      prisma.leaveRequest.findMany({
        where,
        select: leaveRequestSelect,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip,
        take,
      }),
      prisma.leaveRequest.count({ where }),
    ]);

    return {
      items: rows.map((r) => toLeaveRequestItem(r, user.id)),
      page: toPageInfo(page, pageSize, total),
    };
  }

  /**
   * The signed-in user's own leave requests and employee record (self view). Every query
   * is scoped to the user's own employee id; nothing about other employees is read.
   */
  async getMyLeaveOverview(
    user: AuthenticatedUser,
    query: LeaveListFilters & { page?: number; pageSize?: number } = {}
  ): Promise<{
    employee: EmployeeOption | null;
    requests: LeaveRequestItem[];
    page: PageInfo;
    stats: LeaveStats;
    calendar: LeaveCalendar;
  }> {
    const employee = await prisma.employee.findUnique({
      where: { userId: user.id },
      select: { ...employeeOptionSelect, status: true },
    });

    const { skip, take, page, pageSize } = pageArgs(query.page, query.pageSize);

    if (!employee) {
      return {
        employee: null,
        requests: [],
        page: toPageInfo(page, pageSize, 0),
        stats: EMPTY_STATS,
        calendar: { onLeaveToday: [], upcoming: [] },
      };
    }

    const scope: Prisma.LeaveRequestWhereInput = { employeeId: employee.id };
    const where = buildLeaveWhere({ ...query, employeeId: employee.id });

    const [rows, total, stats, calendar] = await Promise.all([
      prisma.leaveRequest.findMany({
        where,
        select: leaveRequestSelect,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip,
        take,
      }),
      prisma.leaveRequest.count({ where }),
      this.loadStats(scope),
      this.loadCalendar(scope, user.id),
    ]);

    return {
      employee: employee.status === EmployeeStatus.EXITED ? null : toEmployeeOption(employee),
      requests: rows.map((r) => toLeaveRequestItem(r, user.id)),
      page: toPageInfo(page, pageSize, total),
      stats,
      calendar,
    };
  }

  /**
   * Submits a leave request for oneself, or on behalf of another employee with `canLeave`.
   * No balance is checked or deducted (OD-007). Dates are UTC calendar days, the range is
   * bounded, the leave type must be active and the request may not overlap the same
   * employee's pending or approved requests.
   */
  async submitLeaveRequest(
    user: AuthenticatedUser,
    input: CreateLeaveRequestInput
  ): Promise<LeaveRequestItem> {
    const employee = await prisma.employee.findUnique({
      where: { id: input.employeeId },
      select: { id: true, userId: true, status: true },
    });

    if (!employee) {
      throw new NotFoundError("Employee record not found.");
    }

    if (employee.userId !== user.id) {
      await assertPermission(user, "canLeave");
    }

    if (employee.status === EmployeeStatus.EXITED) {
      throw new ValidationError("Leave cannot be requested for an exited employee record.");
    }

    const leaveType = await prisma.leaveType.findUnique({ where: { id: input.leaveTypeId } });
    if (!leaveType) {
      throw new NotFoundError("Leave type not found.");
    }
    if (!leaveType.isActive) {
      throw new ValidationError("This leave category is not active.");
    }

    const rawStart = new Date(input.startDate);
    const rawEnd = new Date(input.endDate);
    if (isNaN(rawStart.getTime()) || isNaN(rawEnd.getTime())) {
      throw new ValidationError("Invalid date values provided.");
    }
    const start = toUtcDateOnly(rawStart);
    const end = toUtcDateOnly(rawEnd);
    if (end < start) {
      throw new ValidationError("End date cannot precede start date.");
    }
    const durationDays = inclusiveUtcDaySpan(start, end);
    if (durationDays > MAX_LEAVE_REQUEST_SPAN_DAYS) {
      throw new ValidationError(
        `A single leave request cannot span more than ${MAX_LEAVE_REQUEST_SPAN_DAYS} days.`
      );
    }

    const created = await prisma.$transaction(async (tx) => {
      // Serialise submissions per employee so two concurrent requests cannot both pass
      // the overlap check.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`leave-request:${employee.id}`}))`;

      const overlapping = await tx.leaveRequest.findFirst({
        where: {
          employeeId: employee.id,
          status: { in: OPEN_LEAVE_STATUSES },
          startDate: { lte: end },
          endDate: { gte: start },
        },
        select: { id: true, status: true },
      });
      if (overlapping) {
        throw new ConflictError(
          "These dates overlap an existing pending or approved leave request for this employee."
        );
      }

      const request = await tx.leaveRequest.create({
        data: {
          employeeId: employee.id,
          leaveTypeId: leaveType.id,
          startDate: start,
          endDate: end,
          reason: input.reason.trim(),
          status: LeaveRequestStatus.PENDING,
        },
        select: leaveRequestSelect,
      });

      await tx.auditLog.create({
        data: {
          actorId: user.id,
          actorRole: user.roles[0] ?? null,
          action: "SUBMIT_LEAVE_REQUEST",
          resourceType: "LeaveRequest",
          resourceId: request.id,
          diffPayload: {
            employeeId: employee.id,
            leaveType: leaveType.code,
            startDate: start.toISOString(),
            endDate: end.toISOString(),
            durationDays,
            onBehalf: employee.userId !== user.id,
          },
        },
      });

      return request;
    });

    return toLeaveRequestItem(created, user.id);
  }

  /**
   * Approves or rejects a pending leave request (requires `canLeave`). Reviewers cannot
   * review their own request. Approval chains are not modelled (OD-007).
   *
   * The status change, the attendance sync and the audit entry run in one transaction.
   * Approval marks UTC days in the range as ON_LEAVE only where no attendance is recorded
   * (or the day is ABSENT without a check-in); days with a check-in, PRESENT/HALF_DAY or a
   * pending correction are never overwritten and are returned as `skippedDates`.
   */
  async reviewLeaveRequest(
    user: AuthenticatedUser,
    input: ReviewLeaveRequestInput
  ): Promise<LeaveReviewResult> {
    await assertPermission(user, "canLeave");

    const req = await prisma.leaveRequest.findUnique({
      where: { id: input.requestId },
      include: {
        employee: { select: { id: true, userId: true } },
        leaveType: { select: { code: true, name: true } },
      },
    });

    if (!req) {
      throw new NotFoundError("Leave request not found.");
    }
    if (req.employee.userId === user.id) {
      throw new ForbiddenError("You cannot review your own leave request.");
    }
    if (req.status !== LeaveRequestStatus.PENDING) {
      throw new ConflictError("Leave request has already been finalized.");
    }

    const targetStatus =
      input.status === "APPROVED" ? LeaveRequestStatus.APPROVED : LeaveRequestStatus.REJECTED;

    const start = toUtcDateOnly(req.startDate);
    const end = toUtcDateOnly(req.endDate);
    if (targetStatus === LeaveRequestStatus.APPROVED) {
      if (end < start || inclusiveUtcDaySpan(start, end) > MAX_LEAVE_REQUEST_SPAN_DAYS) {
        throw new ValidationError(
          `This request's date range is invalid or longer than ${MAX_LEAVE_REQUEST_SPAN_DAYS} days and cannot be approved. Reject it and ask for a corrected request.`
        );
      }
    }

    const reviewNotes = input.reviewNotes?.trim() || null;

    return prisma.$transaction(async (tx) => {
      // Conditional transition: only one reviewer can move the request out of PENDING.
      const transitioned = await tx.leaveRequest.updateMany({
        where: { id: req.id, status: LeaveRequestStatus.PENDING },
        data: {
          status: targetStatus,
          reviewNotes,
          reviewedById: user.id,
          reviewedAt: new Date(),
        },
      });
      if (transitioned.count !== 1) {
        throw new ConflictError("Leave request was already reviewed by someone else.");
      }

      let attendanceDaysMarked = 0;
      const skippedDates: string[] = [];

      if (targetStatus === LeaveRequestStatus.APPROVED) {
        const existing = await tx.attendanceRecord.findMany({
          where: { employeeId: req.employeeId, date: { gte: start, lte: end } },
          select: { id: true, date: true, status: true, checkInTime: true },
        });
        const byDay = new Map(existing.map((r) => [utcDateKey(r.date), r]));

        // Leave reasons are private: attendance notes only name the leave category.
        const notes = `Approved leave: ${req.leaveType.name}`;
        const toCreate: Prisma.AttendanceRecordCreateManyInput[] = [];
        const absentIds: string[] = [];

        for (const day of listUtcDays(start, end)) {
          const key = utcDateKey(day);
          const record = byDay.get(key);
          if (!record) {
            toCreate.push({
              employeeId: req.employeeId,
              date: day,
              status: AttendanceStatus.ON_LEAVE,
              entryMethod: AttendanceEntryMethod.SYSTEM_IMPORT,
              notes,
            });
          } else if (record.status === AttendanceStatus.ON_LEAVE) {
            continue;
          } else if (record.status === AttendanceStatus.ABSENT && !record.checkInTime) {
            absentIds.push(record.id);
          } else {
            skippedDates.push(key);
          }
        }

        if (toCreate.length > 0) {
          // skipDuplicates: a row created concurrently (e.g. a check-in) is kept as is.
          const created = await tx.attendanceRecord.createMany({ data: toCreate, skipDuplicates: true });
          attendanceDaysMarked += created.count;
        }
        if (absentIds.length > 0) {
          const updated = await tx.attendanceRecord.updateMany({
            where: { id: { in: absentIds }, status: AttendanceStatus.ABSENT, checkInTime: null },
            data: { status: AttendanceStatus.ON_LEAVE, notes },
          });
          attendanceDaysMarked += updated.count;
        }
      }

      await tx.auditLog.create({
        data: {
          actorId: user.id,
          actorRole: user.roles[0] ?? null,
          action: targetStatus === LeaveRequestStatus.APPROVED ? "APPROVE_LEAVE" : "REJECT_LEAVE",
          resourceType: "LeaveRequest",
          resourceId: req.id,
          diffPayload: {
            employeeId: req.employeeId,
            leaveType: req.leaveType.code,
            previousStatus: req.status,
            nextStatus: targetStatus,
            reviewNotes,
            attendanceDaysMarked,
            skippedDates,
          },
        },
      });

      return {
        status: targetStatus === LeaveRequestStatus.APPROVED ? "APPROVED" : "REJECTED",
        attendanceDaysMarked,
        skippedDates,
      };
    });
  }

  /**
   * Non-exited employees for the on-behalf leave form (requires `canLeave`). Bounded to
   * EMPLOYEE_OPTION_LIMIT rows; `search` narrows by name, code or department and `total`
   * tells the picker whether more employees exist than were returned.
   */
  async getEmployeeOptions(
    user: AuthenticatedUser,
    options: { search?: string; take?: number } = {}
  ): Promise<EmployeeOptionsResult> {
    await assertPermission(user, "canLeave");

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

    const [raw, total] = await Promise.all([
      prisma.employee.findMany({
        where,
        select: employeeOptionSelect,
        orderBy: { employeeCode: "asc" },
        take,
      }),
      prisma.employee.count({ where }),
    ]);

    return { options: raw.map(toEmployeeOption), total };
  }

  /**
   * Calendar days on record for one employee (the employee themself, or staff with
   * `canLeave`). Day totals are summed in PostgreSQL; entitlements and balances are not
   * calculated (OD-007).
   */
  async getEmployeeLeaveSummary(
    user: AuthenticatedUser,
    employeeId: string,
    excludeRequestId?: string
  ): Promise<EmployeeLeaveSummary> {
    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
      select: { id: true, userId: true },
    });
    if (!employee) {
      throw new NotFoundError("Employee record not found.");
    }
    if (employee.userId !== user.id) {
      await assertPermission(user, "canLeave");
    }

    const [dayTotals, totalRequests, recentOther] = await Promise.all([
      prisma.$queryRaw<{ status: string; days: number }[]>`
        SELECT "status"::text AS status,
               COALESCE(SUM(("endDate"::date - "startDate"::date) + 1), 0)::int AS days
        FROM "leave_requests"
        WHERE "employeeId" = ${employeeId} AND "status" IN ('APPROVED', 'PENDING')
        GROUP BY "status"`,
      prisma.leaveRequest.count({ where: { employeeId } }),
      prisma.leaveRequest.findMany({
        where: { employeeId, ...(excludeRequestId ? { id: { not: excludeRequestId } } : {}) },
        select: leaveRequestSelect,
        orderBy: [{ startDate: "desc" }, { id: "desc" }],
        take: 3,
      }),
    ]);

    const days = (status: string) => Number(dayTotals.find((d) => d.status === status)?.days ?? 0);
    return {
      approvedDays: days(LeaveRequestStatus.APPROVED),
      pendingDays: days(LeaveRequestStatus.PENDING),
      totalRequests,
      recentOther: recentOther.map((r) => toLeaveRequestItem(r, user.id)),
    };
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
