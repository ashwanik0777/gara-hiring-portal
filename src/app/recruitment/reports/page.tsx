import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/guards";
import { UnauthorizedState } from "@/components/feedback/unauthorized-state";
import { Role } from "@prisma/client";
import { Navbar } from "@/components/navigation/navbar";
import { reportService } from "@/features/reports/services/report-service";
import { ReportsExportPanel } from "@/features/reports/components/reports-export-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  BarChart3,
  Briefcase,
  Calendar,
  Filter,
  GraduationCap,
  ShieldCheck,
  Users,
} from "lucide-react";

export const metadata = {
  title: "Operational Reports & Audited Exports",
  description:
    "Real-time recruitment funnel, internship lifecycle, and employee headcount reports with audited CSV exports.",
};

interface ReportsPageProps {
  searchParams: Promise<{
    startDate?: string;
    endDate?: string;
    department?: string;
    openingId?: string;
  }>;
}

export const instant = false;

export default async function OperationalReportsPage({
  searchParams,
}: ReportsPageProps) {
  const user = await getCurrentUser();

  const canViewReports =
    user &&
    (user.roles.includes(Role.ADMIN) ||
      user.roles.includes(Role.HR) ||
      user.roles.includes(Role.MANAGER));

  if (!canViewReports) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Navbar />
        <div className="flex-1 flex items-center justify-center p-8">
          <UnauthorizedState message="Operational reports and exports are restricted to authorized Administrators, HR, and Managers." />
        </div>
      </div>
    );
  }

  const resolvedParams = await searchParams;
  const startDate = resolvedParams.startDate || undefined;
  const endDate = resolvedParams.endDate || undefined;
  const department = resolvedParams.department || undefined;
  const openingId = resolvedParams.openingId || undefined;

  const report = await reportService.getOperationsReport(user, {
    startDate,
    endDate,
    department,
    openingId,
  });

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <Navbar />

      <main className="flex-1 py-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/70 pb-6">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="text-xs gap-1">
                  <ShieldCheck className="h-3 w-3 text-primary" />
                  Authorized Analytics & Reporting
                </Badge>
                <Badge variant="secondary" className="text-xs gap-1">
                  <Calendar className="h-3 w-3" />
                  Period: {report.metadata.periodLabel}
                </Badge>
                {report.metadata.filters.department && (
                  <Badge variant="secondary" className="text-xs">
                    Dept: {report.metadata.filters.department}
                  </Badge>
                )}
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight mt-2 flex items-center gap-2">
                <BarChart3 className="h-7 w-7 text-primary" />
                Operational Reports & Audited Exports
              </h1>
            </div>
          </div>

          {/* Filter Form */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Filter className="h-4 w-4 text-primary" />
                Report Time Period & Scope Filters
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form
                method="GET"
                action="/recruitment/reports"
                className="grid grid-cols-1 sm:grid-cols-4 gap-4 items-end"
              >
                <div className="space-y-1">
                  <label
                    htmlFor="startDate"
                    className="text-xs font-medium text-muted-foreground"
                  >
                    Start Date (YYYY-MM-DD)
                  </label>
                  <Input
                    id="startDate"
                    name="startDate"
                    type="date"
                    defaultValue={startDate ?? ""}
                  />
                </div>
                <div className="space-y-1">
                  <label
                    htmlFor="endDate"
                    className="text-xs font-medium text-muted-foreground"
                  >
                    End Date (YYYY-MM-DD)
                  </label>
                  <Input
                    id="endDate"
                    name="endDate"
                    type="date"
                    defaultValue={endDate ?? ""}
                  />
                </div>
                <div className="space-y-1">
                  <label
                    htmlFor="department"
                    className="text-xs font-medium text-muted-foreground"
                  >
                    Department
                  </label>
                  <Input
                    id="department"
                    name="department"
                    placeholder="e.g. Engineering"
                    defaultValue={department ?? ""}
                  />
                </div>
                <div className="flex gap-2">
                  <Button type="submit" size="sm">
                    Apply Filters
                  </Button>
                  <Link href="/recruitment/reports">
                    <Button type="button" variant="outline" size="sm">
                      Reset
                    </Button>
                  </Link>
                </div>
              </form>
            </CardContent>
          </Card>

          {/* Audited CSV Export Panel */}
          <ReportsExportPanel filters={report.metadata.filters} />

          {/* Summary KPI Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* 1. Recruitment Pipeline */}
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Briefcase className="h-4 w-4 text-primary" />
                    Recruitment Pipeline
                  </CardTitle>
                  <Badge variant="secondary">
                    {report.recruitment.totalApplications} Total
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 text-xs">
                <div className="divide-y divide-border/60">
                  {Object.entries(report.recruitment.byStatus).length === 0 ? (
                    <p className="py-4 text-muted-foreground">
                      No applications recorded in this filter period.
                    </p>
                  ) : (
                    Object.entries(report.recruitment.byStatus).map(
                      ([status, count]) => (
                        <div
                          key={status}
                          className="py-2 flex items-center justify-between"
                        >
                          <span className="font-mono text-[11px]">{status}</span>
                          <span className="font-bold">{count}</span>
                        </div>
                      )
                    )
                  )}
                </div>
              </CardContent>
            </Card>

            {/* 2. Internship Lifecycle */}
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <GraduationCap className="h-4 w-4 text-primary" />
                    Internship Lifecycle
                  </CardTitle>
                  <Badge variant="secondary">
                    {report.internship.totalEnrollments} Enrolled
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 text-xs">
                <div className="grid grid-cols-2 gap-2 rounded-lg bg-muted/40 p-3">
                  <div>
                    <p className="text-muted-foreground">Onboarding Done</p>
                    <p className="text-base font-bold">
                      {report.internship.onboardingCompletedCount}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">ID Cards Issued</p>
                    <p className="text-base font-bold">
                      {report.internship.idCardsIssuedCount}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Active Certs</p>
                    <p className="text-base font-bold">
                      {report.internship.certificatesActiveCount}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Revoked Certs</p>
                    <p className="text-base font-bold">
                      {report.internship.certificatesRevokedCount}
                    </p>
                  </div>
                </div>

                <div className="divide-y divide-border/60">
                  {Object.entries(report.internship.byEvaluationStatus).map(
                    ([status, count]) => (
                      <div
                        key={status}
                        className="py-2 flex items-center justify-between"
                      >
                        <span className="font-mono text-[11px]">{status}</span>
                        <span className="font-bold">{count}</span>
                      </div>
                    )
                  )}
                </div>
              </CardContent>
            </Card>

            {/* 3. Employee Headcount */}
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Users className="h-4 w-4 text-primary" />
                    Employee Headcount
                  </CardTitle>
                  <Badge variant="secondary">
                    {report.employees.totalEmployees} Staff
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 text-xs">
                <div className="divide-y divide-border/60">
                  {Object.entries(report.employees.byStatus).length === 0 ? (
                    <p className="py-4 text-muted-foreground">
                      No employee records in this filter period.
                    </p>
                  ) : (
                    Object.entries(report.employees.byStatus).map(
                      ([status, count]) => (
                        <div
                          key={status}
                          className="py-2 flex items-center justify-between"
                        >
                          <span className="font-mono text-[11px]">{status}</span>
                          <span className="font-bold">{count}</span>
                        </div>
                      )
                    )
                  )}
                </div>

                {report.employees.byDepartment.length > 0 && (
                  <div className="pt-2 border-t border-border/60 space-y-1.5">
                    <p className="font-semibold text-muted-foreground">
                      By Department:
                    </p>
                    {report.employees.byDepartment.map((dept) => (
                      <div
                        key={dept.department}
                        className="flex items-center justify-between"
                      >
                        <span>{dept.department}</span>
                        <Badge variant="outline" className="text-[10px]">
                          {dept.count}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
