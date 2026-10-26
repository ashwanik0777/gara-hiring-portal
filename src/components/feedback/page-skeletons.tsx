import * as React from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/*
 * Loading skeletons that mirror the real page layouts, so content does not jump when
 * it arrives. Every page-level skeleton is wrapped in a polite live region with a
 * screen-reader label; the blocks themselves are aria-hidden.
 */

function SkeletonRegion({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className={className}>
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}

function SkeletonCard({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("rounded-2xl border border-border/70 bg-card p-5", className)}>{children}</div>
  );
}

// -----------------------------------------------------------------------------
// Building blocks
// -----------------------------------------------------------------------------

export function PageHeaderSkeleton({ withAction = true }: { withAction?: boolean }) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="space-y-2.5">
        <Skeleton className="h-6 w-56 max-w-full" />
        <Skeleton className="h-3.5 w-80 max-w-full" />
      </div>
      {withAction && <Skeleton className="h-9 w-36 rounded-xl" />}
    </div>
  );
}

export function StatCardsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: count }, (_, i) => (
        <SkeletonCard key={i} className="space-y-4">
          <div className="flex items-center justify-between">
            <Skeleton className="h-3.5 w-24" />
            <Skeleton className="h-8 w-8 rounded-xl" />
          </div>
          <Skeleton className="h-7 w-20" />
          <Skeleton className="h-3 w-32" />
        </SkeletonCard>
      ))}
    </div>
  );
}

export function ToolbarSkeleton() {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <Skeleton className="h-9 w-full rounded-xl sm:max-w-xs" />
      <div className="flex gap-2">
        <Skeleton className="h-9 w-28 rounded-xl" />
        <Skeleton className="h-9 w-28 rounded-xl" />
      </div>
    </div>
  );
}

export function TabsSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="flex gap-2 border-b border-border/60 pb-3">
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} className="h-8 w-28 rounded-lg" />
      ))}
    </div>
  );
}

export function TableSkeleton({ rows = 6, columns = 5 }: { rows?: number; columns?: number }) {
  const widths = ["w-40", "w-28", "w-24", "w-20", "w-16", "w-24"];
  return (
    <div className="overflow-hidden rounded-2xl border border-border/70 bg-card">
      <div className="flex items-center gap-6 border-b border-border/60 bg-muted/40 px-5 py-3">
        {Array.from({ length: columns }, (_, c) => (
          <Skeleton key={c} className={cn("h-3", c === 0 ? "w-32" : "hidden w-20 sm:block")} />
        ))}
      </div>
      <div className="divide-y divide-border/50">
        {Array.from({ length: rows }, (_, r) => (
          <div key={r} className="flex items-center gap-6 px-5 py-4">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton className="h-3.5 w-40 max-w-full" />
                <Skeleton className="h-3 w-28 max-w-full" />
              </div>
            </div>
            {Array.from({ length: Math.max(columns - 1, 0) }, (_, c) => (
              <Skeleton key={c} className={cn("hidden h-3.5 md:block", widths[(c + r) % widths.length])} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function ChartGridSkeleton({ count = 2 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {Array.from({ length: count }, (_, i) => (
        <SkeletonCard key={i} className="space-y-5">
          <div className="space-y-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-56 max-w-full" />
          </div>
          <div className="flex h-44 items-end gap-2">
            {[60, 85, 45, 70, 95, 55, 75, 40].map((h, b) => (
              <Skeleton key={b} className="flex-1 rounded-t-md rounded-b-none" style={{ height: `${h}%` }} />
            ))}
          </div>
        </SkeletonCard>
      ))}
    </div>
  );
}

export function ListCardSkeleton({ rows = 5, title = true }: { rows?: number; title?: boolean }) {
  return (
    <SkeletonCard className="space-y-4">
      {title && <Skeleton className="h-4 w-44" />}
      <div className="space-y-4">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3.5 w-3/5" />
              <Skeleton className="h-3 w-2/5" />
            </div>
            <Skeleton className="h-5 w-16 rounded-full" />
          </div>
        ))}
      </div>
    </SkeletonCard>
  );
}

export function FormSkeleton({ fields = 6 }: { fields?: number }) {
  return (
    <SkeletonCard className="space-y-6">
      <Skeleton className="h-5 w-48" />
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        {Array.from({ length: fields }, (_, i) => (
          <div key={i} className={cn("space-y-2", i === fields - 1 && fields % 2 === 1 && "md:col-span-2")}>
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-10 w-full rounded-xl" />
          </div>
        ))}
      </div>
      <Skeleton className="h-24 w-full rounded-xl" />
      <div className="flex justify-end gap-2">
        <Skeleton className="h-9 w-24 rounded-xl" />
        <Skeleton className="h-9 w-32 rounded-xl" />
      </div>
    </SkeletonCard>
  );
}

function KeyValueCardSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <SkeletonCard className="space-y-4">
      <Skeleton className="h-4 w-36" />
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center justify-between gap-4">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-3.5 w-32" />
        </div>
      ))}
    </SkeletonCard>
  );
}

