import React from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/feedback/empty-state";

/*
 * Server-rendered pagination for the recruitment lists. Pages and filters travel in the
 * URL (plain links), so the back button, bookmarks and shared links keep working and no
 * client state is needed.
 */

/** Parses a `?page=` search param into a 1-based page number; anything invalid is page 1. */
export function parsePageParam(value: string | undefined): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed >= 1 ? parsed : 1;
}

/**
 * Link to a page of a list, keeping the active filters in the query string. Page 1 and
 * empty filter values are omitted so the canonical URL stays short.
 */
export function pageHref(
  baseHref: string,
  query: Record<string, string | undefined>,
  page: number
): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value) params.set(key, value);
  }
  if (page > 1) params.set("page", String(page));
  const serialized = params.toString();
  return serialized ? `${baseHref}?${serialized}` : baseHref;
}

const PAGE_LINK_CLASS =
  "inline-flex items-center gap-1 rounded-xl border border-border/80 px-3 py-1.5 font-semibold text-foreground hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";

interface ListPaginationProps {
  baseHref: string;
  /** Active filters to preserve in the page links. */
  query: Record<string, string | undefined>;
  page: number;
  pageCount: number;
  /** Rows across all pages. */
  total: number;
  /** Singular noun for the summary, e.g. "application". */
  noun: string;
  /** Accessible name of the navigation landmark. */
  label: string;
}

/** Previous/next links with a "Page x of y" summary; renders nothing for a single page. */
export function ListPagination({
  baseHref,
  query,
  page,
  pageCount,
  total,
  noun,
  label,
}: ListPaginationProps) {
  if (pageCount <= 1) return null;
  return (
    <nav aria-label={label} className="flex items-center justify-between gap-3 pt-2 text-xs">
      <span className="text-muted-foreground font-mono">
        Page {page} of {pageCount} · {total} {noun}
        {total === 1 ? "" : "s"}
      </span>
      <div className="flex items-center gap-2">
        {page > 1 ? (
          <Link href={pageHref(baseHref, query, page - 1)} className={PAGE_LINK_CLASS}>
            <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" /> Previous
          </Link>
        ) : null}
        {page < pageCount ? (
          <Link href={pageHref(baseHref, query, page + 1)} className={PAGE_LINK_CLASS}>
            Next <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        ) : null}
      </div>
    </nav>
  );
}

interface PageOutOfRangeProps {
  page: number;
  pageCount: number;
  /** Singular noun, e.g. "application". */
  noun: string;
  /** Link to the first page with the same filters. */
  href: string;
}

/**
 * Shown when the URL asks for a page beyond the last one (stale link, or the rows moved
 * after a bulk action): an honest empty state instead of a silent redirect.
 */
export function PageOutOfRange({ page, pageCount, noun, href }: PageOutOfRangeProps) {
  return (
    <EmptyState
      title={`Page ${page} is empty`}
      description={
        pageCount === 1
          ? `There is only one page of ${noun}s for these filters.`
          : `There are only ${pageCount} pages of ${noun}s for these filters.`
      }
      action={
        <Link href={href}>
          <Button size="sm" variant="outline" className="rounded-xl">
            Go to first page
          </Button>
        </Link>
      }
    />
  );
}
