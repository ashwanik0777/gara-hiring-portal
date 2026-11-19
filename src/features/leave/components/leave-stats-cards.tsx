import React from "react";
import {
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  FileText,
  CalendarRange,
} from "lucide-react";
import { StatCard, StatGrid } from "@/components/ui/stat-card";
import type { LeaveStats } from "../types";

/**
 * Read-only summary cards (server-rendered). Counts come from PostgreSQL; no leave
 * balances are shown or computed (OD-007).
 */
export function LeaveStatsCards({
  stats,
  activeTypeCount,
  isTeamView,
}: {
  stats: LeaveStats;
  activeTypeCount: number;
  isTeamView: boolean;
}) {
  return (
    <StatGrid columns={5} label="Leave summary">
      <StatCard
        label="Pending Requests"
        value={stats.pendingCount}
        icon={Clock}
        tone="amber"
        hint={
          stats.pendingCount > 0 ? (
            <span className="inline-flex items-center gap-1 font-semibold text-amber-700 dark:text-amber-400 bg-amber-500/15 px-2 py-0.5 rounded-md">
              <AlertCircle className="h-3 w-3" aria-hidden="true" /> {isTeamView ? "Action required" : "Awaiting review"}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400 bg-emerald-500/15 px-2 py-0.5 rounded-md font-medium">
              <CheckCircle2 className="h-3 w-3" aria-hidden="true" /> Inbox cleared
            </span>
          )
        }
      />
      <StatCard
        label="Away Today"
        value={stats.onLeaveTodayCount}
        icon={CalendarRange}
        tone="blue"
        hint="Active out-of-office today"
      />
      <StatCard
        label="Approved"
        value={stats.approvedCount}
        icon={CheckCircle2}
        tone="emerald"
        hint="Authorized time-off records"
      />
      <StatCard
        label="Rejected"
        value={stats.rejectedCount}
        icon={XCircle}
        tone="rose"
        hint="Denied with review notes"
      />
      <StatCard
        label="Policy Types"
        value={activeTypeCount}
        icon={FileText}
        tone="violet"
        hint="Active leave categories"
        className="col-span-2 sm:col-span-1"
      />
    </StatGrid>
  );
}
