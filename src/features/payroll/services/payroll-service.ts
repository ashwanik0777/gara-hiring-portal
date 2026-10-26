import { z } from "zod";
import { PAYROLL_PROFILE_MARKER, locatePayoutProfileBlock } from "../payout-notes";
import { PAYROLL_STAFF_ROLES } from "../roles";
import { prisma } from "@/lib/db";
import { assertPermission, hasPermission, type AuthenticatedUser } from "@/lib/auth/guards";
import { Prisma, Role, PayrollStatus, EmployeeStatus } from "@prisma/client";
import {
  MY_PAYROLL_PAGE_SIZE,
  PAYROLL_DIRECTORY_PAGE_SIZE,
  PAYROLL_MAX_PAGE_SIZE,
  PAYROLL_PERIODS_PAGE_SIZE,
  PAYROLL_RECORDS_PAGE_SIZE,
  type CreatePayrollPeriodData,
  type RecordDisbursementData,
  type UpdatePayrollPeriodStatusData,
  type BulkDisbursementData,
  type UpdateEmployeePayoutProfileData,
} from "../schemas";
import type {
  PayrollPeriodItem,
  PayrollDashboardData,
  PayrollDashboardQueryInput,
  PayrollPeriodDetail,
  PayrollRecordWithEmployee,
  EmployeePayoutProfile,
  PayrollStats,
  MaskedPayoutDetails,
  MyPayrollOverview,
  PageInfo,
} from "../types";
import {
  PolicyBlockedError,
  NotFoundError,
  ValidationError,
  ConflictError,
} from "@/lib/errors";

/** Employee statuses that can be enrolled into a payroll period by an explicit staff action. */
const ENROLLABLE_EMPLOYEE_STATUSES: EmployeeStatus[] = [
  EmployeeStatus.ACTIVE,
  EmployeeStatus.PROBATION,
];

/**
 * Explicit manual transitions for payroll periods. PAID is terminal and is reached only
 * when every enrolled record has a recorded disbursement; VOID is terminal.
 */
export const PAYROLL_PERIOD_TRANSITIONS: Record<PayrollStatus, readonly PayrollStatus[]> = {
  [PayrollStatus.DRAFT]: [PayrollStatus.FINALIZED, PayrollStatus.VOID],
  [PayrollStatus.FINALIZED]: [PayrollStatus.DRAFT, PayrollStatus.VOID],
  [PayrollStatus.PAID]: [],
  [PayrollStatus.VOID]: [],
};

// -----------------------------------------------------------------------------
// Payout profile storage
//
// Payout details currently live in `Employee.internalNotes` as a marked block:
//   PAYROLL_PROFILE:{...json...}
// The block is located with a string-aware brace scanner (values may contain "}")
// and validated field by field. Missing or invalid values are treated as
// "Not configured" — never replaced with defaults.
// -----------------------------------------------------------------------------

const StoredPayoutSchema = z.object({
  isPaid: z.boolean().optional().catch(undefined),
  employmentType: z.enum(["INTERN", "FULL_TIME"]).optional().catch(undefined),
  stipendAmount: z.number().finite().min(0).nullable().optional().catch(undefined),
  bankName: z.string().nullable().optional().catch(undefined),
  accountNumber: z.string().nullable().optional().catch(undefined),
  ifscCode: z.string().nullable().optional().catch(undefined),
  accountHolderName: z.string().nullable().optional().catch(undefined),
  panNumber: z.string().nullable().optional().catch(undefined),
});

export type StoredPayoutInfo = z.infer<typeof StoredPayoutSchema>;

/**
 * Reads the stored payout profile. Returns `null` when no valid profile block exists.
 */
