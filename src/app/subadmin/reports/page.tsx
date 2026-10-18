import React from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/guards";
import { getUserPermissions, STAFF_ROLES } from "@/lib/auth/permissions";
import { reportService } from "@/features/reports/services/report-service";
import { AnalyticsDashboardClient } from "@/features/reports/components/analytics-dashboard-client";

export const instant = false;

export const metadata = {
  title: "Analytics & Reports — SubAdmin Console",
  description:
    "Real-time recruitment funnel, workforce headcount, attendance, and payroll telemetry.",
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

  const hasStaffOrAdminRole = user.roles.some((r) => STAFF_ROLES.includes(r));
  if (!hasStaffOrAdminRole) {
    redirect("/candidate/dashboard");
  }

  const permissions = await getUserPermissions(user.id, user.roles);
  if (!permissions.canReports) {
    redirect("/subadmin");
  }

  const resolvedParams = await searchParams;
  const startDate = resolvedParams.startDate || undefined;
  const endDate = resolvedParams.endDate || undefined;
  const department = resolvedParams.department || undefined;
  const openingId = resolvedParams.openingId || undefined;

  const analyticsData = await reportService.getComprehensiveAnalytics(user, {
    startDate,
    endDate,
    department,
    openingId,
  });

  return (
    <div className="w-full">
      <AnalyticsDashboardClient initialData={analyticsData} />
    </div>
  );
}
