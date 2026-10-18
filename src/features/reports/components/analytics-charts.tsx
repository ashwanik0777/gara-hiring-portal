"use client";

import React, { useState } from "react";
import {
  TrendingUp,
  Users,
  Briefcase,
  Calendar,
  CreditCard,
  CheckCircle2,
  Clock,
  ArrowRight,
  Sparkles,
} from "lucide-react";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  MonthlyRecruitmentTrend,
  DepartmentChartData,
  AttendanceDailyTrend,
  PayrollCycleTrend,
  FunnelStage,
} from "../types";

// ─────────────────────────────────────────────────────────────────────────────
// 1. RECRUITMENT MONTHLY TREND AREA / BAR CHART (PURE SVG)
// ─────────────────────────────────────────────────────────────────────────────

interface RecruitmentTrendChartProps {
  data: MonthlyRecruitmentTrend[];
}

export function RecruitmentTrendChart({ data }: RecruitmentTrendChartProps) {
  const [activeSeries, setActiveSeries] = useState<"applications" | "interviews" | "hired">("applications");
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const seriesConfig = {
    applications: {
      label: "Applications Received",
      color: "#3b82f6",
      stroke: "stroke-blue-500",
      fill: "url(#blueGrad)",
      bg: "bg-blue-500",
      text: "text-blue-600 dark:text-blue-400",
    },
    interviews: {
      label: "Interviews & Evals",
      color: "#8b5cf6",
      stroke: "stroke-purple-500",
      fill: "url(#purpleGrad)",
      bg: "bg-purple-500",
      text: "text-purple-600 dark:text-purple-400",
    },
    hired: {
      label: "Final Hires",
      color: "#10b981",
      stroke: "stroke-emerald-500",
      fill: "url(#emeraldGrad)",
      bg: "bg-emerald-500",
      text: "text-emerald-600 dark:text-emerald-400",
    },
  };

  const currentCfg = seriesConfig[activeSeries];

  // Calculate scales
  const values = data.map((d) => d[activeSeries]);
  const maxValue = Math.max(...values, 5);
  const chartHeight = 160;
  const chartWidth = 560;
  const paddingX = 40;
  const paddingY = 25;
  const usableWidth = chartWidth - paddingX * 2;
  const usableHeight = chartHeight - paddingY * 2;

  const points = data.map((d, i) => {
    const x = paddingX + (usableWidth / Math.max(data.length - 1, 1)) * i;
    const y = paddingY + usableHeight - (d[activeSeries] / maxValue) * usableHeight;
    return { x, y, item: d };
  });

  // SVG Area path generator
  const linePath = points.reduce((acc, pt, i) => {
    return i === 0 ? `M ${pt.x} ${pt.y}` : `${acc} L ${pt.x} ${pt.y}`;
  }, "");

  const areaPath =
    points.length > 0
      ? `${linePath} L ${points[points.length - 1].x} ${chartHeight - paddingY} L ${points[0].x} ${
          chartHeight - paddingY
        } Z`
      : "";

  const totalInSeries = values.reduce((sum, v) => sum + v, 0);

  return (
    <Card className="rounded-2xl border border-border/80 p-5 shadow-2xs">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-border/60">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-primary" />
          <CardTitle className="text-sm font-bold text-foreground">
            Recruitment Velocity Trends
          </CardTitle>
          <Badge variant="outline" className="text-[10px] font-mono">
            Past 6 Months
          </Badge>
        </div>

        {/* Series Selector Buttons */}
        <div className="flex items-center gap-1 bg-muted/60 p-1 rounded-xl border border-border/60">
          {(["applications", "interviews", "hired"] as const).map((key) => (
            <button
              key={key}
              onClick={() => {
                setActiveSeries(key);
                setHoveredIndex(null);
              }}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                activeSeries === key
                  ? "bg-background text-foreground shadow-2xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {key === "applications" ? "Applications" : key === "interviews" ? "Interviews" : "Hires"}
            </button>
          ))}
        </div>
      </div>

      {/* Chart Canvas Area */}
      <div className="relative pt-4">
        {/* Active hover info badge */}
        <div className="flex items-center justify-between mb-2 px-1 text-xs">
          <div className="flex items-center gap-2">
            <span className={`h-2.5 w-2.5 rounded-full ${currentCfg.bg}`} />
            <span className="font-semibold text-foreground">{currentCfg.label}</span>
            <span className="font-mono text-muted-foreground">• Total: {totalInSeries}</span>
          </div>
          {hoveredIndex !== null && (
            <div className="font-mono font-bold text-xs bg-muted/80 px-2 py-0.5 rounded-md border border-border/60 animate-in fade-in">
              {data[hoveredIndex].label}:{" "}
              <span className={currentCfg.text}>{data[hoveredIndex][activeSeries]}</span>
            </div>
          )}
        </div>

        <svg
          viewBox={`0 0 ${chartWidth} ${chartHeight}`}
          className="w-full h-44 sm:h-52 overflow-visible"
        >
          <defs>
            <linearGradient id="blueGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.0" />
            </linearGradient>
            <linearGradient id="purpleGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0.0" />
            </linearGradient>
            <linearGradient id="emeraldGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10b981" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Grid lines */}
          {[0, 0.33, 0.66, 1].map((pct, i) => {
            const y = paddingY + usableHeight * (1 - pct);
            const val = Math.round(maxValue * pct);
            return (
              <g key={i}>
                <line
                  x1={paddingX}
                  y1={y}
                  x2={chartWidth - paddingX}
                  y2={y}
                  stroke="currentColor"
                  strokeOpacity="0.08"
                  strokeDasharray="3 3"
                />
                <text
                  x={paddingX - 10}
                  y={y + 3}
                  textAnchor="end"
                  className="text-[9px] fill-muted-foreground font-mono"
                >
                  {val}
                </text>
              </g>
            );
          })}

          {/* Area Fill */}
          {areaPath && (
            <path
              d={areaPath}
              fill={currentCfg.fill}
              className="transition-all duration-300"
            />
          )}

          {/* Main Trend Line */}
          {linePath && (
            <path
              d={linePath}
              fill="none"
              stroke={currentCfg.color}
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="transition-all duration-300"
            />
          )}

          {/* Points & Interactive Nodes */}
          {points.map((pt, i) => (
            <g
              key={i}
              className="cursor-pointer group"
              onMouseEnter={() => setHoveredIndex(i)}
              onMouseLeave={() => setHoveredIndex(null)}
            >
              {/* Invisible wider hover hit target */}
              <circle cx={pt.x} cy={pt.y} r="14" fill="transparent" />

              {/* Visible circle */}
              <circle
                cx={pt.x}
                cy={pt.y}
                r={hoveredIndex === i ? "6" : "4"}
                fill={hoveredIndex === i ? currentCfg.color : "#ffffff"}
                stroke={currentCfg.color}
                strokeWidth={hoveredIndex === i ? "3" : "2"}
                className="transition-all duration-150 shadow-sm"
              />

              {/* Month label along bottom */}
              <text
                x={pt.x}
                y={chartHeight - 6}
                textAnchor="middle"
                className={`text-[10px] font-mono transition-colors ${
                  hoveredIndex === i
                    ? "fill-foreground font-bold"
                    : "fill-muted-foreground"
                }`}
              >
                {pt.item.month}
              </text>
            </g>
          ))}
        </svg>
      </div>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. STEPPED CONVERSION FUNNEL PROGRESSION GRAPH
// ─────────────────────────────────────────────────────────────────────────────

interface SteppedFunnelChartProps {
  stages: FunnelStage[];
  totalApplications: number;
}

export function SteppedFunnelChart({
  stages,
  totalApplications,
}: SteppedFunnelChartProps) {
  return (
    <Card className="rounded-2xl border border-border/80 p-5 shadow-2xs">
      <div className="flex items-center justify-between pb-4 border-b border-border/60 mb-4">
        <div className="flex items-center gap-2">
          <Briefcase className="h-4 w-4 text-primary" />
          <CardTitle className="text-sm font-bold text-foreground">
            Recruitment Funnel Conversion
          </CardTitle>
        </div>
        <span className="font-mono text-xs text-muted-foreground">
          Total: {totalApplications} Applicants
        </span>
      </div>

      <div className="space-y-3">
        {stages.map((st, i) => {
          const prevCount = i === 0 ? st.count : stages[i - 1].count;
          const stepConversion =
            prevCount > 0 ? Math.round((st.count / prevCount) * 100) : 0;

          return (
            <div key={st.stage} className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-[11px] text-muted-foreground">
                    0{i + 1}.
                  </span>
                  <span className="font-semibold text-foreground">{st.stage}</span>
                </div>
                <div className="flex items-center gap-3 font-mono text-xs">
                  <span className="font-bold text-foreground">{st.count}</span>
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                    {st.percentage}%
                  </Badge>
                  {i > 0 && (
                    <span className="text-[10px] text-muted-foreground hidden sm:inline">
                      ({stepConversion}% from prev)
                    </span>
                  )}
                </div>
              </div>

              {/* Progression Bar with visual width */}
              <div className="h-2 w-full bg-muted/60 rounded-full overflow-hidden">
                <div
                  className={`h-full ${st.color} rounded-full transition-all duration-500`}
                  style={{ width: `${Math.max(st.percentage, 2)}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. WORKFORCE COMPOSITION & DEPARTMENT DONUT CHART (SVG)
// ─────────────────────────────────────────────────────────────────────────────

interface WorkforceDonutChartProps {
  departments: DepartmentChartData[];
  employmentTypes: Array<{
    type: string;
    count: number;
    percentage: number;
    color: string;
  }>;
  totalEmployees: number;
}

export function WorkforceDonutChart({
  departments,
  employmentTypes,
  totalEmployees,
}: WorkforceDonutChartProps) {
  const [viewMode, setViewMode] = useState<"departments" | "types">("departments");
  const [hoveredSlice, setHoveredSlice] = useState<number | null>(null);

  const activeData =
    viewMode === "departments"
      ? departments.map((d) => ({
          label: d.department,
          count: d.count,
          percentage: d.percentage,
          color: d.color,
        }))
      : employmentTypes.map((t) => ({
          label: t.type,
          count: t.count,
          percentage: t.percentage,
          color: t.color,
        }));

  // SVG Donut calculation
  const radius = 62;
  const strokeWidth = 18;
  const circumference = 2 * Math.PI * radius;

  let accumulatedPercent = 0;
  const slices = activeData.map((item) => {
    const strokeDasharray = `${(item.percentage / 100) * circumference} ${circumference}`;
    const strokeDashoffset = -((accumulatedPercent / 100) * circumference);
    accumulatedPercent += item.percentage;
    return {
      ...item,
      strokeDasharray,
      strokeDashoffset,
    };
  });

  return (
    <Card className="rounded-2xl border border-border/80 p-5 shadow-2xs">
      <div className="flex items-center justify-between pb-4 border-b border-border/60 mb-4">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-primary" />
          <CardTitle className="text-sm font-bold text-foreground">
            Workforce Demographics
          </CardTitle>
        </div>

        {/* Toggle Mode */}
        <div className="flex items-center gap-1 bg-muted/60 p-1 rounded-xl border border-border/60">
          <button
            onClick={() => {
              setViewMode("departments");
              setHoveredSlice(null);
            }}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              viewMode === "departments"
                ? "bg-background text-foreground shadow-2xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Departments
          </button>
          <button
            onClick={() => {
              setViewMode("types");
              setHoveredSlice(null);
            }}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              viewMode === "types"
                ? "bg-background text-foreground shadow-2xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Employment Type
          </button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row items-center gap-6">
        {/* Donut SVG */}
        <div className="relative shrink-0 flex items-center justify-center">
          <svg width="170" height="170" viewBox="0 0 170 170" className="transform -rotate-90">
            {/* Background Circle */}
            <circle
              cx="85"
              cy="85"
              r={radius}
              stroke="currentColor"
              strokeWidth={strokeWidth}
              className="text-muted/40"
              fill="transparent"
            />
            {/* Arc Slices */}
            {slices.map((slice, i) => (
              <circle
                key={slice.label}
                cx="85"
                cy="85"
                r={radius}
                stroke={slice.color}
                strokeWidth={hoveredSlice === i ? strokeWidth + 4 : strokeWidth}
                strokeDasharray={slice.strokeDasharray}
                strokeDashoffset={slice.strokeDashoffset}
                strokeLinecap="round"
                fill="transparent"
                className="transition-all duration-300 cursor-pointer"
                onMouseEnter={() => setHoveredSlice(i)}
                onMouseLeave={() => setHoveredSlice(null)}
              />
            ))}
          </svg>

          {/* Centered Total Indicator */}
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <span className="text-2xl font-extrabold font-mono text-foreground leading-none">
              {hoveredSlice !== null ? activeData[hoveredSlice].count : totalEmployees}
            </span>
            <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider mt-1">
              {hoveredSlice !== null ? activeData[hoveredSlice].label : "Total Staff"}
            </span>
          </div>
        </div>

        {/* Legend List */}
        <div className="flex-1 w-full space-y-2 max-h-48 overflow-y-auto pr-1">
          {activeData.map((item, i) => (
            <div
              key={item.label}
              onMouseEnter={() => setHoveredSlice(i)}
              onMouseLeave={() => setHoveredSlice(null)}
              className={`p-2 rounded-xl transition-all border flex items-center justify-between text-xs cursor-pointer ${
                hoveredSlice === i
                  ? "bg-muted/80 border-border"
                  : "bg-muted/30 border-transparent hover:bg-muted/50"
              }`}
            >
              <div className="flex items-center gap-2 truncate">
                <span
                  className="h-2.5 w-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: item.color }}
                />
                <span className="font-medium text-foreground truncate">{item.label}</span>
              </div>
              <div className="flex items-center gap-2 font-mono shrink-0">
                <span className="font-bold text-foreground">{item.count}</span>
                <span className="text-muted-foreground text-[11px]">({item.percentage}%)</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. ATTENDANCE & LEAVES DAILY TREND BAR GRAPH (SVG)
// ─────────────────────────────────────────────────────────────────────────────

interface AttendanceTrendChartProps {
  data: AttendanceDailyTrend[];
  todayPresent: number;
  todayOnLeave: number;
  activeStaff: number;
}

export function AttendanceTrendChart({
  data,
  todayPresent,
  todayOnLeave,
  activeStaff,
}: AttendanceTrendChartProps) {
  const maxStaff = Math.max(activeStaff, 1);
  const todayRate = Math.min(100, Math.round((todayPresent / maxStaff) * 100));

  return (
    <Card className="rounded-2xl border border-border/80 p-5 shadow-2xs">
      <div className="flex items-center justify-between pb-4 border-b border-border/60 mb-4">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-primary" />
          <CardTitle className="text-sm font-bold text-foreground">
            Attendance & Absence Dynamics
          </CardTitle>
        </div>
        <div className="flex items-center gap-2 font-mono text-xs">
          <Badge
            variant="outline"
            className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30 font-semibold"
          >
            Today: {todayRate}% Present
          </Badge>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
        {/* Left 2 Cols: 7-Day Bar Chart */}
        <div className="md:col-span-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-3">
            <span>7-Day Attendance Logs</span>
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                Present
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-amber-500" />
                Leave
              </span>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-2 items-end h-32 pt-2 border-b border-border/60 pb-2">
            {data.map((day) => {
              const presentHeight = Math.min(100, (day.present / maxStaff) * 100);
              const leaveHeight = Math.min(100, (day.onLeave / maxStaff) * 100);

              return (
                <div key={day.dateStr} className="flex flex-col items-center gap-1.5 h-full justify-end group">
                  <div className="w-full max-w-[28px] flex flex-col justify-end h-full gap-0.5">
                    {/* Leave bar */}
                    {leaveHeight > 0 && (
                      <div
                        className="w-full bg-amber-500/80 rounded-t-sm transition-all duration-300"
                        style={{ height: `${leaveHeight}%` }}
                        title={`${day.onLeave} on leave`}
                      />
                    )}
                    {/* Present bar */}
                    <div
                      className="w-full bg-emerald-500 rounded-sm transition-all duration-300 group-hover:bg-emerald-600"
                      style={{ height: `${Math.max(presentHeight, 8)}%` }}
                      title={`${day.present} present (${day.attendanceRate}%)`}
                    />
                  </div>
                  <span className="font-mono text-[10px] text-muted-foreground group-hover:text-foreground font-semibold">
                    {day.day}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Col: Today's Presence Radial Meter */}
        <div className="p-4 rounded-xl bg-muted/40 border border-border/60 flex flex-col items-center justify-center text-center">
          <div className="relative flex items-center justify-center mb-2">
            <svg width="90" height="90" viewBox="0 0 90 90" className="transform -rotate-90">
              <circle
                cx="45"
                cy="45"
                r="36"
                stroke="currentColor"
                strokeWidth="8"
                className="text-muted/60"
                fill="transparent"
              />
              <circle
                cx="45"
                cy="45"
                r="36"
                stroke="#10b981"
                strokeWidth="8"
                strokeDasharray={`${(todayRate / 100) * (2 * Math.PI * 36)} ${2 * Math.PI * 36}`}
                strokeLinecap="round"
                fill="transparent"
                className="transition-all duration-500"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-lg font-bold font-mono text-foreground leading-none">
                {todayRate}%
              </span>
            </div>
          </div>
          <span className="text-xs font-semibold text-foreground">Operational Turnout</span>
          <div className="mt-2 flex items-center gap-2 text-[11px] font-mono text-muted-foreground">
            <span className="text-emerald-600 dark:text-emerald-400 font-bold">{todayPresent} Present</span>
            <span>•</span>
            <span className="text-amber-600 dark:text-amber-400">{todayOnLeave} on Leave</span>
          </div>
        </div>
      </div>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. PAYROLL DISBURSEMENT VOLUME CHART (SVG)
// ─────────────────────────────────────────────────────────────────────────────

interface PayrollTrendChartProps {
  data: PayrollCycleTrend[];
  formatCurrency: (amount?: number | null) => string;
}

export function PayrollTrendChart({
  data,
  formatCurrency,
}: PayrollTrendChartProps) {
  const maxDisbursed = Math.max(...data.map((d) => d.disbursedAmount), 50000);

  return (
    <Card className="rounded-2xl border border-border/80 p-5 shadow-2xs">
      <div className="flex items-center justify-between pb-4 border-b border-border/60 mb-4">
        <div className="flex items-center gap-2">
          <CreditCard className="h-4 w-4 text-primary" />
          <CardTitle className="text-sm font-bold text-foreground">
            Disbursement Volume by Cycle
          </CardTitle>
        </div>
        <span className="font-mono text-xs text-muted-foreground">
          Recent Cycles
        </span>
      </div>

      <div className="space-y-4">
        {data.map((cycle) => {
          const pct = Math.round((cycle.disbursedAmount / maxDisbursed) * 100);
          return (
            <div key={cycle.cycle} className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-mono font-semibold text-foreground">
                  Cycle {cycle.cycle}
                </span>
                <div className="flex items-center gap-2 font-mono">
                  <span className="font-bold text-emerald-600 dark:text-emerald-400">
                    {formatCurrency(cycle.disbursedAmount)}
                  </span>
                  <span className="text-muted-foreground text-[11px]">
                    ({cycle.paidCount} Paid)
                  </span>
                </div>
              </div>
              <div className="h-2 w-full bg-muted/60 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                  style={{ width: `${Math.max(pct, 4)}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