export function parsePayoutProfile(internalNotes: string | null | undefined): StoredPayoutInfo | null {
  if (!internalNotes) return null;
  const block = locatePayoutProfileBlock(internalNotes);
  if (!block) return null;
  try {
    const parsed = StoredPayoutSchema.safeParse(JSON.parse(block.json));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/**
 * Writes the payout profile block, preserving every other part of the notes.
 */
export function serializePayoutProfile(
  existingNotes: string | null | undefined,
  profile: StoredPayoutInfo
): string {
  const block = `${PAYROLL_PROFILE_MARKER}${JSON.stringify(profile)}`;
  if (!existingNotes) {
    return block;
  }
  const located = locatePayoutProfileBlock(existingNotes);
  if (located) {
    return `${existingNotes.slice(0, located.start)}${block}${existingNotes.slice(located.end)}`;
  }
  return `${existingNotes}\n\n${block}`;
}

/** Masks an identifier to its last four characters. */
export function maskIdentifier(value: string | null | undefined): string | null {
  if (!value) return null;
  const compact = value.replace(/\s+/g, "");
  if (!compact) return null;
  return compact.length > 4 ? `•••• ${compact.slice(-4)}` : "••••";
}

function nonEmpty(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/**
 * Resolves the browser-safe payout view of an employee. Unset values are `null`
 * ("Not configured"); account numbers and PANs are masked.
 */
export function resolveEmployeePayoutInfo(emp: {
  internalNotes?: string | null;
}): MaskedPayoutDetails {
  const payout = parsePayoutProfile(emp.internalNotes);
  if (!payout) {
    return {
      isPaid: null,
      employmentType: null,
      stipendAmount: null,
      bankName: null,
      accountNumberMasked: null,
      ifscCode: null,
      accountHolderName: null,
      panMasked: null,
    };
  }
  return {
    isPaid: payout.isPaid ?? null,
    employmentType: payout.employmentType ?? null,
    stipendAmount:
      typeof payout.stipendAmount === "number" && payout.isPaid === true
        ? payout.stipendAmount
        : null,
    bankName: nonEmpty(payout.bankName),
    accountNumberMasked: maskIdentifier(payout.accountNumber),
    ifscCode: nonEmpty(payout.ifscCode),
    accountHolderName: nonEmpty(payout.accountHolderName),
    panMasked: maskIdentifier(payout.panNumber),
  };
}

/** Configured payout amount at this moment, or null when not recorded. */
function configuredAmount(internalNotes: string | null | undefined): number | null {
  const amount = parsePayoutProfile(internalNotes)?.stipendAmount;
  return typeof amount === "number" ? amount : null;
}

function isConfiguredAsPaid(internalNotes: string | null | undefined): boolean {
  return parsePayoutProfile(internalNotes)?.isPaid === true;
}

// -----------------------------------------------------------------------------
// Read-side helpers: bounded pages and column selects
// -----------------------------------------------------------------------------

/** Clamps page / page size and returns the matching Prisma `skip` / `take`. */
function pageArgs(page: number | undefined, defaultSize: number, pageSize?: number) {
  const size = Math.min(Math.max(1, Math.trunc(pageSize ?? defaultSize)), PAYROLL_MAX_PAGE_SIZE);
  const current = Math.max(1, Math.trunc(page ?? 1));
  return { skip: (current - 1) * size, take: size, page: current, pageSize: size };
}

function toPageInfo(page: number, pageSize: number, total: number): PageInfo {
  return { page, pageSize, total, pageCount: Math.max(1, Math.ceil(total / pageSize)) };
}

const periodSelect = {
  id: true,
  code: true,
  startDate: true,
  endDate: true,
  status: true,
  notes: true,
} satisfies Prisma.PayrollPeriodSelect;

type PeriodRow = Prisma.PayrollPeriodGetPayload<{ select: typeof periodSelect }>;

/**
 * Register row. `employee.internalNotes` carries the payout block and is selected only
 * here, inside the `canPayroll`-gated dashboard; it never reaches the browser unmasked.
 */
const recordSelect = {
  id: true,
  payrollPeriodId: true,
  employeeId: true,
  status: true,
  disbursementReference: true,
  disbursedAt: true,
  disbursedAmount: true,
  notes: true,
  finalizedAt: true,
  createdAt: true,
  employee: {
    select: {
      employeeCode: true,
      department: true,
      designation: true,
      internalNotes: true,
      user: { select: { name: true, email: true } },
    },
  },
  finalizedBy: { select: { name: true } },
} satisfies Prisma.PayrollRecordSelect;

const directorySelect = {
  id: true,
  employeeCode: true,
  department: true,
  designation: true,
  joiningDate: true,
  internalNotes: true,
  user: { select: { name: true, email: true } },
} satisfies Prisma.EmployeeSelect;

type StatusGroup = { status: PayrollStatus; _count: { _all: number } };
type PeriodStatusGroup = StatusGroup & { payrollPeriodId: string };

function buildRecordWhere(
  periodId: string,
  query: Pick<PayrollDashboardQueryInput, "status" | "search">
): Prisma.PayrollRecordWhereInput {
  const search = query.search?.trim();
  return {
    payrollPeriodId: periodId,
    ...(query.status ? { status: query.status } : {}),
    ...(search
      ? {
          OR: [
            { employee: { user: { name: { contains: search, mode: "insensitive" } } } },
            { employee: { employeeCode: { contains: search, mode: "insensitive" } } },
            { employee: { department: { contains: search, mode: "insensitive" } } },
            { disbursementReference: { contains: search, mode: "insensitive" } },
          ],
        }
      : {}),
  };
}

function buildDirectoryWhere(search: string | undefined): Prisma.EmployeeWhereInput {
  const trimmed = search?.trim();
  if (!trimmed) return {};
  return {
    OR: [
      { user: { name: { contains: trimmed, mode: "insensitive" } } },
      { employeeCode: { contains: trimmed, mode: "insensitive" } },
      { department: { contains: trimmed, mode: "insensitive" } },
    ],
  };
}

function actorRoleOf(user: AuthenticatedUser): string | null {
  if (user.roles.includes(Role.ADMIN)) return Role.ADMIN;
  return user.roles[0] ?? null;
}

async function writeAudit(
  tx: Prisma.TransactionClient,
  user: AuthenticatedUser,
  action: string,
  resourceType: "PAYROLL_PERIOD" | "PAYROLL_RECORD" | "EMPLOYEE_PAYOUT_PROFILE",
  resourceId: string,
  diffPayload: Prisma.InputJsonValue
): Promise<void> {
  await tx.auditLog.create({
    data: {
      actorId: user.id,
      actorRole: actorRoleOf(user),
      action,
      resourceType,
      resourceId,
      diffPayload,
    },
  });
}

export class PayrollService {
  /** Throws unless the user is ADMIN, or HR holding `canPayroll`. */
  private async assertPayrollAccess(user: AuthenticatedUser): Promise<void> {
    await assertPermission(user, "canPayroll", { roles: PAYROLL_STAFF_ROLES });
  }

  /** Returns true when the user may use the payroll staff console. */
  async canManagePayroll(user: AuthenticatedUser): Promise<boolean> {
    const roleAllowed = user.roles.some((r) => PAYROLL_STAFF_ROLES.includes(r));
    if (!roleAllowed) return false;
    return hasPermission(user, "canPayroll");
  }

  /**
   * Creation of a payroll cycle tracking period (explicit staff action).
   * Does NOT execute automatic salary computation.
   */
  async createPayrollPeriod(
    user: AuthenticatedUser,
    input: CreatePayrollPeriodData
  ): Promise<PayrollPeriodItem> {
    await this.assertPayrollAccess(user);

    const code = input.code.trim();
    const start = new Date(input.startDate);
    const end = new Date(input.endDate);
    if (end < start) {
      throw new ValidationError("End date cannot precede start date.");
    }

    const existing = await prisma.payrollPeriod.findUnique({ where: { code } });
    if (existing) {
      throw new ConflictError(`Payroll period '${code}' already exists.`);
    }

    const period = await prisma.$transaction(async (tx) => {
      const created = await tx.payrollPeriod.create({
        data: {
          code,
          startDate: start,
          endDate: end,
          status: PayrollStatus.DRAFT,
          notes: input.notes?.trim() || null,
        },
      });
      await writeAudit(tx, user, "PAYROLL_PERIOD_CREATED", "PAYROLL_PERIOD", created.id, {
        code,
        startDate: start.toISOString(),
        endDate: end.toISOString(),
      });
      return created;
    });

    return {
      id: period.id,
      code: period.code,
      startDate: period.startDate,
      endDate: period.endDate,
      status: period.status,
      notes: period.notes,
      totalRecords: 0,
    };
  }

  /**
   * Latest payroll periods (one page, newest first) with their record counts.
   */
  async getPayrollPeriods(
    user: AuthenticatedUser,
    query: { page?: number; pageSize?: number } = {}
  ): Promise<{ items: PayrollPeriodItem[]; page: PageInfo }> {
    await this.assertPayrollAccess(user);

    const { skip, take, page, pageSize } = pageArgs(query.page, PAYROLL_PERIODS_PAGE_SIZE, query.pageSize);
    const [periods, total] = await Promise.all([
      prisma.payrollPeriod.findMany({
        select: { ...periodSelect, _count: { select: { records: true } } },
        orderBy: [{ startDate: "desc" }, { id: "desc" }],
        skip,
        take,
      }),
      prisma.payrollPeriod.count(),
    ]);

    return {
      items: periods.map((p) => ({
        id: p.id,
        code: p.code,
        startDate: p.startDate,
        endDate: p.endDate,
        status: p.status,
        notes: p.notes,
        totalRecords: p._count.records,
      })),
      page: toPageInfo(page, pageSize, total),
    };
  }

  /**
   * Payroll overview for the staff console. Read-only: periods and enrolments are only
   * ever created by explicit staff actions. Every list is one bounded page and every
   * count or sum is computed in PostgreSQL (`groupBy`, `aggregate`, `count`).
   */
  async getPayrollDashboardData(
    user: AuthenticatedUser,
    query: PayrollDashboardQueryInput = {}
  ): Promise<PayrollDashboardData> {
    await this.assertPayrollAccess(user);

    const periodPaging = pageArgs(query.periodsPage, PAYROLL_PERIODS_PAGE_SIZE);
    const [periodRows, periodsTotal] = await Promise.all([
      prisma.payrollPeriod.findMany({
        select: periodSelect,
        orderBy: [{ startDate: "desc" }, { id: "desc" }],
        skip: periodPaging.skip,
        take: periodPaging.take,
      }),
      prisma.payrollPeriod.count(),
    ]);

    // A deep link to a period outside the current page still opens that period.
    let selected: PeriodRow | null = query.periodId
      ? periodRows.find((p) => p.id === query.periodId) ?? null
      : null;
    if (query.periodId && !selected) {
      selected = await prisma.payrollPeriod.findUnique({
        where: { id: query.periodId },
        select: periodSelect,
      });
    }
    const active = selected ?? periodRows[0] ?? null;
    const listedPeriods = active && !periodRows.some((p) => p.id === active.id) ? [active, ...periodRows] : periodRows;
    const periodIds = listedPeriods.map((p) => p.id);

    const recordPaging = pageArgs(query.page, PAYROLL_RECORDS_PAGE_SIZE);
    const directoryPaging = pageArgs(query.directoryPage, PAYROLL_DIRECTORY_PAGE_SIZE);
    const recordWhere = active ? buildRecordWhere(active.id, query) : null;
    const directoryWhere = buildDirectoryWhere(query.directorySearch);

    const [
      periodGroups,
      recordsRaw,
      recordsTotal,
      statusGroups,
      paidSum,
      paidRecordsWithoutAmount,
      workforce,
      directoryRaw,
      directoryTotal,
    ] = await Promise.all([
      periodIds.length > 0
        ? prisma.payrollRecord.groupBy({
            by: ["payrollPeriodId", "status"],
            where: { payrollPeriodId: { in: periodIds } },
            _count: { _all: true },
          })
        : Promise.resolve([]),
      recordWhere
        ? prisma.payrollRecord.findMany({
            where: recordWhere,
            select: recordSelect,
            orderBy: [{ employee: { employeeCode: "asc" } }, { id: "asc" }],
            skip: recordPaging.skip,
            take: recordPaging.take,
          })
        : Promise.resolve([]),
      recordWhere ? prisma.payrollRecord.count({ where: recordWhere }) : Promise.resolve(0),
      active
        ? prisma.payrollRecord.groupBy({
            by: ["status"],
            where: { payrollPeriodId: active.id },
            _count: { _all: true },
          })
        : Promise.resolve([]),
      active
        ? prisma.payrollRecord.aggregate({
            where: { payrollPeriodId: active.id, status: PayrollStatus.PAID },
            _sum: { disbursedAmount: true },
          })
        : Promise.resolve(null),
      active
        ? prisma.payrollRecord.count({
            where: { payrollPeriodId: active.id, status: PayrollStatus.PAID, disbursedAmount: null },
          })
        : Promise.resolve(0),
      // The paid / unpaid flag lives inside the payout block of `internalNotes` (see
      // payout-notes.ts), so it cannot be grouped in SQL; only that one column is read.
      prisma.employee.findMany({ select: { internalNotes: true } }),
      prisma.employee.findMany({
        where: directoryWhere,
        select: directorySelect,
        orderBy: { employeeCode: "asc" },
        skip: directoryPaging.skip,
        take: directoryPaging.take,
      }),
      prisma.employee.count({ where: directoryWhere }),
    ]);

    const groupsByPeriod = periodGroups as PeriodStatusGroup[];
    const toDetail = (p: PeriodRow): PayrollPeriodDetail => {
      const groups = groupsByPeriod.filter((g) => g.payrollPeriodId === p.id);
      const total = groups.reduce((sum, g) => sum + g._count._all, 0);
      const paid = groups.find((g) => g.status === PayrollStatus.PAID)?._count._all ?? 0;
      return {
        id: p.id,
        code: p.code,
        startDate: p.startDate.toISOString(),
        endDate: p.endDate.toISOString(),
        status: p.status,
        notes: p.notes,
        totalRecords: total,
        paidRecords: paid,
        pendingRecords: total - paid,
      };
    };

    const periods = listedPeriods.map(toDetail);
    const activePeriod = active ? toDetail(active) : null;

    const records: PayrollRecordWithEmployee[] = activePeriod
      ? recordsRaw.map((r) => ({
          id: r.id,
          payrollPeriodId: r.payrollPeriodId,
          payrollPeriodCode: activePeriod.code,
          employeeId: r.employeeId,
          employeeName: r.employee.user.name || "Employee",
          employeeCode: r.employee.employeeCode,
          employeeEmail: r.employee.user.email,
          department: r.employee.department,
          designation: r.employee.designation,
          status: r.status,
          disbursementReference: r.disbursementReference,
          disbursedAt: r.disbursedAt?.toISOString() || null,
          notes: r.notes,
          finalizedByName: r.finalizedBy?.name || null,
          finalizedAt: r.finalizedAt?.toISOString() || null,
          createdAt: r.createdAt.toISOString(),
          ...resolveEmployeePayoutInfo(r.employee),
          // PAID records report the amount snapshotted at disbursement, never the current profile.
          ...(r.status === PayrollStatus.PAID
            ? { stipendAmount: r.disbursedAmount == null ? null : r.disbursedAmount.toNumber() }
            : {}),
        }))
      : [];

    const employees: EmployeePayoutProfile[] = directoryRaw.map((emp) => ({
      employeeId: emp.id,
      employeeCode: emp.employeeCode,
      employeeName: emp.user.name || "Employee",
      employeeEmail: emp.user.email,
      department: emp.department,
      designation: emp.designation,
      joiningDate: emp.joiningDate.toISOString(),
      ...resolveEmployeePayoutInfo(emp),
    }));

    return {
      periods,
      periodsPage: toPageInfo(periodPaging.page, periodPaging.pageSize, periodsTotal),
      activePeriod,
      records,
      recordsPage: toPageInfo(recordPaging.page, recordPaging.pageSize, recordsTotal),
      recordFilters: { status: query.status, search: query.search?.trim() || undefined },
      employees,
      employeesPage: toPageInfo(directoryPaging.page, directoryPaging.pageSize, directoryTotal),
      directorySearch: query.directorySearch?.trim() || undefined,
      stats: this.buildStats(
        statusGroups as StatusGroup[],
        paidSum?._sum.disbursedAmount ?? null,
        paidRecordsWithoutAmount,
        workforce
      ),
    };
  }

  /** Active-period counts from `groupBy` / `aggregate`; workforce flags from the payout blocks. */
  private buildStats(
    statusGroups: StatusGroup[],
    disbursedSum: Prisma.Decimal | null,
    paidRecordsWithoutAmount: number,
    workforce: { internalNotes: string | null }[]
  ): PayrollStats {
    const count = (status: PayrollStatus) =>
      statusGroups.find((g) => g.status === status)?._count._all ?? 0;
    const totalEnrolled = statusGroups.reduce((sum, g) => sum + g._count._all, 0);
    const paidCount = count(PayrollStatus.PAID);
    const flags = workforce.map((e) => parsePayoutProfile(e.internalNotes)?.isPaid ?? null);
    return {
      totalEnrolled,
      draftCount: count(PayrollStatus.DRAFT),
      finalizedCount: count(PayrollStatus.FINALIZED),
      paidCount,
      voidCount: count(PayrollStatus.VOID),
      completionRate: totalEnrolled > 0 ? Math.round((paidCount / totalEnrolled) * 100) : 0,
      totalDisbursedAmount: disbursedSum ? disbursedSum.toNumber() : 0,
      paidRecordsWithoutAmount,
      totalPaidWorkforce: flags.filter((f) => f === true).length,
      totalUnpaidWorkforce: flags.filter((f) => f === false).length,
      totalUnconfiguredWorkforce: flags.filter((f) => f === null).length,
    };
  }

  /**
   * Self-service view: one page of the signed-in user's own payroll records and masked
   * payout details. Every query is scoped to the user's own employee row.
   */
  async getMyPayrollOverview(
    user: AuthenticatedUser,
    query: { page?: number; pageSize?: number } = {}
  ): Promise<MyPayrollOverview> {
    const { skip, take, page, pageSize } = pageArgs(query.page, MY_PAYROLL_PAGE_SIZE, query.pageSize);

    const employee = await prisma.employee.findUnique({
      where: { userId: user.id },
      select: {
        id: true,
        employeeCode: true,
        department: true,
        designation: true,
        internalNotes: true,
        user: { select: { name: true } },
      },
    });

    if (!employee) {
      return { employee: null, payout: null, records: [], page: toPageInfo(page, pageSize, 0) };
    }

    const where: Prisma.PayrollRecordWhereInput = { employeeId: employee.id };
    const [records, total] = await Promise.all([
      prisma.payrollRecord.findMany({
        where,
        select: {
          id: true,
          status: true,
          disbursementReference: true,
          disbursedAt: true,
          payrollPeriod: { select: { code: true, startDate: true, endDate: true } },
        },
        orderBy: [{ payrollPeriod: { startDate: "desc" } }, { id: "desc" }],
        skip,
        take,
      }),
      prisma.payrollRecord.count({ where }),
    ]);

    return {
      employee: {
        employeeCode: employee.employeeCode,
        employeeName: employee.user.name || "Employee",
        department: employee.department,
        designation: employee.designation,
      },
      payout: resolveEmployeePayoutInfo(employee),
      records: records.map((r) => ({
        id: r.id,
        payrollPeriodCode: r.payrollPeriod.code,
        periodStartDate: r.payrollPeriod.startDate.toISOString(),
        periodEndDate: r.payrollPeriod.endDate.toISOString(),
        status: r.status,
        disbursementReference: r.disbursementReference,
        disbursedAt: r.disbursedAt?.toISOString() ?? null,
      })),
      page: toPageInfo(page, pageSize, total),
    };
  }

  /**
   * Explicit staff action: enrolls active employees whose payout profile is configured
   * as paid into a DRAFT period. Employees without a configured profile are skipped.
   */
  async generatePayrollRecordsForPeriod(
    user: AuthenticatedUser,
    periodId: string
  ): Promise<{ enrolledCount: number; skippedUnconfiguredCount: number }> {
    await this.assertPayrollAccess(user);

    return prisma.$transaction(async (tx) => {
      const period = await tx.payrollPeriod.findUnique({
        where: { id: periodId },
        include: { records: { select: { employeeId: true } } },
      });
      if (!period) {
        throw new NotFoundError("Payroll period not found.");
      }

      // Conditional touch locks the period row and confirms it is still DRAFT.
      const locked = await tx.payrollPeriod.updateMany({
        where: { id: periodId, status: PayrollStatus.DRAFT },
        data: { updatedAt: new Date() },
      });
      if (locked.count !== 1) {
        throw new ValidationError("Employees can only be enrolled into a DRAFT payroll period.");
      }

      const existingEmpIds = period.records.map((r) => r.employeeId);
      const candidates = await tx.employee.findMany({
        where: {
          status: { in: ENROLLABLE_EMPLOYEE_STATUSES },
          id: { notIn: existingEmpIds },
        },
        select: { id: true, internalNotes: true },
      });

      const paidEligible = candidates.filter((emp) => isConfiguredAsPaid(emp.internalNotes));
      const skippedUnconfiguredCount = candidates.filter(
        (emp) => parsePayoutProfile(emp.internalNotes)?.isPaid === undefined
      ).length;

      if (paidEligible.length === 0) {
        return { enrolledCount: 0, skippedUnconfiguredCount };
      }

      const created = await tx.payrollRecord.createMany({
        data: paidEligible.map((emp) => ({
          payrollPeriodId: periodId,
          employeeId: emp.id,
          status: PayrollStatus.DRAFT,
        })),
        skipDuplicates: true,
      });

      await writeAudit(tx, user, "PAYROLL_RECORDS_ENROLLED", "PAYROLL_PERIOD", periodId, {
        periodCode: period.code,
        enrolledCount: created.count,
        employeeIds: paidEligible.map((emp) => emp.id),
      });

      return { enrolledCount: created.count, skippedUnconfiguredCount };
    });
  }

  /**
   * Manual payroll period transition validated against PAYROLL_PERIOD_TRANSITIONS.
   */
  async updatePayrollPeriodStatus(
    user: AuthenticatedUser,
    input: UpdatePayrollPeriodStatusData
  ): Promise<{ affectedRecords: number }> {
    await this.assertPayrollAccess(user);

    const target = input.status as PayrollStatus;

    return prisma.$transaction(async (tx) => {
      const period = await tx.payrollPeriod.findUnique({ where: { id: input.periodId } });
      if (!period) {
        throw new NotFoundError("Payroll period not found.");
      }

      const allowed = PAYROLL_PERIOD_TRANSITIONS[period.status];
      if (!allowed.includes(target)) {
        throw new ValidationError(
          `Payroll period cannot move from ${period.status} to ${target}.`
        );
      }

      const updated = await tx.payrollPeriod.updateMany({
        where: { id: period.id, status: period.status },
        data: {
          status: target,
          notes: input.notes?.trim() || period.notes,
        },
      });
      if (updated.count !== 1) {
        throw new ConflictError(
          "This payroll period was changed by another user. Reload and try again."
        );
      }

      const now = new Date();
      let affectedRecords = 0;
      if (target === PayrollStatus.FINALIZED) {
        const res = await tx.payrollRecord.updateMany({
          where: { payrollPeriodId: period.id, status: PayrollStatus.DRAFT },
          data: { status: PayrollStatus.FINALIZED, finalizedById: user.id, finalizedAt: now },
        });
        affectedRecords = res.count;
      } else {
        // Reopening (FINALIZED -> DRAFT) or voiding must never touch recorded disbursements.
        const paidCount = await tx.payrollRecord.count({
          where: { payrollPeriodId: period.id, status: PayrollStatus.PAID },
        });
        if (paidCount > 0) {
          throw new ConflictError(
            "This payroll period already has recorded disbursements and cannot be reopened or voided."
          );
        }
        if (target === PayrollStatus.DRAFT) {
          const res = await tx.payrollRecord.updateMany({
            where: { payrollPeriodId: period.id, status: PayrollStatus.FINALIZED },
            data: { status: PayrollStatus.DRAFT, finalizedById: null, finalizedAt: null },
          });
          affectedRecords = res.count;
        } else {
          const res = await tx.payrollRecord.updateMany({
            where: {
              payrollPeriodId: period.id,
              status: { in: [PayrollStatus.DRAFT, PayrollStatus.FINALIZED] },
            },
            data: { status: PayrollStatus.VOID },
          });
          affectedRecords = res.count;
        }
      }

      await writeAudit(tx, user, "PAYROLL_PERIOD_STATUS_CHANGED", "PAYROLL_PERIOD", period.id, {
        periodCode: period.code,
        from: period.status,
        to: target,
        affectedRecords,
        notes: input.notes?.trim() || null,
      });

      return { affectedRecords };
    });
  }

  /**
   * Records a staff-entered disbursement reference for one FINALIZED record.
   * Does NOT calculate any payslip formula.
   */
  async recordDisbursement(
    user: AuthenticatedUser,
    input: RecordDisbursementData
  ): Promise<{ periodPaid: boolean }> {
    await this.assertPayrollAccess(user);

    const reference = input.disbursementReference.trim();

    return prisma.$transaction(async (tx) => {
      const record = await tx.payrollRecord.findUnique({
        where: { id: input.payrollRecordId },
        include: {
          payrollPeriod: { select: { id: true, code: true } },
          employee: { select: { internalNotes: true } },
        },
      });
      if (!record) {
        throw new NotFoundError("Payroll record not found.");
      }
      if (record.status === PayrollStatus.PAID) {
        throw new ConflictError(
          "Disbursement has already been recorded for this payroll record. Duplicate disbursement is not permitted."
        );
      }
      if (record.status !== PayrollStatus.FINALIZED) {
        throw new ValidationError("Only FINALIZED payroll records can be marked as disbursed.");
      }
      if (!isConfiguredAsPaid(record.employee.internalNotes)) {
        throw new ValidationError(
          "This employee's payout profile is not configured as paid. Update the payout profile first."
        );
      }
      const disbursedAmount = configuredAmount(record.employee.internalNotes);

      const periodLocked = await tx.payrollPeriod.updateMany({
        where: { id: record.payrollPeriodId, status: PayrollStatus.FINALIZED },
        data: { updatedAt: new Date() },
      });
      if (periodLocked.count !== 1) {
        throw new ValidationError("Disbursements can only be recorded for a FINALIZED payroll period.");
      }

      const now = new Date();
      const updated = await tx.payrollRecord.updateMany({
        where: { id: record.id, status: PayrollStatus.FINALIZED },
        data: {
          status: PayrollStatus.PAID,
          disbursementReference: reference,
          disbursedAt: now,
          disbursedAmount,
          notes: input.notes?.trim() || record.notes,
        },
      });
      if (updated.count !== 1) {
        throw new ConflictError(
          "This payroll record was changed by another user. Reload and try again."
        );
      }

      const periodPaid = await this.markPeriodPaidWhenComplete(tx, record.payrollPeriodId);

      await writeAudit(tx, user, "PAYROLL_DISBURSEMENT_RECORDED", "PAYROLL_RECORD", record.id, {
        periodCode: record.payrollPeriod.code,
        employeeId: record.employeeId,
        disbursementReference: reference,
        disbursedAmount,
        periodPaid,
      });

      return { periodPaid };
    });
  }

  /**
   * Records one staff-entered batch reference for every FINALIZED record of a FINALIZED
   * period whose employee is configured as paid. All-or-nothing.
   */
  async bulkDisburseRecords(
    user: AuthenticatedUser,
    input: BulkDisbursementData
  ): Promise<{ updatedCount: number; skippedNotPaidCount: number; periodPaid: boolean }> {
    await this.assertPayrollAccess(user);

    const reference = input.disbursementReference.trim();

    return prisma.$transaction(async (tx) => {
      const period = await tx.payrollPeriod.findUnique({
        where: { id: input.periodId },
        select: { id: true, code: true },
      });
      if (!period) {
        throw new NotFoundError("Payroll period not found.");
      }

      const periodLocked = await tx.payrollPeriod.updateMany({
        where: { id: period.id, status: PayrollStatus.FINALIZED },
        data: { updatedAt: new Date() },
      });
      if (periodLocked.count !== 1) {
        throw new ValidationError("Bulk disbursement requires a FINALIZED payroll period.");
      }

      const finalizedRecords = await tx.payrollRecord.findMany({
        where: { payrollPeriodId: period.id, status: PayrollStatus.FINALIZED },
        select: { id: true, employee: { select: { internalNotes: true } } },
      });
      if (finalizedRecords.length === 0) {
        throw new ValidationError(
          "No FINALIZED payroll records are awaiting disbursement in this period."
        );
      }

      const eligible = finalizedRecords.filter((r) => isConfiguredAsPaid(r.employee.internalNotes));
      const skippedNotPaidCount = finalizedRecords.length - eligible.length;
      if (eligible.length === 0) {
        throw new ValidationError(
          "None of the FINALIZED records belong to employees configured as paid."
        );
      }

      const now = new Date();
      let updatedCount = 0;
      for (const rec of eligible) {
        // Each record snapshots its own amount, so later profile edits never change history.
        const updated = await tx.payrollRecord.updateMany({
          where: { id: rec.id, status: PayrollStatus.FINALIZED },
          data: {
            status: PayrollStatus.PAID,
            disbursementReference: reference,
            disbursedAt: now,
            disbursedAmount: configuredAmount(rec.employee.internalNotes),
            ...(input.notes?.trim() ? { notes: input.notes.trim() } : {}),
          },
        });
        updatedCount += updated.count;
      }
      if (updatedCount !== eligible.length) {
        // Rolls back the whole batch: some records were changed concurrently.
        throw new ConflictError(
          "Some payroll records were changed by another user. No disbursements were recorded; reload and try again."
        );
      }

      const periodPaid = await this.markPeriodPaidWhenComplete(tx, period.id);

      await writeAudit(tx, user, "PAYROLL_BULK_DISBURSEMENT_RECORDED", "PAYROLL_PERIOD", period.id, {
        periodCode: period.code,
        disbursementReference: reference,
        updatedCount,
        recordIds: eligible.map((r) => r.id),
        skippedNotPaidCount,
        periodPaid,
      });

      return { updatedCount, skippedNotPaidCount, periodPaid };
    });
  }

  /** Moves a FINALIZED period to PAID once no DRAFT/FINALIZED records remain. */
  private async markPeriodPaidWhenComplete(
    tx: Prisma.TransactionClient,
    periodId: string
  ): Promise<boolean> {
    const remaining = await tx.payrollRecord.count({
      where: {
        payrollPeriodId: periodId,
        status: { in: [PayrollStatus.DRAFT, PayrollStatus.FINALIZED] },
      },
    });
    if (remaining > 0) return false;
    const res = await tx.payrollPeriod.updateMany({
      where: { id: periodId, status: PayrollStatus.FINALIZED },
      data: { status: PayrollStatus.PAID },
    });
    return res.count === 1;
  }

  /**
   * Updates an employee's banking details, configured amount and Paid/Unpaid flag.
   * Never deletes payroll records and never enrolls the employee automatically.
   */
  async updateEmployeePayoutProfile(
    user: AuthenticatedUser,
    input: UpdateEmployeePayoutProfileData
  ): Promise<{ openRecordCount: number }> {
    await this.assertPayrollAccess(user);

    return prisma.$transaction(async (tx) => {
      const emp = await tx.employee.findUnique({
        where: { id: input.employeeId },
        select: { id: true, internalNotes: true },
      });
      if (!emp) {
        throw new NotFoundError("Employee not found.");
      }

      const current = parsePayoutProfile(emp.internalNotes) ?? {};
      const pick = <K extends keyof StoredPayoutInfo>(
        key: K,
        incoming: StoredPayoutInfo[K] | undefined
      ): StoredPayoutInfo[K] => (incoming !== undefined ? incoming : current[key]);

      // Amounts of unpaid employees are not sent to the browser, so an empty field coming
      // back for such an employee means "unchanged", not "clear the stored amount".
      const amountWasHidden = current.isPaid !== true && typeof current.stipendAmount === "number";
      const incomingAmount =
        input.stipendAmount === null && amountWasHidden ? undefined : input.stipendAmount;

      const updatedProfile: StoredPayoutInfo = {
        isPaid: input.isPaid,
        employmentType: pick("employmentType", input.employmentType ?? undefined),
        stipendAmount: pick("stipendAmount", incomingAmount),
        bankName: pick("bankName", input.bankName),
        accountNumber: pick("accountNumber", input.accountNumber),
        ifscCode: pick("ifscCode", input.ifscCode),
        accountHolderName: pick("accountHolderName", input.accountHolderName),
        panNumber: pick("panNumber", input.panNumber),
      };
      if (input.employmentType === null) {
        updatedProfile.employmentType = undefined;
      }

      await tx.employee.update({
        where: { id: emp.id },
        data: { internalNotes: serializePayoutProfile(emp.internalNotes, updatedProfile) },
      });

      const openRecordCount = await tx.payrollRecord.count({
        where: {
          employeeId: emp.id,
          status: { in: [PayrollStatus.DRAFT, PayrollStatus.FINALIZED] },
        },
      });

      const changedFields = (Object.keys(updatedProfile) as (keyof StoredPayoutInfo)[]).filter(
        (key) => updatedProfile[key] !== current[key]
      );

      // Sensitive identifiers are recorded only in masked form.
      await writeAudit(tx, user, "PAYROLL_PAYOUT_PROFILE_UPDATED", "EMPLOYEE_PAYOUT_PROFILE", emp.id, {
        changedFields,
        isPaid: { from: current.isPaid ?? null, to: updatedProfile.isPaid ?? null },
        accountNumber: maskIdentifier(updatedProfile.accountNumber),
        panNumber: maskIdentifier(updatedProfile.panNumber),
        openRecordCount,
      });

      return { openRecordCount };
    });
  }

  // ---------------------------------------------------------------------------
  // EXPLICIT POLICY GATES (NON-NEGOTIABLE PRESERVATION OF OD-008 / D-12)
  // ---------------------------------------------------------------------------

  /**
   * POLICY BLOCKED: Calculates gross salary, basic/HRA/allowance formulas, or net take-home pay.
   * Throws PolicyBlockedError pending product owner policy approval.
   */
  calculateGrossNetSalary(): never {
    throw new PolicyBlockedError(
      "OD-008",
      "Payroll calculation engine, salary component structure, proration formulas, and payslip generation have not been approved by the product owner. Calculation engine is strictly disabled."
    );
  }

  /**
   * POLICY BLOCKED: Calculates statutory deductions (PF, ESI, TDS, Professional Tax).
   */
  calculateStatutoryTaxes(): never {
    throw new PolicyBlockedError(
      "OD-008",
      "Statutory deduction formulas (PF, ESI, TDS, Professional Tax) without an approved compliance policy and legal validation source are strictly prohibited."
    );
  }
}

export const payrollService = new PayrollService();
