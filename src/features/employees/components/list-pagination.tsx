import React from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface ListPaginationProps {
  page: number;
  pageCount: number;
  /** Rows across all pages. */
  total: number;
  pageSize: number;
  /** Builds the link for a page; the caller keeps the active filters in it. */
  hrefFor: (page: number) => string;
  /** Accessible name of the navigation, e.g. "Employee directory pages". */
  label: string;
  /** Plural noun for the summary, e.g. "employees". */
  itemNoun: string;
  className?: string;
}

const linkClass =
  "inline-flex h-8 items-center gap-1 rounded-xl border border-border bg-card px-3 text-xs font-medium text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const disabledClass =
  "inline-flex h-8 items-center gap-1 rounded-xl border border-border/60 px-3 text-xs font-medium text-muted-foreground/60";

/**
 * Previous / next links for a database-paged list (server-rendered, keyboard reachable).
 * Renders nothing when the list is empty; the list shows its own empty state.
 */
export function ListPagination({
  page,
  pageCount,
  total,
  pageSize,
  hrefFor,
  label,
  itemNoun,
  className,
}: ListPaginationProps) {
  if (total === 0) return null;

  const beyondLastPage = page > pageCount;
  const first = (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);

  return (
    <nav
      aria-label={label}
      className={cn(
        "flex flex-col gap-3 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between",
        className
      )}
    >
      <p>
        {beyondLastPage ? (
          <>This page is past the end of the list. </>
        ) : (
          <>
            Showing{" "}
            <span className="font-medium text-foreground">
              {first}–{last}
            </span>{" "}
            of {total} {itemNoun}.{" "}
          </>
        )}
        Page {Math.min(page, pageCount)} of {pageCount}
      </p>
      <div className="flex items-center gap-2">
        {page > 1 ? (
          <Link href={hrefFor(beyondLastPage ? pageCount : page - 1)} rel="prev" className={linkClass}>
            <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" /> Previous
          </Link>
        ) : (
          <span aria-disabled="true" className={disabledClass}>
            <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" /> Previous
          </span>
        )}
        {page < pageCount ? (
          <Link href={hrefFor(page + 1)} rel="next" className={linkClass}>
            Next <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        ) : (
          <span aria-disabled="true" className={disabledClass}>
            Next <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
          </span>
        )}
      </div>
    </nav>
  );
}
