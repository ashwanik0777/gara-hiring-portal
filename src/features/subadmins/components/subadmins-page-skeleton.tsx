import React from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCardsSkeleton, TableSkeleton } from "@/components/feedback/page-skeletons";

/** Mirrors the sub-admin directory: four summary cards, search row and the table. */
export function SubAdminsPageSkeleton({ label = "Loading sub-admins" }: { label?: string }) {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className="space-y-6">
      <span className="sr-only">{label}</span>
      <StatCardsSkeleton count={4} />
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <Skeleton className="h-8 w-full max-w-md rounded-xl" />
        <Skeleton className="h-8 w-36 rounded-xl" />
      </div>
      <TableSkeleton rows={6} columns={4} />
    </div>
  );
}
