import type { AuthenticatedUser } from "@/lib/auth/guards";
import { ForbiddenError } from "@/lib/errors";
import { Role } from "@prisma/client";
import { LeaveListQuerySchema, type LeaveListQuery } from "../schemas";
import type { LeaveListFilters, LeavePageData } from "../types";
import { leaveService } from "./leave-service";

const FORBIDDEN_MESSAGE = "Leave administration requires the leave permission.";

export type RawSearchParams = Record<string, string | string[] | undefined>;

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** Validates URL search params; unknown or malformed values fall back to defaults. */
export function parseLeaveListQuery(raw: RawSearchParams | undefined): LeaveListQuery {
  return LeaveListQuerySchema.parse({
    status: firstValue(raw?.status),
    type: firstValue(raw?.type),
    q: firstValue(raw?.q),
    page: firstValue(raw?.page),
    tab: firstValue(raw?.tab),
  });
}

/**
 * Loads one page of data for a leave page. Staff holding `canLeave` receive the team view;
 * when `allowSelfView` is set everyone else receives only their own requests.
 * No leave categories are seeded and no employee records are created here.
 */
export async function loadLeavePageData(
  user: AuthenticatedUser,
  options: { allowSelfView: boolean; query?: LeaveListQuery }
): Promise<LeavePageData> {
  const query = options.query ?? {};
  const filters: LeaveListFilters = {
    status: query.status,
    leaveTypeId: query.type,
    search: query.q,
  };
  const listQuery = { ...filters, page: query.page };

  try {
    if (await leaveService.canManageLeave(user)) {
      const [stats, leaveTypes, requestPage, employeeOptions, canManageTypes, calendar] =
        await Promise.all([
          leaveService.getLeaveStats(user),
          leaveService.getLeaveTypes(true),
          leaveService.getAllLeaveRequests(user, listQuery),
          leaveService.getEmployeeOptions(user),
          leaveService.canManageLeaveTypes(user),
          leaveService.getLeaveCalendar(user),
        ]);
      return {
        view: "team",
        stats,
        leaveTypes,
        requests: requestPage.items,
        page: requestPage.page,
        filters,
        calendar,
        employees: employeeOptions.options,
        employeesTotal: employeeOptions.total,
        canManageTypes,
        canSeedDefaultTypes: user.roles.includes(Role.ADMIN),
      };
    }

    if (options.allowSelfView) {
      const [overview, leaveTypes] = await Promise.all([
        leaveService.getMyLeaveOverview(user, listQuery),
        leaveService.getLeaveTypes(false),
      ]);
      return {
        view: "self",
        requests: overview.requests,
        page: overview.page,
        filters,
        calendar: overview.calendar,
        stats: overview.stats,
        leaveTypes,
        employees: overview.employee ? [overview.employee] : [],
        employeesTotal: overview.employee ? 1 : 0,
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
