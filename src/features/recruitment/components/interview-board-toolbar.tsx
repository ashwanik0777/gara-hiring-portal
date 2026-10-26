import React from "react";
import Link from "next/link";
import { CalendarRange, History } from "lucide-react";
import { LocalDateTime } from "@/features/lifecycle/components/local-date-time";
import type { InterviewBoardPage } from "../types";

interface InterviewBoardToolbarProps {
  board: Pick<InterviewBoardPage, "range" | "window" | "total">;
  /** Board path, e.g. "/admin/interviews". */
  baseHref: string;
}

const TOGGLE_CLASS =
  "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-xl border border-border bg-card px-3 text-xs font-medium text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/**
 * Says which sessions the board lists and links between the default window (recent and
 * upcoming) and all sessions. Plain links: the range travels in the URL.
 */
export function InterviewBoardToolbar({ board, baseHref }: InterviewBoardToolbarProps) {
  const sessions = `${board.total} session${board.total === 1 ? "" : "s"}`;
  return (
    <div className="flex flex-col gap-3 text-xs sm:flex-row sm:items-center sm:justify-between">
      <p className="text-muted-foreground">
        {board.window ? (
          <>
            Showing {sessions} between{" "}
            <LocalDateTime iso={board.window.from.toISOString()} mode="date" /> and{" "}
            <LocalDateTime iso={board.window.to.toISOString()} mode="date" /> (recent and upcoming).
          </>
        ) : (
          <>Showing all {sessions}.</>
        )}
      </p>
      {board.window ? (
        <Link href={`${baseHref}?range=all`} className={TOGGLE_CLASS}>
          <History className="h-3.5 w-3.5" aria-hidden="true" /> Show all sessions
        </Link>
      ) : (
        <Link href={baseHref} className={TOGGLE_CLASS}>
          <CalendarRange className="h-3.5 w-3.5" aria-hidden="true" /> Show recent and upcoming
        </Link>
      )}
    </div>
  );
}
