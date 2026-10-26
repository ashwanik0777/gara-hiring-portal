import { describe, it, expect, vi, beforeEach } from "vitest";
import { Role } from "@prisma/client";
import type { AuthenticatedUser } from "@/lib/auth/guards";

// ---------------------------------------------------------------------------
// Round 5: every HRMS list is bounded (take ≤ 50, explicit date windows), counts
// and sums are pushed to PostgreSQL, the self views never read other employees and
// payout profiles are joined with their browser-safe columns only (round 6: the
// `EmployeePayoutProfile` table; encrypted identifiers are never selected for display).
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
    aggregate: vi.fn(),
    groupBy: vi.fn(),
  });
  const db = {
    user: model(),
    employee: model(),
    attendanceRecord: model(),
    attendanceRegularization: model(),
    leaveType: model(),
    leaveRequest: model(),
    payrollPeriod: model(),
    payrollRecord: model(),
    employeePayoutProfile: model(),
    auditLog: model(),
    subAdminPermission: model(),
    $transaction: vi.fn(),
    $executeRaw: vi.fn(),
    $queryRaw: vi.fn(),
  };
  const reset = () => {
    for (const value of Object.values(db)) {
      if (typeof value === "function") value.mockReset();
      else for (const fn of Object.values(value)) fn.mockReset();
    }
    // Lists resolve empty and counts resolve 0 unless a test says otherwise.
    for (const value of Object.values(db)) {
      if (typeof value === "function") continue;
      value.findMany.mockResolvedValue([]);
      value.count.mockResolvedValue(0);
      value.groupBy.mockResolvedValue([]);
      value.aggregate.mockResolvedValue({ _sum: { disbursedAmount: null } });
    }
    db.$queryRaw.mockResolvedValue([]);
    db.subAdminPermission.findUnique.mockResolvedValue(null);
  };
  reset();
  return { mockDb: db, resetMockDb: reset };
});

vi.mock("@/lib/db", () => ({ prisma: mockDb }));

import { leaveService } from "@/features/leave/services/leave-service";
import { LEAVE_MAX_PAGE_SIZE } from "@/features/leave/schemas";
import { attendanceService } from "@/features/attendance/services/attendance-service";
import { ATTENDANCE_MAX_PAGE_SIZE } from "@/features/attendance/schemas";
import { currentBusinessMonthKey, utcMonthWindow } from "@/features/attendance/services/attendance-dates";
import { payrollService } from "@/features/payroll/services/payroll-service";
import { PAYROLL_MAX_PAGE_SIZE, PAYROLL_PERIODS_PAGE_SIZE, PAYROLL_RECORDS_PAGE_SIZE } from "@/features/payroll/schemas";
import { loadLeavePageData, parseLeaveListQuery } from "@/features/leave/services/leave-page-data";
import { parseAttendanceListQuery } from "@/features/attendance/services/attendance-page-data";
import { parsePayrollDashboardQuery } from "@/features/payroll/services/payroll-page-data";
import { ForbiddenError } from "@/lib/errors";

const adminUser: AuthenticatedUser = { id: "user-admin", email: "a@t.test", name: "Admin", roles: [Role.ADMIN] };
const hrUser: AuthenticatedUser = { id: "user-hr", email: "h@t.test", name: "HR", roles: [Role.HR] };
const internUser: AuthenticatedUser = { id: "user-intern", email: "i@t.test", name: "Intern", roles: [Role.INTERN] };

const ownEmployee = {
  id: "emp-self",
  userId: internUser.id,
  employeeCode: "EMP-1",
  department: "Eng",
  designation: "Intern",
  status: "ACTIVE",
  user: { name: "Intern", email: "i@t.test" },
};

type Args = Record<string, unknown>;
const firstArgs = (fn: ReturnType<typeof vi.fn>, index = 0) => fn.mock.calls[index][0] as Args;

/** Every field name selected by a Prisma `select`, including nested relation selects. */
function selectedFields(select: unknown, out: Set<string> = new Set()): Set<string> {
  if (!select || typeof select !== "object") return out;
  for (const [key, value] of Object.entries(select as Record<string, unknown>)) {
    out.add(key);
    if (value && typeof value === "object" && "select" in value) {
      selectedFields((value as { select: unknown }).select, out);
    }
  }
  return out;
}

