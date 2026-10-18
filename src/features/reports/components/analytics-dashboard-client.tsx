"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  BarChart3,
  Users,
  Briefcase,
  Calendar,
  CreditCard,
  Download,
  Filter,
  TrendingUp,
  Globe,
  Building,
} from "lucide-react";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ComprehensiveAnalyticsDashboardData } from "../types";
import { ReportsExportPanel } from "./reports-export-panel";
import {
  RecruitmentTrendChart,
  SteppedFunnelChart,
  WorkforceDonutChart,
  AttendanceTrendChart,
  PayrollTrendChart,
} from "./analytics-charts";

interface AnalyticsDashboardClientProps {
  initialData: ComprehensiveAnalyticsDashboardData;
}

export function AnalyticsDashboardClient({
  initialData,
}: AnalyticsDashboardClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [activeTab, setActiveTab] = useState<
    "overview" | "recruitment" | "workforce" | "payroll" | "exports"
  >("overview");

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
    if (amount === undefined || amount === null) return "₹0";
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const handleDatePreset = (days?: number) => {
    if (!days) {
      router.push("/admin/reports");
      return;
    }
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - days);

    const sStr = start.toISOString().split("T")[0];
    const eStr = end.toISOString().split("T")[0];

    router.push(`/admin/reports?startDate=${sStr}&endDate=${eStr}`);
  };

  const handleApplyFilter = (e: React.FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams();
    if (startDate) params.set("startDate", startDate);
    if (endDate) params.set("endDate", endDate);
    if (department) params.set("department", department);

    router.push(`/admin/reports?${params.toString()}`);
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

        {/* Date Filter Presets */}
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
      </div>

      {/* ─── Collapsible Custom Filter Drawer ─── */}
      {showCustomFilter && (
        <Card className="rounded-2xl border border-border/80 p-4 shadow-2xs animate-in fade-in duration-150">
          <form onSubmit={handleApplyFilter} className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-muted-foreground uppercase font-mono">
                Start Date
              </label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="text-xs rounded-xl h-9 font-mono"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-muted-foreground uppercase font-mono">
                End Date
              </label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="text-xs rounded-xl h-9 font-mono"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-muted-foreground uppercase font-mono">
                Department
              </label>
              <Input
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
                  router.push("/admin/reports");
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

      {/* ─── 5 EXECUTIVE KPI CARDS ─── */}
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
          <div className="text-xl sm:text-2xl font-extrabold font-mono text-foreground tracking-tight truncate">
            {formatCurrency(kpis.payrollDisbursedAmount)}
          </div>
          <div className="mt-2 flex items-center gap-1.5 text-[11px] font-mono">
            <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20">
              {kpis.paidWorkforceCount} Paid
            </Badge>
            <span className="text-muted-foreground">• {kpis.unpaidWorkforceCount} Unpaid</span>
          </div>
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
                <Link href="/admin/leave" className="text-primary font-semibold hover:underline flex items-center gap-1">
                  Manage Leaves →
                </Link>
              </div>
            </Card>

            {/* 3. Payroll & Financial Summary */}
            <Card className="rounded-2xl border border-border/80 p-5 shadow-2xs flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between pb-3 border-b border-border/60 mb-3">
                  <CardTitle className="text-sm font-bold text-foreground flex items-center gap-2">
                    <CreditCard className="h-4 w-4 text-primary" />
                    Payroll Operations
                  </CardTitle>
                  <Badge variant="outline" className="font-mono text-xs">
                    Cycle: {payroll.activeCycleCode}
                  </Badge>
                </div>

                <div className="space-y-3">
                  <div className="p-3.5 rounded-xl bg-muted/40 border border-border/60 flex justify-between items-center">
                    <div>
                      <span className="text-[10px] font-bold text-muted-foreground uppercase font-mono">
                        Disbursed Net Pay
                      </span>
                      <div className="text-xl font-bold font-mono text-emerald-600 dark:text-emerald-400">
                        {formatCurrency(payroll.disbursedAmount)}
                      </div>
                    </div>
                    <Badge variant="outline" className="text-xs font-mono">
                      {kpis.payrollCompletionRate}% Paid
                    </Badge>
                  </div>

                  <div className="space-y-1.5 text-xs">
                    <div className="flex justify-between py-1 border-b border-border/40">
                      <span className="text-muted-foreground">Paid Eligible Workforce:</span>
                      <span className="font-mono font-bold text-foreground">
                        {payroll.paidWorkforce} Staff
                      </span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-border/40">
                      <span className="text-muted-foreground">Unpaid / Non-Stipendiary:</span>
                      <span className="font-mono font-bold text-muted-foreground">
                        {payroll.unpaidWorkforce} Staff
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
                <span>Cycle: {payroll.cycleStatus}</span>
                <Link href="/admin/payroll" className="text-primary font-semibold hover:underline flex items-center gap-1">
                  Manage Payroll →
                </Link>
              </div>
            </Card>
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
      {activeTab === "payroll" && (
        <div className="space-y-6">
          <PayrollTrendChart
            data={charts.payrollCycleTrends}
            formatCurrency={formatCurrency}
          />

          <Card className="rounded-2xl border border-border/80 p-5 shadow-2xs">
            <div className="flex items-center justify-between pb-4 border-b border-border/60 mb-4">
              <CardTitle className="text-sm font-bold text-foreground flex items-center gap-2">
                <CreditCard className="h-4 w-4 text-primary" />
                Current Cycle: {payroll.activeCycleCode}
              </CardTitle>
              <Badge variant="outline" className="font-mono text-xs">
                Status: {payroll.cycleStatus}
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
                  Disbursed Volume
                </span>
                <div className="text-2xl font-bold font-mono text-foreground mt-1">
                  {formatCurrency(payroll.disbursedAmount)}
                </div>
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
