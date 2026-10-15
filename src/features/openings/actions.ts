"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/guards";
import { Role, OpeningStatus } from "@prisma/client";
import {
  createOpening,
  updateOpening,
  updateOpeningStatus,
  saveOpeningFormVersion,
} from "./services/opening-service";
import { CreateOpeningInput, UpdateOpeningInput } from "./schemas";
import { FormSchemaDefinitionInput } from "@/features/application-forms/schemas";
import { toSafeErrorResponse } from "@/lib/errors";

export async function createOpeningAction(data: CreateOpeningInput) {
  try {
    const user = await requireRole([Role.ADMIN, Role.HR]);
    const opening = await createOpening(data, user);
    revalidatePath("/careers");
    revalidatePath("/recruitment/openings");
    return { success: true as const, data: opening };
  } catch (error) {
    return toSafeErrorResponse(error);
  }
}

export async function updateOpeningAction(id: string, data: UpdateOpeningInput) {
  try {
    const user = await requireRole([Role.ADMIN, Role.HR]);
    const opening = await updateOpening(id, data, user);
    revalidatePath("/careers");
    revalidatePath(`/careers/${opening.slug}`);
    revalidatePath("/recruitment/openings");
    return { success: true as const, data: opening };
  } catch (error) {
    return toSafeErrorResponse(error);
  }
}

export async function updateOpeningStatusAction(id: string, status: OpeningStatus) {
  try {
    const user = await requireRole([Role.ADMIN, Role.HR]);
    const opening = await updateOpeningStatus(id, status, user);
    revalidatePath("/careers");
    revalidatePath(`/careers/${opening.slug}`);
    revalidatePath("/recruitment/openings");
    return { success: true as const, data: opening };
  } catch (error) {
    return toSafeErrorResponse(error);
  }
}

export async function saveOpeningFormVersionAction(
  openingId: string,
  schema: FormSchemaDefinitionInput,
  shouldPublish = true
) {
  try {
    const user = await requireRole([Role.ADMIN, Role.HR]);
    const formVersion = await saveOpeningFormVersion(openingId, schema, shouldPublish, user);
    revalidatePath("/careers");
    revalidatePath("/recruitment/openings");
    return { success: true as const, data: formVersion };
  } catch (error) {
    return toSafeErrorResponse(error);
  }
}
