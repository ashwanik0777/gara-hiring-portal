"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/guards";
import { payrollService } from "./services/payroll-service";
import {
  CreatePayrollPeriodSchema,
  RecordDisbursementSchema,
  UpdatePayrollPeriodStatusSchema,
  BulkDisbursementSchema,
  UpdateEmployeePayoutProfileSchema,
  GeneratePayrollRecordsSchema,
  CreatePayrollPeriodInput,
  RecordDisbursementInput,
  UpdatePayrollPeriodStatusInput,
  BulkDisbursementInput,
  UpdateEmployeePayoutProfileInput,
  GeneratePayrollRecordsInput,
} from "./schemas";
import { Role } from "@/types/enums";

function assertFinanceAdmin(user: { roles: Role[] } | null): void {
  if (!user) {
    throw new Error("Unauthorized: Please sign in to access payroll operations.");
  }
  const isAuthorized = user.roles.some((r) => ([Role.ADMIN, Role.HR] as Role[]).includes(r));
  if (!isAuthorized) {
    throw new Error("Forbidden: Payroll operations require Administrator or HR authority.");
  }
}

export async function createPayrollPeriodAction(
  rawInput: CreatePayrollPeriodInput
): Promise<{ success: boolean; error?: string; data?: unknown }> {
  try {
    const user = await getCurrentUser();
    assertFinanceAdmin(user);

    const parsed = CreatePayrollPeriodSchema.safeParse(rawInput);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues.map((i) => i.message).join(", ") };
    }

    const result = await payrollService.createPayrollPeriod(user!, parsed.data);

    revalidatePath("/admin/payroll");
    revalidatePath("/hrms/payroll");
    revalidatePath("/subadmin/payroll");

    return { success: true, data: result };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to create payroll period.";
    return { success: false, error: message };
  }
}

export async function updatePayrollPeriodStatusAction(
  rawInput: UpdatePayrollPeriodStatusInput
): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await getCurrentUser();
    assertFinanceAdmin(user);

    const parsed = UpdatePayrollPeriodStatusSchema.safeParse(rawInput);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues.map((i) => i.message).join(", ") };
    }

    await payrollService.updatePayrollPeriodStatus(user!, parsed.data);

    revalidatePath("/admin/payroll");
    revalidatePath("/hrms/payroll");
    revalidatePath("/subadmin/payroll");

    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to update payroll period status.";
    return { success: false, error: message };
  }
}

export async function generatePayrollRecordsAction(
  rawInput: GeneratePayrollRecordsInput
): Promise<{ success: boolean; error?: string; data?: unknown }> {
  try {
    const user = await getCurrentUser();
    assertFinanceAdmin(user);

    const parsed = GeneratePayrollRecordsSchema.safeParse(rawInput);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues.map((i) => i.message).join(", ") };
    }

    const result = await payrollService.generatePayrollRecordsForPeriod(user!, parsed.data.periodId);

    revalidatePath("/admin/payroll");
    revalidatePath("/hrms/payroll");
    revalidatePath("/subadmin/payroll");

    return { success: true, data: result };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to generate payroll records.";
    return { success: false, error: message };
  }
}

export async function recordDisbursementAction(
  rawInput: RecordDisbursementInput
): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await getCurrentUser();
    assertFinanceAdmin(user);

    const parsed = RecordDisbursementSchema.safeParse(rawInput);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues.map((i) => i.message).join(", ") };
    }

    await payrollService.recordDisbursement(user!, parsed.data);

    revalidatePath("/admin/payroll");
    revalidatePath("/hrms/payroll");
    revalidatePath("/subadmin/payroll");

    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to record disbursement.";
    return { success: false, error: message };
  }
}

export async function bulkDisburseAction(
  rawInput: BulkDisbursementInput
): Promise<{ success: boolean; error?: string; data?: unknown }> {
  try {
    const user = await getCurrentUser();
    assertFinanceAdmin(user);

    const parsed = BulkDisbursementSchema.safeParse(rawInput);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues.map((i) => i.message).join(", ") };
    }

    const result = await payrollService.bulkDisburseRecords(user!, parsed.data);

    revalidatePath("/admin/payroll");
    revalidatePath("/hrms/payroll");
    revalidatePath("/subadmin/payroll");

    return { success: true, data: result };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to execute bulk disbursement.";
    return { success: false, error: message };
  }
}

export async function updateEmployeePayoutProfileAction(
  rawInput: UpdateEmployeePayoutProfileInput
): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await getCurrentUser();
    assertFinanceAdmin(user);

    const parsed = UpdateEmployeePayoutProfileSchema.safeParse(rawInput);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues.map((i) => i.message).join(", ") };
    }

    await payrollService.updateEmployeePayoutProfile(user!, parsed.data);

    revalidatePath("/admin/payroll");
    revalidatePath("/hrms/payroll");
    revalidatePath("/subadmin/payroll");

    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to update employee payout profile.";
    return { success: false, error: message };
  }
}
