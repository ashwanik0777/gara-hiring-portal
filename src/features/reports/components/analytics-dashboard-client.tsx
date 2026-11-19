"use client";

import React, { useRef, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import {
  BarChart3,
  Users,
  Briefcase,
  Calendar,
  CalendarRange,
  CheckCircle2,
  Clock,
  CreditCard,
  Download,
  Filter,
  Globe,
  Building,
  TrendingDown,
  UserPlus,
  type LucideIcon,
} from "lucide-react";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCard, StatGrid } from "@/components/ui/stat-card";
import { cn } from "@/lib/utils";
import { describeApplicationStage } from "@/features/applications/stage-labels";
import { ComprehensiveAnalyticsDashboardData } from "../types";
import { ReportToolbarLabel, reportFieldLabelClass, reportToolbarClass } from "./report-toolbar";

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

interface TabDefinition {
  key: AnalyticsDashboardTab;
  label: string;
  icon: LucideIcon;
}

/** Shared tab panel; every tab's `aria-controls` points at it. */
const TAB_PANEL_ID = "reports-tabpanel";
const CUSTOM_FILTER_ID = "reports-custom-filter";

function tabId(key: AnalyticsDashboardTab): string {
  return `reports-tab-${key}`;
}

type DatePreset = "all" | "30" | "90" | "365" | "custom";

const DATE_PRESETS: ReadonlyArray<{ key: Exclude<DatePreset, "all" | "custom">; label: string; days: number }> = [
  { key: "30", label: "30 Days", days: 30 },
  { key: "90", label: "90 Days", days: 90 },
  { key: "365", label: "This Year", days: 365 },
];

/** The preset date range (UTC calendar days, as the preset buttons have always used). */
function presetRange(days: number, now: Date): { startDate: string; endDate: string } {
  const end = new Date(now);
  const start = new Date(now);
  start.setDate(end.getDate() - days);
  return { startDate: start.toISOString().split("T")[0], endDate: end.toISOString().split("T")[0] };
}

/** Which preset the applied filters correspond to (computed from the report time, not the clock). */
function activeDatePreset(data: ComprehensiveAnalyticsDashboardData): DatePreset {
  const { filters, generatedAt } = data.metadata;
  if (!filters.startDate && !filters.endDate && !filters.department && !filters.openingId) return "all";
  if (filters.department || filters.openingId) return "custom";
  const reportTime = new Date(generatedAt);
  const match = DATE_PRESETS.find((preset) => {
    const range = presetRange(preset.days, reportTime);
    return range.startDate === filters.startDate && range.endDate === filters.endDate;
  });
  return match ? match.key : "custom";
}

