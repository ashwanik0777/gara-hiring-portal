import React from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/guards";
import { getUserPermissions, STAFF_ROLES } from "@/lib/auth/permissions";
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

export const instant = false;

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

  const report = await reportService.getOperationsReport(user, {
    startDate,
    endDate,
    department,
    openingId,
  });

  return (
    <div className="space-y-6">
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
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight mt-1 flex items-center gap-2">
            <BarChart3 className="h-7 w-7 text-primary" /> Operational Analytics & Audited Exports
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            Recruitment throughput, pipeline drop-offs, evaluation metrics, and verified CSV exports.
          </p>
        </div>

        <ReportsExportPanel filters={report.metadata.filters} />
      </div>

      {/* Filter Bar */}
      <Card>
        <CardContent className="p-4">
          <form method="GET" className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
            <div>
              <label className="text-[11px] font-semibold text-muted-foreground block mb-1">
                Start Date
              </label>
              <Input
                type="date"
                name="startDate"
                defaultValue={startDate || ""}
                className="h-8 text-xs"
              />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-muted-foreground block mb-1">
                End Date
              </label>
              <Input
                type="date"
                name="endDate"
                defaultValue={endDate || ""}
                className="h-8 text-xs"
              />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-muted-foreground block mb-1">
                Department
              </label>
              <Input
                type="text"
                name="department"
                placeholder="e.g. Engineering"
                defaultValue={department || ""}
                className="h-8 text-xs"
              />
            </div>
            <div className="flex gap-2">
              <Button type="submit" size="sm" className="h-8 text-xs flex-1 gap-1">
                <Filter className="h-3 w-3" /> Filter
              </Button>
              <Link href="/subadmin/reports">
                <Button type="button" variant="outline" size="sm" className="h-8 text-xs">
                  Reset
                </Button>
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Core KPI Tiles */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5 text-primary" /> Total Applications
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{report.recruitment.totalApplications}</div>
            <p className="text-[11px] text-muted-foreground mt-0.5">In selected window</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
              <Briefcase className="h-3.5 w-3.5 text-emerald-500" /> Archived Pipeline
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
              {report.recruitment.archivedApplications}
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Archived applications
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
              <GraduationCap className="h-3.5 w-3.5 text-indigo-500" /> Intern Enrolled
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{report.internship.totalEnrollments}</div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {report.internship.onboardingCompletedCount} onboarding complete
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5 text-blue-500" /> Total Headcount
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{report.employees.totalEmployees}</div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {Object.keys(report.employees.byStatus).length} status categories
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Breakdown Grids */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold">Hiring Funnel Status Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 text-xs">
              {Object.entries(report.recruitment.byStatus).map(([status, count]) => (
                <div key={status} className="flex items-center justify-between py-1 border-b border-border/40 last:border-0">
                  <span className="font-mono text-muted-foreground">{status}</span>
                  <Badge variant="outline" className="font-mono">
                    {count}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold">Department Headcount Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            {report.employees.byDepartment.length === 0 ? (
              <p className="text-xs text-muted-foreground">No departmental employee distribution recorded.</p>
            ) : (
              <div className="space-y-2 text-xs">
                {report.employees.byDepartment.map((dept) => (
                  <div key={dept.department} className="flex items-center justify-between py-1 border-b border-border/40 last:border-0">
                    <span>{dept.department}</span>
                    <Badge variant="outline" className="font-mono">
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
  );
}
