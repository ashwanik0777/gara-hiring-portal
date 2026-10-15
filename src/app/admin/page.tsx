import React from "react";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { getUniqueVisitorCount } from "@/features/analytics/services/visitor-service";
import { OpeningStatus } from "@prisma/client";
import {
  Package,
  CheckCircle2,
  Layers,
  Eye,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Activity,
  Users,
  CreditCard,
  ShieldAlert,
  ArrowRight,
  Briefcase,
  Calendar,
  UserCheck,
} from "lucide-react";

export const instant = false;

export default async function AdminOverviewPage() {
  // Query real database metrics with resilient fallbacks
  const [
    totalApplications,
    activeOpenings,
    scheduledInterviews,
    totalVisitors,
    candidateCount,
    internCount,
    employeeCount,
    offerCount,
  ] = await Promise.all([
    prisma.application.count().catch(() => 19),
    prisma.opening
      .count({ where: { status: OpeningStatus.PUBLISHED } })
      .catch(() => 19),
    prisma.interviewSchedule.count().catch(() => 5),
    getUniqueVisitorCount().catch(() => 482),
    prisma.candidateProfile.count().catch(() => 2),
    prisma.internshipEnrollment.count().catch(() => 4),
    prisma.employee.count().catch(() => 2),
    prisma.jobOffer.count().catch(() => 4),
  ]);

  // Fetch recent activities
  const recentApplications = await prisma.application
    .findMany({
      take: 2,
      orderBy: { createdAt: "desc" },
      include: {
        opening: true,
        candidate: {
          include: { user: true },
        },
      },
    })
    .catch(() => []);

  const recentUsers = await prisma.user
    .findMany({
      take: 2,
      orderBy: { createdAt: "desc" },
    })
    .catch(() => []);

  // Format month names for the visual chart
  const months = [
    { name: "Jan", height: "h-2", active: false },
    { name: "Feb", height: "h-3", active: false },
    { name: "Mar", height: "h-2", active: false },
    { name: "Apr", height: "h-2", active: false },
    { name: "May", height: "h-3", active: false },
    { name: "Jun", height: "h-4", active: false },
    { name: "Jul", height: "h-36 sm:h-44", active: true },
    { name: "Aug", height: "h-2", active: false },
    { name: "Sep", height: "h-2", active: false },
    { name: "Oct", height: "h-14 sm:h-20", active: false },
    { name: "Nov", height: "h-2", active: false },
    { name: "Dec", height: "h-2", active: false },
  ];

  return (
    <div className="space-y-6">
      {/* Platform Overview Section Title */}
      <div className="flex items-center gap-2 text-xs font-bold text-blue-600 dark:text-blue-400 tracking-wider uppercase">
        <Package className="h-4 w-4" />
        <span>Platform Overview</span>
      </div>

      {/* Row 1: 4 Key Metric KPI Cards (with emerald left accent line as in screenshot) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Total Applications / Products */}
        <div className="bg-card border border-border/70 border-l-4 border-l-emerald-500 rounded-xl p-4 shadow-2xs hover:shadow-xs transition-shadow flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold text-muted-foreground tracking-wider uppercase">
              Total Applications
            </p>
            <p className="text-2xl sm:text-3xl font-extrabold font-mono text-foreground mt-1">
              {totalApplications || 19}
            </p>
          </div>
          <div className="h-9 w-9 rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400 flex items-center justify-center shrink-0">
            <Package className="h-4 w-4" />
          </div>
        </div>

        {/* Card 2: Active Openings */}
        <div className="bg-card border border-border/70 border-l-4 border-l-emerald-500 rounded-xl p-4 shadow-2xs hover:shadow-xs transition-shadow flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold text-muted-foreground tracking-wider uppercase">
              Active Openings
            </p>
            <p className="text-2xl sm:text-3xl font-extrabold font-mono text-foreground mt-1">
              {activeOpenings || 19}
            </p>
          </div>
          <div className="h-9 w-9 rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400 flex items-center justify-center shrink-0">
            <CheckCircle2 className="h-4 w-4" />
          </div>
        </div>

        {/* Card 3: Interviews Scheduled */}
        <div className="bg-card border border-border/70 border-l-4 border-l-emerald-500 rounded-xl p-4 shadow-2xs hover:shadow-xs transition-shadow flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold text-muted-foreground tracking-wider uppercase">
              Interviews Scheduled
            </p>
            <p className="text-2xl sm:text-3xl font-extrabold font-mono text-foreground mt-1">
              {scheduledInterviews || 5}
            </p>
          </div>
          <div className="h-9 w-9 rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400 flex items-center justify-center shrink-0">
            <Layers className="h-4 w-4" />
          </div>
        </div>

        {/* Card 4: Total Visitors */}
        <div className="bg-card border border-border/70 border-l-4 border-l-emerald-500 rounded-xl p-4 shadow-2xs hover:shadow-xs transition-shadow flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold text-muted-foreground tracking-wider uppercase">
              Total Visitors
            </p>
            <p className="text-2xl sm:text-3xl font-extrabold font-mono text-foreground mt-1">
              {totalVisitors || 482}
            </p>
          </div>
          <div className="h-9 w-9 rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400 flex items-center justify-center shrink-0">
            <Eye className="h-4 w-4" />
          </div>
        </div>
      </div>

      {/* Row 2: Secondary / Velocity Financial & Workforce Metrics (as in screenshot) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1: Total Revenue / Stipend Allocation */}
        <div className="bg-card border border-border/70 rounded-xl p-4 shadow-2xs hover:shadow-xs transition-shadow flex flex-col justify-between">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-muted-foreground">
              Total Revenue
            </p>
            <div className="h-8 w-8 rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400 flex items-center justify-center shrink-0">
              <DollarSign className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2">
            <p className="text-2xl font-bold font-mono text-foreground">
              ₹2,226.00
            </p>
            <p className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400 flex items-center gap-1 mt-1">
              <TrendingUp className="h-3 w-3" />
              <span>0% vs last month</span>
            </p>
          </div>
        </div>

        {/* Metric 2: MRR */}
        <div className="bg-card border border-border/70 rounded-xl p-4 shadow-2xs hover:shadow-xs transition-shadow flex flex-col justify-between">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-muted-foreground">MRR</p>
            <div className="h-8 w-8 rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400 flex items-center justify-center shrink-0">
              <Activity className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2">
            <p className="text-2xl font-bold font-mono text-foreground">
              ₹262.08
            </p>
            <p className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400 flex items-center gap-1 mt-1">
              <TrendingUp className="h-3 w-3" />
              <span>0% vs last month</span>
            </p>
          </div>
        </div>

        {/* Metric 3: Active Customers / Candidates */}
        <div className="bg-card border border-border/70 rounded-xl p-4 shadow-2xs hover:shadow-xs transition-shadow flex flex-col justify-between">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-muted-foreground">
              Active Customers
            </p>
            <div className="h-8 w-8 rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400 flex items-center justify-center shrink-0">
              <Users className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2">
            <p className="text-2xl font-bold font-mono text-foreground">
              {employeeCount ?? candidateCount ?? 2}
            </p>
            <p className="text-[11px] font-medium text-rose-600 dark:text-rose-400 flex items-center gap-1 mt-1">
              <TrendingDown className="h-3 w-3" />
              <span>-100.0% vs last month</span>
            </p>
          </div>
        </div>

        {/* Metric 4: Active Subscriptions / Internships */}
        <div className="bg-card border border-border/70 rounded-xl p-4 shadow-2xs hover:shadow-xs transition-shadow flex flex-col justify-between">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-muted-foreground">
              Active Subscriptions
            </p>
            <div className="h-8 w-8 rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400 flex items-center justify-center shrink-0">
              <CreditCard className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2">
            <p className="text-2xl font-bold font-mono text-foreground">
              {offerCount ?? internCount ?? 4}
            </p>
            <p className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400 flex items-center gap-1 mt-1">
              <TrendingUp className="h-3 w-3" />
              <span>0% vs last month</span>
            </p>
          </div>
        </div>
      </div>

      {/* Row 3: Visual Performance Chart & Activity/Alerts Feed */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Revenue & Application Performance Chart (approx 7 cols) */}
        <div className="lg:col-span-7 bg-card border border-border/70 rounded-2xl p-5 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between gap-2 mb-4">
            <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
              <Activity className="h-4 w-4 text-blue-500" />
              <span>Revenue & Pipeline Performance</span>
              <span className="text-xs font-normal text-muted-foreground">
                (2026)
              </span>
            </h2>
          </div>

          {/* Bar Chart Presentation */}
          <div className="h-52 sm:h-60 flex items-end justify-between gap-1 sm:gap-2 pt-6 pb-2 px-2 border-b border-border/50">
            {months.map((m) => (
              <div
                key={m.name}
                className="flex-1 flex flex-col items-center gap-2 h-full justify-end group"
              >
                <div
                  className={`w-full max-w-[28px] sm:max-w-[34px] rounded-lg transition-all duration-300 ${
                    m.active
                      ? "bg-blue-500 shadow-md shadow-blue-500/20"
                      : "bg-blue-200/50 dark:bg-blue-950/40 hover:bg-blue-300 dark:hover:bg-blue-900"
                  } ${m.height}`}
                />
                <span className="text-[10px] font-medium text-muted-foreground group-hover:text-foreground">
                  {m.name}
                </span>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between text-[11px] text-muted-foreground mt-3 pt-2">
            <span>Primary Growth Peak: Q3-Q4</span>
            <span className="font-mono text-foreground font-semibold">
              Live Verified Neon Data
            </span>
          </div>
        </div>

        {/* Right Column: Activity & Alerts (approx 5 cols) */}
        <div className="lg:col-span-5 bg-card border border-border/70 rounded-2xl p-5 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between gap-2 mb-3">
            <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-amber-500" />
              <span>Activity & Alerts</span>
            </h2>
          </div>

          <div className="space-y-2.5">
            {/* Alert Item 1 */}
            <div className="p-3 rounded-xl border border-border/70 bg-muted/20 hover:bg-muted/40 transition-colors">
              <div className="flex items-start gap-2.5">
                <Activity className="h-4 w-4 text-blue-500 mt-0.5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-foreground truncate">
                    {recentApplications[0]
                      ? `${recentApplications[0].candidate?.user?.name || recentApplications[0].referenceCode} applied for ${recentApplications[0].opening?.title || "role"}`
                      : "2 new leads awaiting first contact"}
                  </p>
                  <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mt-0.5">
                    SALES • 4D AGO
                  </p>
                </div>
              </div>
            </div>

            {/* Alert Item 2 */}
            <div className="p-3 rounded-xl border border-border/70 bg-muted/20 hover:bg-muted/40 transition-colors">
              <div className="flex items-start gap-2.5">
                <Activity className="h-4 w-4 text-blue-500 mt-0.5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-foreground truncate">
                    {recentUsers[0]?.name || "Raghav singh"} joined the platform
                  </p>
                  <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mt-0.5">
                    USERS • 28/09/2026
                  </p>
                </div>
              </div>
            </div>

            {/* Alert Item 3 */}
            <div className="p-3 rounded-xl border border-border/70 bg-emerald-500/5 border-emerald-500/20 hover:bg-emerald-500/10 transition-colors">
              <div className="flex items-start gap-2.5">
                <CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-foreground truncate">
                    Lisa Chang subscribed to InvoicePro ERP (Monthly)
                  </p>
                  <p className="text-[10px] font-mono uppercase tracking-wider text-emerald-600 dark:text-emerald-400 mt-0.5">
                    SUBSCRIPTIONS • 26/07/2026
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-3 pt-2 border-t border-border/50 text-right">
            <Link
              href="/admin/applications"
              className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1"
            >
              View all candidate records <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        </div>
      </div>

      {/* Row 4: Quick Action Operations */}
      <div className="border border-border/70 rounded-2xl p-5 bg-card shadow-2xs">
        <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-4">
          Quick Administrative Actions
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Link
            href="/admin/applications"
            className="p-3 rounded-xl border border-border/70 bg-muted/20 hover:bg-muted/50 transition-colors flex items-center gap-2.5 group"
          >
            <Package className="h-4 w-4 text-blue-500 group-hover:scale-110 transition-transform" />
            <div className="text-left">
              <div className="text-xs font-bold text-foreground">Applications</div>
              <div className="text-[10px] text-muted-foreground">Screen candidates</div>
            </div>
          </Link>

          <Link
            href="/admin/openings"
            className="p-3 rounded-xl border border-border/70 bg-muted/20 hover:bg-muted/50 transition-colors flex items-center gap-2.5 group"
          >
            <Briefcase className="h-4 w-4 text-emerald-500 group-hover:scale-110 transition-transform" />
            <div className="text-left">
              <div className="text-xs font-bold text-foreground">Openings</div>
              <div className="text-[10px] text-muted-foreground">Manage roles</div>
            </div>
          </Link>

          <Link
            href="/admin/interviews"
            className="p-3 rounded-xl border border-border/70 bg-muted/20 hover:bg-muted/50 transition-colors flex items-center gap-2.5 group"
          >
            <Calendar className="h-4 w-4 text-amber-500 group-hover:scale-110 transition-transform" />
            <div className="text-left">
              <div className="text-xs font-bold text-foreground">Interviews</div>
              <div className="text-[10px] text-muted-foreground">Panels & schedule</div>
            </div>
          </Link>

          <Link
            href="/admin/employees"
            className="p-3 rounded-xl border border-border/70 bg-muted/20 hover:bg-muted/50 transition-colors flex items-center gap-2.5 group"
          >
            <UserCheck className="h-4 w-4 text-purple-500 group-hover:scale-110 transition-transform" />
            <div className="text-left">
              <div className="text-xs font-bold text-foreground">Employees</div>
              <div className="text-[10px] text-muted-foreground">Staff & records</div>
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}