beforeEach(() => {
  resetMockDb();
});

// ---------------------------------------------------------------------------
// Leave
// ---------------------------------------------------------------------------

describe("Leave lists are bounded and counted in the database", () => {
  it("paginates the review list with skip/take, caps the page size at 50 and counts in the same round trip", async () => {
    await leaveService.getAllLeaveRequests(adminUser, {
      page: 3,
      pageSize: 999,
      status: "PENDING",
      leaveTypeId: "lt-1",
      search: "asha",
    });

    const args = firstArgs(mockDb.leaveRequest.findMany);
    expect(args.take).toBe(LEAVE_MAX_PAGE_SIZE);
    expect(args.skip).toBe(2 * LEAVE_MAX_PAGE_SIZE);
    expect(args.include).toBeUndefined();
    expect(args.select).toBeDefined();
    expect(args.where).toMatchObject({ status: "PENDING", leaveTypeId: "lt-1" });
    expect(JSON.stringify(args.where)).toContain("asha");
    expect(mockDb.leaveRequest.count).toHaveBeenCalledWith({ where: args.where });
  });

  it("defaults to page 1 with a bounded page size and no filters", async () => {
    const result = await leaveService.getAllLeaveRequests(adminUser);
    const args = firstArgs(mockDb.leaveRequest.findMany);
    expect(args.skip).toBe(0);
    expect(args.take).toBeLessThanOrEqual(LEAVE_MAX_PAGE_SIZE);
    expect(args.where).toEqual({});
    expect(result.page).toMatchObject({ page: 1, total: 0, pageCount: 1 });
  });

  it("computes stats with groupBy/count and never loads request rows", async () => {
    mockDb.leaveRequest.groupBy.mockResolvedValue([
      { status: "PENDING", _count: { _all: 2 } },
      { status: "APPROVED", _count: { _all: 5 } },
      { status: "REJECTED", _count: { _all: 1 } },
    ]);
    mockDb.leaveRequest.count.mockResolvedValueOnce(1).mockResolvedValueOnce(4);

    const stats = await leaveService.getLeaveStats(adminUser);

    expect(stats).toEqual({
      totalRequests: 8,
      pendingCount: 2,
      approvedCount: 5,
      rejectedCount: 1,
      onLeaveTodayCount: 1,
      paidLeavesCount: 4,
    });
    expect(mockDb.leaveRequest.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({ by: ["status"], _count: { _all: true } })
    );
    expect(mockDb.leaveRequest.findMany).not.toHaveBeenCalled();
  });

  it("bounds the calendar lists and the employee picker", async () => {
    await leaveService.getLeaveCalendar(adminUser);
    for (const call of mockDb.leaveRequest.findMany.mock.calls) {
      const args = call[0] as Args;
      expect(args.take).toBeLessThanOrEqual(50);
      expect(args.where).toMatchObject({ status: "APPROVED" });
    }
    expect(mockDb.leaveRequest.findMany).toHaveBeenCalledTimes(2);

    mockDb.employee.count.mockResolvedValue(120);
    const options = await leaveService.getEmployeeOptions(adminUser, { take: 500, search: "ra" });
    const args = firstArgs(mockDb.employee.findMany);
    expect(args.take).toBe(50);
    expect(args.where).toMatchObject({ status: { not: "EXITED" } });
    expect(JSON.stringify(args.where)).toContain("ra");
    expect(options.total).toBe(120);
  });

  it("sums recorded days in SQL for the details dialog and guards other employees with canLeave", async () => {
    mockDb.employee.findUnique.mockResolvedValue({ id: "emp-other", userId: "user-other" });
    await expect(leaveService.getEmployeeLeaveSummary(internUser, "emp-other")).rejects.toBeInstanceOf(ForbiddenError);
    expect(mockDb.$queryRaw).not.toHaveBeenCalled();

    mockDb.$queryRaw.mockResolvedValue([
      { status: "APPROVED", days: 7 },
      { status: "PENDING", days: 2 },
    ]);
    mockDb.leaveRequest.count.mockResolvedValue(4);
    const summary = await leaveService.getEmployeeLeaveSummary(adminUser, "emp-other", "lr-x");

    expect(summary).toMatchObject({ approvedDays: 7, pendingDays: 2, totalRequests: 4, recentOther: [] });
    expect(mockDb.$queryRaw).toHaveBeenCalledTimes(1);
    const recent = firstArgs(mockDb.leaveRequest.findMany);
    expect(recent.take).toBe(3);
    expect(recent.where).toMatchObject({ employeeId: "emp-other", id: { not: "lr-x" } });
  });

  it("self overview scopes rows, counts, stats and calendar to the own employee and never lists employees", async () => {
    mockDb.employee.findUnique.mockResolvedValue(ownEmployee);
    const overview = await leaveService.getMyLeaveOverview(internUser, { page: 2, pageSize: 10 });

    const queries = [
      ...mockDb.leaveRequest.findMany.mock.calls,
      ...mockDb.leaveRequest.count.mock.calls,
      ...mockDb.leaveRequest.groupBy.mock.calls,
    ];
    expect(queries.length).toBeGreaterThanOrEqual(5);
    for (const call of queries) {
      expect((call[0] as Args).where).toMatchObject({ employeeId: ownEmployee.id });
    }
    expect(firstArgs(mockDb.leaveRequest.findMany)).toMatchObject({ skip: 10, take: 10 });
    expect(mockDb.employee.findMany).not.toHaveBeenCalled();
    expect(overview.employee?.id).toBe(ownEmployee.id);
  });

  it("validates list query params from the URL and passes the page to the service", async () => {
    expect(parseLeaveListQuery({ status: "BOGUS", page: "x", type: "not-a-uuid", tab: "calendar" })).toEqual({
      tab: "calendar",
    });
    expect(parseLeaveListQuery({ status: ["APPROVED"], page: "4", q: "  asha " })).toEqual({
      status: "APPROVED",
      page: 4,
      q: "asha",
    });

    const pageData = await loadLeavePageData(adminUser, {
      allowSelfView: false,
      query: { status: "APPROVED", page: 2 },
    });
    expect(pageData.view).toBe("team");
    const listCall = mockDb.leaveRequest.findMany.mock.calls.find(
      (c) => (c[0] as Args).skip !== undefined
    );
    expect(listCall?.[0]).toMatchObject({ skip: expect.any(Number), where: { status: "APPROVED" } });
  });
});

