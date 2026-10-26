import React from "react";
import {
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  FileText,
  CalendarRange,
} from "lucide-react";
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
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5 sm:gap-4">
      <div className="bg-card border border-border/80 border-l-4 border-l-amber-500 rounded-2xl p-4 sm:p-5 shadow-2xs hover:shadow-xs hover:border-amber-500/40 transition-all flex flex-col justify-between">
        <div className="flex items-center justify-between gap-2 mb-2">
          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider font-mono">
            Pending Requests
          </span>
          <div className="h-8 w-8 rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
            <Clock className="h-4 w-4" />
          </div>
        </div>
        <div className="text-2xl sm:text-3xl font-extrabold font-mono text-foreground tracking-tight">
          {stats.pendingCount}
        </div>
        <div className="mt-2 flex items-center gap-1.5 text-[11px]">
          {stats.pendingCount > 0 ? (
            <span className="inline-flex items-center gap-1 font-semibold text-amber-700 dark:text-amber-400 bg-amber-500/15 px-2 py-0.5 rounded-md">
              <AlertCircle className="h-3 w-3" /> {isTeamView ? "Action required" : "Awaiting review"}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400 bg-emerald-500/15 px-2 py-0.5 rounded-md font-medium">
              <CheckCircle2 className="h-3 w-3" /> Inbox cleared
            </span>
          )}
        </div>
      </div>

      <div className="bg-card border border-border/80 border-l-4 border-l-blue-500 rounded-2xl p-4 sm:p-5 shadow-2xs hover:shadow-xs hover:border-blue-500/40 transition-all flex flex-col justify-between">
        <div className="flex items-center justify-between gap-2 mb-2">
          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider font-mono">
            Away Today
          </span>
          <div className="h-8 w-8 rounded-xl bg-blue-500/15 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
            <CalendarRange className="h-4 w-4" />
          </div>
        </div>
        <div className="text-2xl sm:text-3xl font-extrabold font-mono text-foreground tracking-tight">
          {stats.onLeaveTodayCount}
        </div>
        <div className="mt-2 text-[11px] text-muted-foreground">Active out-of-office today</div>
      </div>

      <div className="bg-card border border-border/80 border-l-4 border-l-emerald-500 rounded-2xl p-4 sm:p-5 shadow-2xs hover:shadow-xs hover:border-emerald-500/40 transition-all flex flex-col justify-between">
        <div className="flex items-center justify-between gap-2 mb-2">
          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider font-mono">
            Approved
          </span>
          <div className="h-8 w-8 rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
            <CheckCircle2 className="h-4 w-4" />
          </div>
        </div>
        <div className="text-2xl sm:text-3xl font-extrabold font-mono text-foreground tracking-tight">
          {stats.approvedCount}
        </div>
        <div className="mt-2 text-[11px] text-muted-foreground">Authorized time-off records</div>
      </div>

      <div className="bg-card border border-border/80 border-l-4 border-l-rose-500 rounded-2xl p-4 sm:p-5 shadow-2xs hover:shadow-xs hover:border-rose-500/40 transition-all flex flex-col justify-between">
        <div className="flex items-center justify-between gap-2 mb-2">
          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider font-mono">
            Rejected
          </span>
          <div className="h-8 w-8 rounded-xl bg-rose-500/15 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
            <XCircle className="h-4 w-4" />
          </div>
        </div>
        <div className="text-2xl sm:text-3xl font-extrabold font-mono text-foreground tracking-tight">
          {stats.rejectedCount}
        </div>
        <div className="mt-2 text-[11px] text-muted-foreground">Denied with review notes</div>
      </div>

      <div className="col-span-2 sm:col-span-1 bg-card border border-border/80 border-l-4 border-l-purple-500 rounded-2xl p-4 sm:p-5 shadow-2xs hover:shadow-xs hover:border-purple-500/40 transition-all flex flex-col justify-between">
        <div className="flex items-center justify-between gap-2 mb-2">
          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider font-mono">
            Policy Types
          </span>
          <div className="h-8 w-8 rounded-xl bg-purple-500/15 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0">
            <FileText className="h-4 w-4" />
          </div>
        </div>
        <div className="text-2xl sm:text-3xl font-extrabold font-mono text-foreground tracking-tight">
          {activeTypeCount}
        </div>
        <div className="mt-2 text-[11px] text-muted-foreground">Active leave categories</div>
      </div>
    </div>
  );
}
