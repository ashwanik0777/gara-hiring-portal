import React from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCardsSkeleton, TableSkeleton } from "@/components/feedback/page-skeletons";

/** Mirrors the attendance screen: four summary cards, a filter row and the log table. */
export function AttendancePageSkeleton({ label = "Loading attendance" }: { label?: string }) {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className="space-y-6">
      <span className="sr-only">{label}</span>
      <StatCardsSkeleton count={4} />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          <Skeleton className="h-8 w-64 max-w-full rounded-xl" />
          <Skeleton className="h-8 w-32 rounded-xl" />
          <Skeleton className="h-8 w-40 rounded-xl" />
        </div>
        <Skeleton className="h-8 w-36 rounded-xl" />
      </div>
      <TableSkeleton rows={6} columns={7} />
    </div>
  );
}
