import { Suspense } from "react";
import type { AuthenticatedUser } from "@/lib/auth/guards";
import { ValidationError } from "@/lib/errors";
import { reportService } from "../services/report-service";
import type { ComprehensiveAnalyticsDashboardData } from "../types";
import { AnalyticsDashboardClient } from "./analytics-dashboard-client";
import {
  HiringFunnelSection,
  HiringFunnelSkeleton,
  readHiringFunnelParams,
} from "./hiring-funnel-section";

type SearchParamValue = string | string[] | undefined;

interface AnalyticsDashboardSectionProps {
  user: AuthenticatedUser;
  basePath: "/admin" | "/subadmin";
  searchParams: Record<string, SearchParamValue>;
}

const DASHBOARD_PARAM_KEYS = ["startDate", "endDate", "department", "openingId"] as const;

function firstValue(value: SearchParamValue): string | undefined {
  const single = Array.isArray(value) ? value[0] : value;
  return single || undefined;
}

/**
 * Streams the analytics dashboard for a reports page (the caller has already checked
 * `canReports`). The payroll figures are omitted by the service unless the viewer also
 * holds `canPayroll`; the hiring funnel streams in its own boundary.
 */
export async function AnalyticsDashboardSection({
  user,
  basePath,
  searchParams,
}: AnalyticsDashboardSectionProps) {
  let analyticsData: ComprehensiveAnalyticsDashboardData;
  try {
    analyticsData = await reportService.getComprehensiveAnalytics(user, {
      startDate: firstValue(searchParams.startDate),
      endDate: firstValue(searchParams.endDate),
      department: firstValue(searchParams.department),
      openingId: firstValue(searchParams.openingId),
    });
  } catch (error) {
    if (!(error instanceof ValidationError)) {
      throw error;
    }
    return (
      <div
        role="alert"
        className="max-w-lg mx-auto rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive"
      >
        Invalid report filters: {error.message}
      </div>
    );
  }

  // Dashboard filters kept when the funnel filters change (and vice versa).
  const preservedParams: Record<string, string> = {};
  for (const key of DASHBOARD_PARAM_KEYS) {
    const value = firstValue(searchParams[key]);
    if (value) preservedParams[key] = value;
  }
  const showFunnel = firstValue(searchParams.tab) === "funnel";
  const reportsPath = `${basePath}/reports`;

  return (
    <AnalyticsDashboardClient
      // Remount when switching to/from the funnel tab so the requested tab opens.
      key={showFunnel ? "funnel" : "dashboard"}
      initialData={analyticsData}
      basePath={basePath}
      initialTab={showFunnel ? "funnel" : "overview"}
      hiringFunnel={
        showFunnel ? (
          <Suspense fallback={<HiringFunnelSkeleton />}>
            <HiringFunnelSection
              user={user}
              filters={readHiringFunnelParams(searchParams)}
              reportsPath={reportsPath}
              preservedParams={preservedParams}
            />
          </Suspense>
        ) : undefined
      }
    />
  );
}
