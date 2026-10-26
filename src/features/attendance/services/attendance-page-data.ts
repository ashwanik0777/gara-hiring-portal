import type { AuthenticatedUser } from "@/lib/auth/guards";
import { ForbiddenError } from "@/lib/errors";
import { AttendanceListQuerySchema, type AttendanceListQuery } from "../schemas";
import type { AttendancePageData } from "../types";
import { attendanceService } from "./attendance-service";

const FORBIDDEN_MESSAGE = "Attendance administration requires the attendance permission.";

export type RawSearchParams = Record<string, string | string[] | undefined>;

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** Validates URL search params; unknown or malformed values fall back to defaults. */
export function parseAttendanceListQuery(raw: RawSearchParams | undefined): AttendanceListQuery {
  return AttendanceListQuerySchema.parse({
    month: firstValue(raw?.month),
    status: firstValue(raw?.status),
    q: firstValue(raw?.q),
    employee: firstValue(raw?.employee),
    page: firstValue(raw?.page),
  });
}

/**
 * Loads one page of data for an attendance page. Staff holding `canAttendance` receive
 * the team view; when `allowSelfView` is set everyone else receives only their own records.
 */
export async function loadAttendancePageData(
  user: AuthenticatedUser,
  options: { allowSelfView: boolean; query?: AttendanceListQuery }
): Promise<AttendancePageData> {
  const query = options.query ?? {};
  try {
    if (await attendanceService.canManageAttendance(user)) {
      const team = await attendanceService.getTeamAttendanceView(user, {
        month: query.month,
        status: query.status,
        search: query.q,
        employeeId: query.employee,
        page: query.page,
      });
      return { view: "team", ...team };
    }
    if (options.allowSelfView) {
      const self = await attendanceService.getSelfAttendanceView(user, {
        month: query.month,
        page: query.page,
      });
      return { view: "self", ...self };
    }
    return { view: "forbidden", message: FORBIDDEN_MESSAGE };
  } catch (err) {
    if (err instanceof ForbiddenError) {
      return { view: "forbidden", message: err.message };
    }
    throw err;
  }
}
