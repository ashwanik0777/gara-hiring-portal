import React from "react";
import { Calendar, Clock, FileText, UserCheck } from "lucide-react";
import { StatCard, StatGrid } from "@/components/ui/stat-card";
import type { AttendancePageData } from "../types";
import { formatMonthLabel } from "./attendance-format";

/**
 * Team attendance summary (server-rendered). Every figure is counted in PostgreSQL;
 * nothing is inferred from work-hour or overtime rules (OD-006).
 */
export function AttendanceStatsCards({
  pageData,
}: {
  pageData: Extract<AttendancePageData, { view: "team" }>;
}) {
  const { todayCounts, pendingRegularizationCount, page, filters } = pageData;
  return (
    <StatGrid columns={4} label="Attendance summary">
      <StatCard
        label="Present Today (UTC)"
        value={todayCounts.present}
        icon={UserCheck}
        tone="emerald"
        hint="Present or half day recorded"
      />
      <StatCard
        label="On Leave / Absent"
        value={todayCounts.onLeaveOrAbsent}
        icon={Clock}
        tone="amber"
        hint="Recorded for today"
      />
      <StatCard
        label="Entries This Month"
        value={page.total}
        icon={Calendar}
        tone="blue"
        hint={`${formatMonthLabel(filters.month)}${filters.status ? " · filtered" : ""}`}
      />
      <StatCard
        label="Pending Corrections"
        value={pendingRegularizationCount}
        icon={FileText}
        tone="violet"
        hint="Regularization requests awaiting review"
      />
    </StatGrid>
  );
}
