"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/guards";
import { leaveService } from "./services/leave-service";
import {
  CreateLeaveRequestSchema,
  ReviewLeaveRequestSchema,
  CreateLeaveTypeSchema,
  ToggleLeaveTypeSchema,
  CreateLeaveRequestInput,
  ReviewLeaveRequestInput,
  CreateLeaveTypeInput,
  ToggleLeaveTypeInput,
} from "./schemas";
import { Role } from "@/types/enums";

export async function reviewLeaveRequestAction(
  rawInput: ReviewLeaveRequestInput
): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: "Unauthorized: Please log in." };
    }

    const isAuthorized = user.roles.some((r) =>
      ([Role.ADMIN, Role.HR, Role.MANAGER] as Role[]).includes(r)
    );
    if (!isAuthorized) {
      return {
        success: false,
        error: "Forbidden: Leave review requires HR, Manager, or Admin authority.",
      };
    }

    const parsed = ReviewLeaveRequestSchema.safeParse(rawInput);
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.issues.map((i) => i.message).join(", "),
      };
    }

    await leaveService.reviewLeaveRequest(user, parsed.data);

    revalidatePath("/admin/leave");
    revalidatePath("/subadmin/leave");
    revalidatePath("/hrms/leave");
    revalidatePath("/admin/attendance");

    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to review leave request.";
    return { success: false, error: message };
  }
}

export async function createLeaveRequestAction(
  rawInput: CreateLeaveRequestInput
): Promise<{ success: boolean; error?: string; data?: unknown }> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: "Unauthorized: Please log in." };
    }

    const parsed = CreateLeaveRequestSchema.safeParse(rawInput);
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.issues.map((i) => i.message).join(", "),
      };
    }

    const result = await leaveService.submitLeaveRequest(user, parsed.data);

    revalidatePath("/admin/leave");
    revalidatePath("/subadmin/leave");
    revalidatePath("/hrms/leave");

    return { success: true, data: result };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to submit leave request.";
    return { success: false, error: message };
  }
}

export async function createLeaveTypeAction(
  rawInput: CreateLeaveTypeInput
): Promise<{ success: boolean; error?: string; data?: unknown }> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: "Unauthorized: Please log in." };
    }

    const isAuthorized = user.roles.some((r) =>
      ([Role.ADMIN, Role.HR, Role.MANAGER] as Role[]).includes(r)
    );
    if (!isAuthorized) {
      return {
        success: false,
        error: "Forbidden: Creating leave categories requires Admin or HR authority.",
      };
    }

    const parsed = CreateLeaveTypeSchema.safeParse(rawInput);
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.issues.map((i) => i.message).join(", "),
      };
    }

    const result = await leaveService.createLeaveType(user, parsed.data);

    revalidatePath("/admin/leave");
    revalidatePath("/subadmin/leave");
    revalidatePath("/hrms/leave");

    return { success: true, data: result };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to create leave type.";
    return { success: false, error: message };
  }
}

export async function toggleLeaveTypeAction(
  rawInput: ToggleLeaveTypeInput
): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: "Unauthorized: Please log in." };
    }

    const parsed = ToggleLeaveTypeSchema.safeParse(rawInput);
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.issues.map((i) => i.message).join(", "),
      };
    }

    await leaveService.toggleLeaveType(user, parsed.data.id, parsed.data.isActive);

    revalidatePath("/admin/leave");
    revalidatePath("/subadmin/leave");
    revalidatePath("/hrms/leave");

    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to toggle leave category status.";
    return { success: false, error: message };
  }
}

export async function seedDefaultLeaveTypesAction(): Promise<{ success: boolean; error?: string }> {
  try {
    await leaveService.ensureDefaultLeaveTypes();
    revalidatePath("/admin/leave");
    revalidatePath("/subadmin/leave");
    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to initialize default leave types.";
    return { success: false, error: message };
  }
}
