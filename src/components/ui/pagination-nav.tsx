import * as React from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface PaginationNavProps {
  page: number;
  pageCount: number;
  total: number;
  /** Builds the link for a page number; filters stay in the URL so the back button works. */
  hrefFor: (page: number) => string;
  /** Accessible name of the navigation landmark, e.g. "Leave request pages". */
  label: string;
  /** Noun used in the summary, e.g. "requests". */
  itemLabel?: string;
  className?: string;
}

const linkClass =
  "inline-flex items-center gap-1 rounded-xl border border-border/80 bg-card px-3 py-1.5 font-semibold text-foreground hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";

/** Previous / next links for a database-paginated list. Renders nothing for a single page. */
export function PaginationNav({
  page,
  pageCount,
  total,
  hrefFor,
  label,
  itemLabel = "items",
  className,
}: PaginationNavProps) {
  if (pageCount <= 1) return null;
  return (
    <nav
      aria-label={label}
      className={`flex flex-col gap-3 pt-2 text-xs sm:flex-row sm:items-center sm:justify-between ${className ?? ""}`}
    >
      <span className="font-mono text-muted-foreground">
        Page {page} of {pageCount} · {total} {itemLabel}
      </span>
      <div className="flex items-center gap-2">
        {page > 1 ? (
          <Link href={hrefFor(page - 1)} className={linkClass} rel="prev">
            <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" /> Previous
          </Link>
        ) : null}
        {page < pageCount ? (
          <Link href={hrefFor(page + 1)} className={linkClass} rel="next">
            Next <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        ) : null}
      </div>
    </nav>
  );
}
