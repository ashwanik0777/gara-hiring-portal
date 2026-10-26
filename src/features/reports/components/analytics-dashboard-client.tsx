"use client";

import React, { useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import {
  BarChart3,
  Users,
  Briefcase,
  Calendar,
  CreditCard,
  Download,
  Filter,
  Globe,
  Building,
  TrendingDown,
  UserPlus,
} from "lucide-react";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ComprehensiveAnalyticsDashboardData } from "../types";

/** Placeholder with the footprint of a chart card, shown while a chart chunk loads. */
function ChartCardSkeleton() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className="rounded-2xl border border-border/80 bg-card p-5 shadow-2xs space-y-5"
    >
      <span className="sr-only">Loading chart</span>
      <div className="space-y-2">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-3 w-56 max-w-full" />
      </div>
      <div className="flex h-44 items-end gap-2">
        {[60, 85, 45, 70, 95, 55, 75, 40].map((h, i) => (
          <Skeleton key={i} className="flex-1 rounded-t-md rounded-b-none" style={{ height: `${h}%` }} />
        ))}
      </div>
    </div>
  );
}

function PanelSkeleton() {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className="rounded-2xl border border-border/80 bg-card p-5 space-y-4">
      <span className="sr-only">Loading export panel</span>
      <Skeleton className="h-4 w-48" />
      <div className="flex flex-wrap gap-3">
        <Skeleton className="h-8 w-56 rounded-xl" />
        <Skeleton className="h-8 w-56 rounded-xl" />
        <Skeleton className="h-8 w-56 rounded-xl" />
      </div>
    </div>
  );
}

/*
 * The SVG charts are lazy-loaded so the first paint ships the KPI cards and the plain
 * tables (which remain the accessible, always-rendered view of the same figures); each
 * chart shows a skeleton of its own size until its chunk arrives.
 */
// next/dynamic requires an inline object literal for its options, so each call repeats it.
const RecruitmentTrendChart = dynamic(
  () => import("./analytics-charts").then((mod) => mod.RecruitmentTrendChart),
  { loading: () => <ChartCardSkeleton /> }
);
const SteppedFunnelChart = dynamic(
  () => import("./analytics-charts").then((mod) => mod.SteppedFunnelChart),
  { loading: () => <ChartCardSkeleton /> }
);
const WorkforceDonutChart = dynamic(
  () => import("./analytics-charts").then((mod) => mod.WorkforceDonutChart),
  { loading: () => <ChartCardSkeleton /> }
);
const AttendanceTrendChart = dynamic(
  () => import("./analytics-charts").then((mod) => mod.AttendanceTrendChart),
  { loading: () => <ChartCardSkeleton /> }
);
const PayrollTrendChart = dynamic(
  () => import("./analytics-charts").then((mod) => mod.PayrollTrendChart),
  { loading: () => <ChartCardSkeleton /> }
);
const ReportsExportPanel = dynamic(
  () => import("./reports-export-panel").then((mod) => mod.ReportsExportPanel),
  { loading: () => <PanelSkeleton /> }
);

export type AnalyticsDashboardTab =
  | "overview"
  | "recruitment"
  | "funnel"
  | "registrations"
  | "workforce"
  | "payroll"
  | "exports";

interface AnalyticsDashboardClientProps {
  initialData: ComprehensiveAnalyticsDashboardData;
  /** Console the dashboard is rendered in, used for filter navigation and module links. */
  basePath?: "/admin" | "/subadmin";
  /** Tab shown first (`?tab=funnel` / `?tab=registrations` open the server-rendered tabs). */
  initialTab?: AnalyticsDashboardTab;
  /**
   * Server-rendered hiring funnel section. It is only rendered (and queried) when the page
   * was opened on the funnel tab; otherwise the tab navigates there.
   */
  hiringFunnel?: React.ReactNode;
  /** Server-rendered registrations section; same loading rule as the funnel. */
  registrations?: React.ReactNode;
}

/** Tabs whose content is a server-rendered section with its own filters. */
type ServerTab = "funnel" | "registrations";