// ---------------------------------------------------------------------------
// Attendance
// ---------------------------------------------------------------------------

describe("Attendance lists use explicit month windows and database counts", () => {
  it("team view defaults to the current business month, pages with take ≤ 50 and counts today's statuses with groupBy", async () => {
    mockDb.attendanceRecord.groupBy.mockResolvedValue([
      { status: "PRESENT", _count: { _all: 3 } },
      { status: "HALF_DAY", _count: { _all: 1 } },
      { status: "ABSENT", _count: { _all: 2 } },
    ]);
    mockDb.attendanceRecord.count.mockResolvedValue(70);

    const view = await attendanceService.getTeamAttendanceView(adminUser, { pageSize: 500, page: 2 });

    const { start, endExclusive } = utcMonthWindow(currentBusinessMonthKey());
    const args = firstArgs(mockDb.attendanceRecord.findMany);
    expect(args.where).toMatchObject({ date: { gte: start, lt: endExclusive } });
    expect(args.take).toBe(ATTENDANCE_MAX_PAGE_SIZE);
    expect(args.skip).toBe(ATTENDANCE_MAX_PAGE_SIZE);
    expect(args.include).toBeUndefined();
    expect(args.select).toBeDefined();

    expect(mockDb.attendanceRecord.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({ by: ["status"], _count: { _all: true } })
    );
    expect(view.todayCounts).toMatchObject({ present: 4, onLeaveOrAbsent: 2 });
    expect(view.page).toMatchObject({ page: 2, pageSize: ATTENDANCE_MAX_PAGE_SIZE, total: 70, pageCount: 2 });
    expect(view.window.month).toBe(currentBusinessMonthKey());
    expect(firstArgs(mockDb.employee.findMany).take).toBeLessThanOrEqual(50);
  });

  it("honours an explicit month and the status / search filters", async () => {
    await attendanceService.getTeamAttendanceView(adminUser, { month: "2026-02", status: "ABSENT", search: "ram" });
    const args = firstArgs(mockDb.attendanceRecord.findMany);
    expect(args.where).toMatchObject({
      status: "ABSENT",
      date: { gte: new Date("2026-02-01T00:00:00.000Z"), lt: new Date("2026-03-01T00:00:00.000Z") },
    });
    expect(JSON.stringify(args.where)).toContain("ram");
  });

  it("self view reads only the own employee's rows inside the month plus today's row", async () => {
    mockDb.employee.findUnique.mockResolvedValue(ownEmployee);
    const view = await attendanceService.getSelfAttendanceView(internUser, { month: "2026-09", page: 1 });

    const args = firstArgs(mockDb.attendanceRecord.findMany);
    expect(args.where).toMatchObject({
      employeeId: ownEmployee.id,
      date: { gte: new Date("2026-09-01T00:00:00.000Z"), lt: new Date("2026-10-01T00:00:00.000Z") },
    });
    expect(args.take).toBeLessThanOrEqual(ATTENDANCE_MAX_PAGE_SIZE);
    expect(firstArgs(mockDb.attendanceRecord.findUnique).where).toEqual({
      employeeId_date: { employeeId: ownEmployee.id, date: expect.any(Date) },
    });
    expect(mockDb.employee.findMany).not.toHaveBeenCalled();
    expect(mockDb.attendanceRecord.groupBy).not.toHaveBeenCalled();
    expect(view.employee?.id).toBe(ownEmployee.id);
  });

  it("history is paginated inside a month window and guarded by canAttendance for other employees", async () => {
    mockDb.employee.findUnique.mockResolvedValue({ ...ownEmployee, id: "emp-other", userId: "user-other" });
    await expect(attendanceService.getEmployeeAttendanceHistory(internUser, "emp-other")).rejects.toBeInstanceOf(
      ForbiddenError
    );
    expect(mockDb.attendanceRecord.findMany).not.toHaveBeenCalled();

    const history = await attendanceService.getEmployeeAttendanceHistory(hrUser, "emp-other", { month: "2026-01", page: 2, pageSize: 10 });
    const args = firstArgs(mockDb.attendanceRecord.findMany);
    expect(args).toMatchObject({
      skip: 10,
      take: 10,
      where: { employeeId: "emp-other", date: { gte: new Date("2026-01-01T00:00:00.000Z"), lt: new Date("2026-02-01T00:00:00.000Z") } },
    });
    expect(history.page.page).toBe(2);
  });

  it("validates attendance query params from the URL", () => {
    expect(parseAttendanceListQuery({ month: "2026-13", status: "NOPE", page: "0" })).toEqual({});
    expect(parseAttendanceListQuery({ month: "2026-04", status: "ON_LEAVE", page: "2", q: "x" })).toEqual({
      month: "2026-04",
      status: "ON_LEAVE",
      page: 2,
      q: "x",
    });
  });
});

