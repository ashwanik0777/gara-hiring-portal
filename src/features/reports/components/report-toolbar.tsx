import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/*
 * Shared look of the filter rows on the reports and registrations pages: the dashboard
 * period toolbar (client), the hiring funnel and registrations GET forms (server) and the
 * registrant list filters all use the same card, label, field and button styles, so the
 * row below the tab strip looks the same on every tab. No hooks: usable from server and
 * client components alike.
 */

/** Card wrapping a filter row. */
export const reportToolbarClass = "rounded-2xl border border-border/80 bg-card p-3 shadow-2xs sm:p-4";

/** Label of an individual filter field. */
export const reportFieldLabelClass =
  "block text-[10px] font-bold uppercase tracking-wider text-muted-foreground font-mono";

/** Native inputs and selects inside a filter row. */
export const reportFieldClass =
  "h-9 w-full rounded-xl border border-input bg-background px-3 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** Secondary link styled like an outline button (Reset / Clear). */
export const reportSecondaryLinkClass =
  "inline-flex h-9 items-center justify-center rounded-xl border border-border bg-card px-3 text-xs font-medium text-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** Small hint line under a filter row. */
export const reportToolbarNoteClass = "mt-2.5 text-[11px] text-muted-foreground";

/** Leading label of a filter row, e.g. "Period" or "Filters". */
export function ReportToolbarLabel({
  icon: Icon,
  id,
  children,
  className,
}: {
  icon: LucideIcon;
  id?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      id={id}
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground font-mono",
        className
      )}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {children}
    </span>
  );
}
