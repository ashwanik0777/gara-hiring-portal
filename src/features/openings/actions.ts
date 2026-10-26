"use server";

import { z } from "zod";
import { revalidatePath, updateTag } from "next/cache";
import { requirePermission } from "@/lib/auth/guards";
import { OpeningStatus } from "@prisma/client";
import {
  createOpening,
  updateOpeningStatus,
  saveOpeningFormVersion,
  PUBLIC_OPENINGS_TAG,
  publicOpeningIdTag,
  publicOpeningSlugTag,
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

/**
 * Expires everything that shows this opening. The public pages and the sitemap read through
 * `"use cache"` entries tagged in opening-service.ts: `updateTag` (Server Actions only)
 * expires them immediately, so staff see their change on the very next request. The
 * `revalidatePath` calls still refresh the prerendered page shells and the staff lists.
 */
function revalidateOpeningCaches(opening?: { id?: string; slug?: string }) {
  updateTag(PUBLIC_OPENINGS_TAG);
  if (opening?.slug) {
    updateTag(publicOpeningSlugTag(opening.slug));
  }
  if (opening?.id) {
    updateTag(publicOpeningIdTag(opening.id));
  }

  revalidatePath("/careers");
  if (opening?.slug) {
    revalidatePath(`/careers/${opening.slug}`);
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
    revalidateOpeningCaches({ id: opening.id, slug: opening.slug });
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
    revalidateOpeningCaches({ id: opening.id, slug: opening.slug });
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
    // The slug is not known here; the id tag covers the cached opening page.
    revalidateOpeningCaches({ id });
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