// -----------------------------------------------------------------------------
// Page-level skeletons (used by loading.tsx files)
// -----------------------------------------------------------------------------

/** Portal overview: KPI cards, two panels and an activity list. */
export function OverviewPageSkeleton({ label = "Loading dashboard" }: { label?: string }) {
  return (
    <SkeletonRegion label={label} className="space-y-6">
      <PageHeaderSkeleton />
      <StatCardsSkeleton />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <ChartGridSkeleton count={1} />
        </div>
        <ListCardSkeleton rows={4} />
      </div>
      <ListCardSkeleton rows={5} />
    </SkeletonRegion>
  );
}

/** Lists: header, optional summary cards, filters and a table. */
export function ListPageSkeleton({
  label = "Loading list",
  withStats = false,
}: {
  label?: string;
  withStats?: boolean;
}) {
  return (
    <SkeletonRegion label={label} className="space-y-6">
      <PageHeaderSkeleton />
      {withStats && <StatCardsSkeleton />}
      <ToolbarSkeleton />
      <TableSkeleton rows={7} />
    </SkeletonRegion>
  );
}

/** Record detail: summary header, main column and side panel. */
export function DetailPageSkeleton({ label = "Loading details" }: { label?: string }) {
  return (
    <SkeletonRegion label={label} className="space-y-6">
      <SkeletonCard className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <Skeleton className="h-14 w-14 shrink-0 rounded-2xl" />
          <div className="space-y-2.5">
            <Skeleton className="h-5 w-52 max-w-full" />
            <Skeleton className="h-3.5 w-72 max-w-full" />
          </div>
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-28 rounded-xl" />
          <Skeleton className="h-9 w-28 rounded-xl" />
        </div>
      </SkeletonCard>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <KeyValueCardSkeleton rows={5} />
          <ListCardSkeleton rows={4} />
        </div>
        <div className="space-y-4">
          <KeyValueCardSkeleton rows={4} />
          <ListCardSkeleton rows={3} title />
        </div>
      </div>
    </SkeletonRegion>
  );
}

/** Create/edit forms. */
export function FormPageSkeleton({ label = "Loading form" }: { label?: string }) {
  return (
    <SkeletonRegion label={label} className="space-y-6">
      <PageHeaderSkeleton withAction={false} />
      <FormSkeleton fields={7} />
    </SkeletonRegion>
  );
}

/** HR modules (attendance, leave, payroll): summary cards, tabs and a table. */
export function ModulePageSkeleton({ label = "Loading module" }: { label?: string }) {
  return (
    <SkeletonRegion label={label} className="space-y-6">
      <PageHeaderSkeleton />
      <StatCardsSkeleton />
      <TabsSkeleton count={3} />
      <ToolbarSkeleton />
      <TableSkeleton rows={6} columns={6} />
    </SkeletonRegion>
  );
}

/** Analytics and reports: KPI cards and chart grid. */
export function ReportsPageSkeleton({ label = "Loading reports" }: { label?: string }) {
  return (
    <SkeletonRegion label={label} className="space-y-6">
      <PageHeaderSkeleton />
      <StatCardsSkeleton />
      <ChartGridSkeleton count={4} />
      <TableSkeleton rows={4} columns={4} />
    </SkeletonRegion>
  );
}

/** Chat assistant console. */
export function ChatPageSkeleton({ label = "Loading assistant" }: { label?: string }) {
  return (
    <SkeletonRegion label={label} className="space-y-6">
      <PageHeaderSkeleton withAction={false} />
      <SkeletonCard className="flex h-[28rem] flex-col justify-between">
        <div className="space-y-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className={cn("flex", i % 2 === 1 ? "justify-end" : "justify-start")}>
              <Skeleton className={cn("h-14 rounded-2xl", i % 2 === 1 ? "w-1/2" : "w-2/3")} />
            </div>
          ))}
        </div>
        <Skeleton className="h-11 w-full rounded-xl" />
      </SkeletonCard>
    </SkeletonRegion>
  );
}

