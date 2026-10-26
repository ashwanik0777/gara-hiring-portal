import React from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { TableSkeleton, ToolbarSkeleton } from "@/components/feedback/page-skeletons";

/** Mirrors the leave screen: five summary cards, four tabs, a filter bar and the table. */
export function LeavePageSkeleton({ label = "Loading leave management" }: { label?: string }) {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className="space-y-6">
      <span className="sr-only">{label}</span>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5 sm:gap-4">
        {Array.from({ length: 5 }, (_, i) => (
          <div
            key={i}
            className={`rounded-2xl border border-border/70 bg-card p-4 sm:p-5 space-y-3 ${
              i === 4 ? "col-span-2 sm:col-span-1" : ""
            }`}
          >
            <div className="flex items-center justify-between">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-8 w-8 rounded-xl" />
            </div>
            <Skeleton className="h-8 w-16" />
            <Skeleton className="h-3 w-28" />
          </div>
        ))}
      </div>
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
