"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth/guards";
import { ForbiddenError, ValidationError, toActionError } from "@/lib/errors";
import { isStaffUser } from "./services/lifecycle-service";
import { SaveCareerInterestSchema } from "./schemas";

/**
 * Records what a candidate signed up for (job, internship or both). Staff accounts are
 * created by administrators and have no candidate profile.
 */
export async function saveCareerInterestAction(
  input: unknown
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const user = await requireAuth();
    if (isStaffUser(user)) {
      throw new ForbiddenError("Staff accounts do not have a candidate profile.");
    }
    const parsed = SaveCareerInterestSchema.safeParse(input);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues[0]?.message ?? "Invalid selection.");
    }

    await prisma.candidateProfile.upsert({
      where: { userId: user.id },
      create: { userId: user.id, careerInterest: parsed.data.careerInterest },
      update: { careerInterest: parsed.data.careerInterest },
    });

    revalidatePath("/candidate/dashboard");
    revalidatePath("/candidate/profile");
    return { success: true };
  } catch (error) {
    return { success: false, error: toActionError(error, "Could not save your preference.") };
  }
}
