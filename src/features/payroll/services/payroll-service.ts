import { PAYROLL_STAFF_ROLES } from "../roles";
import { buildPayrollRegisterCsv } from "../format";
import { prisma } from "@/lib/db";
import { assertPermission, hasPermission, type AuthenticatedUser } from "@/lib/auth/guards";
import { payoutFieldEncryptor } from "@/lib/security/field-encryption";
import { Prisma, Role, PayrollStatus, EmployeeStatus } from "@prisma/client";
import {
  MY_PAYROLL_PAGE_SIZE,
  PAYROLL_DIRECTORY_PAGE_SIZE,
  PAYROLL_EXPORT_MAX_ROWS,
  PAYROLL_MAX_PAGE_SIZE,
  PAYROLL_PERIODS_PAGE_SIZE,
  PAYROLL_RECORDS_PAGE_SIZE,
  type CreatePayrollPeriodData,
  type RecordDisbursementData,
  type UpdatePayrollPeriodStatusData,
  type BulkDisbursementData,
  type UpdateEmployeePayoutProfileData,
  type ExportPayrollRegisterData,
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
  PayrollRegisterExport,
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
// Payout details live in `EmployeePayoutProfile` (one row per employee, written only
// here, behind `canPayroll`). The account number and PAN are stored AES-256-GCM
// encrypted (`*Encrypted`) next to their last four characters (`*Last4`), which is all
// any read path selects. A missing row or a null column means "Not configured" — never
// replaced with defaults.
// -----------------------------------------------------------------------------

/**
 * Browser-safe payout columns. Read paths select exactly these: the encrypted account
 * number and PAN are never read back for display.
 */
export const payoutReadSelect = {
  isPaid: true,
  employmentType: true,
  stipendAmount: true,
  bankName: true,
  accountNumberLast4: true,
  ifscCode: true,
  accountHolderName: true,
  panLast4: true,
} satisfies Prisma.EmployeePayoutProfileSelect;

export type PayoutProfileRow = Prisma.EmployeePayoutProfileGetPayload<{ select: typeof payoutReadSelect }>;

/** Paid flag and amount only: what enrolment and disbursement need. */
const payoutEligibilitySelect = {
  isPaid: true,
  stipendAmount: true,
} satisfies Prisma.EmployeePayoutProfileSelect;

type PayoutEligibilityRow = Prisma.EmployeePayoutProfileGetPayload<{ select: typeof payoutEligibilitySelect }>;

export type PayoutIdentifierField = "accountNumber" | "pan";

/**
 * Additional authenticated data of an encrypted identifier: a ciphertext only decrypts
 * for the employee and column it was written for.
 */
export function payoutFieldContext(employeeId: string, field: PayoutIdentifierField): string {
  return `employee-payout:${employeeId}:${field}`;
}

/** Masked display from the stored last four characters (`•••• 1234`); null when unset. */
export function maskFromLast4(last4: string | null | undefined): string | null {
  const compact = last4?.replace(/\s+/g, "");
  return compact ? `•••• ${compact}` : null;
}

function nonEmpty(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function decimalOrNull(value: Prisma.Decimal | null | undefined): number | null {
  return value === null || value === undefined ? null : value.toNumber();
}

const NOT_CONFIGURED_PAYOUT: MaskedPayoutDetails = {
  isPaid: null,
  employmentType: null,
  stipendAmount: null,
  bankName: null,
  accountNumberMasked: null,
  ifscCode: null,
  accountHolderName: null,
  panMasked: null,
};

/**
 * Resolves the browser-safe payout view of an employee. Unset values are `null`
 * ("Not configured"); account numbers and PANs are masked from their last four.
 */
export function resolveEmployeePayoutInfo(profile: PayoutProfileRow | null | undefined): MaskedPayoutDetails {
  if (!profile) {
    return { ...NOT_CONFIGURED_PAYOUT };
  }
  return {
    isPaid: profile.isPaid,
    employmentType: profile.employmentType ?? null,
    // Amounts of unpaid employees are not shown.
    stipendAmount: profile.isPaid ? decimalOrNull(profile.stipendAmount) : null,
    bankName: nonEmpty(profile.bankName),
    accountNumberMasked: maskFromLast4(profile.accountNumberLast4),
    ifscCode: nonEmpty(profile.ifscCode),
    accountHolderName: nonEmpty(profile.accountHolderName),
    panMasked: maskFromLast4(profile.panLast4),
  };
}

/** Configured payout amount at this moment, or null when not recorded. */
function configuredAmount(profile: PayoutEligibilityRow | null | undefined): number | null {
  return decimalOrNull(profile?.stipendAmount);
}

function isConfiguredAsPaid(profile: PayoutEligibilityRow | null | undefined): boolean {
  return profile?.isPaid === true;
}

interface SealedIdentifier {
  encrypted: string | null;
  last4: string | null;
}

/**
 * Prepares an identifier write: `undefined` keeps the stored value, `null` clears both
 * columns, a value is encrypted (throws FieldEncryptionUnavailableError in production
 * without PAYOUT_ENCRYPTION_KEY) and its last four characters kept for display.
 */
function sealIdentifier(
  employeeId: string,
  field: PayoutIdentifierField,
  value: string | null | undefined
): SealedIdentifier | undefined {
  if (value === undefined) return undefined;
  if (value === null) return { encrypted: null, last4: null };
  const compact = value.replace(/\s+/g, "");
  return {
    encrypted: payoutFieldEncryptor.encrypt(compact, payoutFieldContext(employeeId, field)),
    last4: compact.slice(-4),
  };
}

/** Employees configured as paid in their payout profile (SQL relation filter). */
const PAID_PROFILE_WHERE: Prisma.EmployeeWhereInput = { payoutProfile: { is: { isPaid: true } } };

/**
 * Names of the payout fields a save changed, for the audit entry. A newly entered
 * account number or PAN always counts as a change (stored values are never decrypted
 * to compare); clearing counts only when a value was stored.
 */
function changedPayoutFields(
  before: PayoutProfileRow | null,
  after: PayoutProfileRow,
  identifiers: { accountNumber?: SealedIdentifier; pan?: SealedIdentifier }
): string[] {
  const changed: string[] = [];
  if (before?.isPaid !== after.isPaid) changed.push("isPaid");
  if ((before?.employmentType ?? null) !== (after.employmentType ?? null)) changed.push("employmentType");
  if (decimalOrNull(before?.stipendAmount) !== decimalOrNull(after.stipendAmount)) changed.push("stipendAmount");
  for (const key of ["bankName", "ifscCode", "accountHolderName"] as const) {
    if ((before?.[key] ?? null) !== (after[key] ?? null)) changed.push(key);
  }
  const identifierChanged = (sealed: SealedIdentifier | undefined, storedLast4: string | null | undefined) =>
    sealed !== undefined && (sealed.encrypted !== null || (storedLast4 ?? null) !== null);
  if (identifierChanged(identifiers.accountNumber, before?.accountNumberLast4)) changed.push("accountNumber");
  if (identifierChanged(identifiers.pan, before?.panLast4)) changed.push("panNumber");
  return changed;
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
 * Register row. The payout profile is joined with its browser-safe columns only, inside
 * the `canPayroll`-gated dashboard and export; identifiers leave the server masked.
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
      payoutProfile: { select: payoutReadSelect },
      user: { select: { name: true, email: true } },
    },
  },
  finalizedBy: { select: { name: true } },
} satisfies Prisma.PayrollRecordSelect;

