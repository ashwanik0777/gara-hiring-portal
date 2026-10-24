import type { AuthenticatedUser } from "@/lib/auth/guards";
import { ForbiddenError } from "@/lib/errors";
import { Role } from "@prisma/client";
import type { LeavePageData } from "../types";
import { leaveService } from "./leave-service";

const FORBIDDEN_MESSAGE = "Leave administration requires the leave permission.";

/**
 * Loads the data for a leave page. Staff holding `canLeave` receive the team view;
 * when `allowSelfView` is set everyone else receives only their own requests.
 * No leave categories are seeded and no employee records are created here.
 */
export async function loadLeavePageData(
  user: AuthenticatedUser,
  options: { allowSelfView: boolean }
): Promise<LeavePageData> {
  try {
    if (await leaveService.canManageLeave(user)) {
      const [stats, leaveTypes, requests, employees, canManageTypes] = await Promise.all([
        leaveService.getLeaveStats(user),
        leaveService.getLeaveTypes(true),
        leaveService.getAllLeaveRequests(user),
        leaveService.getEmployeeOptions(user),
        leaveService.canManageLeaveTypes(user),
      ]);
      return {
        view: "team",
        stats,
        leaveTypes,
        requests,
        employees,
        canManageTypes,
        canSeedDefaultTypes: user.roles.includes(Role.ADMIN),
      };
    }

    if (options.allowSelfView) {
      const [overview, leaveTypes] = await Promise.all([
        leaveService.getMyLeaveOverview(user),
        leaveService.getLeaveTypes(false),
      ]);
      return {
        view: "self",
        requests: overview.requests,
        stats: overview.stats,
        leaveTypes,
        employees: overview.employee ? [overview.employee] : [],
      };
    }

    return { view: "forbidden", message: FORBIDDEN_MESSAGE };
  } catch (err) {
    if (err instanceof ForbiddenError) {
      return { view: "forbidden", message: err.message };
    }
    throw err;
  }
}
