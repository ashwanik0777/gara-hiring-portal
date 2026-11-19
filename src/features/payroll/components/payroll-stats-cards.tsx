import React from "react";
import { Calendar, CheckCircle2, Clock, Sparkles, UserX, Users } from "lucide-react";
import { StatCard, StatGrid } from "@/components/ui/stat-card";
import type { PayrollDashboardData } from "../types";
import { NOT_CONFIGURED, formatDate } from "./payroll-ui";

/**
 * Summary of the active payroll cycle (server-rendered). Counts are computed in
 * PostgreSQL; no salary or deduction figure is calculated (OD-008).
 */
export function PayrollStatsCards({
  stats,
  activePeriod,
}: {
  stats: PayrollDashboardData["stats"];
  activePeriod: PayrollDashboardData["activePeriod"];
}) {
  return (
    <StatGrid columns={5} label="Payroll cycle summary">
      <StatCard
        label="Active Cycle"
        value={activePeriod?.code || null}
        icon={Calendar}
        tone="blue"
        hint={activePeriod ? formatDate(activePeriod.startDate) : "No cycle"}
      />
      <StatCard
        label="Enrolled Records"
        value={stats.totalEnrolled}
        icon={Users}
        tone="violet"
        hint={
          <span className="inline-flex items-center gap-1 font-medium text-violet-700 dark:text-violet-300">
            <Sparkles className="h-3 w-3" aria-hidden="true" />
            {stats.totalPaidWorkforce} configured as paid
          </span>
        }
      />
      <StatCard
        label="Disbursed & Paid"
        value={stats.paidCount}
        icon={CheckCircle2}
        tone="emerald"
        hint={
          <span className="font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-500/15 px-2 py-0.5 rounded-md font-mono">
            {stats.completionRate}% Done
          </span>
        }
      />
      <StatCard
        label="Pending Payouts"
        value={stats.draftCount + stats.finalizedCount}
        icon={Clock}
        tone="amber"
        hint="Awaiting bank disbursement"
      />
      <StatCard
        label="Unpaid Workforce"
        value={stats.totalUnpaidWorkforce}
        icon={UserX}
        tone="slate"
        hint={`${stats.totalUnconfiguredWorkforce} payout ${NOT_CONFIGURED.toLowerCase()}`}
        className="col-span-2 sm:col-span-1"
      />
    </StatGrid>
  );
}
