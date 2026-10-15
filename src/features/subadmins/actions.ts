"use server";

import crypto from "crypto";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/guards";
import { Role } from "@prisma/client";
import { hashPassword } from "better-auth/crypto";
import { z } from "zod";

const createSubAdminSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Valid email is required"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  role: z.enum([Role.HR, Role.MANAGER, Role.INTERVIEWER, Role.MENTOR]),
  permissions: z.object({
    canApplications: z.boolean().default(true),
    canOpenings: z.boolean().default(false),
    canInterviews: z.boolean().default(false),
    canEvaluations: z.boolean().default(false),
    canEmployees: z.boolean().default(false),
    canAttendance: z.boolean().default(false),
    canLeave: z.boolean().default(false),
    canPayroll: z.boolean().default(false),
    canReports: z.boolean().default(false),
  }),
});

export async function createSubAdminAction(formData: z.infer<typeof createSubAdminSchema>) {
  const adminUser = await getCurrentUser();
  if (!adminUser || !adminUser.roles.includes(Role.ADMIN)) {
    return { success: false, error: "Unauthorized. Super Admin access required." };
  }

  const parsed = createSubAdminSchema.safeParse(formData);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message || "Invalid input data" };
  }

  const { name, email, password, role, permissions } = parsed.data;

  try {
    // 1. Check if email already in use
    const existing = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
    });

    if (existing) {
      return { success: false, error: "A user account with this email already exists." };
    }

    const userId = crypto.randomUUID();
    const hashedPassword = await hashPassword(password);

    // 2. Execute transactional creation
    await prisma.$transaction(async (tx) => {
      // Create user record
      await tx.user.create({
        data: {
          id: userId,
          name: name.trim(),
          email: email.toLowerCase().trim(),
          emailVerified: true,
        },
      });

      // Link credential account
      await tx.account.create({
        data: {
          id: crypto.randomUUID(),
          userId,
          accountId: userId,
          providerId: "credential",
          password: hashedPassword,
        },
      });

      // Assign Sub-Admin staff role
      await tx.userRole.create({
        data: {
          id: crypto.randomUUID(),
          userId,
          role,
          assignedBy: adminUser.id,
        },
      });

      // Assign custom granular module permissions
      await tx.subAdminPermission.create({
        data: {
          id: crypto.randomUUID(),
          userId,
          canApplications: permissions.canApplications,
          canOpenings: permissions.canOpenings,
          canInterviews: permissions.canInterviews,
          canEvaluations: permissions.canEvaluations,
          canEmployees: permissions.canEmployees,
          canAttendance: permissions.canAttendance,
          canLeave: permissions.canLeave,
          canPayroll: permissions.canPayroll,
          canReports: permissions.canReports,
        },
      });

      // Log in audit log
      await tx.auditLog.create({
        data: {
          actorId: adminUser.id,
          actorRole: "ADMIN",
          action: "SUBADMIN_CREATED",
          resourceType: "SUB_ADMIN",
          resourceId: userId,
        },
      });
    });

    revalidatePath("/admin/subadmins");
    revalidatePath("/admin");
    return { success: true, message: `Sub-Admin ${name} successfully created with role ${role}` };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create Sub-Admin account";
    return { success: false, error: message };
  }
}

const updatePermissionsSchema = z.object({
  subAdminId: z.string().uuid(),
  role: z.enum([Role.HR, Role.MANAGER, Role.INTERVIEWER, Role.MENTOR]),
  permissions: z.object({
    canApplications: z.boolean(),
    canOpenings: z.boolean(),
    canInterviews: z.boolean(),
    canEvaluations: z.boolean(),
    canEmployees: z.boolean(),
    canAttendance: z.boolean(),
    canLeave: z.boolean(),
    canPayroll: z.boolean(),
    canReports: z.boolean(),
  }),
});

export async function updateSubAdminPermissionsAction(
  data: z.infer<typeof updatePermissionsSchema>
) {
  const adminUser = await getCurrentUser();
  if (!adminUser || !adminUser.roles.includes(Role.ADMIN)) {
    return { success: false, error: "Unauthorized. Super Admin access required." };
  }

  const parsed = updatePermissionsSchema.safeParse(data);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message || "Invalid input data" };
  }

  const { subAdminId, role, permissions } = parsed.data;

  try {
    await prisma.$transaction(async (tx) => {
      // 1. Update Role
      await tx.userRole.deleteMany({
        where: { userId: subAdminId },
      });

      await tx.userRole.create({
        data: {
          id: crypto.randomUUID(),
          userId: subAdminId,
          role,
          assignedBy: adminUser.id,
        },
      });

      // 2. Upsert SubAdminPermission
      await tx.subAdminPermission.upsert({
        where: { userId: subAdminId },
        update: {
          ...permissions,
        },
        create: {
          id: crypto.randomUUID(),
          userId: subAdminId,
          ...permissions,
        },
      });

      // Audit Log
      await tx.auditLog.create({
        data: {
          actorId: adminUser.id,
          actorRole: "ADMIN",
          action: "SUBADMIN_PERMISSIONS_UPDATED",
          resourceType: "SUB_ADMIN",
          resourceId: subAdminId,
        },
      });
    });

    revalidatePath("/admin/subadmins");
    revalidatePath("/subadmin");
    return { success: true, message: "Sub-Admin permissions successfully updated." };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update permissions";
    return { success: false, error: message };
  }
}

export async function deleteSubAdminAction(subAdminId: string) {
  const adminUser = await getCurrentUser();
  if (!adminUser || !adminUser.roles.includes(Role.ADMIN)) {
    return { success: false, error: "Unauthorized. Super Admin access required." };
  }

  if (subAdminId === adminUser.id) {
    return { success: false, error: "Super Admin cannot delete their own account." };
  }

  try {
    await prisma.user.delete({
      where: { id: subAdminId },
    });

    revalidatePath("/admin/subadmins");
    return { success: true, message: "Sub-Admin removed successfully." };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to remove Sub-Admin";
    return { success: false, error: message };
  }
}