export function AnalyticsDashboardClient({
  initialData,
  basePath = "/admin",
  initialTab = "overview",
  hiringFunnel,
  registrations,
}: AnalyticsDashboardClientProps) {
  const reportsPath = `${basePath}/reports`;
  const router = useRouter();
  const searchParams = useSearchParams();

  const serverTabContent: Record<ServerTab, React.ReactNode> = {
    funnel: hiringFunnel,
    registrations,
  };
  const [activeTab, setActiveTab] = useState<AnalyticsDashboardTab>(
    (initialTab === "funnel" || initialTab === "registrations") && !serverTabContent[initialTab]
      ? "overview"
      : initialTab
  );
  // The server-rendered tabs have their own filters and figures (no dashboard presets/KPIs).
  const showsDashboardFilters = activeTab !== "funnel" && activeTab !== "registrations";

  /** Opens a server-rendered tab: in place when it was rendered, otherwise by navigating. */
  const openServerTab = (tab: ServerTab) => {
    if (serverTabContent[tab]) {
      setActiveTab(tab);
      return;
    }
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", tab);
    router.push(`${reportsPath}?${params.toString()}`);
  };

  const [showCustomFilter, setShowCustomFilter] = useState(false);
  const [startDate, setStartDate] = useState(
    searchParams.get("startDate") || ""
  );
  const [endDate, setEndDate] = useState(searchParams.get("endDate") || "");
  const [department, setDepartment] = useState(
    searchParams.get("department") || ""
  );

  const kpis = initialData.kpis;
  const funnel = initialData.funnelStages;
  const charts = initialData.charts;
  const recruitment = initialData.recruitment;
  const employees = initialData.employees;
  const attendance = initialData.attendance;
  const leaves = initialData.leaves;
  const payroll = initialData.payroll;
  const telemetry = initialData.telemetry;

  const formatCurrency = (amount?: number | null) => {
    if (amount === undefined || amount === null) return "Not configured";
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const handleDatePreset = (days?: number) => {
    if (!days) {
      router.push(reportsPath);
      return;
    }
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - days);

    const sStr = start.toISOString().split("T")[0];
    const eStr = end.toISOString().split("T")[0];

    router.push(`${reportsPath}?startDate=${sStr}&endDate=${eStr}`);
  };

  const handleApplyFilter = (e: React.FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams();
    if (startDate) params.set("startDate", startDate);
    if (endDate) params.set("endDate", endDate);
    if (department) params.set("department", department);

    router.push(`${reportsPath}?${params.toString()}`);
    setShowCustomFilter(false);
  };

  return (
    <div className="w-full space-y-6">
      {/* ─── Top Action Strip: Tabs & Date Presets (Title is exclusively in Navbar) ─── */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        {/* Navigation Tabs */}
        <div className="flex items-center gap-1.5 p-1 rounded-2xl bg-muted/60 border border-border/60 overflow-x-auto max-w-full">
          <button
            onClick={() => setActiveTab("overview")}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
              activeTab === "overview"
                ? "bg-background text-foreground shadow-2xs border border-border/60"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <BarChart3 className="h-3.5 w-3.5" />
            Overview
          </button>

          <button
            onClick={() => setActiveTab("recruitment")}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
              activeTab === "recruitment"
                ? "bg-background text-foreground shadow-2xs border border-border/60"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Briefcase className="h-3.5 w-3.5" />
            Recruitment & Pipeline ({recruitment.totalApplications})
          </button>

          <button
            type="button"
            onClick={() => openServerTab("funnel")}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
              activeTab === "funnel"
                ? "bg-background text-foreground shadow-2xs border border-border/60"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <TrendingDown className="h-3.5 w-3.5" aria-hidden="true" />
            Hiring Funnel
          </button>

          <button
            type="button"
            onClick={() => openServerTab("registrations")}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
              activeTab === "registrations"
                ? "bg-background text-foreground shadow-2xs border border-border/60"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <UserPlus className="h-3.5 w-3.5" aria-hidden="true" />
            Registrations
          </button>

          <button
            onClick={() => setActiveTab("workforce")}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
              activeTab === "workforce"
                ? "bg-background text-foreground shadow-2xs border border-border/60"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Users className="h-3.5 w-3.5" />
            Workforce & HR ({employees.totalEmployees})
          </button>

          {payroll && (
            <button
              onClick={() => setActiveTab("payroll")}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
                activeTab === "payroll"
                  ? "bg-background text-foreground shadow-2xs border border-border/60"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <CreditCard className="h-3.5 w-3.5" />
              Payroll & Finance
            </button>
          )}

          <button
            onClick={() => setActiveTab("exports")}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
              activeTab === "exports"
                ? "bg-background text-foreground shadow-2xs border border-border/60"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Download className="h-3.5 w-3.5" />
            Audited CSV Exports
          </button>
        </div>

        {/* Date Filter Presets (the funnel and registrations tabs have their own filters) */}
        {showsDashboardFilters && (
        <div className="flex flex-wrap items-center gap-1.5 shrink-0">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => handleDatePreset()}
            className="h-8 text-xs rounded-xl"
          >
            All Time
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => handleDatePreset(30)}
            className="h-8 text-xs rounded-xl"
          >
            30 Days
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => handleDatePreset(90)}
            className="h-8 text-xs rounded-xl"
          >
            90 Days
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => handleDatePreset(365)}
            className="h-8 text-xs rounded-xl"
          >
            This Year
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowCustomFilter(!showCustomFilter)}
            className="h-8 text-xs rounded-xl gap-1.5"
          >
            <Filter className="h-3 w-3" />
            Custom Filter
          </Button>
        </div>
        )}
      </div>

      {/* ─── Collapsible Custom Filter Drawer ─── */}
      {showCustomFilter && showsDashboardFilters && (
        <Card className="rounded-2xl border border-border/80 p-4 shadow-2xs animate-in fade-in duration-150">
          <form onSubmit={handleApplyFilter} className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
            <div className="space-y-1">
              <label htmlFor="analytics-dashboard-client-start-date" className="text-[10px] font-bold text-muted-foreground uppercase font-mono">
                Start Date
              </label>
              <Input
                id="analytics-dashboard-client-start-date"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="text-xs rounded-xl h-9 font-mono"
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="analytics-dashboard-client-end-date" className="text-[10px] font-bold text-muted-foreground uppercase font-mono">
                End Date
              </label>
              <Input
                id="analytics-dashboard-client-end-date"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="text-xs rounded-xl h-9 font-mono"
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="analytics-dashboard-client-department" className="text-[10px] font-bold text-muted-foreground uppercase font-mono">
                Department
              </label>
              <Input
                id="analytics-dashboard-client-department"
                placeholder="e.g. Engineering"
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                className="text-xs rounded-xl h-9"
              />
            </div>
            <div className="flex gap-2">
              <Button type="submit" size="sm" className="h-9 text-xs rounded-xl flex-1">
                Apply
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setStartDate("");
                  setEndDate("");
                  setDepartment("");
                  router.push(reportsPath);
                  setShowCustomFilter(false);
                }}
                className="h-9 text-xs rounded-xl"
              >
                Reset
              </Button>
            </div>
          </form>
        </Card>
      )}

      {/* ─── 5 EXECUTIVE KPI CARDS (not on the server-rendered tabs, which have their own figures) ─── */}
      {showsDashboardFilters && (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5 sm:gap-4">
        {/* 1. Applications & Talent Funnel */}
        <div className="bg-card border border-border/80 border-l-4 border-l-blue-500 rounded-2xl p-4 sm:p-5 shadow-2xs hover:shadow-xs transition-all flex flex-col justify-between">
          <div className="flex items-center justify-between gap-2 mb-2">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider font-mono">
              Applications
            </span>
            <div className="h-8 w-8 rounded-xl bg-blue-500/15 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
              <Briefcase className="h-4 w-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold font-mono text-foreground tracking-tight">
            {kpis.totalApplications}
          </div>
          <div className="mt-2 flex items-center gap-1.5 text-[11px] font-mono">
            <Badge variant="outline" className="text-[10px] bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/20">
              {kpis.totalHired} Hired
            </Badge>
            <span className="text-muted-foreground">• {kpis.activeOpenings} Active Openings</span>
          </div>
        </div>

        {/* 2. Total Workforce Headcount */}
        <div className="bg-card border border-border/80 border-l-4 border-l-purple-500 rounded-2xl p-4 sm:p-5 shadow-2xs hover:shadow-xs transition-all flex flex-col justify-between">
          <div className="flex items-center justify-between gap-2 mb-2">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider font-mono">
              Workforce
            </span>
            <div className="h-8 w-8 rounded-xl bg-purple-500/15 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0">
              <Users className="h-4 w-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold font-mono text-foreground tracking-tight">
            {kpis.totalEmployees}
          </div>
          <div className="mt-2 flex items-center gap-1.5 text-[11px] font-mono">
            <span className="font-semibold text-purple-700 dark:text-purple-300">
              {kpis.fullTimeCount} Full-Time
            </span>
            <span className="text-muted-foreground">•</span>
            <span className="text-muted-foreground">{kpis.internCount} Interns</span>
          </div>
        </div>

        {/* 3. Disbursed Payroll Volume */}
        <div className="bg-card border border-border/80 border-l-4 border-l-emerald-500 rounded-2xl p-4 sm:p-5 shadow-2xs hover:shadow-xs transition-all flex flex-col justify-between">
          <div className="flex items-center justify-between gap-2 mb-2">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider font-mono">
              Disbursed Payroll
            </span>
            <div className="h-8 w-8 rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
              <CreditCard className="h-4 w-4" />
            </div>
          </div>
          {payroll ? (
            <>
              <div className="text-xl sm:text-2xl font-extrabold font-mono text-foreground tracking-tight truncate">
                {formatCurrency(kpis.payrollDisbursedAmount)}
              </div>
              <div className="mt-2 flex items-center gap-1.5 text-[11px] font-mono">
                <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20">
                  {kpis.paidWorkforceCount ?? 0} Paid
                </Badge>
                <span className="text-muted-foreground">• {kpis.unpaidWorkforceCount ?? 0} Unpaid</span>
              </div>
            </>
          ) : (
            <p className="text-xs text-muted-foreground">
              Payroll figures require the payroll permission.
            </p>
          )}
        </div>

        {/* 4. Attendance & Leaves Today */}
        <div className="bg-card border border-border/80 border-l-4 border-l-amber-500 rounded-2xl p-4 sm:p-5 shadow-2xs hover:shadow-xs transition-all flex flex-col justify-between">
          <div className="flex items-center justify-between gap-2 mb-2">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider font-mono">
              Attendance Today
            </span>
            <div className="h-8 w-8 rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
              <Calendar className="h-4 w-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold font-mono text-foreground tracking-tight">
            {kpis.todayAttendancePresent}
          </div>
          <div className="mt-2 flex items-center gap-1.5 text-[11px] font-mono">
            <span className="font-semibold text-emerald-600 dark:text-emerald-400">Present</span>
            <span className="text-muted-foreground">•</span>
            <span className="text-amber-600 dark:text-amber-400">{kpis.todayOnLeave} on Leave</span>
          </div>
        </div>

        {/* 5. Platform Visitors & Conversion */}
        <div className="col-span-2 sm:col-span-1 bg-card border border-border/80 border-l-4 border-l-cyan-500 rounded-2xl p-4 sm:p-5 shadow-2xs hover:shadow-xs transition-all flex flex-col justify-between">
          <div className="flex items-center justify-between gap-2 mb-2">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider font-mono">
              Portal Traffic
            </span>
            <div className="h-8 w-8 rounded-xl bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 flex items-center justify-center shrink-0">
              <Globe className="h-4 w-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold font-mono text-foreground tracking-tight">
            {telemetry.uniqueVisitors}
          </div>
          <div className="mt-2 flex items-center gap-1.5 text-[11px] font-mono">
            <Badge variant="outline" className="text-[10px] bg-cyan-500/10 text-cyan-700 dark:text-cyan-300 border-cyan-500/20">
              {telemetry.conversionRate}% Conversion
            </Badge>
          </div>
        </div>
      </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          TAB: HIRING FUNNEL (server-rendered section, streamed in Suspense)
          ══════════════════════════════════════════════════════════════════ */}
      {activeTab === "funnel" && hiringFunnel}

      {/* ══════════════════════════════════════════════════════════════════
          TAB: REGISTRATIONS (server-rendered section, streamed in Suspense)
          ══════════════════════════════════════════════════════════════════ */}
      {activeTab === "registrations" && registrations}

      {/* ══════════════════════════════════════════════════════════════════
          TAB 1: OVERVIEW & SYSTEM HEALTH (RICH GRAPHS FIRST)
          ══════════════════════════════════════════════════════════════════ */}
      {activeTab === "overview" && (
        <div className="space-y-6">
          {/* Top Row: Monthly Trend Area Chart & Conversion Funnel */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <RecruitmentTrendChart data={charts.monthlyRecruitmentTrends} />
            <SteppedFunnelChart
              stages={funnel}
              totalApplications={recruitment.totalApplications}
            />
          </div>

          {/* Middle Row: Workforce Donut Chart & 7-Day Attendance Dynamics */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <WorkforceDonutChart
              departments={charts.departmentDistribution}
              employmentTypes={charts.employmentTypeDistribution}
              totalEmployees={employees.totalEmployees}
            />
            <AttendanceTrendChart
              data={charts.attendanceDailyTrends}
              todayPresent={kpis.todayAttendancePresent}
              todayOnLeave={kpis.todayOnLeave}
              activeStaff={kpis.activeEmployees}
            />
          </div>

          {/* Bottom Row: 3 Functional Matrix Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* 1. Department Breakdown */}
            <Card className="rounded-2xl border border-border/80 p-5 shadow-2xs flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between pb-3 border-b border-border/60 mb-3">
                  <CardTitle className="text-sm font-bold text-foreground flex items-center gap-2">
                    <Building className="h-4 w-4 text-primary" />
                    Departments
                  </CardTitle>
                  <Badge variant="outline" className="font-mono text-xs">
                    {employees.byDepartment.length} Units
                  </Badge>
                </div>

                <div className="space-y-2.5">
                  {employees.byDepartment.length === 0 ? (
                    <div className="py-6 text-center text-xs text-muted-foreground">
                      No department data available
                    </div>
                  ) : (
                    employees.byDepartment.slice(0, 5).map((dept) => {
                      const pct =
                        employees.totalEmployees > 0
                          ? Math.round((dept.count / employees.totalEmployees) * 100)
                          : 0;
                      return (
                        <div key={dept.department} className="space-y-1">
                          <div className="flex justify-between text-xs">
                            <span className="font-medium text-foreground">{dept.department}</span>
                            <span className="font-mono font-bold text-muted-foreground">
                              {dept.count} ({pct}%)
                            </span>
                          </div>
                          <div className="h-1.5 w-full bg-muted/60 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-primary rounded-full"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              <div className="pt-3 border-t border-border/60 mt-4 flex items-center justify-between text-xs text-muted-foreground">
                <span>Active Staff: {kpis.activeEmployees}</span>
                <button
                  onClick={() => setActiveTab("workforce")}
                  className="text-primary font-semibold hover:underline flex items-center gap-1 cursor-pointer"
                >
                  View Staff →
                </button>
              </div>
            </Card>

            {/* 2. Leave & Absence Operations */}
            <Card className="rounded-2xl border border-border/80 p-5 shadow-2xs flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between pb-3 border-b border-border/60 mb-3">
                  <CardTitle className="text-sm font-bold text-foreground flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-primary" />
                    Leave & Time-Off
                  </CardTitle>
                  <Badge variant="outline" className="font-mono text-xs">
                    {leaves.totalRequests} Requests
                  </Badge>
                </div>

                <div className="grid grid-cols-3 gap-2 text-center mb-4">
                  <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20">
                    <span className="text-[10px] font-bold text-amber-700 dark:text-amber-400 font-mono">
                      Pending
                    </span>
                    <div className="text-lg font-bold font-mono text-amber-800 dark:text-amber-300">
                      {leaves.pendingCount}
                    </div>
                  </div>
                  <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                    <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400 font-mono">
                      Approved
                    </span>
                    <div className="text-lg font-bold font-mono text-emerald-800 dark:text-emerald-300">
                      {leaves.approvedCount}
                    </div>
                  </div>
                  <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20">
                    <span className="text-[10px] font-bold text-rose-700 dark:text-rose-400 font-mono">
                      Rejected
                    </span>
                    <div className="text-lg font-bold font-mono text-rose-800 dark:text-rose-300">
                      {leaves.rejectedCount}
                    </div>
                  </div>
                </div>

                {/* Popular Categories */}
                <div className="space-y-1.5 text-xs">
                  {leaves.byCategory.slice(0, 3).map((cat) => (
                    <div key={cat.category} className="flex justify-between py-1 border-b border-border/40">
                      <span className="text-muted-foreground">{cat.category}</span>
                      <span className="font-mono font-bold text-foreground">{cat.count}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-3 border-t border-border/60 mt-4 flex items-center justify-between text-xs text-muted-foreground">
                <span>Active on leave today: {kpis.todayOnLeave}</span>
                <Link href={`${basePath}/leave`} className="text-primary font-semibold hover:underline flex items-center gap-1">
                  Manage Leaves →
                </Link>
              </div>
            </Card>

            {/* 3. Payroll & Financial Summary (only with the payroll permission) */}
            {payroll ? (
            <Card className="rounded-2xl border border-border/80 p-5 shadow-2xs flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between pb-3 border-b border-border/60 mb-3">
                  <CardTitle className="text-sm font-bold text-foreground flex items-center gap-2">
                    <CreditCard className="h-4 w-4 text-primary" />
                    Payroll Operations
                  </CardTitle>
                  <Badge variant="outline" className="font-mono text-xs">
                    Cycle: {payroll.activeCycleCode ?? "Not configured"}
                  </Badge>
                </div>

                <div className="space-y-3">
                  <div className="p-3.5 rounded-xl bg-muted/40 border border-border/60 flex justify-between items-center">
                    <div>
                      <span className="text-[10px] font-bold text-muted-foreground uppercase font-mono">
                        Recorded Disbursements
                      </span>
                      <div className="text-xl font-bold font-mono text-emerald-600 dark:text-emerald-400">
                        {formatCurrency(payroll.disbursedAmount)}
                      </div>
                      {payroll.paidWithoutRecordedAmount > 0 && (
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {payroll.paidWithoutRecordedAmount} paid record(s) without a recorded amount are excluded.
                        </p>
                      )}
                    </div>
                    <Badge variant="outline" className="text-xs font-mono">
                      {kpis.payrollCompletionRate ?? 0}% Paid
                    </Badge>
                  </div>

                  <div className="space-y-1.5 text-xs">
                    <div className="flex justify-between py-1 border-b border-border/40">
                      <span className="text-muted-foreground">Configured as Paid:</span>
                      <span className="font-mono font-bold text-foreground">
                        {payroll.paidWorkforce} Staff
                      </span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-border/40">
                      <span className="text-muted-foreground">Configured as Unpaid:</span>
                      <span className="font-mono font-bold text-muted-foreground">
                        {payroll.unpaidWorkforce} Staff
                      </span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-border/40">
                      <span className="text-muted-foreground">Payout Not Configured:</span>
                      <span className="font-mono font-bold text-muted-foreground">
                        {payroll.payoutNotConfigured} Staff
                      </span>
                    </div>
                    <div className="flex justify-between py-1">
                      <span className="text-muted-foreground">Pending Payouts:</span>
                      <span className="font-mono font-bold text-amber-600 dark:text-amber-400">
                        {payroll.pendingCount}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t border-border/60 mt-4 flex items-center justify-between text-xs text-muted-foreground">
                <span>Cycle: {payroll.cycleStatus ?? "Not configured"}</span>
                <Link href={`${basePath}/payroll`} className="text-primary font-semibold hover:underline flex items-center gap-1">
                  Manage Payroll →
                </Link>
              </div>
            </Card>
            ) : (
            <Card className="rounded-2xl border border-border/80 p-5 shadow-2xs flex flex-col justify-center text-center">
              <CreditCard className="h-5 w-5 text-muted-foreground mx-auto mb-2" />
              <CardTitle className="text-sm font-bold text-foreground">Payroll Operations</CardTitle>
              <p className="text-xs text-muted-foreground mt-1">
                Payroll figures are only shown to staff with the payroll permission.
              </p>
            </Card>
            )}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          TAB 2: RECRUITMENT & HIRING VELOCITY
          ══════════════════════════════════════════════════════════════════ */}
      {activeTab === "recruitment" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <RecruitmentTrendChart data={charts.monthlyRecruitmentTrends} />
            <SteppedFunnelChart
              stages={funnel}
              totalApplications={recruitment.totalApplications}
            />
          </div>

          {/* Top Openings Performance Table */}
          <Card className="rounded-2xl border border-border/80 overflow-hidden shadow-2xs">
            <div className="p-4 border-b border-border/60 flex items-center justify-between">
              <CardTitle className="text-sm font-bold text-foreground flex items-center gap-2">
                <Briefcase className="h-4 w-4 text-primary" />
                Vacancies & Application Volume
              </CardTitle>
              <Badge variant="outline" className="font-mono text-xs">
                {recruitment.byOpening.length} Openings
              </Badge>
            </div>

            <div className="w-full">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-border/80 bg-muted/40 text-muted-foreground text-[11px] uppercase tracking-wider font-mono font-bold">
                    <th className="py-3 px-4">Role Title</th>
                    <th className="py-3 px-4">Department</th>
                    <th className="py-3 px-4">Nature</th>
                    <th className="py-3 px-4 text-right pr-4">Total Applicants</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {recruitment.byOpening.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-8 text-center text-muted-foreground text-xs">
                        No openings or application data recorded in this period.
                      </td>
                    </tr>
                  ) : (
                    recruitment.byOpening.map((op) => (
                      <tr key={op.openingId} className="hover:bg-muted/30 transition-colors">
                        <td className="py-3.5 px-4 font-semibold text-foreground">
                          {op.title}
                        </td>
                        <td className="py-3.5 px-4 text-muted-foreground">
                          {op.department}
                        </td>
                        <td className="py-3.5 px-4">
                          <Badge variant="outline" className="text-[10px] font-mono">
                            {op.type}
                          </Badge>
                        </td>
                        <td className="py-3.5 px-4 text-right pr-4 font-mono font-bold text-foreground">
                          {op.applicationCount}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Status Breakdown Chips */}
          <Card className="rounded-2xl border border-border/80 p-5 shadow-2xs">
            <CardTitle className="text-sm font-bold text-foreground mb-4">
              Detailed Application Status Distribution
            </CardTitle>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {Object.entries(recruitment.byStatus).map(([st, cnt]) => (
                <div key={st} className="p-3 rounded-xl bg-muted/40 border border-border/60 flex items-center justify-between">
                  <span className="font-mono text-xs text-muted-foreground truncate">{st}</span>
                  <span className="font-mono font-bold text-foreground text-sm">{cnt}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          TAB 3: WORKFORCE & HR DEMOGRAPHICS
          ══════════════════════════════════════════════════════════════════ */}
      {activeTab === "workforce" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <WorkforceDonutChart
              departments={charts.departmentDistribution}
              employmentTypes={charts.employmentTypeDistribution}
              totalEmployees={employees.totalEmployees}
            />
            <AttendanceTrendChart
              data={charts.attendanceDailyTrends}
              todayPresent={kpis.todayAttendancePresent}
              todayOnLeave={kpis.todayOnLeave}
              activeStaff={kpis.activeEmployees}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Status Breakdown */}
            <Card className="rounded-2xl border border-border/80 p-5 shadow-2xs">
              <CardTitle className="text-sm font-bold text-foreground mb-4 flex items-center gap-2">
                <Users className="h-4 w-4 text-primary" />
                Staff Employment Status
              </CardTitle>
              <div className="space-y-2.5">
                {Object.entries(employees.byStatus).map(([status, count]) => {
                  const pct =
                    employees.totalEmployees > 0
                      ? Math.round((count / employees.totalEmployees) * 100)
                      : 0;
                  return (
                    <div key={status} className="p-3 rounded-xl bg-muted/40 border border-border/60 flex items-center justify-between">
                      <span className="font-mono text-xs font-semibold">{status}</span>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-foreground">{count}</span>
                        <span className="text-xs text-muted-foreground">({pct}%)</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>

            {/* Attendance Analytics */}
            <Card className="rounded-2xl border border-border/80 p-5 shadow-2xs">
              <CardTitle className="text-sm font-bold text-foreground mb-4 flex items-center gap-2">
                <Calendar className="h-4 w-4 text-primary" />
                Attendance Log Distribution
              </CardTitle>
              <div className="space-y-2.5">
                {Object.entries(attendance.byStatus).length === 0 ? (
                  <div className="py-6 text-center text-xs text-muted-foreground">
                    No attendance records logged yet.
                  </div>
                ) : (
                  Object.entries(attendance.byStatus).map(([status, count]) => (
                    <div key={status} className="p-3 rounded-xl bg-muted/40 border border-border/60 flex items-center justify-between">
                      <span className="font-mono text-xs font-semibold">{status}</span>
                      <span className="font-mono font-bold text-foreground">{count}</span>
                    </div>
                  ))
                )}
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          TAB 4: PAYROLL & FINANCE TELEMETRY
          ══════════════════════════════════════════════════════════════════ */}
      {activeTab === "payroll" && payroll && (
        <div className="space-y-6">
          <PayrollTrendChart
            data={charts.payrollCycleTrends}
            formatCurrency={formatCurrency}
          />

          <Card className="rounded-2xl border border-border/80 p-5 shadow-2xs">
            <div className="flex items-center justify-between pb-4 border-b border-border/60 mb-4">
              <CardTitle className="text-sm font-bold text-foreground flex items-center gap-2">
                <CreditCard className="h-4 w-4 text-primary" />
                Current Cycle: {payroll.activeCycleCode ?? "Not configured"}
              </CardTitle>
              <Badge variant="outline" className="font-mono text-xs">
                Status: {payroll.cycleStatus ?? "Not configured"}
              </Badge>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              <div className="p-4 rounded-xl bg-muted/40 border border-border/60">
                <span className="text-[10px] font-bold text-muted-foreground uppercase font-mono">
                  Enrolled Workforce
                </span>
                <div className="text-2xl font-bold font-mono text-foreground mt-1">
                  {payroll.totalEnrolled}
                </div>
              </div>
              <div className="p-4 rounded-xl bg-muted/40 border border-border/60">
                <span className="text-[10px] font-bold text-muted-foreground uppercase font-mono">
                  Paid Disbursed
                </span>
                <div className="text-2xl font-bold font-mono text-emerald-600 dark:text-emerald-400 mt-1">
                  {payroll.paidCount}
                </div>
              </div>
              <div className="p-4 rounded-xl bg-muted/40 border border-border/60">
                <span className="text-[10px] font-bold text-muted-foreground uppercase font-mono">
                  Pending Payouts
                </span>
                <div className="text-2xl font-bold font-mono text-amber-600 dark:text-amber-400 mt-1">
                  {payroll.pendingCount}
                </div>
              </div>
              <div className="p-4 rounded-xl bg-muted/40 border border-border/60">
                <span className="text-[10px] font-bold text-muted-foreground uppercase font-mono">
                  Recorded Disbursements
                </span>
                <div className="text-2xl font-bold font-mono text-foreground mt-1">
                  {formatCurrency(payroll.disbursedAmount)}
                </div>
                {payroll.paidWithoutRecordedAmount > 0 && (
                  <p className="text-[10px] text-muted-foreground mt-1">
                    Excludes {payroll.paidWithoutRecordedAmount} paid record(s) without a recorded amount.
                  </p>
                )}
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          TAB 5: AUDITED CSV EXPORTS
          ══════════════════════════════════════════════════════════════════ */}
      {activeTab === "exports" && (
        <div className="space-y-6">
          <ReportsExportPanel filters={initialData.metadata.filters} />
        </div>
      )}
    </div>
  );
}
