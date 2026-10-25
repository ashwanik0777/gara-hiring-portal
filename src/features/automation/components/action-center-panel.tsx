import * as React from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowRight,
  BellRing,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  Clock,
  FileText,
  Handshake,
  ListChecks,
  MessageSquareText,
  Repeat,
  Scale,
  Send,
  UserPlus,
  type LucideIcon,
} from "lucide-react";
import type { AuthenticatedUser } from "@/lib/auth/guards";
import { logger } from "@/lib/logging/logger";
import { Skeleton } from "@/components/ui/skeleton";
import { getActionCenter } from "../services/action-center-service";
import type { ActionCenterResult, ActionCenterSection, ActionCenterSectionKey } from "../types";

const SECTION_ICONS: Record<ActionCenterSectionKey, LucideIcon> = {
  applicationsAwaitingScreening: FileText,
  interviewsAwaitingFeedback: MessageSquareText,
  checkpointsAwaitingReview: ListChecks,
  evaluationsAwaitingDecision: Scale,
  passedAwaitingJoining: UserPlus,
  offersAwaitingResponse: Send,
  acceptedOffersAwaitingJoining: Handshake,
  internReviewsDue: CalendarClock,
  conversionsPendingEffectiveDate: Repeat,
  leaveRequestsPending: CalendarDays,
  regularizationsPending: Clock,
};

const FOCUS_RING =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

function PanelFrame({ total, children }: { total?: number; children: React.ReactNode }) {
  return (
    <section
      aria-labelledby="action-center-heading"
      className="rounded-2xl border border-border/80 bg-card p-4 shadow-2xs sm:p-5"
    >
      <div className="mb-4 flex items-center justify-between gap-3 border-b border-border/60 pb-3">
        <div className="flex items-center gap-2">
          <BellRing className="h-4 w-4 text-primary" aria-hidden="true" />
          <h2 id="action-center-heading" className="text-sm font-bold text-foreground">
            Needs your attention
          </h2>
        </div>
        {total !== undefined && total > 0 && (
          <span className="rounded-full border border-border bg-background px-2.5 py-0.5 text-xs font-semibold text-foreground">
            {total} pending
          </span>
        )}
      </div>
      {children}
    </section>
  );
}

type LoadedSection = Extract<ActionCenterSection, { status: "ok" }>;

function SectionCard({ section }: { section: LoadedSection }) {
  const Icon = SECTION_ICONS[section.key];
  return (
    <div className="flex h-full flex-col gap-3 rounded-xl border border-border/70 bg-background p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Icon className="h-4 w-4" aria-hidden="true" />
          </span>
          <h3 className="text-sm font-semibold leading-snug text-foreground">{section.title}</h3>
        </div>
        <span className="text-xl font-bold tabular-nums text-foreground">
          <span className="sr-only">Pending: </span>
          {section.count}
        </span>
      </div>
      <p className="text-xs text-muted-foreground">{section.description}</p>
      {section.items.length > 0 && (
        <ul className="space-y-1">
          {section.items.map((item) => (
            <li key={item.id}>
              <Link
                href={item.href}
                className={`flex flex-col rounded-md px-2 py-1.5 transition-colors hover:bg-muted ${FOCUS_RING}`}
              >
                <span className="truncate text-xs font-medium text-foreground">{item.label}</span>
                <span
                  className={`truncate text-[11px] ${
                    item.overdue ? "font-semibold text-destructive" : "text-muted-foreground"
                  }`}
                >
                  {item.detail}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Link
        href={section.href}
        className={`mt-auto inline-flex items-center gap-1 self-start rounded-md text-xs font-semibold text-primary hover:underline ${FOCUS_RING}`}
      >
        View all<span className="sr-only">: {section.title}</span>
        <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
      </Link>
    </div>
  );
}

/** Presentational part of the panel (kept separate so it can be rendered from known data). */
export function ActionCenterView({ center }: { center: ActionCenterResult }) {
  const pending = center.sections.filter(
    (section): section is LoadedSection => section.status === "ok" && section.count > 0
  );
  const unavailable = center.sections.filter((section) => section.status === "unavailable");

  return (
    <PanelFrame total={center.totalCount}>
      {pending.length === 0 && unavailable.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-6 text-center">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
          </span>
          <p className="text-sm font-semibold text-foreground">You&apos;re all caught up</p>
          <p className="max-w-sm text-xs text-muted-foreground">
            Nothing is waiting for you right now. New items appear here as soon as they need your attention.
          </p>
        </div>
      ) : (
        pending.length > 0 && (
          <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {pending.map((section) => (
              <li key={section.key}>
                <SectionCard section={section} />
              </li>
            ))}
          </ul>
        )
      )}
      {unavailable.length > 0 && (
        <p
          role="status"
          className="mt-3 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-200"
        >
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>
            We couldn&apos;t load some items right now ({unavailable.map((section) => section.title).join(", ")}).
            Please refresh the page in a moment.
          </span>
        </p>
      )}
    </PanelFrame>
  );
}

/**
 * "Needs your attention" panel for the staff overview pages. Render it inside `<Suspense>`
 * with `<ActionCenterSkeleton />` so the rest of the overview does not wait for it. The
 * page must already have authenticated the user; every section is permission-scoped here.
 */
export async function ActionCenterPanel({ user, portalBase }: { user: AuthenticatedUser; portalBase: string }) {
  let center: ActionCenterResult;
  try {
    center = await getActionCenter(user, { portalBase });
  } catch (error) {
    logger.error("Action Center could not be loaded", error);
    return (
      <PanelFrame>
        <p role="status" className="flex items-start gap-2 text-sm text-muted-foreground">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
          We couldn&apos;t load the items that need your attention right now. Please refresh the page in a moment.
        </p>
      </PanelFrame>
    );
  }
  return <ActionCenterView center={center} />;
}

export function ActionCenterSkeleton() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className="rounded-2xl border border-border/80 bg-card p-4 sm:p-5"
    >
      <span className="sr-only">Loading items that need your attention</span>
      <div className="mb-4 flex items-center justify-between border-b border-border/60 pb-3">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-5 w-20 rounded-full" />
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="space-y-3 rounded-xl border border-border/70 p-4">
            <div className="flex items-center justify-between">
              <Skeleton className="h-8 w-40" />
              <Skeleton className="h-6 w-8" />
            </div>
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        ))}
      </div>
    </div>
  );
}
