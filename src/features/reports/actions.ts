"use server";

import { requireAuth } from "@/lib/auth/guards";
import { toSafeErrorResponse } from "@/lib/errors";
import { ExportReportInput } from "./schemas";
import { reportService } from "./services/report-service";

export async function exportReportCsvAction(input: ExportReportInput) {
  try {
    const user = await requireAuth();
    const result = await reportService.exportReportCsv(user, input);
    return {
      success: true as const,
      data: result,
    };
  } catch (error) {
    return toSafeErrorResponse(error);
  }
}
