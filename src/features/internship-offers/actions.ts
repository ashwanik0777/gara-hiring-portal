"use server";

import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/auth/guards";
import { toActionError } from "@/lib/errors";
import { saveInternshipOffer } from "./services/internship-offer-service";
import type { InternshipOfferInput } from "./schemas";

export type InternshipOfferActionResult = { success: true; data: { version: number } } | { success: false; error: string };

/** Staff: issue or update the internship offer letter of an application. */
export async function saveInternshipOfferAction(input: InternshipOfferInput): Promise<InternshipOfferActionResult> {
  try {
    const user = await requireAuth();
    const offer = await saveInternshipOffer(user, input);
    revalidatePath(`/candidate/applications/${offer.applicationId}`);
    revalidatePath("/admin/evaluations", "layout");
    revalidatePath("/subadmin/evaluations", "layout");
    return { success: true, data: { version: offer.version } };
  } catch (error) {
    return { success: false, error: toActionError(error, "The offer letter could not be saved.") };
  }
}
