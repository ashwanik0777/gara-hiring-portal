import React from "react";
import { ListCardSkeleton, PageHeaderSkeleton, StatCardsSkeleton } from "@/components/feedback/page-skeletons";
import { Skeleton } from "@/components/ui/skeleton";

/** Mirrors the review board body: summary cards, view chips and review cards. */
export function ReviewBoardSkeleton({ label = "Loading intern reviews" }: { label?: string }) {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className="space-y-6">
      <span className="sr-only">{label}</span>
      <StatCardsSkeleton count={4} />
      <div className="flex flex-wrap gap-2">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-8 w-28 rounded-full" />
        ))}
      </div>
      <ListCardSkeleton rows={3} title={false} />
      <ListCardSkeleton rows={2} title={false} />
    </div>
  );
}

/** Whole-page skeleton for the board route (header plus the body above). */
export function ReviewBoardPageSkeleton({ label = "Loading intern reviews" }: { label?: string }) {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className="space-y-6">
      <span className="sr-only">{label}</span>
      <PageHeaderSkeleton withAction={false} />
      <div className="flex flex-wrap gap-2">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-8 w-28 rounded-full" />
        ))}
      </div>
      <Skeleton className="h-4 w-32" />
      <ListCardSkeleton rows={3} title={false} />
      <ListCardSkeleton rows={2} title={false} />
    </div>
  );
}