const humanize = (code: string) => code.replace(/_/g, " ");

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
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const kpis = initialData.kpis;
  const funnel = initialData.funnelStages;
  const charts = initialData.charts;
  const recruitment = initialData.recruitment;
  const employees = initialData.employees;
  const attendance = initialData.attendance;
  const leaves = initialData.leaves;
  const payroll = initialData.payroll;
  const telemetry = initialData.telemetry;
  const activePreset = activeDatePreset(initialData);

  const tabs: TabDefinition[] = [
    { key: "overview", label: "Overview", icon: BarChart3 },
    { key: "recruitment", label: `Recruitment & Pipeline (${recruitment.totalApplications})`, icon: Briefcase },
    { key: "funnel", label: "Hiring Funnel", icon: TrendingDown },
    { key: "registrations", label: "Registrations", icon: UserPlus },
    { key: "workforce", label: `Workforce & HR (${employees.totalEmployees})`, icon: Users },
    ...(payroll ? [{ key: "payroll" as const, label: "Payroll & Finance", icon: CreditCard }] : []),
    { key: "exports", label: "Audited CSV Exports", icon: Download },
  ];

  const selectTab = (key: AnalyticsDashboardTab) => {
    if (key === "funnel" || key === "registrations") {
      openServerTab(key);
    } else {
      setActiveTab(key);
    }
  };

  /**
   * Arrow keys, Home and End move focus along the tab strip (manual activation: Enter or
   * Space opens the focused tab, because the funnel and registrations tabs navigate).
   */
  const handleTabKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    let next: number | null = null;
    if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
    else if (event.key === "ArrowLeft") next = (index - 1 + tabs.length) % tabs.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = tabs.length - 1;
    if (next === null) return;
    event.preventDefault();
    tabRefs.current[next]?.focus();
  };

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
    const range = presetRange(days, new Date());
    router.push(`${reportsPath}?startDate=${range.startDate}&endDate=${range.endDate}`);
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

  const presetButtonClass = (active: boolean) =>
    cn(
      "h-7 shrink-0 rounded-lg px-3 text-xs font-semibold whitespace-nowrap transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      active
        ? "bg-background text-foreground shadow-2xs border border-border/60"
        : "text-muted-foreground hover:text-foreground"
    );

  const appliedPeriod = [
    initialData.metadata.periodLabel,
    initialData.metadata.filters.department ? `Department: ${initialData.metadata.filters.department}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="w-full space-y-6">
      {/* ─── Row 1: the tab strip, always on its own full-width row (title lives in the navbar) ─── */}
      <div
        role="tablist"
        aria-label="Report sections"
        aria-orientation="horizontal"
        className="flex w-full items-center gap-1.5 overflow-x-auto overscroll-x-contain rounded-2xl border border-border/60 bg-muted/60 p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {tabs.map((tab, index) => {
          const selected = activeTab === tab.key;
          const Icon = tab.icon;
          return (
            <button
              key={tab.key}
              ref={(element) => {
                tabRefs.current[index] = element;
              }}
              type="button"
              role="tab"
              id={tabId(tab.key)}
              aria-selected={selected}
              aria-controls={TAB_PANEL_ID}
              tabIndex={selected ? 0 : -1}
              onClick={() => selectTab(tab.key)}
              onKeyDown={(event) => handleTabKeyDown(event, index)}
              className={cn(
                "flex shrink-0 items-center gap-2 whitespace-nowrap rounded-xl border px-3.5 py-1.5 text-xs font-semibold transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                selected
                  ? "border-border/60 bg-background text-foreground shadow-2xs"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className="h-3.5 w-3.5" aria-hidden="true" />
              {tab.label}
            </button>
          );
        })}
      </div>

      <div role="tabpanel" id={TAB_PANEL_ID} aria-labelledby={tabId(activeTab)} className="space-y-6">
        {/* ─── Row 2: period toolbar (the funnel and registrations tabs render their own filters here) ─── */}
        {showsDashboardFilters && (
          <div className={cn(reportToolbarClass, "flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between")}>
            <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
              <ReportToolbarLabel id="reports-period-label" icon={CalendarRange} className="lg:w-20">
                Period
              </ReportToolbarLabel>
              <div
                role="group"
                aria-labelledby="reports-period-label"
                className="flex max-w-full items-center gap-1 overflow-x-auto rounded-xl border border-border/60 bg-muted/60 p-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              >
                <button
                  type="button"
                  aria-pressed={activePreset === "all"}
                  onClick={() => handleDatePreset()}
                  className={presetButtonClass(activePreset === "all")}
                >
                  All Time
                </button>
                {DATE_PRESETS.map((preset) => (
                  <button
                    key={preset.key}
                    type="button"
                    aria-pressed={activePreset === preset.key}
                    onClick={() => handleDatePreset(preset.days)}
                    className={presetButtonClass(activePreset === preset.key)}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 sm:justify-end">
              <span className="min-w-0 truncate text-[11px] text-muted-foreground" title={appliedPeriod}>
                Showing: {appliedPeriod}
              </span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                aria-expanded={showCustomFilter}
                aria-controls={CUSTOM_FILTER_ID}
                onClick={() => setShowCustomFilter(!showCustomFilter)}
                className={cn(
                  "h-8 shrink-0 gap-1.5 rounded-xl text-xs",
                  activePreset === "custom" && "border-primary/60 text-primary"
                )}
              >
                <Filter className="h-3 w-3" aria-hidden="true" />
                Custom Filter
              </Button>
            </div>
          </div>
        )}

        {/* ─── Row 3: custom filter drawer ─── */}
        {showCustomFilter && showsDashboardFilters && (
          <Card id={CUSTOM_FILTER_ID} className="rounded-2xl border border-border/80 p-4 shadow-2xs animate-in fade-in duration-150">
            <form onSubmit={handleApplyFilter} className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
              <div className="space-y-1">
                <label htmlFor="analytics-dashboard-client-start-date" className={reportFieldLabelClass}>
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
                <label htmlFor="analytics-dashboard-client-end-date" className={reportFieldLabelClass}>
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
                <label htmlFor="analytics-dashboard-client-department" className={reportFieldLabelClass}>
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
          <StatGrid columns={5} label="Key figures">
            <StatCard
              label="Applications"
              value={kpis.totalApplications}
              icon={Briefcase}
              tone="blue"
              hint={
                <>
                  <Badge variant="outline" className="text-[10px] bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/20">
                    {kpis.totalHired} Hired
                  </Badge>
                  <span className="font-mono">• {kpis.activeOpenings} Active Openings</span>
                </>
              }
            />
            <StatCard
              label="Workforce"
              value={kpis.totalEmployees}
              icon={Users}
              tone="violet"
              hint={
                <span className="font-mono">
                  <span className="font-semibold text-violet-700 dark:text-violet-300">{kpis.fullTimeCount} Full-Time</span>
                  {" • "}
                  {kpis.internCount} Interns
                </span>
              }
            />
            {payroll ? (
              <StatCard
                label="Disbursed Payroll"
                value={kpis.payrollDisbursedAmount === null ? null : formatCurrency(kpis.payrollDisbursedAmount)}
                icon={CreditCard}
                tone="emerald"
                hint={
                  <>
                    <Badge
                      variant="outline"
                      className="text-[10px] bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20"
                    >
                      {kpis.paidWorkforceCount ?? 0} Paid
                    </Badge>
                    <span className="font-mono">• {kpis.unpaidWorkforceCount ?? 0} Unpaid</span>
                  </>
                }
              />
            ) : (
              <StatCard
                label="Disbursed Payroll"
                value="Restricted"
                icon={CreditCard}
                tone="emerald"
                hint="Payroll figures require the payroll permission."
              />
            )}
            <StatCard
              label="Attendance Today"
              value={kpis.todayAttendancePresent}
              icon={Calendar}
              tone="amber"
              hint={
                <span className="font-mono">
                  <span className="font-semibold text-emerald-600 dark:text-emerald-400">Present</span>
                  {" • "}
                  <span className="text-amber-600 dark:text-amber-400">{kpis.todayOnLeave} on Leave</span>
                </span>
              }
            />
            <StatCard
              label="Portal Traffic"
              value={telemetry.uniqueVisitors}
              icon={Globe}
              tone="cyan"
              className="col-span-2 sm:col-span-1"
              hint={
                <Badge variant="outline" className="text-[10px] bg-cyan-500/10 text-cyan-700 dark:text-cyan-300 border-cyan-500/20">
                  {telemetry.conversionRate}% Conversion
                </Badge>
              }
            />
          </StatGrid>
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
                    type="button"
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

                  <StatGrid columns={3} label="Leave requests by status" className="mb-4 gap-2 sm:gap-2">
                    <StatCard label="Pending" value={leaves.pendingCount} tone="amber" size="compact" />
                    <StatCard label="Approved" value={leaves.approvedCount} tone="emerald" size="compact" />
                    <StatCard label="Rejected" value={leaves.rejectedCount} tone="rose" size="compact" />
                  </StatGrid>

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
                    <StatCard
                      label="Recorded Disbursements"
                      value={formatCurrency(payroll.disbursedAmount)}
                      tone="emerald"
                      size="compact"
                      hint={
                        <>
                          <Badge variant="outline" className="text-xs font-mono">
                            {kpis.payrollCompletionRate ?? 0}% Paid
                          </Badge>
                          {payroll.paidWithoutRecordedAmount > 0 && (
                            <span>
                              {payroll.paidWithoutRecordedAmount} paid record(s) without a recorded amount are excluded.
                            </span>
                          )}
                        </>
                      }
                    />

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

              <div className="w-full overflow-x-auto">
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

            {/* Status Breakdown */}
            <Card className="rounded-2xl border border-border/80 p-5 shadow-2xs">
              <CardTitle className="text-sm font-bold text-foreground mb-4">
                Detailed Application Status Distribution
              </CardTitle>
              {Object.keys(recruitment.byStatus).length === 0 ? (
                <p className="py-6 text-center text-xs text-muted-foreground">
                  No applications recorded in this period.
                </p>
              ) : (
                <StatGrid columns={4} label="Applications by status">
                  {Object.entries(recruitment.byStatus).map(([st, cnt]) => (
                    <StatCard key={st} label={describeApplicationStage(st)} value={cnt} size="compact" />
                  ))}
                </StatGrid>
              )}
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
                {Object.keys(employees.byStatus).length === 0 ? (
                  <p className="py-6 text-center text-xs text-muted-foreground">No employee records yet.</p>
                ) : (
                  <StatGrid columns={3} label="Staff by employment status">
                    {Object.entries(employees.byStatus).map(([status, count]) => {
                      const pct =
                        employees.totalEmployees > 0
                          ? Math.round((count / employees.totalEmployees) * 100)
                          : 0;
                      return (
                        <StatCard
                          key={status}
                          label={humanize(status)}
                          value={count}
                          size="compact"
                          tone="violet"
                          hint={`${pct}% of staff`}
                        />
                      );
                    })}
                  </StatGrid>
                )}
              </Card>

              {/* Attendance Analytics */}
              <Card className="rounded-2xl border border-border/80 p-5 shadow-2xs">
                <CardTitle className="text-sm font-bold text-foreground mb-4 flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-primary" />
                  Attendance Log Distribution
                </CardTitle>
                {Object.entries(attendance.byStatus).length === 0 ? (
                  <div className="py-6 text-center text-xs text-muted-foreground">
                    No attendance records logged yet.
                  </div>
                ) : (
                  <StatGrid columns={3} label="Attendance records by status">
                    {Object.entries(attendance.byStatus).map(([status, count]) => (
                      <StatCard key={status} label={humanize(status)} value={count} size="compact" tone="amber" />
                    ))}
                  </StatGrid>
                )}
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
              <div className="flex flex-wrap items-center justify-between gap-2 pb-4 border-b border-border/60 mb-4">
                <CardTitle className="text-sm font-bold text-foreground flex items-center gap-2">
                  <CreditCard className="h-4 w-4 text-primary" />
                  Current Cycle: {payroll.activeCycleCode ?? "Not configured"}
                </CardTitle>
                <Badge variant="outline" className="font-mono text-xs">
                  Status: {payroll.cycleStatus ?? "Not configured"}
                </Badge>
              </div>

              <StatGrid columns={4} label="Current payroll cycle">
                <StatCard label="Enrolled Workforce" value={payroll.totalEnrolled} icon={Users} tone="slate" />
                <StatCard label="Paid Disbursed" value={payroll.paidCount} icon={CheckCircle2} tone="emerald" />
                <StatCard label="Pending Payouts" value={payroll.pendingCount} icon={Clock} tone="amber" />
                <StatCard
                  label="Recorded Disbursements"
                  value={formatCurrency(payroll.disbursedAmount)}
                  icon={CreditCard}
                  tone="slate"
                  hint={
                    payroll.paidWithoutRecordedAmount > 0
                      ? `Excludes ${payroll.paidWithoutRecordedAmount} paid record(s) without a recorded amount.`
                      : undefined
                  }
                />
              </StatGrid>
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
    </div>
  );
}
