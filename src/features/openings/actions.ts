"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth/guards";
import { OpeningStatus } from "@prisma/client";
import {
  createOpening,
  updateOpeningStatus,
  saveOpeningFormVersion,
} from "./services/opening-service";
import {
  CreateOpeningInput,
  createOpeningSchema,
  openingIdSchema,
  openingStatusSchema,
} from "./schemas";
import {
  FormSchemaDefinitionInput,
  formSchemaDefinitionSchema,
} from "@/features/application-forms/schemas";
import { toActionError, ValidationError } from "@/lib/errors";

export type OpeningActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

function parseArgument<T>(schema: z.ZodType<T>, value: unknown, message: string): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0]?.message ?? message, parsed.error.issues);
  }
  return parsed.data;
}

function revalidateOpeningPaths(slug?: string) {
  revalidatePath("/careers");
  if (slug) {
    revalidatePath(`/careers/${slug}`);
  }
  revalidatePath("/admin/openings");
  revalidatePath("/subadmin/openings");
}

export async function createOpeningAction(
  data: CreateOpeningInput
): Promise<OpeningActionResult<{ id: string; slug: string }>> {
  try {
    const user = await requirePermission("canOpenings");
    const input = parseArgument(createOpeningSchema, data, "Invalid opening details");
    const opening = await createOpening(input, user);
    revalidateOpeningPaths();
    return { success: true, data: { id: opening.id, slug: opening.slug } };
  } catch (error) {
    return { success: false, error: toActionError(error, "The opening could not be created.") };
  }
}

export async function updateOpeningStatusAction(
  id: string,
  status: OpeningStatus
): Promise<OpeningActionResult<{ id: string; slug: string; status: OpeningStatus }>> {
  try {
    const user = await requirePermission("canOpenings");
    const openingId = parseArgument(openingIdSchema, id, "Invalid opening identifier");
    const nextStatus = parseArgument(openingStatusSchema, status, "Invalid opening status");
    const opening = await updateOpeningStatus(openingId, nextStatus, user);
    revalidateOpeningPaths(opening.slug);
    return {
      success: true,
      data: { id: opening.id, slug: opening.slug, status: opening.status },
    };
  } catch (error) {
    return {
      success: false,
      error: toActionError(error, "The opening status could not be changed."),
    };
  }
}

export async function saveOpeningFormVersionAction(
  openingId: string,
  schema: FormSchemaDefinitionInput,
  shouldPublish = true
): Promise<OpeningActionResult<{ id: string; versionNumber: number; isPublished: boolean }>> {
  try {
    const user = await requirePermission("canOpenings");
    const id = parseArgument(openingIdSchema, openingId, "Invalid opening identifier");
    const formSchema = parseArgument(
      formSchemaDefinitionSchema,
      schema,
      "Invalid application form definition"
    );
    const publish = parseArgument(z.boolean(), shouldPublish, "Invalid publish flag");
    const formVersion = await saveOpeningFormVersion(id, formSchema, publish, user);
    revalidateOpeningPaths();
    return {
      success: true,
      data: {
        id: formVersion.id,
        versionNumber: formVersion.versionNumber,
        isPublished: formVersion.isPublished,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: toActionError(error, "The application form could not be saved."),
    };
  }
}
