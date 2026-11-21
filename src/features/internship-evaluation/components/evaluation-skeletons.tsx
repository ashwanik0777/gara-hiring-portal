import React from "react";
import { ListCardSkeleton } from "@/components/feedback/page-skeletons";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCardSkeleton } from "@/components/ui/stat-card";

/** The four summary cards (same grid as StatGrid columns={4}); no live region of its own. */
function EvaluationStatsSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3.5 sm:gap-4 lg:grid-cols-4">
      {[0, 1, 2, 3].map((i) => (
        <StatCardSkeleton key={i} />
      ))}
    </div>
  );
}

/** Body of the evaluations list: summary cards, status chips and enrollment cards. */
export function EvaluationListSkeleton({ label = "Loading evaluations" }: { label?: string }) {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className="space-y-6">
      <span className="sr-only">{label}</span>
      <EvaluationStatsSkeleton />
      <div className="flex flex-wrap gap-2">
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-8 w-28 rounded-full" />
        ))}
      </div>
      <ListCardSkeleton rows={3} title={false} />
      <ListCardSkeleton rows={3} title={false} />
    </div>
  );
}

/** Whole-page skeleton for the evaluations list route. */
export function EvaluationListPageSkeleton({ label = "Loading evaluations" }: { label?: string }) {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className="space-y-6">
      <span className="sr-only">{label}</span>
      <EvaluationStatsSkeleton />
      <div className="flex flex-wrap gap-2">
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-8 w-28 rounded-full" />
        ))}
      </div>
      <ListCardSkeleton rows={3} title={false} />
      <ListCardSkeleton rows={3} title={false} />
    </div>
  );
}

/** Task cards streamed into the cockpit. */
export function EvaluationTasksSkeleton({ label = "Loading tasks" }: { label?: string }) {
  return (
    <div role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">{label}</span>
      <ListCardSkeleton rows={3} title={false} />
    </div>
  );
}