/** Content placeholder used inside the dashboard shell skeleton. */
export function ContentSkeleton() {
  return (
    <div className="space-y-6">
      <PageHeaderSkeleton />
      <StatCardsSkeleton />
      <TableSkeleton rows={5} />
    </div>
  );
}

// -----------------------------------------------------------------------------
// Shell and public skeletons
// -----------------------------------------------------------------------------

/**
 * Mirrors DashboardShell (sidebar, header bar and scrollable content area) so a portal
 * paints immediately while the session and navigation are resolved.
 */
export function DashboardShellSkeleton({
  label = "Loading your workspace",
  children,
}: {
  label?: string;
  children?: React.ReactNode;
}) {
  return (
    <SkeletonRegion
      label={label}
      className="flex h-screen max-h-screen min-h-screen gap-3 overflow-hidden bg-[#f3f4f7] p-2 text-foreground sm:p-3 md:gap-4 md:p-4 dark:bg-[#0a0d14]"
    >
      <div className="hidden w-64 shrink-0 flex-col justify-between rounded-3xl border border-border/70 bg-card shadow-sm md:flex">
        <div className="flex items-center gap-2.5 border-b border-border/50 p-3.5">
          <Skeleton className="h-8 w-8 rounded-full" />
          <div className="space-y-1.5">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-3 w-20" />
          </div>
        </div>
        <div className="flex-1 space-y-2 px-2.5 py-3">
          {Array.from({ length: 9 }, (_, i) => (
            <div key={i} className="flex items-center gap-3 px-3 py-2">
              <Skeleton className="h-4 w-4 rounded" />
              <Skeleton className={cn("h-3", ["w-24", "w-32", "w-28", "w-20"][i % 4])} />
            </div>
          ))}
        </div>
        <div className="border-t border-border/50 p-2.5">
          <div className="flex items-center gap-2.5 rounded-xl border border-border/70 p-2">
            <Skeleton className="h-8 w-8 rounded-full" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-2.5 w-16" />
            </div>
          </div>
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm md:rounded-3xl">
        <div className="flex items-center justify-between gap-4 border-b border-border/50 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2.5">
            <Skeleton className="h-8 w-8 rounded-lg md:hidden" />
            <Skeleton className="h-8 w-8 rounded-xl" />
            <Skeleton className="h-5 w-44" />
          </div>
          <div className="flex items-center gap-2">
            <Skeleton className="hidden h-8 w-48 rounded-xl md:block" />
            <Skeleton className="h-8 w-20 rounded-xl" />
            <Skeleton className="h-8 w-8 rounded-xl" />
          </div>
        </div>
        <div className="flex-1 overflow-hidden p-4 sm:p-6 lg:p-8">{children ?? <ContentSkeleton />}</div>
      </div>
    </SkeletonRegion>
  );
}

function NavbarSkeleton() {
  return (
    <div className="flex items-center justify-between border-b border-border/60 px-4 py-4 sm:px-8">
      <div className="flex items-center gap-2.5">
        <Skeleton className="h-9 w-9 rounded-full" />
        <Skeleton className="h-4 w-32" />
      </div>
      <div className="hidden gap-6 md:flex">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-3.5 w-16" />
        ))}
      </div>
      <Skeleton className="h-9 w-24 rounded-xl" />
    </div>
  );
}

/** Public marketing/listing pages (navbar, hero and cards). */
export function PublicPageSkeleton({ label = "Loading page" }: { label?: string }) {
  return (
    <SkeletonRegion label={label} className="flex min-h-screen flex-col bg-background">
      <NavbarSkeleton />
      <div className="mx-auto w-full max-w-6xl flex-1 space-y-10 px-4 py-12 sm:px-8">
        <div className="mx-auto max-w-2xl space-y-4 text-center">
          <Skeleton className="mx-auto h-5 w-40 rounded-full" />
          <Skeleton className="mx-auto h-9 w-full max-w-xl" />
          <Skeleton className="mx-auto h-4 w-4/5" />
        </div>
        <CardGridSkeleton />
      </div>
    </SkeletonRegion>
  );
}

