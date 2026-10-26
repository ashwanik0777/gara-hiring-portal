"use server";

import { requirePermission } from "@/lib/auth/guards";
import { toActionError } from "@/lib/errors";
import {
  RegistrantListFilterSchema,
  registrationAnalyticsService,
} from "./services/registration-analytics-service";
import type { RegistrantCsvExportResult } from "./types";

export type RegistrantExportActionResult =
  | { success: true; data: RegistrantCsvExportResult }
  | { success: false; error: { code: "VALIDATION_ERROR" | "EXPORT_FAILED"; message: string } };

/**
 * CSV of the registrants matching the list filters. Authenticates, requires `canReports`,
 * validates the filters, and the service additionally limits names and e-mails to ADMIN
 * and HR; the export is recorded in the audit log (EXPORT_REPORT / REGISTRATIONS).
 */
export async function exportRegistrantsCsvAction(rawInput: unknown): Promise<RegistrantExportActionResult> {
  try {
    const user = await requirePermission("canReports");

    const parsed = RegistrantListFilterSchema.safeParse(rawInput ?? {});
    if (!parsed.success) {
      return {
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: parsed.error.issues[0]?.message ?? "Check the registrant filters and try again.",
        },
      };
    }

    const data = await registrationAnalyticsService.exportRegistrantsCsv(user, parsed.data);
    return { success: true, data };
  } catch (error) {
    return {
      success: false,
      error: {
        code: "EXPORT_FAILED",
        message: toActionError(error, "We couldn't export the registrations. Please try again."),
      },
    };
  }
}
