import React from "react";
import type { AuthenticatedUser } from "@/lib/auth/guards";
import {
  loadPayrollPageData,
  parsePayrollDashboardQuery,
  type RawSearchParams,
} from "../services/payroll-page-data";
import { PayrollPageView } from "./payroll-page-view";

/**
 * Streams the data-dependent part of a payroll page: reads the URL (period, filters,
 * pages) and loads one bounded page server-side. The page itself only performs the
 * authentication and role guards and wraps this in `<Suspense>`.
 */
export async function PayrollPageSection({
  user,
  searchParams,
  allowSelfView,
  basePath,
}: {
  user: AuthenticatedUser;
  searchParams: Promise<RawSearchParams>;
  allowSelfView: boolean;
  basePath: string;
}) {
  const query = parsePayrollDashboardQuery(await searchParams);
  const pageData = await loadPayrollPageData(user, { allowSelfView, query });
  return <PayrollPageView pageData={pageData} initialTab={query.tab} basePath={basePath} />;
}
