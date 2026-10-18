import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/guards";
import { Role } from "@prisma/client";
import { reportService } from "@/features/reports/services/report-service";
import { AnalyticsDashboardClient } from "@/features/reports/components/analytics-dashboard-client";

export const instant = false;

export const metadata = {
  title: "Analytics & Reports — Admin Console",
  description:
    "Real-time recruitment funnel, workforce headcount, attendance, and payroll telemetry.",
};

interface ReportsPageProps {
  searchParams: Promise<{
    startDate?: string;
    endDate?: string;
    department?: string;
    openingId?: string;
  }>;
}

export default async function OperationalReportsPage({
  searchParams,
}: ReportsPageProps) {
  const user = await getCurrentUser();

  const canViewReports =
    user &&
    (user.roles.includes(Role.ADMIN) ||
      user.roles.includes(Role.HR) ||
      user.roles.includes(Role.MANAGER));

  if (!user || !canViewReports) {
    redirect("/admin");
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