/** Grid of opening/feature cards. */
export function CardGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="space-y-4 rounded-3xl border border-border/80 bg-card p-6">
          <div className="flex items-center justify-between">
            <Skeleton className="h-5 w-24 rounded-full" />
            <Skeleton className="h-4 w-16" />
          </div>
          <Skeleton className="h-6 w-3/4" />
          <div className="space-y-2">
            <Skeleton className="h-3.5 w-full" />
            <Skeleton className="h-3.5 w-5/6" />
          </div>
          <div className="border-t border-border/40 pt-4">
            <Skeleton className="h-9 w-full rounded-xl" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Public detail page (opening detail, verification result) with an optional form. */
export function PublicDetailSkeleton({
  label = "Loading details",
  withForm = false,
  withNavbar = false,
}: {
  label?: string;
  withForm?: boolean;
  /** Set for pages that render their own navbar (no shared layout). */
  withNavbar?: boolean;
}) {
  const body = (
    <div className="mx-auto w-full max-w-4xl space-y-6 px-4 py-10 sm:px-8">
      <Skeleton className="h-4 w-28" />
      <div className="space-y-3">
        <Skeleton className="h-8 w-3/4" />
        <div className="flex flex-wrap gap-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-6 w-24 rounded-full" />
          ))}
        </div>
      </div>
      {withForm ? (
        <FormSkeleton fields={6} />
      ) : (
        <SkeletonCard className="space-y-3">
          {[100, 95, 90, 80, 85, 60].map((w, i) => (
            <Skeleton key={i} className="h-3.5" style={{ width: `${w}%` }} />
          ))}
        </SkeletonCard>
      )}
    </div>
  );
  return (
    <SkeletonRegion label={label} className={withNavbar ? "flex min-h-screen flex-col bg-background" : undefined}>
      {withNavbar && <NavbarSkeleton />}
      {body}
    </SkeletonRegion>
  );
}

/** Sign-in / registration / password screens. */
export function AuthScreenSkeleton({ label = "Loading sign in" }: { label?: string }) {
  return (
    <SkeletonRegion label={label} className="grid min-h-screen bg-background lg:grid-cols-2">
      <div className="hidden bg-muted/40 p-12 lg:flex lg:flex-col lg:justify-between">
        <Skeleton className="h-10 w-40" />
        <div className="space-y-4">
          <Skeleton className="h-9 w-4/5" />
          <Skeleton className="h-4 w-3/5" />
          <Skeleton className="h-4 w-2/5" />
        </div>
        <Skeleton className="h-24 w-full rounded-2xl" />
      </div>
      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm space-y-5">
          <div className="space-y-2">
            <Skeleton className="h-7 w-48" />
            <Skeleton className="h-3.5 w-64 max-w-full" />
          </div>
          <Skeleton className="h-11 w-full rounded-xl" />
          <Skeleton className="h-3 w-20" />
          {[0, 1].map((i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-11 w-full rounded-xl" />
            </div>
          ))}
          <Skeleton className="h-11 w-full rounded-xl" />
        </div>
      </div>
    </SkeletonRegion>
  );
}

// -----------------------------------------------------------------------------
// Public site: careers, help centre, certificate verification, auth cards
// -----------------------------------------------------------------------------

/** Careers index: navbar, centred heading and the openings grid. */
export function CareersPageSkeleton({ label = "Loading openings" }: { label?: string }) {
  return (
    <SkeletonRegion label={label} className="flex min-h-screen flex-col bg-background">
      <NavbarSkeleton />
      <div className="mx-auto w-full max-w-7xl flex-1 px-4 py-12 sm:px-6 md:py-16 lg:px-8">
        <div className="mx-auto mb-12 max-w-6xl space-y-3 text-center">
          <Skeleton className="mx-auto h-10 w-full max-w-2xl" />
        </div>
        <CardGridSkeleton />
      </div>
    </SkeletonRegion>
  );
}

