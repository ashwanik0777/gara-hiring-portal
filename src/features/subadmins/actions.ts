"use server";

import crypto from "crypto";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/guards";
import { Role } from "@prisma/client";
import { hashPassword } from "better-auth/crypto";
import { NodemailerEmailAdapter } from "@/infrastructure/email/outbox-processor";
import { z } from "zod";

const createSubAdminSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Valid email is required"),
  password: z.string()
    .min(10, "Password must be at least 10 characters")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[a-z]/, "Password must contain at least one lowercase letter")
    .regex(/[0-9]/, "Password must contain at least one number")
    .regex(/[^A-Za-z0-9]/, "Password must contain at least one special character"),
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
          mustChangePassword: true,
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

    // 3. Dispatch credentials email with temporary password
    try {
      const emailTransport = new NodemailerEmailAdapter();
      const loginUrl = `${process.env.BETTER_AUTH_URL || "http://localhost:3000"}/login`;

      await emailTransport.sendEmail({
        to: email.toLowerCase().trim(),
        subject: "[GARA Innovation] Sub-Admin Account Credentials",
        text: `Hello ${name},\n\nYou have been provisioned as a Sub-Admin (${role}) at GARA Innovation.\n\nYour Temporary Login Credentials:\nEmail: ${email.toLowerCase().trim()}\nTemporary Password: ${password}\nLogin Portal: ${loginUrl}\n\nPlease sign in with this temporary password. Upon your first login, you will be required to set your own permanent password.\n\n— GARA Innovation Team`,
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 32px 24px; border: 1px solid #e2e8f0; border-radius: 16px; background: #ffffff;">
            <div style="margin-bottom: 24px;">
              <h2 style="color: #0f172a; margin: 0 0 6px 0; font-size: 20px;">Welcome to GARA Innovation</h2>
              <p style="color: #64748b; margin: 0; font-size: 13px;">Sub-Admin Account Credentials</p>
            </div>
            <p style="color: #334155; font-size: 14px; line-height: 1.6;">
              Hello <strong>${name}</strong>,<br/>
              An administrative staff account with role <strong>${role}</strong> has been configured for you.
            </p>
            <div style="margin: 24px 0; padding: 20px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px;">
              <p style="margin: 0 0 10px 0; font-size: 13px; color: #475569;">
                <strong>Login Email:</strong> <span style="font-family: monospace; color: #0f172a;">${email.toLowerCase().trim()}</span>
              </p>
              <p style="margin: 0; font-size: 13px; color: #475569;">
                <strong>Temporary Password:</strong> <span style="font-family: monospace; font-weight: bold; color: #2563eb;">${password}</span>
              </p>
            </div>
            <p style="color: #334155; font-size: 13px; line-height: 1.6;">
              Please log in using these temporary credentials. You will be prompted to set your personal permanent password upon your first sign in.
            </p>
            <div style="margin: 28px 0; text-align: center;">
              <a href="${loginUrl}" style="display: inline-block; padding: 12px 32px; background: #2563eb; color: #ffffff; text-decoration: none; border-radius: 10px; font-weight: 600; font-size: 14px; box-shadow: 0 2px 4px rgba(37,99,235,0.2);">
                Sign In & Set Password
              </a>
            </div>
          </div>
        `,
      });
    } catch (mailErr) {
      console.error("[CreateSubAdmin] Failed to send credentials email:", mailErr);
    }

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

  // Prevent modifying accounts that hold the ADMIN role
  const existingRoles = await prisma.userRole.findMany({
    where: { userId: subAdminId },
    select: { role: true },
  });
  if (existingRoles.some((r) => r.role === Role.ADMIN)) {
    return { success: false, error: "Cannot modify a Super Admin's roles or permissions." };
  }

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

  // Validate UUID format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!subAdminId || !uuidRegex.test(subAdminId)) {
    return { success: false, error: "Invalid sub-admin ID format." };
  }

  if (subAdminId === adminUser.id) {
    return { success: false, error: "Super Admin cannot delete their own account." };
  }

  // Verify target is actually a sub-admin (not an admin or regular user)
  const targetRoles = await prisma.userRole.findMany({
    where: { userId: subAdminId },
    select: { role: true },
  });
  const targetHasAdminRole = targetRoles.some((r) => r.role === Role.ADMIN);
  if (targetHasAdminRole) {
    return { success: false, error: "Cannot delete a Super Admin account." };
  }
  const targetPermission = await prisma.subAdminPermission.findUnique({
    where: { userId: subAdminId },
  });
  if (!targetPermission && targetRoles.length === 0) {
    return { success: false, error: "Target user is not a sub-admin." };
  }

  try {
    // Audit log before deletion
    await prisma.auditLog.create({
      data: {
        actorId: adminUser.id,
        actorRole: "ADMIN",
        action: "SUBADMIN_DELETED",
        resourceType: "SUB_ADMIN",
        resourceId: subAdminId,
      },
    });

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
