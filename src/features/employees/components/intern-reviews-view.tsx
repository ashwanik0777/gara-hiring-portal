import React, { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  CalendarDays,
  ClipboardCheck,
  History,
  LogOut,
} from "lucide-react";
import { Role } from "@prisma/client";
import { getCurrentUser, hasPermission, type AuthenticatedUser } from "@/lib/auth/guards";
import { STAFF_ROLES } from "@/lib/auth/permissions";
import { ForbiddenError, toActionError } from "@/lib/errors";
import { BUSINESS_TIME_ZONE, businessDateKey } from "@/lib/time/business-time";
import { UnauthorizedState } from "@/components/feedback/unauthorized-state";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { conversionService } from "../services/conversion-service";
import {
  CONVERSION_OFFER_LABELS,
  REVIEW_DUE_LABELS,
  REVIEW_OUTCOME_LABELS,
  type ReviewDueState,
} from "../conversion-rules";
import {
  isInternReviewView,
  type InternReviewBoard,
  type InternReviewItem,
  type InternReviewView,
} from "../types";
import { FilterChipLink } from "./filter-chip-link";
import { ListPagination } from "./list-pagination";
import { buildListHref, firstParam, parsePositivePage, type RawSearchParams } from "./list-search-params";
import { ReviewBoardSkeleton } from "./intern-reviews-skeleton";
import { RecordReviewOutcomeDialog } from "./record-review-outcome-dialog";
import { SectionUnavailable } from "./section-unavailable";

export type InternReviewsPortal = "admin" | "subadmin";

const PORTAL_PATHS: Record<InternReviewsPortal, { self: string; employees: string }> = {
  admin: { self: "/admin/intern-reviews", employees: "/admin/employees" },
  subadmin: { self: "/subadmin/intern-reviews", employees: "/subadmin/employees" },
};

const DUE_BADGE: Record<ReviewDueState, "destructive" | "warning" | "outline"> = {
  OVERDUE: "destructive",
  DUE_THIS_WEEK: "warning",
  UPCOMING: "outline",
};

const VIEW_META: Record<InternReviewView, { label: string; icon: React.ReactNode; empty: string }> = {
  due: {
    label: "Due now",
    icon: <CalendarClock className="h-3.5 w-3.5" />,
    empty: "No reviews are overdue or due in the next seven days.",
  },
  overdue: {
    label: "Overdue",
    icon: <AlertTriangle className="h-3.5 w-3.5" />,
    empty: "No overdue reviews.",
  },
  upcoming: {
    label: "Upcoming",
    icon: <CalendarDays className="h-3.5 w-3.5" />,
    empty: "No later reviews are scheduled. Reviews are scheduled when an intern is marked as joined.",
  },
  decided: {
    label: "Decisions",
    icon: <History className="h-3.5 w-3.5" />,
    empty: "No review outcomes have been recorded yet.",
  },
};

/** Review and effective dates are calendar days stored at UTC midnight. */
function formatDay(value: Date | null): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-GB", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" }).format(
    new Date(value)
  );
}

/** Decision timestamps are instants, shown in the business time zone. */
function formatInstant(value: Date | null): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: BUSINESS_TIME_ZONE,
  }).format(new Date(value));
}

/** `?view=…&page=…`; the default view and page 1 are left out so the base URL stays canonical. */
function boardHref(basePath: string, view: InternReviewView, page = 1): string {
  return buildListHref(basePath, { view: view === "due" ? null : view, page: page > 1 ? page : null });
}

function InternHeading({ item, employeeHref }: { item: InternReviewItem; employeeHref: string | null }) {
  return (
    <div className="min-w-0 space-y-0.5">
      <p className="flex flex-wrap items-center gap-2">
        {employeeHref ? (
          <Link
            href={employeeHref}
            className="text-sm font-semibold text-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
          >
            {item.internName}
          </Link>
        ) : (
          <span className="text-sm font-semibold text-foreground">{item.internName}</span>
        )}
        <span className="font-mono text-[11px] text-muted-foreground">{item.employeeCode}</span>
      </p>
      <p className="text-xs text-muted-foreground">
        {item.designation} · {item.department}
        {item.periodStartDate ? ` · joined ${formatDay(item.periodStartDate)}` : ""}
      </p>
    </div>
  );
}

