import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser, hasPermission } from "@/lib/auth/guards";
import { STAFF_ROLES } from "@/lib/auth/permissions";
import { AnalyticsDashboardSection } from "@/features/reports/components/analytics-dashboard-section";
import { UnauthorizedState } from "@/components/feedback/unauthorized-state";
import { ReportsPageSkeleton } from "@/components/feedback/page-skeletons";

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
    tab?: string;
    funnelStart?: string;
    funnelEnd?: string;
    funnelType?: string;
    funnelOpening?: string;
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

  return (
    <div className="w-full">
      <Suspense fallback={<ReportsPageSkeleton label="Loading reports" />}>
        {/* Payroll figures are omitted by the service unless the user also holds canPayroll. */}
        <AnalyticsDashboardSection user={user} basePath="/subadmin" searchParams={resolvedParams} />
      </Suspense>
    </div>
  );
}
