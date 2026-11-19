import React from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCardSkeleton, StatGrid } from "@/components/ui/stat-card";
import { TableSkeleton, ToolbarSkeleton } from "@/components/feedback/page-skeletons";

/** Mirrors the leave screen: five summary cards, four tabs, a filter bar and the table. */
export function LeavePageSkeleton({ label = "Loading leave management" }: { label?: string }) {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className="space-y-6">
      <span className="sr-only">{label}</span>
      {/* Same grid as `LeaveStatsCards`; the page region above already announces the loading state. */}
      <StatGrid columns={5}>
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className={i === 4 ? "col-span-2 sm:col-span-1" : undefined}>
            <StatCardSkeleton />
          </div>
        ))}
      </StatGrid>
      <div className="flex gap-1.5 p-1 rounded-2xl bg-muted/60 border border-border/60 max-w-fit">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-8 w-28 rounded-xl" />
        ))}
      </div>
      <div className="p-4 rounded-2xl border border-border/80 bg-card/70">
        <ToolbarSkeleton />
      </div>
      <TableSkeleton rows={6} columns={5} />
    </div>
  );
}
