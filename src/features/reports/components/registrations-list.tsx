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
  REGISTRANT_DIRECTORY_PARAM_KEYS,
  registrantDirectoryHref,
  registrantDirectoryParams,
  type RegistrantDirectoryFormValues,
} from "./registrations-filters";
import { RegistrantsExportButton } from "./registrations-export-button";

type SearchParamValue = string | string[] | undefined;

const thClass = "py-2.5 px-3 text-left font-semibold";
const pageLinkClass =
  "inline-flex h-8 items-center justify-center rounded-xl border border-border bg-card px-3 text-xs font-medium hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function firstValue(value: SearchParamValue): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

/**
 * Reads the Registrations page parameters: the raw values for the filter form and the
 * service input (validated by the service).
 */
export function readRegistrantDirectoryParams(searchParams: Record<string, SearchParamValue>): {
  input: RegistrantListFilterInput;
  formValues: RegistrantDirectoryFormValues;
} {
  const keys = REGISTRANT_DIRECTORY_PARAM_KEYS;
  const formValues: RegistrantDirectoryFormValues = {
    search: firstValue(searchParams[keys.search]),
    interest: firstValue(searchParams[keys.interest]),
    emailVerified: firstValue(searchParams[keys.emailVerified]),
    applied: firstValue(searchParams[keys.applied]),
    startDate: firstValue(searchParams[keys.startDate]),
    endDate: firstValue(searchParams[keys.endDate]),
  };
  return {
    formValues,
    input: {
      search: formValues.search,
      interest: formValues.interest as RegistrantListFilterInput["interest"],
      emailVerified: formValues.emailVerified as RegistrantListFilterInput["emailVerified"],
      applied: formValues.applied as RegistrantListFilterInput["applied"],
      startDate: formValues.startDate,
      endDate: formValues.endDate,
      page: firstValue(searchParams[keys.page]),
    },
  };
}

interface RegistrantDirectoryListProps {
  user: AuthenticatedUser;
  params: RegistrantListFilterInput;
  /** The Registrations page of the current console, e.g. "/admin/registrations". */
  listPath: string;
}

function ListShell({ children, meta }: { children: ReactNode; meta?: ReactNode }) {
  return (
    <Card className="rounded-2xl border border-border/80 p-4 shadow-2xs sm:p-5">
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
 * Registrant table of the Registrations page (ADMIN, or HR with canReports): one bounded
 * page, newest first, with its total, page travel in the URL, an audited CSV export and a
 * link from every row to the person's detail page.
 */
export async function RegistrantDirectoryList({ user, params, listPath }: RegistrantDirectoryListProps) {
  let page: RegistrantListPage;
  try {
    page = await registrationAnalyticsService.listRegistrants(user, params);
  } catch (error) {
    if (error instanceof ValidationError) {
      return (
        <ListShell>
          <div role="alert" className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
            {error.message}{" "}
            <Link href={listPath} className="font-semibold underline">
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

  const listParams = registrantDirectoryParams(page.filters);
  const pageHref = (target: number) =>
    registrantDirectoryHref(listPath, {
      ...listParams,
      [REGISTRANT_DIRECTORY_PARAM_KEYS.page]: target > 1 ? String(target) : "",
    });
  const firstRow = page.total === 0 ? 0 : (page.page - 1) * page.pageSize + 1;
  const lastRow = (page.page - 1) * page.pageSize + page.items.length;
  const filtered = Object.values(listParams).some(Boolean);

  return (
    <ListShell
      meta={
        <div className="flex flex-col items-start gap-1 sm:items-end">
          <span className="font-mono text-xs text-muted-foreground">
            {page.total} {page.total === 1 ? "person" : "people"}
            {filtered ? " match these filters" : ""}
          </span>
          {page.total > 0 && <RegistrantsExportButton filters={page.filters} />}
        </div>
      }
    >
      {page.items.length === 0 ? (
        <EmptyState
          title={page.total === 0 ? (filtered ? "Nobody matches these filters" : "Nobody has signed up yet") : "No people on this page"}
          description={
            page.total === 0
              ? filtered
                ? "Nobody who signed up matches the filters. Widen the date range or clear the filters."
                : "People appear here as soon as they create a candidate account."
              : "This page is past the end of the list."
          }
          icon={<Users className="h-6 w-6 text-primary" />}
          action={
            page.total > 0 ? (
              <Link href={pageHref(1)} className={pageLinkClass}>
                Go to the first page
              </Link>
            ) : filtered ? (
              <Link href={listPath} className={pageLinkClass}>
                Clear the filters
              </Link>
            ) : undefined
          }
        />
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-xs">
              <caption className="sr-only">
                People who signed up, newest first: name (opens their details), e-mail, what they signed up for, sign-up
                date, e-mail verification, applications and current stage
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
                  <tr key={item.id} className="transition-colors hover:bg-muted/30">
                    <th scope="row" className="max-w-[14rem] py-2.5 px-3 text-left font-medium">
                      <Link
                        href={`${listPath}/${encodeURIComponent(item.userId)}`}
                        className="block truncate rounded-sm text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {item.name}
                      </Link>
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
export function RegistrantDirectoryListSkeleton() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className="space-y-4 rounded-2xl border border-border/80 bg-card p-4 shadow-2xs sm:p-5"
    >
      <span className="sr-only">Loading the registrant list</span>
      <div className="flex items-center justify-between border-b border-border/60 pb-3" aria-hidden="true">
        <Skeleton className="h-4 w-44" />
        <Skeleton className="h-8 w-28 rounded-xl" />
      </div>
      <div className="space-y-2" aria-hidden="true">
        <Skeleton className="h-8 w-full" />
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} className="h-9 w-full" />
        ))}
      </div>
      <div className="flex items-center justify-between" aria-hidden="true">
        <Skeleton className="h-3 w-48" />
        <div className="flex gap-2">
          <Skeleton className="h-8 w-20 rounded-xl" />
          <Skeleton className="h-8 w-16 rounded-xl" />
        </div>
      </div>
    </div>
  );
}
