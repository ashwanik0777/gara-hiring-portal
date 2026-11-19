import { Skeleton } from "@/components/ui/skeleton";
import { StatGridSkeleton } from "@/components/ui/stat-card";
import { reportToolbarClass } from "./report-toolbar";

/*
 * Loading state of the reports page, mirroring the real layout: the full-width tab strip,
 * the period toolbar below it, the five KPI cards and the chart grid. Used by loading.tsx
 * and as the Suspense fallback while the dashboard figures stream in.
 */

const TAB_WIDTHS = ["w-24", "w-48", "w-28", "w-28", "w-40", "w-36", "w-40"];

export function ReportsDashboardSkeleton({ label = "Loading reports" }: { label?: string }) {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className="w-full space-y-6">
      <span className="sr-only">{label}</span>
      <div className="flex w-full items-center gap-1.5 overflow-hidden rounded-2xl border border-border/60 bg-muted/60 p-1" aria-hidden="true">
        {TAB_WIDTHS.map((width, index) => (
          <Skeleton key={index} className={`h-[30px] shrink-0 rounded-xl ${width}`} />
        ))}
      </div>
      <div className={`${reportToolbarClass} flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between`} aria-hidden="true">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-8 w-72 max-w-full rounded-xl" />
        </div>
        <div className="flex items-center justify-between gap-2 sm:justify-end">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-8 w-28 rounded-xl" />
        </div>
      </div>
      <StatGridSkeleton count={5} columns={5} label="Loading key figures" />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2" aria-hidden="true">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="space-y-5 rounded-2xl border border-border/80 bg-card p-5 shadow-2xs">
            <div className="space-y-2">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-56 max-w-full" />
            </div>
            <div className="flex h-44 items-end gap-2">
              {[60, 85, 45, 70, 95, 55, 75, 40].map((height, bar) => (
                <Skeleton key={bar} className="flex-1 rounded-t-md rounded-b-none" style={{ height: `${height}%` }} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