function ScheduledReviewCard({
  item,
  canRecord,
  employeesBase,
  todayKey,
}: {
  item: InternReviewItem;
  canRecord: boolean;
  employeesBase: string;
  todayKey: string;
}) {
  const employeeHref = canRecord ? `${employeesBase}/${item.employeeId}` : null;
  return (
    <li>
      <Card className="border-border shadow-xs">
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-2">
            <InternHeading item={item} employeeHref={employeeHref} />
            <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <CalendarDays className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
              Review on <span className="font-medium text-foreground">{formatDay(item.scheduledFor)}</span>
              <span>(after {item.reviewPeriodMonths} months)</span>
              {item.dueState && <Badge variant={DUE_BADGE[item.dueState]}>{REVIEW_DUE_LABELS[item.dueState]}</Badge>}
            </p>
          </div>
          {canRecord && (
            <RecordReviewOutcomeDialog
              reviewId={item.id}
              internName={item.internName}
              defaultDesignation={item.designation}
              defaultDepartment={item.department}
              todayKey={todayKey}
              exitHref={employeeHref ? `${employeeHref}?tab=exit#employee-administration` : null}
            />
          )}
        </CardContent>
      </Card>
    </li>
  );
}

function DecisionCard({
  item,
  canRecord,
  employeesBase,
}: {
  item: InternReviewItem;
  canRecord: boolean;
  employeesBase: string;
}) {
  const employeeHref = canRecord ? `${employeesBase}/${item.employeeId}` : null;
  const awaitingExit = item.outcome === "END_INTERNSHIP" && item.employeeStatus !== "EXITED";
  return (
    <li>
      <Card className="border-border shadow-xs">
        <CardContent className="space-y-3 p-4 text-xs">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <InternHeading item={item} employeeHref={employeeHref} />
            <div className="flex flex-wrap items-center gap-2">
              {item.outcome && <Badge variant="default">{REVIEW_OUTCOME_LABELS[item.outcome]}</Badge>}
              {item.offerStatus && (
                <Badge variant={item.offerStatus === "ACCEPTED" ? "success" : "outline"}>
                  {item.convertedAt ? "Converted" : CONVERSION_OFFER_LABELS[item.offerStatus]}
                </Badge>
              )}
            </div>
          </div>

          <p className="text-muted-foreground">
            Decided {formatInstant(item.decidedAt)}
            {item.reviewerName ? ` by ${item.reviewerName}` : ""} · review of {formatDay(item.scheduledFor)}
          </p>

          {item.outcome === "CONVERT" && (
            <p className="text-foreground">
              Full-time offer: <span className="font-medium">{item.proposedDesignation}</span> ({item.proposedDepartment}),
              effective {formatDay(item.proposedEffectiveDate)}
              {item.proposedInitialStatus ? `, starting as ${item.proposedInitialStatus}` : ""}.
            </p>
          )}

          {item.sharedSummary && (
            <div className="rounded-lg border border-border/60 bg-muted/30 p-2.5">
              <p className="mb-0.5 text-[11px] font-semibold text-muted-foreground">Shared with the intern</p>
              <p className="whitespace-pre-wrap text-foreground">{item.sharedSummary}</p>
            </div>
          )}
          {item.internalNotes && (
            <div className="rounded-lg border border-warning/30 bg-warning/5 p-2.5">
              <p className="mb-0.5 text-[11px] font-semibold text-warning">Internal notes (staff only)</p>
              <p className="whitespace-pre-wrap text-foreground">{item.internalNotes}</p>
            </div>
          )}

          {awaitingExit && (
            <div className="flex flex-col gap-2 rounded-lg border border-warning/30 bg-warning/10 p-3 sm:flex-row sm:items-center sm:justify-between">
              <span className="flex items-start gap-2 text-foreground">
                <LogOut className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
                The internship is to end. The exit is not processed automatically.
              </span>
              {employeeHref && (
                <Link
                  href={`${employeeHref}?tab=exit#employee-administration`}
                  className="inline-flex items-center gap-1 font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
                >
                  Process exit <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </Link>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </li>
  );
}

interface BoardSectionProps {
  user: AuthenticatedUser;
  paths: { self: string; employees: string };
  view: InternReviewView;
  page: number;
  todayKey: string;
}

/** Streamed board body: one database page of the selected view plus the per-view counts. */
async function InternReviewBoardSection({ user, paths, view, page, todayKey }: BoardSectionProps) {
  let board: InternReviewBoard;
  try {
    board = await conversionService.listReviewBoard(user, { view, page });
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return <UnauthorizedState message="You are not authorized to view intern reviews." />;
    }
    return (
      <SectionUnavailable
        title="Intern reviews"
        message={toActionError(error, "The review board could not be loaded right now. Please try again.")}
      />
    );
  }

  const tabCounts: Record<InternReviewView, number> = {
    due: board.counts.overdue + board.counts.dueThisWeek,
    overdue: board.counts.overdue,
    upcoming: board.counts.upcoming,
    decided: board.counts.decided,
  };
  const active = VIEW_META[board.view];
  const scheduledProps = { canRecord: board.canRecord, employeesBase: paths.employees, todayKey };

  return (
    <div className="space-y-4">
      {!board.canRecord && (
        <p className="text-xs text-muted-foreground">
          Outcomes are recorded by HR and administrators with the employees permission.
        </p>
      )}

      <nav aria-label="Review views" className="flex flex-wrap gap-2">
        {(Object.keys(VIEW_META) as InternReviewView[]).map((key) => (
          <FilterChipLink
            key={key}
            href={boardHref(paths.self, key)}
            active={board.view === key}
            label={VIEW_META[key].label}
            icon={VIEW_META[key].icon}
            count={tabCounts[key]}
            emphasis={key === "overdue"}
          />
        ))}
      </nav>

      <section aria-labelledby="review-list-heading" className="space-y-3">
        <h2 id="review-list-heading" className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <span aria-hidden="true" className="text-primary">
            {active.icon}
          </span>
          {active.label}
          <Badge variant="secondary" className="text-[10px]">
            {board.total}
          </Badge>
        </h2>

        {board.items.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border px-4 py-5 text-center text-xs text-muted-foreground">
            {board.total === 0 ? (
              active.empty
            ) : (
              <>
                No reviews on this page.{" "}
                <Link
                  href={boardHref(paths.self, board.view)}
                  className="font-medium text-primary underline-offset-4 hover:underline"
                >
                  Go to the first page
                </Link>
              </>
            )}
          </p>
        ) : (
          <ul className="grid grid-cols-1 gap-3">
            {board.items.map((item) =>
              board.view === "decided" ? (
                <DecisionCard key={item.id} item={item} canRecord={board.canRecord} employeesBase={paths.employees} />
              ) : (
                <ScheduledReviewCard key={item.id} item={item} {...scheduledProps} />
              )
            )}
          </ul>
        )}

        <ListPagination
          page={board.page}
          pageCount={board.pageCount}
          total={board.total}
          pageSize={board.pageSize}
          hrefFor={(next) => boardHref(paths.self, board.view, next)}
          label="Intern review pages"
          itemNoun="reviews"
        />
      </section>
    </div>
  );
}

/**
 * Intern progress reviews (product-owner decision 2026-10-25). Pages call this view, which
 * authorizes the viewer itself (layouts are not a security boundary): staff with the
 * canEmployees permission see the board; ADMIN and HR with canEmployees record outcomes.
 * The view and page travel in the URL (`?view=&page=`); the board body streams.
 */
export async function InternReviewsView({
  portal,
  searchParams,
}: {
  portal: InternReviewsPortal;
  searchParams?: Promise<RawSearchParams>;
}) {
  const paths = PORTAL_PATHS[portal];
  const user = await getCurrentUser();
  if (!user) {
    redirect(`/login?callbackUrl=${paths.self}`);
  }
  if (user.mustChangePassword) {
    redirect("/set-password");
  }
  if (portal === "admin" && !user.roles.includes(Role.ADMIN)) {
    return <UnauthorizedState message="The administrator portal is available to administrators only." />;
  }
  if (portal === "subadmin" && !user.roles.some((role) => STAFF_ROLES.includes(role))) {
    redirect("/candidate/dashboard");
  }
  if (!(await hasPermission(user, "canEmployees"))) {
    return <UnauthorizedState message="Intern reviews require the employees permission." />;
  }

  const raw = (await searchParams) ?? {};
  const requestedView = firstParam(raw.view);
  const view: InternReviewView = isInternReviewView(requestedView) ? requestedView : "due";
  const page = parsePositivePage(raw.page);
  const todayKey = businessDateKey(new Date());

  return (
    <div className="w-full space-y-6">
      <header className="flex flex-col gap-2 border-b border-border pb-6">
        <h1 className="flex items-center gap-2.5 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          <ClipboardCheck className="h-6 w-6 text-primary" aria-hidden="true" /> Intern Reviews
        </h1>
        <p className="text-xs text-muted-foreground sm:text-sm">
          Progress reviews held 3 or 6 months after an intern joins. The outcome is a full-time offer, an
          extension or the end of the internship.
        </p>
      </header>

      <Suspense key={`${view}|${page}`} fallback={<ReviewBoardSkeleton />}>
        <InternReviewBoardSection user={user} paths={paths} view={view} page={page} todayKey={todayKey} />
      </Suspense>
    </div>
  );
}