// ---------------------------------------------------------------------------
// Payroll
// ---------------------------------------------------------------------------

const PERIOD_A = "11111111-1111-4111-8111-111111111111";
const PERIOD_OLD = "22222222-2222-4222-8222-222222222222";

function periodRow(id: string, code: string) {
  return {
    id,
    code,
    startDate: new Date("2026-04-01T00:00:00.000Z"),
    endDate: new Date("2026-04-30T00:00:00.000Z"),
    status: "FINALIZED",
    notes: null,
  };
}

describe("Payroll lists are bounded and aggregated in the database", () => {
  it("loads the latest periods and one page of records, with stats from groupBy/aggregate/count", async () => {
    mockDb.payrollPeriod.findMany.mockResolvedValue([periodRow(PERIOD_A, "2026-04")]);
    mockDb.payrollPeriod.count.mockResolvedValue(30);
    mockDb.payrollRecord.groupBy
      .mockResolvedValueOnce([
        { payrollPeriodId: PERIOD_A, status: "PAID", _count: { _all: 2 } },
        { payrollPeriodId: PERIOD_A, status: "FINALIZED", _count: { _all: 3 } },
      ])
      .mockResolvedValueOnce([
        { status: "PAID", _count: { _all: 2 } },
        { status: "FINALIZED", _count: { _all: 3 } },
      ]);
    mockDb.payrollRecord.aggregate.mockResolvedValue({ _sum: { disbursedAmount: { toNumber: () => 24000 } } });
    mockDb.payrollRecord.count.mockResolvedValueOnce(5).mockResolvedValueOnce(1);
    mockDb.employee.findMany.mockResolvedValue([]);

    const data = await payrollService.getPayrollDashboardData(adminUser, { page: 2, status: "FINALIZED", search: "utr" });

    const periodArgs = firstArgs(mockDb.payrollPeriod.findMany);
    expect(periodArgs.take).toBe(PAYROLL_PERIODS_PAGE_SIZE);
    expect(periodArgs.include).toBeUndefined();
    expect(periodArgs.select).toBeDefined();

    const recordArgs = firstArgs(mockDb.payrollRecord.findMany);
    expect(recordArgs.take).toBe(PAYROLL_RECORDS_PAGE_SIZE);
    expect(recordArgs.skip).toBe(PAYROLL_RECORDS_PAGE_SIZE);
    expect(recordArgs.include).toBeUndefined();
    expect(recordArgs.where).toMatchObject({ payrollPeriodId: PERIOD_A, status: "FINALIZED" });
    expect(JSON.stringify(recordArgs.where)).toContain("utr");
    expect(PAYROLL_RECORDS_PAGE_SIZE).toBeLessThanOrEqual(PAYROLL_MAX_PAGE_SIZE);

    expect(mockDb.payrollRecord.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { payrollPeriodId: PERIOD_A, status: "PAID" }, _sum: { disbursedAmount: true } })
    );
    expect(data.stats).toMatchObject({
      totalEnrolled: 5,
      paidCount: 2,
      finalizedCount: 3,
      completionRate: 40,
      totalDisbursedAmount: 24000,
      paidRecordsWithoutAmount: 1,
    });
    expect(data.periods[0]).toMatchObject({ totalRecords: 5, paidRecords: 2, pendingRecords: 3 });
    expect(data.periodsPage).toMatchObject({ total: 30, pageCount: 3 });
    expect(data.recordsPage).toMatchObject({ page: 2, total: 5 });
  });

  it("opens a period outside the latest page by id and lists it first", async () => {
    mockDb.payrollPeriod.findMany.mockResolvedValue([periodRow(PERIOD_A, "2026-04")]);
    mockDb.payrollPeriod.findUnique.mockResolvedValue(periodRow(PERIOD_OLD, "2025-01"));
    mockDb.employee.findMany.mockResolvedValue([]);

    const data = await payrollService.getPayrollDashboardData(adminUser, { periodId: PERIOD_OLD });
    expect(mockDb.payrollPeriod.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: PERIOD_OLD } }));
    expect(data.activePeriod?.id).toBe(PERIOD_OLD);
    expect(data.periods.map((p) => p.id)).toEqual([PERIOD_OLD, PERIOD_A]);
    expect(firstArgs(mockDb.payrollRecord.findMany).where).toMatchObject({ payrollPeriodId: PERIOD_OLD });
  });

  it("joins only browser-safe payout columns, and only on the canPayroll-gated dashboard path", async () => {
    await expect(payrollService.getPayrollDashboardData(hrUser)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mockDb.employee.findMany).not.toHaveBeenCalled();
    expect(mockDb.payrollRecord.findMany).not.toHaveBeenCalled();
    expect(mockDb.employeePayoutProfile.groupBy).not.toHaveBeenCalled();

    mockDb.payrollPeriod.findMany.mockResolvedValue([periodRow(PERIOD_A, "2026-04")]);
    await payrollService.getPayrollDashboardData(adminUser);
    const recordSelect = selectedFields(firstArgs(mockDb.payrollRecord.findMany).select);
    expect(recordSelect.has("payoutProfile")).toBe(true);
    expect(recordSelect.has("accountNumberLast4")).toBe(true);
    expect(recordSelect.has("accountNumberEncrypted")).toBe(false);
    expect(recordSelect.has("panEncrypted")).toBe(false);
    expect(recordSelect.has("internalNotes")).toBe(false);
    // The only employee rows read are the bounded directory page.
    expect(mockDb.employee.findMany).toHaveBeenCalledTimes(1);
    const directoryArgs = firstArgs(mockDb.employee.findMany);
    expect(directoryArgs.include).toBeUndefined();
    expect(typeof directoryArgs.take).toBe("number");
    const directorySelect = selectedFields(directoryArgs.select);
    expect(directorySelect.has("panLast4")).toBe(true);
    expect(directorySelect.has("panEncrypted")).toBe(false);
    expect(directorySelect.has("internalNotes")).toBe(false);
    // Workforce flags are grouped in SQL instead of loading every employee.
    expect(mockDb.employeePayoutProfile.groupBy).toHaveBeenCalledWith({ by: ["isPaid"], _count: { _all: true } });
    expect(mockDb.employee.count).toHaveBeenCalledWith({ where: { payoutProfile: { is: null } } });
  });

  it("applies the employment-type filter in SQL and counts the filtered register", async () => {
    mockDb.payrollPeriod.findMany.mockResolvedValue([periodRow(PERIOD_A, "2026-04")]);
    mockDb.payrollRecord.count.mockResolvedValueOnce(30);

    const data = await payrollService.getPayrollDashboardData(adminUser, { type: "FULL_TIME" });

    const where = firstArgs(mockDb.payrollRecord.findMany).where;
    expect(where).toEqual({
      payrollPeriodId: PERIOD_A,
      employee: { payoutProfile: { is: { employmentType: "FULL_TIME" } } },
    });
    expect(mockDb.payrollRecord.count).toHaveBeenCalledWith({ where });
    expect(data.recordsPage.total).toBe(30);
    expect(data.recordFilters).toEqual({ status: undefined, search: undefined, type: "FULL_TIME" });
  });

  it("self payroll view reads the payout profile only for the own employee row and pages the records", async () => {
    mockDb.employee.findUnique.mockResolvedValue({
      id: "emp-self",
      employeeCode: "EMP-1",
      department: "Eng",
      designation: "Intern",
      payoutProfile: null,
      user: { name: "Intern" },
    });
    mockDb.payrollRecord.count.mockResolvedValue(40);

    const overview = await payrollService.getMyPayrollOverview(internUser, { page: 2, pageSize: 500 });

    expect(firstArgs(mockDb.employee.findUnique).where).toEqual({ userId: internUser.id });
    const ownSelect = selectedFields(firstArgs(mockDb.employee.findUnique).select);
    expect(ownSelect.has("accountNumberLast4")).toBe(true);
    expect(ownSelect.has("accountNumberEncrypted")).toBe(false);
    expect(ownSelect.has("internalNotes")).toBe(false);
    expect(overview.payout?.isPaid).toBeNull();
    const args = firstArgs(mockDb.payrollRecord.findMany);
    expect(args.where).toEqual({ employeeId: "emp-self" });
    expect(args.take).toBe(PAYROLL_MAX_PAGE_SIZE);
    expect(args.skip).toBe(PAYROLL_MAX_PAGE_SIZE);
    expect(selectedFields(args.select).has("internalNotes")).toBe(false);
    expect(mockDb.employee.findMany).not.toHaveBeenCalled();
    expect(overview.page).toMatchObject({ page: 2, total: 40 });
  });

  it("caps the period list at 50 and validates dashboard query params", async () => {
    await payrollService.getPayrollPeriods(adminUser, { pageSize: 999 });
    expect(firstArgs(mockDb.payrollPeriod.findMany).take).toBe(PAYROLL_MAX_PAGE_SIZE);
    expect(mockDb.payrollPeriod.count).toHaveBeenCalledTimes(1);

    expect(parsePayrollDashboardQuery({ period: "nope", status: "PAID", page: "3", tab: "periods", dpage: "-1" })).toEqual({
      status: "PAID",
      page: 3,
      tab: "periods",
    });
    expect(parsePayrollDashboardQuery({ type: "INTERN" })).toEqual({ type: "INTERN" });
    expect(parsePayrollDashboardQuery({ type: "CONTRACTOR" })).toEqual({});
  });
});