/** Body of the opening detail page: badges, title, apply button and the content sections. */
function OpeningDetailBodySkeleton() {
  return (
    <>
      <div className="mb-8 space-y-4 border-b border-border/70 pb-8">
        <div className="flex flex-wrap items-center gap-2">
          <Skeleton className="h-5 w-28 rounded-full" />
          <Skeleton className="h-5 w-20 rounded-full" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-28" />
        </div>
        <Skeleton className="h-9 w-4/5 max-w-xl" />
        <div className="pt-2">
          <Skeleton className="h-11 w-44 rounded-xl" />
        </div>
      </div>
      <div className="space-y-10">
        {[0, 1, 2].map((i) => (
          <div key={i} className="space-y-3">
            <Skeleton className="h-6 w-48" />
            <SkeletonCard className="space-y-3 rounded-xl p-6">
              {[100, 92, 96, 70].map((w, line) => (
                <Skeleton key={line} className="h-3.5" style={{ width: `${w}%` }} />
              ))}
            </SkeletonCard>
          </div>
        ))}
        <div className="flex items-center justify-between gap-4 border-t border-border/60 pt-6">
          <div className="space-y-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-56 max-w-full" />
          </div>
          <Skeleton className="h-10 w-28 rounded-xl" />
        </div>
      </div>
    </>
  );
}

/**
 * Opening detail page. With `withNavbar` it mirrors the whole route (loading.tsx); without
 * it, only the streamed detail below the back link (in-page Suspense fallback).
 */
export function OpeningDetailSkeleton({
  label = "Loading opening",
  withNavbar = false,
}: {
  label?: string;
  withNavbar?: boolean;
}) {
  if (!withNavbar) {
    return (
      <SkeletonRegion label={label}>
        <OpeningDetailBodySkeleton />
      </SkeletonRegion>
    );
  }
  return (
    <SkeletonRegion label={label} className="flex min-h-screen flex-col bg-background">
      <NavbarSkeleton />
      <div className="mx-auto w-full max-w-4xl flex-1 px-4 py-10 sm:px-6 md:py-14 lg:px-8">
        <Skeleton className="mb-6 h-4 w-40" />
        <OpeningDetailBodySkeleton />
      </div>
    </SkeletonRegion>
  );
}

/** Embedded portal assistant panel (600px like the widget): header, messages and composer. */
export function ChatPanelSkeleton({ label }: { label?: string }) {
  const panel = (
    <div className="flex h-[600px] flex-col overflow-hidden rounded-3xl border border-border/80 bg-card">
      <div className="flex items-center gap-3 border-b border-border/60 px-5 py-4">
        <Skeleton className="h-9 w-9 rounded-xl" />
        <div className="space-y-1.5">
          <Skeleton className="h-4 w-44" />
          <Skeleton className="h-3 w-64 max-w-full" />
        </div>
      </div>
      <div className="flex-1 space-y-4 p-5">
        <Skeleton className="h-20 w-full rounded-2xl" />
        <div className="flex flex-wrap gap-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-7 w-40 max-w-full rounded-full" />
          ))}
        </div>
      </div>
      <div className="border-t border-border/60 p-4">
        <Skeleton className="h-11 w-full rounded-xl" />
      </div>
    </div>
  );
  return label ? <SkeletonRegion label={label}>{panel}</SkeletonRegion> : panel;
}

/** Help centre: navbar, header, assistant panel, FAQ grid and the privacy card. */
export function HelpPageSkeleton({ label = "Loading help center" }: { label?: string }) {
  return (
    <SkeletonRegion label={label} className="flex min-h-screen flex-col bg-background">
      <NavbarSkeleton />
      <div className="mx-auto w-full max-w-6xl flex-1 space-y-10 px-4 py-10 sm:px-6 lg:px-8">
        <div className="border-b border-border/70 pb-6">
          <Skeleton className="h-9 w-full max-w-lg" />
        </div>
        <ChatPanelSkeleton />
        <div className="space-y-4">
          <Skeleton className="h-6 w-80 max-w-full" />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {Array.from({ length: 6 }, (_, i) => (
              <SkeletonCard key={i} className="space-y-3">
                <div className="flex items-center justify-between">
                  <Skeleton className="h-4 w-24 rounded-full" />
                  <Skeleton className="h-3 w-12" />
                </div>
                <Skeleton className="h-4 w-11/12" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-4/5" />
              </SkeletonCard>
            ))}
          </div>
        </div>
        <SkeletonCard className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-3.5 w-40 max-w-full" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-5/6" />
            </div>
          ))}
        </SkeletonCard>
      </div>
    </SkeletonRegion>
  );
}

