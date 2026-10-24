import type { AuthenticatedUser } from "@/lib/auth/guards";
import { ForbiddenError } from "@/lib/errors";
import type { AttendancePageData } from "../types";
import { attendanceService } from "./attendance-service";

const FORBIDDEN_MESSAGE = "Attendance administration requires the attendance permission.";

/**
 * Loads the data for an attendance page. Staff holding `canAttendance` receive the
 * team view; when `allowSelfView` is set everyone else receives only their own records.
 */
export async function loadAttendancePageData(
  user: AuthenticatedUser,
  options: { allowSelfView: boolean }
): Promise<AttendancePageData> {
  try {
    if (await attendanceService.canManageAttendance(user)) {
      const team = await attendanceService.getTeamAttendanceView(user);
      return { view: "team", ...team };
    }
    if (options.allowSelfView) {
      const self = await attendanceService.getSelfAttendanceView(user);
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
