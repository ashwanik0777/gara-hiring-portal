import type { ReactNode } from "react";
import Link from "next/link";
import { Users } from "lucide-react";
import type { AuthenticatedUser } from "@/lib/auth/guards";
import { ForbiddenError, ValidationError } from "@/lib/errors";
import { logger } from "@/lib/logging/logger";
import { EmptyState } from "@/components/feedback/empty-state";
import { Badge } from "@/components/ui/badge";
import { Card, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  REGISTRATION_INTEREST_LABELS,
  registrationAnalyticsService,
  type RegistrantListFilterInput,
} from "../services/registration-analytics-service";
import type { RegistrantListPage } from "../types";
import {
  REGISTRATION_PARAM_KEYS,
  RegistrantListFiltersForm,
  registrantListParams,
  registrationsHref,
} from "./registrations-filters";
import { RegistrantsExportButton } from "./registrations-export-button";

const thClass = "py-2.5 px-3 text-left font-semibold";
const pageLinkClass =
  "inline-flex h-8 items-center justify-center rounded-xl border border-border bg-card px-3 text-xs font-medium hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";

interface RegistrantListSectionProps {
  user: AuthenticatedUser;
  params: RegistrantListFilterInput;
  reportsPath: string;
  preservedParams: Record<string, string>;
}

function ListShell({ children, meta }: { children: ReactNode; meta?: ReactNode }) {
  return (
    <Card className="rounded-2xl border border-border/80 p-5 shadow-2xs">
      <section aria-labelledby="registrants-heading" className="space-y-4">
        <div className="flex flex-col gap-2 border-b border-border/60 pb-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" aria-hidden="true" />
            <CardTitle id="registrants-heading" className="text-sm font-bold text-foreground">
              People who signed up
            </CardTitle>
          </div>
          {meta}
        </div>
        {children}
      </section>
    </Card>
  );
}

/**
 * Registrant list (names and e-mails) for ADMIN and HR with canReports: one bounded page
 * with its total, filters and page travel in the URL, and an audited CSV export.
 */
export async function RegistrantListSection({ user, params, reportsPath, preservedParams }: RegistrantListSectionProps) {
  let page: RegistrantListPage;
  try {
    page = await registrationAnalyticsService.listRegistrants(user, params);
  } catch (error) {
    if (error instanceof ValidationError) {
      return (
        <ListShell>
          <div role="alert" className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
            {error.message}{" "}
            <Link href={registrationsHref(reportsPath, preservedParams)} className="font-semibold underline">
              Clear the filters
            </Link>
          </div>
        </ListShell>
      );
    }
    if (error instanceof ForbiddenError) {
      return null;
    }
    logger.error("Registrant list could not be loaded", error);
    return (
      <ListShell>
        <p role="alert" className="rounded-xl border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
          The registrant list is unavailable right now. Refresh the page to try again.
        </p>
      </ListShell>
    );
  }

  const listParams = { ...preservedParams, ...registrantListParams(page.filters) };
  const pageHref = (target: number) =>
    registrationsHref(reportsPath, { ...listParams, [REGISTRATION_PARAM_KEYS.page]: target > 1 ? String(target) : "" });
  const firstRow = page.total === 0 ? 0 : (page.page - 1) * page.pageSize + 1;
  const lastRow = (page.page - 1) * page.pageSize + page.items.length;

  return (
    <ListShell
      meta={
        <div className="flex flex-col items-start gap-1 sm:items-end">
          <span className="font-mono text-xs text-muted-foreground">
            {page.total} {page.total === 1 ? "person" : "people"}
          </span>
          {page.total > 0 && <RegistrantsExportButton filters={page.filters} />}
        </div>
      }
    >
      <RegistrantListFiltersForm reportsPath={reportsPath} filters={page.filters} preservedParams={preservedParams} />

      {page.items.length === 0 ? (
        <EmptyState
          title={page.total === 0 ? "Nobody matches these filters" : "No people on this page"}
          description={
            page.total === 0
              ? "Nobody who signed up in this period matches the filters. Widen the date range or clear the filters."
              : "This page is past the end of the list."
          }
          icon={<Users className="h-6 w-6 text-primary" />}
          action={
            page.total > 0 ? (
              <Link href={pageHref(1)} className={pageLinkClass}>
                Go to the first page
              </Link>
            ) : undefined
          }
        />
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-xs">
              <caption className="sr-only">
                People who signed up, newest first: name, e-mail, what they signed up for, sign-up date, e-mail
                verification, applications and current stage
              </caption>
              <thead>
                <tr className="border-b border-border/80 bg-muted/40 text-[11px] text-muted-foreground">
                  <th scope="col" className={thClass}>Name</th>
                  <th scope="col" className={thClass}>E-mail</th>
                  <th scope="col" className={thClass}>Signed up for</th>
                  <th scope="col" className={thClass}>Signed up</th>
                  <th scope="col" className={thClass}>E-mail verified</th>
                  <th scope="col" className={`${thClass} text-right`}>Applications</th>
                  <th scope="col" className={thClass}>Current stage</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {page.items.map((item) => (
                  <tr key={item.id}>
                    <th scope="row" className="max-w-[12rem] truncate py-2.5 px-3 text-left font-medium text-foreground">
                      {item.name}
                    </th>
                    <td className="max-w-[16rem] truncate py-2.5 px-3 text-muted-foreground">{item.email}</td>
                    <td className="py-2.5 px-3">{REGISTRATION_INTEREST_LABELS[item.interest]}</td>
                    <td className="py-2.5 px-3 font-mono tabular-nums">
                      <time dateTime={item.signedUpAt.toISOString()}>{item.signedUpDate}</time>
                    </td>
                    <td className="py-2.5 px-3">{item.emailVerified ? "Yes" : "No"}</td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums">{item.applicationCount}</td>
                    <td className="py-2.5 px-3">
                      <Badge variant="outline" className="text-[10px]">
                        {item.stageLabel}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <nav aria-label="Registrant pages" className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="text-muted-foreground">
              Showing {firstRow}–{lastRow} of {page.total} · page {page.page} of {page.pageCount}
            </span>
            <div className="flex gap-2">
              {page.page > 1 ? (
                <Link href={pageHref(page.page - 1)} className={pageLinkClass} rel="prev">
                  Previous
                </Link>
              ) : (
                <span className={`${pageLinkClass} pointer-events-none opacity-50`} aria-disabled="true">
                  Previous
                </span>
              )}
              {page.page < page.pageCount ? (
                <Link href={pageHref(page.page + 1)} className={pageLinkClass} rel="next">
                  Next
                </Link>
              ) : (
                <span className={`${pageLinkClass} pointer-events-none opacity-50`} aria-disabled="true">
                  Next
                </span>
              )}
            </div>
          </nav>
        </>
      )}
    </ListShell>
  );
}

/** Suspense fallback mirroring the list card. */
export function RegistrantListSkeleton() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className="space-y-4 rounded-2xl border border-border/80 bg-card p-5 shadow-2xs"
    >
      <span className="sr-only">Loading the registrant list</span>
      <div className="flex items-center justify-between" aria-hidden="true">
        <Skeleton className="h-4 w-44" />
        <Skeleton className="h-8 w-28 rounded-xl" />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-hidden="true">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-9 rounded-xl" />
        ))}
      </div>
      <div className="space-y-2" aria-hidden="true">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-8 w-full" />
        ))}
      </div>
    </div>
  );
}
