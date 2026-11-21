import React, { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, ArrowRight, CalendarClock, CalendarDays, Clock, Hash, History, LogOut, UserCheck } from "lucide-react";
import { Role } from "@prisma/client";
import { getCurrentUser, hasPermission, type AuthenticatedUser } from "@/lib/auth/guards";
import { STAFF_ROLES } from "@/lib/auth/permissions";
import { ForbiddenError, toActionError } from "@/lib/errors";
import { BUSINESS_TIME_ZONE, businessDateKey } from "@/lib/time/business-time";
import { UnauthorizedState } from "@/components/feedback/unauthorized-state";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/feedback/empty-state";
import { StatCard, StatGrid } from "@/components/ui/stat-card";
import { conversionService } from "../services/conversion-service";
import {
  CONVERSION_OFFER_LABELS,
  REVIEW_DUE_LABELS,
  REVIEW_OUTCOME_LABELS,
  type ReviewDueState,
  type ReviewOutcome,
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
import { employeeInitials } from "./employee-directory-table";

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

const DUE_AVATAR: Record<ReviewDueState, string> = {
  OVERDUE: "bg-destructive/10 text-destructive",
  DUE_THIS_WEEK: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  UPCOMING: "bg-primary/10 text-primary",
};

const OUTCOME_BADGE: Record<ReviewOutcome, "success" | "default" | "destructive"> = {
  CONVERT: "success",
  EXTEND: "default",
  END_INTERNSHIP: "destructive",
};

const VIEW_META: Record<InternReviewView, { label: string; icon: React.ReactNode; empty: string }> = {
  due: { label: "Due now", icon: <CalendarClock className="h-3.5 w-3.5" />, empty: "No reviews due now" },
  overdue: { label: "Overdue", icon: <AlertTriangle className="h-3.5 w-3.5" />, empty: "No overdue reviews" },
  upcoming: { label: "Upcoming", icon: <CalendarDays className="h-3.5 w-3.5" />, empty: "No upcoming reviews" },
  decided: { label: "Decisions", icon: <History className="h-3.5 w-3.5" />, empty: "No decisions yet" },
};

const DAY = new Intl.DateTimeFormat("en-IN", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
const DAY_IN_BUSINESS_ZONE = new Intl.DateTimeFormat("en-IN", { year: "numeric", month: "short", day: "numeric", timeZone: BUSINESS_TIME_ZONE });

/** Review and effective dates are calendar days stored at UTC midnight. */
function formatDay(value: Date | null): string {
  return value ? DAY.format(new Date(value)) : "—";
}

/** Decision timestamps are instants, shown in the business time zone. */
function formatInstant(value: Date | null): string {
  return value ? DAY_IN_BUSINESS_ZONE.format(new Date(value)) : "—";
}

/** "in 4 days", "today", "3 days overdue" for a review day (UTC midnight) against today's business day. */
export function reviewCountdown(scheduledFor: Date, todayKey: string): string {
  const days = Math.round((new Date(scheduledFor).getTime() - Date.parse(`${todayKey}T00:00:00.000Z`)) / 86_400_000);
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days > 1) return `in ${days} days`;
  return days === -1 ? "1 day overdue" : `${-days} days overdue`;
}

/** "ON_LEAVE" → "On leave". */
function humanize(value: string): string {
  const text = value.replace(/_/g, " ").toLowerCase();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** `?view=…&page=…`; the default view and page 1 are left out so the base URL stays canonical. */
function boardHref(basePath: string, view: InternReviewView, page = 1): string {
  return buildListHref(basePath, { view: view === "due" ? null : view, page: page > 1 ? page : null });
}

function InternHeading({ item, employeeHref, avatarClass, badges }: { item: InternReviewItem; employeeHref: string | null; avatarClass: string; badges?: React.ReactNode }) {
  return (
    <div className="flex min-w-0 gap-3">
      <span aria-hidden="true" className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold", avatarClass)}>
        {employeeInitials(item.internName)}
      </span>
      <div className="min-w-0 space-y-1">
        <p className="flex flex-wrap items-center gap-2">
          {employeeHref ? (
            <Link
              href={employeeHref}
              className="rounded-sm text-sm font-semibold text-foreground hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              {item.internName}
            </Link>
          ) : (
            <span className="text-sm font-semibold text-foreground">{item.internName}</span>
          )}
          {badges}
        </p>
        <p className="text-xs text-foreground/80">
          {item.designation} <span className="text-muted-foreground">· {item.department}</span>
        </p>
      </div>
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
  const due = item.dueState ?? "UPCOMING";
  return (
    <li className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0 space-y-3">
          <InternHeading
            item={item}
            employeeHref={employeeHref}
            avatarClass={DUE_AVATAR[due]}
            badges={
              item.dueState && (
                <Badge variant={DUE_BADGE[item.dueState]} className="text-[10px]">
                  {REVIEW_DUE_LABELS[item.dueState]}
                </Badge>
              )
            }
          />
          <ul className="flex flex-wrap gap-x-4 gap-y-1 pl-13 text-xs text-muted-foreground">
            <li className="inline-flex items-center gap-1.5">
              <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
              Review <span className="font-medium text-foreground">{formatDay(item.scheduledFor)}</span>
              <span className={cn(due === "OVERDUE" && "font-medium text-destructive")}>· {reviewCountdown(item.scheduledFor, todayKey)}</span>
            </li>
            <li className="inline-flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" aria-hidden="true" />
              {item.reviewPeriodMonths}-month review
            </li>
            {item.periodStartDate && (
              <li className="inline-flex items-center gap-1.5">
                <UserCheck className="h-3.5 w-3.5" aria-hidden="true" />
                Joined {formatDay(item.periodStartDate)}
              </li>
            )}
            <li className="inline-flex items-center gap-1.5 font-mono">
              <Hash className="h-3.5 w-3.5" aria-hidden="true" />
              {item.employeeCode}
            </li>
          </ul>
        </div>
        {canRecord && (
          <div className="shrink-0 lg:pl-4">
            <RecordReviewOutcomeDialog
              reviewId={item.id}
              internName={item.internName}
              defaultDesignation={item.designation}
              defaultDepartment={item.department}
              todayKey={todayKey}
            />
          </div>
        )}
      </div>
    </li>
  );
}

function NoteTile({ label, tone, children }: { label: string; tone: "muted" | "warning"; children: React.ReactNode }) {
  return (
    <div className={cn("rounded-xl border p-3", tone === "warning" ? "border-warning/30 bg-warning/5" : "border-border/60 bg-muted/30")}>
      <p className={cn("text-[11px] font-medium uppercase tracking-wider", tone === "warning" ? "text-warning" : "text-muted-foreground")}>{label}</p>
      <div className="mt-1 whitespace-pre-wrap text-sm text-foreground">{children}</div>
    </div>
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
    <li className="space-y-4 rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <InternHeading
          item={item}
          employeeHref={employeeHref}
          avatarClass="bg-primary/10 text-primary"
          badges={
            <>
              {item.outcome && (
                <Badge variant={OUTCOME_BADGE[item.outcome]} className="text-[10px]">
                  {REVIEW_OUTCOME_LABELS[item.outcome]}
                </Badge>
              )}
              {item.offerStatus && (
                <Badge variant={item.offerStatus === "ACCEPTED" ? "success" : "outline"} className="text-[10px]">
                  {item.convertedAt ? "Converted" : CONVERSION_OFFER_LABELS[item.offerStatus]}
                </Badge>
              )}
            </>
          }
        />
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground lg:justify-end lg:text-right">
          <li className="inline-flex items-center gap-1.5">
            <History className="h-3.5 w-3.5" aria-hidden="true" />
            Decided {formatInstant(item.decidedAt)}
            {item.reviewerName ? ` by ${item.reviewerName}` : ""}
          </li>
          <li className="inline-flex items-center gap-1.5">
            <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
            {item.reviewPeriodMonths}-month review, {formatDay(item.scheduledFor)}
          </li>
        </ul>
      </div>

      {item.outcome === "CONVERT" && (
        <dl className="grid grid-cols-2 gap-3 rounded-xl border border-success/25 bg-success/5 p-3 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Full-time role</dt>
            <dd className="mt-0.5 font-medium text-foreground">{item.proposedDesignation}</dd>
          </div>
          <div>
            <dt className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Department</dt>
            <dd className="mt-0.5 text-foreground">{item.proposedDepartment}</dd>
          </div>
          <div>
            <dt className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Effective</dt>
            <dd className="mt-0.5 text-foreground">{formatDay(item.proposedEffectiveDate)}</dd>
          </div>
          {item.proposedInitialStatus && (
            <div>
              <dt className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Starts as</dt>
              <dd className="mt-0.5 text-foreground">{humanize(item.proposedInitialStatus)}</dd>
            </div>
          )}
        </dl>
      )}

      {(item.sharedSummary || item.internalNotes) && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {item.sharedSummary && (
            <NoteTile label="Shared with the intern" tone="muted">
              {item.sharedSummary}
            </NoteTile>
          )}
          {item.internalNotes && (
            <NoteTile label="Internal notes (staff only)" tone="warning">
              {item.internalNotes}
            </NoteTile>
          )}
        </div>
      )}

      {awaitingExit && (
        <div className="flex flex-col gap-3 rounded-xl border border-warning/30 bg-warning/10 p-3 sm:flex-row sm:items-center sm:justify-between">
          <span className="flex items-start gap-2 text-sm text-foreground">
            <LogOut className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
            Exit not processed yet
          </span>
          {employeeHref && (
            <Link
              href={`${employeeHref}?tab=exit#employee-administration`}
              className="inline-flex h-8 w-fit items-center gap-1.5 rounded-lg border border-border bg-background px-3 text-xs font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              Process exit <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          )}
        </div>
      )}
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

/** Streamed board body: summary cards, view chips and one database page of the selected view. */
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

  return <ReviewBoardBody board={board} paths={paths} todayKey={todayKey} />;
}

/** The board for loaded data: summary cards, view chips and the cards of the selected view. */
export function ReviewBoardBody({ board, paths, todayKey }: { board: InternReviewBoard; paths: { self: string; employees: string }; todayKey: string }) {
  const tabCounts: Record<InternReviewView, number> = {
    due: board.counts.overdue + board.counts.dueThisWeek,
    overdue: board.counts.overdue,
    upcoming: board.counts.upcoming,
    decided: board.counts.decided,
  };
  const active = VIEW_META[board.view];
  const scheduledProps = { canRecord: board.canRecord, employeesBase: paths.employees, todayKey };

  return (
    <div className="space-y-6">
      <StatGrid columns={4} label="Review summary">
        <StatCard label="Overdue" value={board.counts.overdue} icon={AlertTriangle} tone="rose" href={boardHref(paths.self, "overdue")} />
        <StatCard label="Due This Week" value={board.counts.dueThisWeek} icon={CalendarClock} tone="amber" href={boardHref(paths.self, "due")} />
        <StatCard label="Upcoming" value={board.counts.upcoming} icon={CalendarDays} tone="blue" href={boardHref(paths.self, "upcoming")} />
        <StatCard label="Decisions" value={board.counts.decided} icon={History} tone="emerald" href={boardHref(paths.self, "decided")} />
      </StatGrid>

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

      <section aria-label={active.label} className="space-y-4">
        {board.items.length === 0 ? (
          <EmptyState
            title={board.total === 0 ? active.empty : "No reviews on this page"}
            action={
              board.total > 0 ? (
                <Link href={boardHref(paths.self, board.view)} className="inline-flex h-9 items-center rounded-lg border border-border px-3 text-sm font-medium hover:bg-muted">
                  Go to the first page
                </Link>
              ) : undefined
            }
          />
        ) : (
          <ul className="grid grid-cols-1 gap-3" aria-label={`${active.label} reviews`}>
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

  // The portal header shows the page title.
  return (
    <div className="w-full space-y-6">
      <Suspense key={`${view}|${page}`} fallback={<ReviewBoardSkeleton />}>
        <InternReviewBoardSection user={user} paths={paths} view={view} page={page} todayKey={todayKey} />
      </Suspense>
    </div>
  );
}