/** Certificate verification index: title, search console and the three trust pillars. */
export function VerifyPageSkeleton({
  label = "Loading credential verification",
}: {
  label?: string;
}) {
  return (
    <SkeletonRegion label={label} className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
      <div className="mb-10 space-y-3 text-center">
        <Skeleton className="mx-auto h-6 w-44 rounded-full" />
        <Skeleton className="mx-auto h-10 w-72 max-w-full" />
      </div>
      <div className="mx-auto mb-12 max-w-3xl">
        <SkeletonCard className="space-y-4 p-6 sm:p-8">
          <Skeleton className="h-3.5 w-56" />
          <div className="flex flex-col gap-3 sm:flex-row">
            <Skeleton className="h-12 flex-1 rounded-xl" />
            <Skeleton className="h-12 w-full rounded-xl sm:w-36" />
          </div>
        </SkeletonCard>
      </div>
      <div className="my-12 grid grid-cols-1 gap-6 md:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <SkeletonCard key={i} className="space-y-3 p-6">
            <Skeleton className="h-10 w-10 rounded-xl" />
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-5/6" />
          </SkeletonCard>
        ))}
      </div>
      <SkeletonCard className="flex flex-col items-center justify-between gap-4 p-6 sm:flex-row">
        <div className="w-full space-y-2 sm:w-auto">
          <Skeleton className="h-3.5 w-64 max-w-full" />
          <Skeleton className="h-3 w-80 max-w-full" />
        </div>
        <Skeleton className="h-9 w-40 rounded-xl" />
      </SkeletonCard>
    </SkeletonRegion>
  );
}

/** Verification result page: title, result card (seal, recipient, details, code) and actions. */
export function VerifyResultSkeleton({ label = "Verifying credential" }: { label?: string }) {
  return (
    <SkeletonRegion label={label} className="mx-auto w-full max-w-4xl px-4 sm:px-6 lg:px-8">
      <div className="mb-8 space-y-3 text-center">
        <Skeleton className="mx-auto h-6 w-44 rounded-full" />
        <Skeleton className="mx-auto h-10 w-80 max-w-full" />
      </div>
      <SkeletonCard className="space-y-6 p-6 sm:p-10">
        <div className="space-y-3 border-b border-border pb-6 text-center">
          <Skeleton className="mx-auto h-14 w-14 rounded-2xl" />
          <Skeleton className="mx-auto h-5 w-44 rounded-full" />
          <Skeleton className="mx-auto h-6 w-56" />
        </div>
        <SkeletonCard className="space-y-2 text-center">
          <Skeleton className="mx-auto h-3 w-24" />
          <Skeleton className="mx-auto h-9 w-72 max-w-full" />
        </SkeletonCard>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <SkeletonCard key={i} className="space-y-2 rounded-xl p-4">
              <Skeleton className="h-3 w-32" />
              <Skeleton className="h-4 w-40 max-w-full" />
            </SkeletonCard>
          ))}
        </div>
        <Skeleton className="h-14 w-full rounded-xl" />
        <Skeleton className="h-20 w-full rounded-xl" />
      </SkeletonCard>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Skeleton className="h-10 w-48 rounded-xl" />
        <Skeleton className="h-10 w-24 rounded-xl" />
      </div>
    </SkeletonRegion>
  );
}

/** Centred single-card auth screens (password reset, first-sign-in password). */
export function AuthCardSkeleton({ label = "Loading" }: { label?: string }) {
  return (
    <SkeletonRegion
      label={label}
      className="flex min-h-screen w-full items-center justify-center bg-background p-4 sm:p-6"
    >
      <div className="w-full max-w-md space-y-6 rounded-3xl border border-border/80 bg-card p-6 sm:p-8">
        <div className="space-y-3 text-center">
          <Skeleton className="mx-auto h-12 w-12 rounded-2xl" />
          <Skeleton className="mx-auto h-7 w-56 max-w-full" />
          <Skeleton className="mx-auto h-3 w-64 max-w-full" />
        </div>
        <div className="space-y-4">
          {[0, 1].map((i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-3 w-28" />
              <Skeleton className="h-11 w-full rounded-xl" />
            </div>
          ))}
          <Skeleton className="h-1.5 w-full rounded-full" />
          <Skeleton className="h-11 w-full rounded-xl" />
        </div>
      </div>
    </SkeletonRegion>
  );
}
