"use server";

import { requireRole } from "@/lib/auth/guards";
import { Role } from "@prisma/client";
import { toSafeErrorResponse } from "@/lib/errors";
import { ExportReportInput } from "./schemas";
import { reportService } from "./services/report-service";

export async function exportReportCsvAction(input: ExportReportInput) {
  try {
    const user = await requireRole([Role.ADMIN, Role.HR, Role.MANAGER]);
    const result = await reportService.exportReportCsv(user, input);
    return {
      success: true as const,
      data: result,
    };
  } catch (error) {
    return toSafeErrorResponse(error);
  }
}
