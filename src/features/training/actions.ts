"use server";

import { z } from "zod";
import { revalidatePath, updateTag } from "next/cache";
import { requireAuth } from "@/lib/auth/guards";
import { toActionError } from "@/lib/errors";
import {
  PUBLIC_TRAINING_TAG,
  createBatch,
  createProgram,
  updateBatch,
  updateProgram,
} from "./services/program-service";
import type { TrainingBatchInput, TrainingProgramInput } from "./schemas";

export type TrainingActionResult<T = { id: string }> = { success: true; data: T } | { success: false; error: string };

const idSchema = z.uuid("Invalid identifier");

/** Programme and batch changes show on /training, the programme pages and the sitemap. */
function revalidateTraining(slugs: string[]) {
  updateTag(PUBLIC_TRAINING_TAG);
  revalidatePath("/training");
  for (const slug of slugs) revalidatePath(`/training/${slug}`);
  revalidatePath("/admin/training", "layout");
}

export async function createTrainingProgramAction(input: TrainingProgramInput): Promise<TrainingActionResult> {
  try {
    const user = await requireAuth();
    const program = await createProgram(input, user);
    revalidateTraining([program.slug]);
    return { success: true, data: { id: program.id } };
  } catch (error) {
    return { success: false, error: toActionError(error, "The programme could not be created.") };
  }
}

export async function updateTrainingProgramAction(id: string, input: TrainingProgramInput): Promise<TrainingActionResult> {
  try {
    const user = await requireAuth();
    const program = await updateProgram(idSchema.parse(id), input, user);
    revalidateTraining([program.slug, program.previousSlug]);
    return { success: true, data: { id: program.id } };
  } catch (error) {
    return { success: false, error: toActionError(error, "The programme could not be saved.") };
  }
}

export async function saveTrainingBatchAction(
  batchId: string | null,
  input: TrainingBatchInput,
  programSlug: string
): Promise<TrainingActionResult> {
  try {
    const user = await requireAuth();
    const batch = batchId ? await updateBatch(idSchema.parse(batchId), input, user) : await createBatch(input, user);
    revalidateTraining([programSlug]);
    return { success: true, data: { id: batch.id } };
  } catch (error) {
    return { success: false, error: toActionError(error, "The batch could not be saved.") };
  }
}
