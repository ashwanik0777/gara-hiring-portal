import { prisma } from "@/lib/db";
import { AuthenticatedUser } from "@/lib/auth/guards";
import { Role, PayrollStatus } from "@prisma/client";
import {
  CreatePayrollPeriodInput,
  RecordDisbursementInput,
} from "../schemas";
import { PayrollPeriodItem } from "../types";
import { PolicyBlockedError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";

const PAYROLL_ADMIN_ROLES: Role[] = [Role.ADMIN, Role.HR];

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
   * Safe disbursement tracking (recording payout reference).
   * Does NOT calculate payslip breakdown.
   */
  async recordDisbursement(
    user: AuthenticatedUser,
    input: RecordDisbursementInput
  ): Promise<void> {
    this.assertAdminAccess(user);

    const record = await prisma.payrollRecord.findUnique({
      where: { id: input.payrollRecordId },
    });

    if (!record) {
      throw new NotFoundError("Payroll record not found.");
    }

    if (record.status === PayrollStatus.PAID) {
      throw new ValidationError("Disbursement has already been recorded for this payroll record. Duplicate disbursement is not permitted.");
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
