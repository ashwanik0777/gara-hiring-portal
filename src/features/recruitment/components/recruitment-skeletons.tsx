import * as React from "react";
import { Skeleton } from "@/components/ui/skeleton";

/*
 * Loading skeletons for the application queue and the interview board. They mirror the
 * real page markup (KPI grid, toolbar, row cards) so nothing jumps when the data streams
 * in; the region announces the loading state and the blocks are aria-hidden.
 */

function LoadingRegion({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className="w-full space-y-6">
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}

function KpiCardsSkeleton({ count, className }: { count: number; className: string }) {
  return (
    <div className={className}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="rounded-2xl border border-border/80 bg-card p-4 sm:p-5 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-8 w-8 rounded-xl" />
          </div>
          <Skeleton className="h-8 w-16" />
          <Skeleton className="h-3 w-28" />
        </div>
      ))}
    </div>
  );
}

function RowCardsSkeleton({ rows, withCheckbox }: { rows: number; withCheckbox: boolean }) {
  return (
    <div className="grid grid-cols-1 gap-3">
      {Array.from({ length: rows }, (_, i) => (
        <div
          key={i}
          className="rounded-2xl border border-border/80 bg-card p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
        >
          <div className="flex items-start gap-3.5 flex-1 min-w-0">
            {withCheckbox && <Skeleton className="mt-3 h-4 w-4 shrink-0 rounded" />}
            <Skeleton className="h-10 w-10 shrink-0 rounded-2xl" />
            <div className="flex-1 min-w-0 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <Skeleton className="h-5 w-20 rounded-lg" />
                <Skeleton className="h-5 w-24 rounded-full" />
                <Skeleton className="hidden h-4 w-40 sm:block" />
              </div>
              <Skeleton className="h-4 w-48 max-w-full" />
              <Skeleton className="h-3 w-64 max-w-full" />
            </div>
          </div>
          <div className="flex w-full items-end justify-between gap-3 sm:w-auto sm:flex-col">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-8 w-32 rounded-xl" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Application queue: five KPI cards, search toolbar with stage pills, selectable row cards. */
export function ApplicationQueueSkeleton({ label = "Loading applications" }: { label?: string }) {
  return (
    <LoadingRegion label={label}>
      <KpiCardsSkeleton
        count={5}
        className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5 sm:gap-4"
      />
      <div className="p-4 rounded-2xl border border-border/80 bg-card/80 flex flex-col lg:flex-row gap-4 lg:items-center justify-between">
        <div className="flex flex-1 items-center gap-2">
          <Skeleton className="h-9 flex-1 rounded-xl" />
          <Skeleton className="h-9 w-20 rounded-xl" />
        </div>
        <div className="flex items-center gap-1.5 overflow-hidden">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-7 w-20 shrink-0 rounded-xl" />
          ))}
        </div>
      </div>
      <div className="space-y-3">
        <Skeleton className="h-4 w-44" />
        <RowCardsSkeleton rows={7} withCheckbox />
      </div>
    </LoadingRegion>
  );
}

/** Interview board: four KPI cards, range toolbar, session cards. */
export function InterviewBoardSkeleton({ label = "Loading interviews" }: { label?: string }) {
  return (
    <LoadingRegion label={label}>
      <KpiCardsSkeleton count={4} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4" />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Skeleton className="h-4 w-72 max-w-full" />
        <Skeleton className="h-8 w-40 rounded-xl" />
      </div>
      <RowCardsSkeleton rows={6} withCheckbox={false} />
    </LoadingRegion>
  );
}
