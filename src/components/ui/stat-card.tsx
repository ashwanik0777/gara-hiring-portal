import * as React from "react";
import Link from "next/link";
import { AlertCircle, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

/*
 * The one statistic card used by every dashboard. Server-component friendly (no client
 * state): label, value, optional icon, tone, hint and link all come from props.
 */

export type StatTone = "blue" | "violet" | "emerald" | "amber" | "cyan" | "rose" | "indigo" | "slate";

/** Full class strings per tone so Tailwind keeps them in the build. */
const TONE_CLASSES: Record<StatTone, { border: string; icon: string; hoverBorder: string }> = {
  blue: {
    border: "border-l-blue-500",
    icon: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
    hoverBorder: "hover:border-blue-500/40",
  },
  violet: {
    border: "border-l-violet-500",
    icon: "bg-violet-500/15 text-violet-600 dark:text-violet-400",
    hoverBorder: "hover:border-violet-500/40",
  },
  emerald: {
    border: "border-l-emerald-500",
    icon: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
    hoverBorder: "hover:border-emerald-500/40",
  },
  amber: {
    border: "border-l-amber-500",
    icon: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
    hoverBorder: "hover:border-amber-500/40",
  },
  cyan: {
    border: "border-l-cyan-500",
    icon: "bg-cyan-500/15 text-cyan-600 dark:text-cyan-400",
    hoverBorder: "hover:border-cyan-500/40",
  },
  rose: {
    border: "border-l-rose-500",
    icon: "bg-rose-500/15 text-rose-600 dark:text-rose-400",
    hoverBorder: "hover:border-rose-500/40",
  },
  indigo: {
    border: "border-l-indigo-500",
    icon: "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400",
    hoverBorder: "hover:border-indigo-500/40",
  },
  slate: {
    border: "border-l-slate-400 dark:border-l-slate-500",
    icon: "bg-slate-500/15 text-slate-600 dark:text-slate-300",
    hoverBorder: "hover:border-slate-500/40",
  },
};

const numberFormat = new Intl.NumberFormat("en-IN");

export interface StatCardProps {
  /** Short label shown above the value, e.g. "Pending requests". */
  label: string;
  /**
   * The figure. Numbers are formatted for en-IN; strings (currency, "4 / 7") are shown as
   * given. `null`/`undefined` means "not recorded" and renders an em dash.
   */
  value: number | string | null | undefined;
  icon?: LucideIcon;
  tone?: StatTone;
  /** Small line under the value: context text or badges. */
  hint?: React.ReactNode;
  /** Makes the whole card a link (e.g. to the filtered list behind the figure). */
  href?: string;
  /**
   * The query behind the figure failed: shows "Unavailable" instead of a misleading 0.
   */
  unavailable?: boolean;
  /** "compact" for dense grids (smaller padding and number). */
  size?: "default" | "compact";
  className?: string;
}

function displayValue(value: StatCardProps["value"]): string {
  if (value === null || value === undefined || value === "") return "—";
  return typeof value === "number" ? numberFormat.format(value) : value;
}

export function StatCard({
  label,
  value,
  icon: Icon,
  tone = "slate",
  hint,
  href,
  unavailable = false,
  size = "default",
  className,
}: StatCardProps) {
  const toneClasses = TONE_CLASSES[tone];
  const compact = size === "compact";
  const shownValue = displayValue(value);

  const body = (
    <>
      <div className={cn("flex items-center justify-between gap-2", compact ? "mb-1.5" : "mb-2")}>
        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground font-mono">{label}</span>
        {Icon && (
          <span
            aria-hidden="true"
            className={cn(
              "flex shrink-0 items-center justify-center rounded-xl",
              compact ? "h-7 w-7" : "h-8 w-8",
              toneClasses.icon
            )}
          >
            <Icon className={compact ? "h-3.5 w-3.5" : "h-4 w-4"} />
          </span>
        )}
      </div>
      {unavailable ? (
        <p className="flex items-center gap-1.5 text-sm font-semibold text-amber-700 dark:text-amber-300">
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
          Unavailable
        </p>
      ) : (
        <p
          className={cn(
            "truncate font-mono font-extrabold tracking-tight tabular-nums text-foreground",
            compact ? "text-xl" : "text-2xl sm:text-3xl"
          )}
          title={shownValue.length > 12 ? shownValue : undefined}
        >
          {shownValue}
          {shownValue === "—" && <span className="sr-only">Not recorded</span>}
        </p>
      )}
      {hint && !unavailable && (
        <div className={cn("flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground", compact ? "mt-1.5" : "mt-2")}>
          {hint}
        </div>
      )}
      {unavailable && (
        <p className={cn("text-[11px] text-muted-foreground", compact ? "mt-1.5" : "mt-2")}>
          This figure could not be loaded. Refresh to try again.
        </p>
      )}
    </>
  );

  const cardClass = cn(
    "flex min-w-0 flex-col justify-between rounded-2xl border border-border/80 border-l-4 bg-card shadow-2xs transition-all",
    compact ? "p-3.5" : "p-4 sm:p-5",
    toneClasses.border,
    className
  );

  if (href) {
    return (
      <Link
        href={href}
        className={cn(
          cardClass,
          "hover:shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          toneClasses.hoverBorder
        )}
      >
        {body}
      </Link>
    );
  }
  return <div className={cardClass}>{body}</div>;
}

const GRID_COLUMNS: Record<2 | 3 | 4 | 5 | 6, string> = {
  2: "grid-cols-1 sm:grid-cols-2",
  3: "grid-cols-2 lg:grid-cols-3",
  4: "grid-cols-2 lg:grid-cols-4",
  5: "grid-cols-2 sm:grid-cols-3 lg:grid-cols-5",
  6: "grid-cols-2 sm:grid-cols-3 xl:grid-cols-6",
};

export interface StatGridProps {
  /** Columns on large screens; phones show one or two columns. */
  columns?: 2 | 3 | 4 | 5 | 6;
  /** Accessible name for the group, e.g. "Leave summary". */
  label?: string;
  className?: string;
  children: React.ReactNode;
}

/** Responsive grid for stat cards. */
export function StatGrid({ columns = 4, label, className, children }: StatGridProps) {
  return (
    <div
      role={label ? "group" : undefined}
      aria-label={label}
      className={cn("grid gap-3.5 sm:gap-4", GRID_COLUMNS[columns], className)}
    >
      {children}
    </div>
  );
}

/** Placeholder matching `StatCard` while the figures stream in. */
export function StatCardSkeleton({ size = "default" }: { size?: "default" | "compact" }) {
  const compact = size === "compact";
  return (
    <div
      className={cn(
        "space-y-3 rounded-2xl border border-border/80 border-l-4 border-l-muted bg-card shadow-2xs",
        compact ? "p-3.5" : "p-4 sm:p-5"
      )}
    >
      <div className="flex items-center justify-between">
        <Skeleton className="h-3 w-24" />
        <Skeleton className={cn("rounded-xl", compact ? "h-7 w-7" : "h-8 w-8")} />
      </div>
      <Skeleton className={compact ? "h-6 w-16" : "h-8 w-20"} />
      <Skeleton className="h-3 w-32" />
    </div>
  );
}

export function StatGridSkeleton({
  count = 4,
  columns = 4,
  size = "default",
  label = "Loading figures",
}: {
  count?: number;
  columns?: 2 | 3 | 4 | 5 | 6;
  size?: "default" | "compact";
  label?: string;
}) {
  return (
    <div role="status" aria-busy="true" aria-live="polite">
      <span className="sr-only">{label}</span>
      <div className={cn("grid gap-3.5 sm:gap-4", GRID_COLUMNS[columns])}>
        {Array.from({ length: count }, (_, index) => (
          <StatCardSkeleton key={index} size={size} />
        ))}
      </div>
    </div>
  );
}