type RecordRow = Prisma.PayrollRecordGetPayload<{ select: typeof recordSelect }>;

const directorySelect = {
  id: true,
  employeeCode: true,
  department: true,
  designation: true,
  joiningDate: true,
  payoutProfile: { select: payoutReadSelect },
  user: { select: { name: true, email: true } },
} satisfies Prisma.EmployeeSelect;

type StatusGroup = { status: PayrollStatus; _count: { _all: number } };
type PeriodStatusGroup = StatusGroup & { payrollPeriodId: string };
type PaidFlagGroup = { isPaid: boolean; _count: { _all: number } };

const recordOrderBy: Prisma.PayrollRecordOrderByWithRelationInput[] = [
  { employee: { employeeCode: "asc" } },
  { id: "asc" },
];

/** Masked payout view of a register row; PAID rows report the disbursement snapshot. */
function toRegisterPayout(r: RecordRow): MaskedPayoutDetails {
  const payout = resolveEmployeePayoutInfo(r.employee.payoutProfile);
  // PAID records report the amount snapshotted at disbursement, never the current profile.
  return r.status === PayrollStatus.PAID
    ? { ...payout, stipendAmount: r.disbursedAmount == null ? null : r.disbursedAmount.toNumber() }
    : payout;
}

function buildRecordWhere(
  periodId: string,
  query: Pick<PayrollDashboardQueryInput, "status" | "search" | "type">
): Prisma.PayrollRecordWhereInput {
  const search = query.search?.trim();
  return {
    payrollPeriodId: periodId,
    ...(query.status ? { status: query.status } : {}),
    // The employment category lives in the payout profile: filtered with a join.
    ...(query.type ? { employee: { payoutProfile: { is: { employmentType: query.type } } } } : {}),
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
      paidFlagGroups,
      unconfiguredWorkforce,
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
            orderBy: recordOrderBy,
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
      // Workforce paid / unpaid / not configured, counted in PostgreSQL over every employee.
      prisma.employeePayoutProfile.groupBy({ by: ["isPaid"], _count: { _all: true } }),
      prisma.employee.count({ where: { payoutProfile: { is: null } } }),
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
          ...toRegisterPayout(r),
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
      ...resolveEmployeePayoutInfo(emp.payoutProfile),
    }));

    return {
      periods,
      periodsPage: toPageInfo(periodPaging.page, periodPaging.pageSize, periodsTotal),
      activePeriod,
      records,
      recordsPage: toPageInfo(recordPaging.page, recordPaging.pageSize, recordsTotal),
      recordFilters: { status: query.status, search: query.search?.trim() || undefined, type: query.type },
      employees,
      employeesPage: toPageInfo(directoryPaging.page, directoryPaging.pageSize, directoryTotal),
      directorySearch: query.directorySearch?.trim() || undefined,
      stats: this.buildStats(
        statusGroups as StatusGroup[],
        paidSum?._sum.disbursedAmount ?? null,
        paidRecordsWithoutAmount,
        paidFlagGroups as PaidFlagGroup[],
        unconfiguredWorkforce
      ),
    };
  }

  /** Active-period counts from `groupBy` / `aggregate`; workforce flags from the payout profile `groupBy`. */
  private buildStats(
    statusGroups: StatusGroup[],
    disbursedSum: Prisma.Decimal | null,
    paidRecordsWithoutAmount: number,
    paidFlagGroups: PaidFlagGroup[],
    unconfiguredWorkforce: number
  ): PayrollStats {
    const count = (status: PayrollStatus) =>
      statusGroups.find((g) => g.status === status)?._count._all ?? 0;
    const totalEnrolled = statusGroups.reduce((sum, g) => sum + g._count._all, 0);
    const paidCount = count(PayrollStatus.PAID);
    const workforce = (isPaid: boolean) =>
      paidFlagGroups.find((g) => g.isPaid === isPaid)?._count._all ?? 0;
    return {
      totalEnrolled,
      draftCount: count(PayrollStatus.DRAFT),
      finalizedCount: count(PayrollStatus.FINALIZED),
      paidCount,
      voidCount: count(PayrollStatus.VOID),
      completionRate: totalEnrolled > 0 ? Math.round((paidCount / totalEnrolled) * 100) : 0,
      totalDisbursedAmount: disbursedSum ? disbursedSum.toNumber() : 0,
      paidRecordsWithoutAmount,
      totalPaidWorkforce: workforce(true),
      totalUnpaidWorkforce: workforce(false),
      totalUnconfiguredWorkforce: unconfiguredWorkforce,
    };
  }

  /**
   * Register CSV of one period with the register's filters (status, search, employment
   * category), read in SQL up to PAYROLL_EXPORT_MAX_ROWS. Identifiers are masked from
   * their last four characters; the export is audited.
   */
  async exportPayrollRegister(
    user: AuthenticatedUser,
    input: ExportPayrollRegisterData
  ): Promise<PayrollRegisterExport> {
    await this.assertPayrollAccess(user);

    const period = await prisma.payrollPeriod.findUnique({
      where: { id: input.periodId },
      select: { id: true, code: true },
    });
    if (!period) {
      throw new NotFoundError("Payroll period not found.");
    }

    // One row more than the limit detects truncation.
    const rows = await prisma.payrollRecord.findMany({
      where: buildRecordWhere(period.id, input),
      select: recordSelect,
      orderBy: recordOrderBy,
      take: PAYROLL_EXPORT_MAX_ROWS + 1,
    });
    const truncated = rows.length > PAYROLL_EXPORT_MAX_ROWS;
    const exported = truncated ? rows.slice(0, PAYROLL_EXPORT_MAX_ROWS) : rows;

    const csvContent = buildPayrollRegisterCsv(
      exported.map((r) => {
        const payout = toRegisterPayout(r);
        return {
          employeeCode: r.employee.employeeCode,
          employeeName: r.employee.user.name || "Employee",
          accountHolderName: payout.accountHolderName,
          bankName: payout.bankName,
          accountNumberMasked: payout.accountNumberMasked,
          ifscCode: payout.ifscCode,
          stipendAmount: payout.stipendAmount,
          employmentType: payout.employmentType,
          disbursementReference: r.disbursementReference,
          status: r.status,
        };
      })
    );

    await writeAudit(prisma, user, "PAYROLL_REGISTER_EXPORTED", "PAYROLL_PERIOD", period.id, {
      periodCode: period.code,
      filters: {
        status: input.status ?? null,
        search: input.search?.trim() || null,
        type: input.type ?? null,
      },
      rowCount: exported.length,
      truncated,
    });

    return {
      filename: `Payroll_Register_${period.code}.csv`,
      csvContent,
      rowCount: exported.length,
      truncated,
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
        payoutProfile: { select: payoutReadSelect },
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
      payout: resolveEmployeePayoutInfo(employee.payoutProfile),
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
        select: { id: true, code: true },
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

      // Eligibility is decided in SQL: enrollable status, not yet in this period, and a
      // payout profile configured as paid. Employees without a profile are only counted.
      const notYetEnrolled: Prisma.EmployeeWhereInput = {
        status: { in: ENROLLABLE_EMPLOYEE_STATUSES },
        payrollRecords: { none: { payrollPeriodId: period.id } },
      };
      const paidEligible = await tx.employee.findMany({
        where: { ...notYetEnrolled, ...PAID_PROFILE_WHERE },
        select: { id: true },
        orderBy: { id: "asc" },
      });
      const skippedUnconfiguredCount = await tx.employee.count({
        where: { ...notYetEnrolled, payoutProfile: { is: null } },
      });

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
          employee: { select: { payoutProfile: { select: payoutEligibilitySelect } } },
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
      if (!isConfiguredAsPaid(record.employee.payoutProfile)) {
        throw new ValidationError(
          "This employee's payout profile is not configured as paid. Update the payout profile first."
        );
      }
      const disbursedAmount = configuredAmount(record.employee.payoutProfile);

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

      const finalizedWhere: Prisma.PayrollRecordWhereInput = {
        payrollPeriodId: period.id,
        status: PayrollStatus.FINALIZED,
      };
      const finalizedCount = await tx.payrollRecord.count({ where: finalizedWhere });
      if (finalizedCount === 0) {
        throw new ValidationError(
          "No FINALIZED payroll records are awaiting disbursement in this period."
        );
      }

      // Only records of employees configured as paid (SQL join), with their amounts.
      const eligible = await tx.payrollRecord.findMany({
        where: { ...finalizedWhere, employee: PAID_PROFILE_WHERE },
        select: { id: true, employee: { select: { payoutProfile: { select: payoutEligibilitySelect } } } },
        orderBy: { id: "asc" },
      });
      const skippedNotPaidCount = finalizedCount - eligible.length;
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
            disbursedAmount: configuredAmount(rec.employee.payoutProfile),
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

    // Identifiers are encrypted before any database work, so a refused encryption
    // (production without PAYOUT_ENCRYPTION_KEY) never leaves a partial save behind.
    const accountNumber = sealIdentifier(input.employeeId, "accountNumber", input.accountNumber);
    const pan = sealIdentifier(input.employeeId, "pan", input.panNumber);

    return prisma.$transaction(async (tx) => {
      const emp = await tx.employee.findUnique({
        where: { id: input.employeeId },
        select: { id: true, payoutProfile: { select: payoutReadSelect } },
      });
      if (!emp) {
        throw new NotFoundError("Employee not found.");
      }
      const current = emp.payoutProfile;

      // Amounts of unpaid employees are not sent to the browser, so an empty field coming
      // back for such an employee means "unchanged", not "clear the stored amount".
      const amountWasHidden = current !== null && !current.isPaid && current.stipendAmount !== null;
      const incomingAmount =
        input.stipendAmount === null && amountWasHidden ? undefined : input.stipendAmount;

      // `undefined` keeps the stored column; `null` clears it (both columns of an identifier).
      const fields: Omit<Prisma.EmployeePayoutProfileUncheckedCreateInput, "employeeId"> = {
        isPaid: input.isPaid,
        updatedById: user.id,
        ...(input.employmentType !== undefined ? { employmentType: input.employmentType } : {}),
        ...(incomingAmount !== undefined ? { stipendAmount: incomingAmount } : {}),
        ...(input.bankName !== undefined ? { bankName: input.bankName } : {}),
        ...(input.ifscCode !== undefined ? { ifscCode: input.ifscCode } : {}),
        ...(input.accountHolderName !== undefined ? { accountHolderName: input.accountHolderName } : {}),
        ...(accountNumber
          ? { accountNumberEncrypted: accountNumber.encrypted, accountNumberLast4: accountNumber.last4 }
          : {}),
        ...(pan ? { panEncrypted: pan.encrypted, panLast4: pan.last4 } : {}),
      };

      const saved = await tx.employeePayoutProfile.upsert({
        where: { employeeId: emp.id },
        create: { employeeId: emp.id, ...fields },
        update: fields,
        select: payoutReadSelect,
      });

      const openRecordCount = await tx.payrollRecord.count({
        where: {
          employeeId: emp.id,
          status: { in: [PayrollStatus.DRAFT, PayrollStatus.FINALIZED] },
        },
      });

      // Sensitive identifiers are recorded only in masked form.
      await writeAudit(tx, user, "PAYROLL_PAYOUT_PROFILE_UPDATED", "EMPLOYEE_PAYOUT_PROFILE", emp.id, {
        changedFields: changedPayoutFields(current, saved, { accountNumber, pan }),
        created: current === null,
        isPaid: { from: current?.isPaid ?? null, to: saved.isPaid },
        accountNumber: maskFromLast4(saved.accountNumberLast4),
        panNumber: maskFromLast4(saved.panLast4),
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
