"use server";

import { requirePermission } from "@/lib/auth/guards";
import { toActionError } from "@/lib/errors";
import { ExportReportSchema, HiringFunnelFilterSchema } from "./schemas";
import { reportService } from "./services/report-service";
import { hiringFunnelService } from "./services/hiring-funnel-service";

export async function exportReportCsvAction(rawInput: unknown) {
  try {
    const user = await requirePermission("canReports");

    const parsed = ExportReportSchema.safeParse(rawInput);
    if (!parsed.success) {
      return {
        success: false as const,
        error: {
          code: "VALIDATION_ERROR",
          message: parsed.error.issues[0]?.message ?? "Invalid report export parameters.",
        },
      };
    }

    const result = await reportService.exportReportCsv(user, parsed.data);
    return {
      success: true as const,
      data: result,
    };
  } catch (error) {
    return {
      success: false as const,
      error: {
        code: "EXPORT_FAILED",
        message: toActionError(error, "Failed to export the report. Please try again."),
      },
    };
  }
}

/** CSV export of the hiring funnel for the given filters (audited as EXPORT_REPORT). */
export async function exportHiringFunnelCsvAction(rawInput: unknown) {
  try {
    const user = await requirePermission("canReports");

    const parsed = HiringFunnelFilterSchema.safeParse(rawInput ?? {});
    if (!parsed.success) {
      return {
        success: false as const,
        error: {
          code: "VALIDATION_ERROR",
          message: parsed.error.issues[0]?.message ?? "Check the funnel filters and try again.",
        },
      };
    }

    const result = await hiringFunnelService.exportHiringFunnelCsv(user, parsed.data);
    return { success: true as const, data: result };
  } catch (error) {
    return {
      success: false as const,
      error: {
        code: "EXPORT_FAILED",
        message: toActionError(error, "We couldn't export the hiring funnel. Please try again."),
      },
    };
  }
}
