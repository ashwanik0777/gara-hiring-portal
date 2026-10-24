"use server";

import crypto from "crypto";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth/auth";
import { getCurrentUser, requireAuth } from "@/lib/auth/guards";
import { toActionError } from "@/lib/errors";
import { hashPassword } from "better-auth/crypto";
import { z } from "zod";

const setPasswordSchema = z.object({
  newPassword: z
    .string()
    .min(10, "Password must be at least 10 characters")
    .max(128, "Password must be at most 128 characters")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[a-z]/, "Password must contain at least one lowercase letter")
    .regex(/[0-9]/, "Password must contain at least one number")
    .regex(/[^A-Za-z0-9]/, "Password must contain at least one special character"),
});

/**
 * Action to set a new permanent password when logged in with a temporary password.
 * Only available while `mustChangePassword` is set (temporary credentials issued by an
 * administrator). Regular password changes go through Better Auth's change-password
 * flow, which requires the current password. Other sessions are revoked afterwards.
 */
export async function setNewPasswordAction(rawInput: { newPassword: string }) {
  try {
    const user = await requireAuth({ allowPendingPasswordChange: true });

    if (!user.mustChangePassword) {
      return {
        success: false,
        error: "Your account does not have a pending temporary password. Use the change-password option instead.",
      };
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

    // 4. Sign out every other device that may still hold the temporary credentials.
    await auth.api.revokeOtherSessions({ headers: await headers() });

    revalidatePath("/", "layout");
    return {
      success: true,
      message: "Permanent password successfully updated. Welcome to GARA Innovation!",
    };
  } catch (error) {
    return { success: false, error: toActionError(error, "Failed to set new password.") };
  }
}

/**
 * Returns where the signed-in user should land right after authentication.
 * Uses the current session only, so it cannot be used to probe other accounts.
 */
export async function getPostLoginRedirectAction(): Promise<{ redirectTo: string | null }> {
  const user = await getCurrentUser();
  if (user?.mustChangePassword) {
    return { redirectTo: "/set-password" };
  }
  return { redirectTo: null };
}
