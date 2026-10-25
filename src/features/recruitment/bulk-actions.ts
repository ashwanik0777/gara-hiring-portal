"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth/guards";
import { toActionError } from "@/lib/errors";
import { scheduleOutboxFlush } from "@/infrastructure/email/outbox-dispatch";
import {
  BULK_DECISION_ROLES,
  BulkEmailPreviewSchema,
  BulkTransitionSchema,
  bulkActionsService,
  type BulkTransitionSummary,
} from "./services/bulk-actions-service";

export type BulkActionResult<T> = { success: true; data: T } | { success: false; error: string };

function revalidateApplicationLists(): void {
  for (const base of ["/admin/applications", "/subadmin/applications"]) {
    // "layout" also refreshes the detail pages of the moved applications.
    revalidatePath(base, "layout");
  }
}

/**
 * Moves or rejects up to 100 selected applications. Each one is delegated to the single
 * stage-transition service, so all of its checks apply; the result lists every
 * application as moved or skipped with a reason.
 */
export async function bulkTransitionApplicationsAction(
  rawInput: unknown
): Promise<BulkActionResult<BulkTransitionSummary>> {
  try {
    const user = await requirePermission("canApplications", { roles: BULK_DECISION_ROLES });

    const parsed = BulkTransitionSchema.safeParse(rawInput);
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.issues[0]?.message ?? "Check the bulk action and try again.",
      };
    }

    const summary = await bulkActionsService.transitionApplications(user, parsed.data);
    if (summary.emailsQueued > 0) {
      scheduleOutboxFlush();
    }
    if (summary.moved > 0) {
      revalidateApplicationLists();
    }
    return { success: true, data: summary };
  } catch (error: unknown) {
    return {
      success: false,
      error: toActionError(error, "We couldn't update the selected applications. Please try again."),
    };
  }
}

/** Preview of the candidate email for the first selected application. */
export async function previewBulkStageEmailAction(
  rawInput: unknown
): Promise<BulkActionResult<{ subject: string; text: string }>> {
  try {
    const user = await requirePermission("canApplications", { roles: BULK_DECISION_ROLES });

    const parsed = BulkEmailPreviewSchema.safeParse(rawInput);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message ?? "Write a message to preview." };
    }

    const preview = await bulkActionsService.previewStageUpdateEmail(user, parsed.data);
    return { success: true, data: preview };
  } catch (error: unknown) {
    return {
      success: false,
      error: toActionError(error, "We couldn't build the email preview. Please try again."),
    };
  }
}
