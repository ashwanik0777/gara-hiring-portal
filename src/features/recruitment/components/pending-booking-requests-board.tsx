import React from "react";
import Link from "next/link";
import { ArrowRight, CalendarRange } from "lucide-react";
import type { AuthenticatedUser } from "@/lib/auth/guards";
import { ForbiddenError } from "@/lib/errors";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LocalDateTime } from "@/features/lifecycle/components/local-date-time";
import { interviewBookingService } from "../services/interview-booking-service";
import { BookingRequestStatusBadge } from "./booking-request-list";

interface PendingBookingRequestsBoardProps {
  user: AuthenticatedUser;
  /** Application detail base path, e.g. "/admin/applications". */
  applicationHrefBase: string;
}

/**
 * Interview board section: interview times still waiting for candidates to book. Renders
 * nothing when there are none or the viewer may not see booking requests.
 */
export async function PendingBookingRequestsBoard({ user, applicationHrefBase }: PendingBookingRequestsBoardProps) {
  let requests: Awaited<ReturnType<typeof interviewBookingService.listPendingRequestsForBoard>>;
  try {
    requests = await interviewBookingService.listPendingRequestsForBoard(user);
  } catch (error) {
    if (error instanceof ForbiddenError) return null;
    throw error;
  }
  if (requests.length === 0) return null;

  return (
    <Card className="border-border shadow-xs">
      <CardHeader className="pb-3 border-b border-border/50">
        <CardTitle className="text-base flex items-center gap-2">
          <CalendarRange className="h-4 w-4 text-primary" aria-hidden="true" /> Waiting for candidates to choose a time
          <span className="ml-auto font-mono text-xs text-muted-foreground">{requests.length}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-4">
        <ul className="divide-y divide-border/60">
          {requests.map((request) => {
            const nextOpen = request.slots.find((slot) => slot.status === "OPEN" && !slot.isPast);
            return (
              <li
                key={request.id}
                className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-foreground">{request.candidateName}</span>
                    <BookingRequestStatusBadge request={{ status: request.status, noTimesLeft: request.noTimesLeft }} />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Round {request.roundNumber}: {request.roundName} · {request.openingTitle} (
                    {request.openingDepartment})
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {request.openSlotCount} of {request.slots.length} times still open
                    {nextOpen ? (
                      <>
                        {" "}
                        · next <LocalDateTime iso={nextOpen.startsAt} />
                      </>
                    ) : null}
                    {request.interviewerName ? ` · Interviewer: ${request.interviewerName}` : ""}
                  </p>
                </div>
                <Link
                  href={`${applicationHrefBase}/${request.applicationId}`}
                  className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-xl border border-border bg-card px-3 text-xs font-medium text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  Open application <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </Link>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
