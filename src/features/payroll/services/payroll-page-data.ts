import type { AuthenticatedUser } from "@/lib/auth/guards";
import { ForbiddenError } from "@/lib/errors";
import { PayrollDashboardQuerySchema, type PayrollDashboardQuery } from "../schemas";
import type { MyPayrollOverview, PayrollDashboardData } from "../types";
import { payrollService } from "./payroll-service";

export type PayrollPageData =
  | { view: "team"; data: PayrollDashboardData }
  | { view: "self"; overview: MyPayrollOverview }
  | { view: "forbidden"; message: string };

const FORBIDDEN_MESSAGE = "Payroll access requires the HR role and the payroll permission.";

export type RawSearchParams = Record<string, string | string[] | undefined>;

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** Validates URL search params; unknown or malformed values fall back to defaults. */
export function parsePayrollDashboardQuery(raw: RawSearchParams | undefined): PayrollDashboardQuery {
  return PayrollDashboardQuerySchema.parse({
    period: firstValue(raw?.period),
    status: firstValue(raw?.status),
    q: firstValue(raw?.q),
    page: firstValue(raw?.page),
    ppage: firstValue(raw?.ppage),
    dpage: firstValue(raw?.dpage),
    dq: firstValue(raw?.dq),
    tab: firstValue(raw?.tab),
  });
}

/**
 * Loads one page of data for a payroll page. Staff with payroll access (ADMIN, or HR
 * holding `canPayroll`) receive the team view; when `allowSelfView` is set everyone else
 * receives only their own records. Account numbers and PANs are masked in both views.
 */
export async function loadPayrollPageData(
  user: AuthenticatedUser,
  options: { allowSelfView: boolean; query?: PayrollDashboardQuery }
): Promise<PayrollPageData> {
  const query = options.query ?? {};
  try {
    if (await payrollService.canManagePayroll(user)) {
      const data = await payrollService.getPayrollDashboardData(user, {
        periodId: query.period,
        status: query.status,
        search: query.q,
        page: query.page,
        periodsPage: query.ppage,
        directoryPage: query.dpage,
        directorySearch: query.dq,
      });
      return { view: "team", data };
    }
    if (options.allowSelfView) {
      return {
        view: "self",
        overview: await payrollService.getMyPayrollOverview(user, { page: query.page }),
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
