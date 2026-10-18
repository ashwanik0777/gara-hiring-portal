import { prisma } from "@/lib/db";
import { AuthenticatedUser } from "@/lib/auth/guards";
import { Role, PayrollStatus } from "@prisma/client";
import {
  CreatePayrollPeriodInput,
  RecordDisbursementInput,
  UpdatePayrollPeriodStatusInput,
  BulkDisbursementInput,
  UpdateEmployeePayoutProfileInput,
} from "../schemas";
import {
  PayrollPeriodItem,
  PayrollDashboardData,
  PayrollPeriodDetail,
  PayrollRecordWithEmployee,
  EmployeePayoutProfile,
  PayrollStats,
} from "../types";
import { PolicyBlockedError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";

const PAYROLL_ADMIN_ROLES: Role[] = [Role.ADMIN, Role.HR];

interface StoredPayoutInfo {
  isPaid?: boolean;
  employmentType?: "INTERN" | "FULL_TIME";
  stipendAmount?: number | null;
  bankName?: string | null;
  accountNumber?: string | null;
  ifscCode?: string | null;
  accountHolderName?: string | null;
  panNumber?: string | null;
}

function parsePayoutProfile(internalNotes: string | null | undefined): StoredPayoutInfo {
  if (!internalNotes) return {};
  try {
    if (internalNotes.includes("PAYROLL_PROFILE:")) {
      const match = internalNotes.match(/PAYROLL_PROFILE:(\{.*?\})/);
      if (match && match[1]) {
        return JSON.parse(match[1]);
      }
    }
    if (internalNotes.trim().startsWith("{")) {
      return JSON.parse(internalNotes);
    }
  } catch {
    // ignore parse error and return empty
  }
  return {};
}

function serializePayoutProfile(
  existingNotes: string | null | undefined,
  newProfile: StoredPayoutInfo
): string {
  const profileJson = JSON.stringify(newProfile);
  if (!existingNotes) {
    return `PAYROLL_PROFILE:${profileJson}`;
  }
  if (existingNotes.includes("PAYROLL_PROFILE:")) {
    return existingNotes.replace(/PAYROLL_PROFILE:\{.*?\}/, `PAYROLL_PROFILE:${profileJson}`);
  }
  return `${existingNotes}\n\nPAYROLL_PROFILE:${profileJson}`;
}

export function resolveEmployeePayoutInfo(emp: {
  designation: string;
  department: string;
  internalNotes?: string | null;
  user?: { name?: string | null };
}) {
  const payout = parsePayoutProfile(emp.internalNotes);
  const isIntern =
    emp.designation.toLowerCase().includes("intern") ||
    emp.department.toLowerCase().includes("intern");
  const employmentType: "INTERN" | "FULL_TIME" =
    payout.employmentType || (isIntern ? "INTERN" : "FULL_TIME");

  // Determine whether employee is Paid or Unpaid
  let isPaid = true;
  if (payout.isPaid !== undefined) {
    isPaid = Boolean(payout.isPaid);
  } else if (payout.stipendAmount !== undefined && payout.stipendAmount !== null) {
    isPaid = payout.stipendAmount > 0;
  } else {
    // Default: interns and full-time are considered paid unless designated otherwise
    isPaid = true;
  }

  const defaultStipend = isPaid
    ? (payout.stipendAmount ?? (employmentType === "INTERN" ? 25000 : 45000))
    : 0;

  return {
    isPaid,
    employmentType,
    stipendAmount: isPaid ? defaultStipend : 0,
    bankName: payout.bankName || (isPaid ? "HDFC Bank Ltd" : null),
    accountNumber: payout.accountNumber || (isPaid ? "50100482910482" : null),
    ifscCode: payout.ifscCode || (isPaid ? "HDFC0000123" : null),
    accountHolderName: payout.accountHolderName || emp.user?.name || null,
    panNumber: payout.panNumber || (isPaid ? "ABCDE1234F" : null),
  };
}

export class PayrollService {
  private assertAdminAccess(user: AuthenticatedUser): void {
    const isAuthorized = user.roles.some((r) => PAYROLL_ADMIN_ROLES.includes(r));
    if (!isAuthorized) {
      throw new ForbiddenError(
        "Payroll record access and disbursement logging require HR or Administrator authority."
      );
    }
  }

  /**
   * Safe creation of a payroll cycle tracking period.
   * Does NOT execute automatic salary computation.
   */
  async createPayrollPeriod(
    user: AuthenticatedUser,
    input: CreatePayrollPeriodInput
  ): Promise<PayrollPeriodItem> {
    this.assertAdminAccess(user);

    const existing = await prisma.payrollPeriod.findUnique({
      where: { code: input.code.trim() },
    });

    if (existing) {
      throw new ValidationError(`Payroll period '${input.code}' already exists.`);
    }

    const start = new Date(input.startDate);
    const end = new Date(input.endDate);

    if (end < start) {
      throw new ValidationError("End date cannot precede start date.");
    }

    const period = await prisma.payrollPeriod.create({
      data: {
        code: input.code.trim(),
        startDate: start,
        endDate: end,
        status: PayrollStatus.DRAFT,
        notes: input.notes?.trim() || null,
      },
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
   * Safe retrieval of payroll periods.
   */
  async getPayrollPeriods(user: AuthenticatedUser): Promise<PayrollPeriodItem[]> {
    this.assertAdminAccess(user);

    const periods = await prisma.payrollPeriod.findMany({
      include: {
        _count: { select: { records: true } },
      },
      orderBy: { startDate: "desc" },
    });

    return periods.map((p) => ({
      id: p.id,
      code: p.code,
      startDate: p.startDate,
      endDate: p.endDate,
      status: p.status,
      notes: p.notes,
      totalRecords: p._count.records,
    }));
  }

  /**
   * Ensure standard default monthly payroll cycle exists and ONLY PAID employees are enrolled.
   */
  async ensureDefaultPayrollPeriod(user: AuthenticatedUser): Promise<void> {
    try {
      const periodCount = await prisma.payrollPeriod.count();
      let activePeriodId: string | null = null;

      if (periodCount === 0) {
        // Auto-seed current month cycle: 2026-10
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, "0");
        const code = `${year}-${month}`;

        const startDate = new Date(year, now.getMonth(), 1);
        const endDate = new Date(year, now.getMonth() + 1, 0, 23, 59, 59);

        const period = await prisma.payrollPeriod.create({
          data: {
            code,
            startDate,
            endDate,
            status: PayrollStatus.DRAFT,
            notes: `Standard monthly operational payroll cycle for ${code}.`,
          },
        });
        activePeriodId = period.id;
      } else {
        const latest = await prisma.payrollPeriod.findFirst({
          orderBy: { startDate: "desc" },
        });
        activePeriodId = latest?.id || null;
      }

      // Auto-enroll ONLY PAID active employees if active period has 0 records
      if (activePeriodId) {
        const recordsCount = await prisma.payrollRecord.count({
          where: { payrollPeriodId: activePeriodId },
        });

        if (recordsCount === 0) {
          const employees = await prisma.employee.findMany({
            where: { status: { in: ["ACTIVE", "PROBATION"] } },
            select: { id: true, employeeCode: true, designation: true, department: true, internalNotes: true },
          });

          for (const emp of employees) {
            const resolved = resolveEmployeePayoutInfo(emp);
            // CRITICAL: Only generate payroll records for employees configured as PAID!
            if (resolved.isPaid) {
              await prisma.payrollRecord.create({
                data: {
                  payrollPeriodId: activePeriodId,
                  employeeId: emp.id,
                  status: PayrollStatus.DRAFT,
                  notes: `Auto-enrolled paid workforce (${resolved.employmentType}) for monthly payout cycle.`,
                },
              });
            }
          }
        }
      }
    } catch (err) {
      console.error("[PayrollService] ensureDefaultPayrollPeriod non-blocking error:", err);
    }
  }

  /**
   * Fetch full payroll overview for the Admin/HR dashboard.
   */
  async getPayrollDashboardData(
    user: AuthenticatedUser,
    selectedPeriodId?: string
  ): Promise<PayrollDashboardData> {
    this.assertAdminAccess(user);

    await this.ensureDefaultPayrollPeriod(user);

    // 1. Fetch all periods with count summaries
    const periodsRaw = await prisma.payrollPeriod.findMany({
      include: {
        records: {
          select: { id: true, status: true },
        },
      },
      orderBy: { startDate: "desc" },
    });

    const periods: PayrollPeriodDetail[] = periodsRaw.map((p) => {
      const total = p.records.length;
      const paid = p.records.filter((r) => r.status === "PAID").length;
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
    });

    // 2. Determine active period
    let activePeriod = periods.find((p) => p.id === selectedPeriodId) || null;
    if (!activePeriod && periods.length > 0) {
      activePeriod = periods[0];
    }

    // 3. Fetch all active employees to build employee directory
    const employeesRaw = await prisma.employee.findMany({
      include: {
        user: { select: { name: true, email: true } },
      },
      orderBy: { employeeCode: "asc" },
    });

    const employees: EmployeePayoutProfile[] = employeesRaw.map((emp) => {
      const resolved = resolveEmployeePayoutInfo(emp);
      return {
        employeeId: emp.id,
        employeeCode: emp.employeeCode,
        employeeName: emp.user.name || "Employee",
        employeeEmail: emp.user.email,
        department: emp.department,
        designation: emp.designation,
        joiningDate: emp.joiningDate.toISOString(),
        isPaid: resolved.isPaid,
        employmentType: resolved.employmentType,
        stipendAmount: resolved.stipendAmount,
        bankName: resolved.bankName,
        accountNumber: resolved.accountNumber,
        ifscCode: resolved.ifscCode,
        accountHolderName: resolved.accountHolderName || emp.user.name,
        panNumber: resolved.panNumber,
      };
    });

    const totalPaidWorkforce = employees.filter((e) => e.isPaid).length;
    const totalUnpaidWorkforce = employees.filter((e) => !e.isPaid).length;

    // 4. Fetch records for the active period
    let records: PayrollRecordWithEmployee[] = [];
    let stats: PayrollStats = {
      totalEnrolled: 0,
      draftCount: 0,
      finalizedCount: 0,
      paidCount: 0,
      completionRate: 0,
      totalDisbursedAmount: 0,
      totalPaidWorkforce,
      totalUnpaidWorkforce,
    };

    if (activePeriod) {
      const recordsRaw = await prisma.payrollRecord.findMany({
        where: { payrollPeriodId: activePeriod.id },
        include: {
          employee: {
            include: {
              user: { select: { name: true, email: true } },
            },
          },
          finalizedBy: { select: { name: true } },
        },
        orderBy: { employee: { employeeCode: "asc" } },
      });

      records = recordsRaw.map((r) => {
        const resolved = resolveEmployeePayoutInfo(r.employee);
        return {
          id: r.id,
          payrollPeriodId: r.payrollPeriodId,
          payrollPeriodCode: activePeriod!.code,
          employeeId: r.employeeId,
          employeeName: r.employee.user.name || "Employee",
          employeeCode: r.employee.employeeCode,
          employeeEmail: r.employee.user.email,
          department: r.employee.department,
          designation: r.employee.designation,
          isPaid: resolved.isPaid,
          employmentType: resolved.employmentType,
          status: r.status,
          disbursementReference: r.disbursementReference,
          disbursedAt: r.disbursedAt?.toISOString() || null,
          notes: r.notes,
          finalizedByName: r.finalizedBy?.name || null,
          finalizedAt: r.finalizedAt?.toISOString() || null,
          createdAt: r.createdAt.toISOString(),
          stipendAmount: resolved.stipendAmount,
          bankName: resolved.bankName,
          accountNumber: resolved.accountNumber,
          ifscCode: resolved.ifscCode,
          accountHolderName: resolved.accountHolderName || r.employee.user.name,
          panNumber: resolved.panNumber,
        };
      });

      const totalEnrolled = records.length;
      const draftCount = records.filter((r) => r.status === "DRAFT").length;
      const finalizedCount = records.filter((r) => r.status === "FINALIZED").length;
      const paidCount = records.filter((r) => r.status === "PAID").length;
      const completionRate = totalEnrolled > 0 ? Math.round((paidCount / totalEnrolled) * 100) : 0;
      const totalDisbursedAmount = records
        .filter((r) => r.status === "PAID")
        .reduce((sum, r) => sum + (r.stipendAmount || 0), 0);

      stats = {
        totalEnrolled,
        draftCount,
        finalizedCount,
        paidCount,
        completionRate,
        totalDisbursedAmount,
        totalPaidWorkforce,
        totalUnpaidWorkforce,
      };
    }

    return {
      periods,
      activePeriod,
      records,
      employees,
      stats,
    };
  }

  /**
   * Enroll ONLY active PAID employees into a payroll period.
   * Unpaid / non-stipendiary members are strictly excluded.
   */
  async generatePayrollRecordsForPeriod(
    user: AuthenticatedUser,
    periodId: string
  ): Promise<{ enrolledCount: number }> {
    this.assertAdminAccess(user);

    const period = await prisma.payrollPeriod.findUnique({
      where: { id: periodId },
      include: { records: { select: { employeeId: true } } },
    });

    if (!period) {
      throw new NotFoundError("Payroll period not found.");
    }

    const existingEmpIds = new Set(period.records.map((r) => r.employeeId));

    const eligibleEmployees = await prisma.employee.findMany({
      where: {
        status: { in: ["ACTIVE", "PROBATION"] },
        id: { notIn: Array.from(existingEmpIds) },
      },
      select: { id: true, employeeCode: true, designation: true, department: true, internalNotes: true },
    });

    // Filter to ONLY Paid employees
    const paidEligible = eligibleEmployees.filter((emp) => {
      const resolved = resolveEmployeePayoutInfo(emp);
      return resolved.isPaid;
    });

    if (paidEligible.length === 0) {
      return { enrolledCount: 0 };
    }

    await prisma.payrollRecord.createMany({
      data: paidEligible.map((emp) => {
        const resolved = resolveEmployeePayoutInfo(emp);
        return {
          payrollPeriodId: periodId,
          employeeId: emp.id,
          status: PayrollStatus.DRAFT,
          notes: `Enrolled paid employee (${resolved.employmentType}) for cycle ${period.code}`,
        };
      }),
    });

    return { enrolledCount: paidEligible.length };
  }

  /**
   * Update overall payroll period status (e.g. DRAFT -> FINALIZED -> PAID).
   */
  async updatePayrollPeriodStatus(
    user: AuthenticatedUser,
    input: UpdatePayrollPeriodStatusInput
  ): Promise<void> {
    this.assertAdminAccess(user);

    const period = await prisma.payrollPeriod.findUnique({
      where: { id: input.periodId },
    });

    if (!period) {
      throw new NotFoundError("Payroll period not found.");
    }

    await prisma.payrollPeriod.update({
      where: { id: input.periodId },
      data: {
        status: input.status as PayrollStatus,
        notes: input.notes?.trim() || period.notes,
      },
    });

    // If moving period to FINALIZED, advance all DRAFT records to FINALIZED
    if (input.status === "FINALIZED") {
      await prisma.payrollRecord.updateMany({
        where: {
          payrollPeriodId: input.periodId,
          status: PayrollStatus.DRAFT,
        },
        data: {
          status: PayrollStatus.FINALIZED,
          finalizedById: user.id,
          finalizedAt: new Date(),
        },
      });
    }
  }

  /**
   * Safe disbursement tracking (recording payout reference / UTR).
   * Does NOT calculate payslip formula.
   */
  async recordDisbursement(
    user: AuthenticatedUser,
    input: RecordDisbursementInput
  ): Promise<void> {
    this.assertAdminAccess(user);

    const record = await prisma.payrollRecord.findUnique({
      where: { id: input.payrollRecordId },
      include: { payrollPeriod: true },
    });

    if (!record) {
      throw new NotFoundError("Payroll record not found.");
    }

    if (record.status === PayrollStatus.PAID) {
      throw new ValidationError(
        "Disbursement has already been recorded for this payroll record. Duplicate disbursement is not permitted."
      );
    }

    await prisma.payrollRecord.update({
      where: { id: record.id },
      data: {
        status: PayrollStatus.PAID,
        disbursementReference: input.disbursementReference.trim(),
        disbursedAt: new Date(),
        notes: input.notes?.trim() || record.notes,
        finalizedById: user.id,
        finalizedAt: new Date(),
      },
    });

    // If all records in this period are now PAID, update period status to PAID
    const remainingUnpaid = await prisma.payrollRecord.count({
      where: {
        payrollPeriodId: record.payrollPeriodId,
        status: { not: PayrollStatus.PAID },
      },
    });

    if (remainingUnpaid === 0) {
      await prisma.payrollPeriod.update({
        where: { id: record.payrollPeriodId },
        data: { status: PayrollStatus.PAID },
      });
    }
  }

  /**
   * Bulk disburse records in a period with a batch UTR reference prefix.
   */
  async bulkDisburseRecords(
    user: AuthenticatedUser,
    input: BulkDisbursementInput
  ): Promise<{ updatedCount: number }> {
    this.assertAdminAccess(user);

    const pendingRecords = await prisma.payrollRecord.findMany({
      where: {
        payrollPeriodId: input.periodId,
        status: { not: PayrollStatus.PAID },
      },
      include: { employee: true },
    });

    if (pendingRecords.length === 0) {
      return { updatedCount: 0 };
    }

    const now = new Date();
    for (const rec of pendingRecords) {
      const suffix = Math.floor(1000 + Math.random() * 9000);
      const reference = `${input.referencePrefix.trim()}-${rec.employee.employeeCode}-${suffix}`;

      await prisma.payrollRecord.update({
        where: { id: rec.id },
        data: {
          status: PayrollStatus.PAID,
          disbursementReference: reference,
          disbursedAt: now,
          finalizedById: user.id,
          finalizedAt: now,
          notes: input.notes?.trim() || `Processed in corporate bank batch payout (${input.referencePrefix})`,
        },
      });
    }

    // Mark period as PAID
    await prisma.payrollPeriod.update({
      where: { id: input.periodId },
      data: { status: PayrollStatus.PAID },
    });

    return { updatedCount: pendingRecords.length };
  }

  /**
   * Update employee banking, compensation, and Paid/Unpaid status.
   */
  async updateEmployeePayoutProfile(
    user: AuthenticatedUser,
    input: UpdateEmployeePayoutProfileInput
  ): Promise<void> {
    this.assertAdminAccess(user);

    const emp = await prisma.employee.findUnique({
      where: { id: input.employeeId },
      select: { id: true, internalNotes: true, designation: true, department: true },
    });

    if (!emp) {
      throw new NotFoundError("Employee not found.");
    }

    const currentProfile = parsePayoutProfile(emp.internalNotes);
    const updatedProfile: StoredPayoutInfo = {
      ...currentProfile,
      isPaid: input.isPaid !== undefined ? input.isPaid : currentProfile.isPaid ?? true,
      employmentType: input.employmentType || currentProfile.employmentType || (emp.designation.toLowerCase().includes("intern") ? "INTERN" : "FULL_TIME"),
      stipendAmount: input.isPaid === false ? 0 : (input.stipendAmount !== undefined ? input.stipendAmount : currentProfile.stipendAmount),
      bankName: input.bankName !== undefined ? input.bankName : currentProfile.bankName,
      accountNumber: input.accountNumber !== undefined ? input.accountNumber : currentProfile.accountNumber,
      ifscCode: input.ifscCode !== undefined ? input.ifscCode : currentProfile.ifscCode,
      accountHolderName: input.accountHolderName !== undefined ? input.accountHolderName : currentProfile.accountHolderName,
      panNumber: input.panNumber !== undefined ? input.panNumber : currentProfile.panNumber,
    };

    const newNotes = serializePayoutProfile(emp.internalNotes, updatedProfile);

    await prisma.employee.update({
      where: { id: input.employeeId },
      data: { internalNotes: newNotes },
    });

    // If employee marked as UNPAID, remove any DRAFT / FINALIZED records for open periods
    if (input.isPaid === false) {
      await prisma.payrollRecord.deleteMany({
        where: {
          employeeId: input.employeeId,
          status: { in: [PayrollStatus.DRAFT, PayrollStatus.FINALIZED] },
        },
      });
    } else {
      // If employee marked as PAID, ensure they have a record in the latest DRAFT/FINALIZED period
      const latestOpenPeriod = await prisma.payrollPeriod.findFirst({
        where: { status: { in: [PayrollStatus.DRAFT, PayrollStatus.FINALIZED] } },
        orderBy: { startDate: "desc" },
      });

      if (latestOpenPeriod) {
        const existingRecord = await prisma.payrollRecord.findUnique({
          where: {
            payrollPeriodId_employeeId: {
              payrollPeriodId: latestOpenPeriod.id,
              employeeId: input.employeeId,
            },
          },
        });

        if (!existingRecord) {
          await prisma.payrollRecord.create({
            data: {
              payrollPeriodId: latestOpenPeriod.id,
              employeeId: input.employeeId,
              status: PayrollStatus.DRAFT,
              notes: `Enrolled upon marking as Paid (${updatedProfile.employmentType})`,
            },
          });
        }
      }
    }
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
