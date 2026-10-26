import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser, hasPermission } from "@/lib/auth/guards";
import { Role } from "@prisma/client";
import { AnalyticsDashboardSection } from "@/features/reports/components/analytics-dashboard-section";
import { UnauthorizedState } from "@/components/feedback/unauthorized-state";
import { ReportsPageSkeleton } from "@/components/feedback/page-skeletons";

export const instant = false;

export const metadata = {
  title: "Analytics & Reports — Admin Console",
  description:
    "Recruitment funnel, workforce headcount, attendance, and payroll reporting.",
};

interface ReportsPageProps {
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

export default async function OperationalReportsPage({
  searchParams,
}: ReportsPageProps) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login?callbackUrl=/admin/reports");
  }
  if (user.mustChangePassword) {
    redirect("/set-password");
  }

  // The page authorizes itself: layouts are not a security boundary.
  if (!user.roles.includes(Role.ADMIN) || !(await hasPermission(user, "canReports"))) {
    return (
      <UnauthorizedState message="Operational reports require the reports permission." />
    );
  }

  const resolvedParams = await searchParams;

  return (
    <div className="w-full">
      <Suspense fallback={<ReportsPageSkeleton label="Loading reports" />}>
        <AnalyticsDashboardSection user={user} basePath="/admin" searchParams={resolvedParams} />
      </Suspense>
    </div>
  );
}
