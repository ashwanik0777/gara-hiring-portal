"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth/guards";
import { toActionError, ValidationError } from "@/lib/errors";
import { updateCollege } from "./services/college-service";

export type CollegeActionResult = { success: true } | { success: false; error: string };

const collegeUpdateSchema = z.object({
  id: z.uuid("Invalid college identifier"),
  name: z.string().max(150),
  city: z.string().max(80).nullable().optional(),
  state: z.string().max(80).nullable().optional(),
  approve: z.boolean(),
});

/** Staff: correct a college's name or place and, optionally, approve it for everyone's search. */
export async function updateCollegeAction(input: z.input<typeof collegeUpdateSchema>): Promise<CollegeActionResult> {
  try {
    const user = await requirePermission("canApplications");
    const parsed = collegeUpdateSchema.safeParse(input);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues[0]?.message ?? "Invalid college details", parsed.error.issues);
    }
    const { id, ...data } = parsed.data;
    await updateCollege(id, data, user);
    revalidatePath("/admin/colleges");
    return { success: true };
  } catch (error) {
    return { success: false, error: toActionError(error, "The college could not be saved.") };
  }
}
