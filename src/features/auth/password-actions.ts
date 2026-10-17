"use server";

import crypto from "crypto";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/guards";
import { hashPassword } from "better-auth/crypto";
import { NodemailerEmailAdapter } from "@/infrastructure/email/outbox-processor";
import { buildForgotPasswordEmail } from "@/infrastructure/email/email-templates";
import { z } from "zod";

const setPasswordSchema = z.object({
  newPassword: z
    .string()
    .min(10, "Password must be at least 10 characters")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[a-z]/, "Password must contain at least one lowercase letter")
    .regex(/[0-9]/, "Password must contain at least one number")
    .regex(/[^A-Za-z0-9]/, "Password must contain at least one special character"),
});

/**
 * Action to set a new permanent password when logged in with a temporary password.
 * Clears mustChangePassword so future logins proceed directly to dashboard.
 */
export async function setNewPasswordAction(rawInput: { newPassword: string }) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: "Authentication required to update password." };
    }

    const parsed = setPasswordSchema.safeParse(rawInput);
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.issues[0]?.message || "Invalid password format.",
      };
    }

    const { newPassword } = parsed.data;
    const hashedPassword = await hashPassword(newPassword);

    await prisma.$transaction(async (tx) => {
      // 1. Update credential account password
      const account = await tx.account.findFirst({
        where: {
          userId: user.id,
          providerId: "credential",
        },
      });

      if (account) {
        await tx.account.update({
          where: { id: account.id },
          data: {
            password: hashedPassword,
            updatedAt: new Date(),
          },
        });
      } else {
        await tx.account.create({
          data: {
            id: crypto.randomUUID(),
            userId: user.id,
            accountId: user.id,
            providerId: "credential",
            password: hashedPassword,
          },
        });
      }

      // 2. Mark mustChangePassword as false
      await tx.user.update({
        where: { id: user.id },
        data: {
          mustChangePassword: false,
          updatedAt: new Date(),
        },
      });

      // 3. Log audit trail
      await tx.auditLog.create({
        data: {
          actorId: user.id,
          actorRole: user.roles[0] || "CANDIDATE",
          action: "PASSWORD_CHANGED_FROM_TEMP",
          resourceType: "USER",
          resourceId: user.id,
        },
      });
    });

    revalidatePath("/", "layout");
    return {
      success: true,
      message: "Permanent password successfully updated. Welcome to GARA Innovation!",
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to set new password.";
    return { success: false, error: msg };
  }
}

/**
 * Action to handle forgot password requests.
 * Generates a temporary password, hashes it, sets mustChangePassword: true,
 * and sends an email to the user with their temporary credentials.
 */
export async function forgotPasswordAction(email: string) {
  try {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) {
      return { success: false, error: "Please enter your email address." };
    }

    const user = await prisma.user.findUnique({
      where: { email: cleanEmail },
      include: { roles: true },
    });

    // If user does not exist, return neutral safe message to avoid email enumeration
    if (!user) {
      return {
        success: true,
        message: "If an account exists with this email, temporary login credentials have been sent to it.",
      };
    }

    // Generate secure temporary password satisfying password strength rules
    // Pattern: Gara@ + 4 hex chars + 2 digits + !
    const randomHex = crypto.randomBytes(2).toString("hex").toUpperCase();
    const randomDigits = Math.floor(10 + Math.random() * 90);
    const tempPassword = `Gara@${randomHex}${randomDigits}!`;
    const hashedPassword = await hashPassword(tempPassword);

    await prisma.$transaction(async (tx) => {
      // 1. Update credential account password
      const account = await tx.account.findFirst({
        where: {
          userId: user.id,
          providerId: "credential",
        },
      });

      if (account) {
        await tx.account.update({
          where: { id: account.id },
          data: {
            password: hashedPassword,
            updatedAt: new Date(),
          },
        });
      } else {
        await tx.account.create({
          data: {
            id: crypto.randomUUID(),
            userId: user.id,
            accountId: user.id,
            providerId: "credential",
            password: hashedPassword,
          },
        });
      }

      // 2. Mark mustChangePassword as true
      await tx.user.update({
        where: { id: user.id },
        data: {
          mustChangePassword: true,
          updatedAt: new Date(),
        },
      });

      // 3. Log audit event
      await tx.auditLog.create({
        data: {
          actorId: user.id,
          actorRole: user.roles[0]?.role || "CANDIDATE",
          action: "PASSWORD_RESET_TEMP_ISSUED",
          resourceType: "USER",
          resourceId: user.id,
        },
      });
    });

    // 4. Send email with temporary password
    try {
      const emailTransport = new NodemailerEmailAdapter();
      const loginUrl = `${process.env.BETTER_AUTH_URL || "http://localhost:3000"}/login`;

      const emailPayload = buildForgotPasswordEmail({
        name: user.name,
        email: user.email,
        temporaryPassword: tempPassword,
        loginUrl,
      });

      await emailTransport.sendEmail({
        to: user.email,
        subject: emailPayload.subject,
        text: emailPayload.text,
        html: emailPayload.html,
      });
    } catch (mailErr) {
      console.error("[ForgotPassword] Failed to dispatch temporary password email:", mailErr);
    }

    return {
      success: true,
      message: `A temporary password has been sent to ${cleanEmail}. Please check your email inbox and sign in to set your permanent password.`,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to reset password.";
    return { success: false, error: msg };
  }
}

/**
 * Action to verify if a user with a given email needs to change their temporary password.
 */
export async function checkUserMustChangePasswordAction(email: string) {
  try {
    const cleanEmail = email.trim().toLowerCase();
    const user = await prisma.user.findUnique({
      where: { email: cleanEmail },
      select: {
        mustChangePassword: true,
        roles: { select: { role: true } },
      },
    });

    return {
      mustChangePassword: user?.mustChangePassword ?? false,
      roles: user?.roles.map((r) => r.role) ?? [],
    };
  } catch {
    return { mustChangePassword: false, roles: [] };
  }
}
