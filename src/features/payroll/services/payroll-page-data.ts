import type { AuthenticatedUser } from "@/lib/auth/guards";
import { ForbiddenError } from "@/lib/errors";
import { PayrollPeriodIdSchema } from "../schemas";
import type { MyPayrollOverview, PayrollDashboardData } from "../types";
import { payrollService } from "./payroll-service";

export type PayrollPageData =
  | { view: "team"; data: PayrollDashboardData }
  | { view: "self"; overview: MyPayrollOverview }
  | { view: "forbidden"; message: string };

const FORBIDDEN_MESSAGE = "Payroll access requires the HR role and the payroll permission.";

/**
 * Loads the data for a payroll page. Staff with payroll access (ADMIN, or HR holding
 * `canPayroll`) receive the team view; when `allowSelfView` is set everyone else
 * receives only their own records. Account numbers and PANs are masked in both views.
 */
export async function loadPayrollPageData(
  user: AuthenticatedUser,
  periodParam: string | string[] | undefined,
  options: { allowSelfView: boolean }
): Promise<PayrollPageData> {
  try {
    if (await payrollService.canManagePayroll(user)) {
      const parsedPeriod = PayrollPeriodIdSchema.safeParse(periodParam);
      const data = await payrollService.getPayrollDashboardData(
        user,
        parsedPeriod.success ? parsedPeriod.data : undefined
      );
      return { view: "team", data };
    }
    if (options.allowSelfView) {
      return { view: "self", overview: await payrollService.getMyPayrollOverview(user) };
    }
    return { view: "forbidden", message: FORBIDDEN_MESSAGE };
  } catch (err) {
    if (err instanceof ForbiddenError) {
      return { view: "forbidden", message: err.message };
    }
    throw err;
  }
}
