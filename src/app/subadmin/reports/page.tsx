import React from "react";
import { redirect } from "next/navigation";
import { getCurrentUser, hasPermission } from "@/lib/auth/guards";
import { STAFF_ROLES } from "@/lib/auth/permissions";
import { ValidationError } from "@/lib/errors";
import { reportService } from "@/features/reports/services/report-service";
import { AnalyticsDashboardClient } from "@/features/reports/components/analytics-dashboard-client";
import { UnauthorizedState } from "@/components/feedback/unauthorized-state";

export const instant = false;

export const metadata = {
  title: "Analytics & Reports — SubAdmin Console",
  description:
    "Recruitment funnel, workforce headcount, attendance, and payroll reporting.",
};

interface SubAdminReportsPageProps {
  searchParams: Promise<{
    startDate?: string;
    endDate?: string;
    department?: string;
    openingId?: string;
  }>;
}

export default async function SubAdminReportsPage({
  searchParams,
}: SubAdminReportsPageProps) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login?callbackUrl=/subadmin/reports");
  }
  if (user.mustChangePassword) {
    redirect("/set-password");
  }

  const hasStaffOrAdminRole = user.roles.some((r) => STAFF_ROLES.includes(r));
  if (!hasStaffOrAdminRole) {
    redirect("/candidate/dashboard");
  }

  if (!(await hasPermission(user, "canReports"))) {
    return (
      <UnauthorizedState message="Operational reports require the reports permission." />
    );
  }

  const resolvedParams = await searchParams;

  let analyticsData: Awaited<ReturnType<typeof reportService.getComprehensiveAnalytics>>;
  try {
    // Payroll figures are omitted by the service unless the user also holds canPayroll.
    analyticsData = await reportService.getComprehensiveAnalytics(user, {
      startDate: resolvedParams.startDate || undefined,
      endDate: resolvedParams.endDate || undefined,
      department: resolvedParams.department || undefined,
      openingId: resolvedParams.openingId || undefined,
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

  return (
    <div className="w-full">
      <AnalyticsDashboardClient initialData={analyticsData} basePath="/subadmin" />
    </div>
  );
}
