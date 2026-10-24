"use server";

import { revalidatePath } from "next/cache";
import type { ZodError } from "zod";
import { requireAuth } from "@/lib/auth/guards";
import { toActionError } from "@/lib/errors";
import { payrollService } from "./services/payroll-service";
import {
  CreatePayrollPeriodSchema,
  RecordDisbursementSchema,
  UpdatePayrollPeriodStatusSchema,
  BulkDisbursementSchema,
  UpdateEmployeePayoutProfileSchema,
  GeneratePayrollRecordsSchema,
  type CreatePayrollPeriodInput,
  type RecordDisbursementInput,
  type UpdatePayrollPeriodStatusInput,
  type BulkDisbursementInput,
  type UpdateEmployeePayoutProfileInput,
  type GeneratePayrollRecordsInput,
} from "./schemas";
import type { PayrollPeriodItem } from "./types";

// Every action authenticates here, validates its (untrusted) input with zod, and the
// service enforces role + `canPayroll` (ADMIN always passes) before any read or write.

type ActionResult<T = undefined> =
  | { success: true; data: T }
  | { success: false; error: string };

function validationMessage(error: ZodError): string {
  return error.issues[0]?.message || "Invalid input data";
}

function revalidatePayrollPages(): void {
  revalidatePath("/admin/payroll");
  revalidatePath("/hrms/payroll");
  revalidatePath("/subadmin/payroll");
}

export async function createPayrollPeriodAction(
  rawInput: CreatePayrollPeriodInput
): Promise<ActionResult<PayrollPeriodItem>> {
  try {
    const user = await requireAuth();
    const parsed = CreatePayrollPeriodSchema.safeParse(rawInput);
    if (!parsed.success) {
      return { success: false, error: validationMessage(parsed.error) };
    }

    const result = await payrollService.createPayrollPeriod(user, parsed.data);
    revalidatePayrollPages();
    return { success: true, data: result };
  } catch (err: unknown) {
    return { success: false, error: toActionError(err, "Failed to create payroll period.") };
  }
}

export async function updatePayrollPeriodStatusAction(
  rawInput: UpdatePayrollPeriodStatusInput
): Promise<ActionResult<{ affectedRecords: number }>> {
  try {
    const user = await requireAuth();
    const parsed = UpdatePayrollPeriodStatusSchema.safeParse(rawInput);
    if (!parsed.success) {
      return { success: false, error: validationMessage(parsed.error) };
    }

    const result = await payrollService.updatePayrollPeriodStatus(user, parsed.data);
    revalidatePayrollPages();
    return { success: true, data: result };
  } catch (err: unknown) {
    return {
      success: false,
      error: toActionError(err, "Failed to update payroll period status."),
    };
  }
}

export async function generatePayrollRecordsAction(
  rawInput: GeneratePayrollRecordsInput
): Promise<ActionResult<{ enrolledCount: number; skippedUnconfiguredCount: number }>> {
  try {
    const user = await requireAuth();
    const parsed = GeneratePayrollRecordsSchema.safeParse(rawInput);
    if (!parsed.success) {
      return { success: false, error: validationMessage(parsed.error) };
    }

    const result = await payrollService.generatePayrollRecordsForPeriod(
      user,
      parsed.data.periodId
    );
    revalidatePayrollPages();
    return { success: true, data: result };
  } catch (err: unknown) {
    return { success: false, error: toActionError(err, "Failed to enroll payroll records.") };
  }
}

export async function recordDisbursementAction(
  rawInput: RecordDisbursementInput
): Promise<ActionResult<{ periodPaid: boolean }>> {
  try {
    const user = await requireAuth();
    const parsed = RecordDisbursementSchema.safeParse(rawInput);
    if (!parsed.success) {
      return { success: false, error: validationMessage(parsed.error) };
    }

    const result = await payrollService.recordDisbursement(user, parsed.data);
    revalidatePayrollPages();
    return { success: true, data: result };
  } catch (err: unknown) {
    return { success: false, error: toActionError(err, "Failed to record disbursement.") };
  }
}

export async function bulkDisburseAction(
  rawInput: BulkDisbursementInput
): Promise<
  ActionResult<{ updatedCount: number; skippedNotPaidCount: number; periodPaid: boolean }>
> {
  try {
    const user = await requireAuth();
    const parsed = BulkDisbursementSchema.safeParse(rawInput);
    if (!parsed.success) {
      return { success: false, error: validationMessage(parsed.error) };
    }

    const result = await payrollService.bulkDisburseRecords(user, parsed.data);
    revalidatePayrollPages();
    return { success: true, data: result };
  } catch (err: unknown) {
    return {
      success: false,
      error: toActionError(err, "Failed to record bulk disbursement."),
    };
  }
}

export async function updateEmployeePayoutProfileAction(
  rawInput: UpdateEmployeePayoutProfileInput
): Promise<ActionResult<{ openRecordCount: number }>> {
  try {
    const user = await requireAuth();
    const parsed = UpdateEmployeePayoutProfileSchema.safeParse(rawInput);
    if (!parsed.success) {
      return { success: false, error: validationMessage(parsed.error) };
    }

    const result = await payrollService.updateEmployeePayoutProfile(user, parsed.data);
    revalidatePayrollPages();
    return { success: true, data: result };
  } catch (err: unknown) {
    return {
      success: false,
      error: toActionError(err, "Failed to update employee payout profile."),
    };
  }
}
