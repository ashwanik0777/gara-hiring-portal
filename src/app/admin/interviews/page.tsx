import React, { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/guards";
import { ForbiddenError } from "@/lib/errors";
import { recruitmentService } from "@/features/recruitment/services/recruitment-service";
import type { InterviewBoardRange } from "@/features/recruitment/types";
import { PendingBookingRequestsBoard } from "@/features/recruitment/components/pending-booking-requests-board";
import { AddToCalendarButton } from "@/features/recruitment/components/add-to-calendar-button";
import { InterviewBoardToolbar } from "@/features/recruitment/components/interview-board-toolbar";
import {
  ListPagination,
  PageOutOfRange,
  pageHref,
  parsePageParam,
} from "@/features/recruitment/components/list-pagination";
import { LocalDateTime } from "@/features/lifecycle/components/local-date-time";
import { absoluteUrl, getSiteUrl } from "@/lib/site-url";
import { InterviewRecommendation, Role } from "@prisma/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/feedback/empty-state";
import { UnauthorizedState } from "@/components/feedback/unauthorized-state";
import {
  Calendar,
  Clock,
  CheckCircle2,
  UserCheck,
  Video,
  ArrowRight,
} from "lucide-react";

const STAFF_ROLES: Role[] = [Role.ADMIN, Role.HR, Role.INTERVIEWER, Role.MANAGER];
const BOARD_HREF = "/admin/interviews";

interface RecruitmentInterviewsPageProps {
  searchParams: Promise<{
    range?: string;
    page?: string;
  }>;
}

function getRecommendationBadge(rec: InterviewRecommendation) {
  switch (rec) {
    case InterviewRecommendation.STRONG_HIRE:
      return <Badge variant="success">Strong Hire</Badge>;
    case InterviewRecommendation.HIRE:
      return <Badge variant="success">Hire</Badge>;
    case InterviewRecommendation.HOLD:
      return <Badge variant="warning">Hold</Badge>;
    case InterviewRecommendation.NO_HIRE:
      return <Badge variant="destructive">No Hire</Badge>;
    default:
      return <Badge variant="outline">{rec}</Badge>;
  }
}

export const instant = false;

export default async function RecruitmentInterviewsPage({
  searchParams,
}: RecruitmentInterviewsPageProps) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.mustChangePassword) redirect("/set-password");

  const isStaff = user.roles.some((r) => STAFF_ROLES.includes(r));
  if (!isStaff) redirect("/candidate/dashboard");
  // Page-level guard: the /admin portal is restricted to Super Administrators.
  if (!user.roles.includes(Role.ADMIN)) {
    return <UnauthorizedState message="The administrator portal is restricted to Super Administrators." />;
  }

  // Range and page travel in the URL so links and the back button keep working.
  const { range, page } = await searchParams;
  const boardRange: InterviewBoardRange = range === "all" ? "all" : "window";
  const listQuery = { range: boardRange === "all" ? "all" : undefined };

  let stats: Awaited<ReturnType<typeof recruitmentService.getInterviewBoardStats>>;
  let board: Awaited<ReturnType<typeof recruitmentService.getInterviewSchedules>>;
  try {
    // The service enforces staff role + canInterviews. KPI counts are aggregated in the
    // database; the list loads one page of the selected range.
    [stats, board] = await Promise.all([
      recruitmentService.getInterviewBoardStats(user),
      recruitmentService.getInterviewSchedules(user, {
        order: "asc",
        range: boardRange,
        page: parsePageParam(page),
      }),
    ]);
  } catch (err: unknown) {
    if (err instanceof ForbiddenError) {
      return <UnauthorizedState message="Viewing interview sessions requires the interviews permission." />;
    }
    throw err;
  }

  const calendarHost = getSiteUrl();

  return (
    <div className="w-full space-y-6">
      {/* 4 KPI Statistics Cards (all-time, aggregated in the database) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Total Interviews */}
        <div className="bg-card border border-border/70 border-l-4 border-l-blue-500 rounded-xl p-4 shadow-2xs hover:shadow-xs transition-shadow flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold text-muted-foreground tracking-wider uppercase">
              Total Sessions
            </p>
            <p className="text-2xl sm:text-3xl font-extrabold font-mono text-foreground mt-1">
              {stats.total}
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Across all hiring rounds
            </p>
          </div>
          <div className="h-9 w-9 rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400 flex items-center justify-center shrink-0">
            <Calendar className="h-4 w-4" />
          </div>
        </div>

        {/* Card 2: Upcoming / Scheduled */}
        <div className="bg-card border border-border/70 border-l-4 border-l-amber-500 rounded-xl p-4 shadow-2xs hover:shadow-xs transition-shadow flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold text-muted-foreground tracking-wider uppercase">
              Upcoming Rounds
            </p>
            <p className="text-2xl sm:text-3xl font-extrabold font-mono text-foreground mt-1">
              {stats.upcoming}
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Scheduled & pending evaluation
            </p>
          </div>
          <div className="h-9 w-9 rounded-xl bg-amber-50 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400 flex items-center justify-center shrink-0">
            <Clock className="h-4 w-4" />
          </div>
        </div>

        {/* Card 3: Completed Reviews */}
        <div className="bg-card border border-border/70 border-l-4 border-l-emerald-500 rounded-xl p-4 shadow-2xs hover:shadow-xs transition-shadow flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold text-muted-foreground tracking-wider uppercase">
              Completed Reviews
            </p>
            <p className="text-2xl sm:text-3xl font-extrabold font-mono text-foreground mt-1">
              {stats.completed}
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Panel feedback submitted
            </p>
          </div>
          <div className="h-9 w-9 rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400 flex items-center justify-center shrink-0">
            <CheckCircle2 className="h-4 w-4" />
          </div>
        </div>

        {/* Card 4: Positive Recommendations */}
        <div className="bg-card border border-border/70 border-l-4 border-l-violet-500 rounded-xl p-4 shadow-2xs hover:shadow-xs transition-shadow flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold text-muted-foreground tracking-wider uppercase">
              Positive Endorsements
            </p>
            <p className="text-2xl sm:text-3xl font-extrabold font-mono text-foreground mt-1">
              {stats.positive}
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Hire & Strong Hire
            </p>
          </div>
          <div className="h-9 w-9 rounded-xl bg-violet-50 text-violet-600 dark:bg-violet-950/60 dark:text-violet-400 flex items-center justify-center shrink-0">
            <UserCheck className="h-4 w-4" />
          </div>
        </div>
      </div>

      {/* Interview times still waiting for candidates (self-scheduling). Renders nothing
          when there are none, so no skeleton: it would flash and collapse on most loads. */}
      <Suspense fallback={null}>
        <PendingBookingRequestsBoard user={user} applicationHrefBase="/admin/applications" />
      </Suspense>

      {/* Main Schedule Content */}
      {stats.total === 0 ? (
        <EmptyState
          title="No interviews scheduled yet"
          description="Schedule candidate interview sessions from the application queue cockpit."
          action={
            <Link href="/admin/applications">
              <Button size="sm">Go to Application Queue</Button>
            </Link>
          }
        />
      ) : (
        <div className="space-y-3">
          <InterviewBoardToolbar board={board} baseHref={BOARD_HREF} />

          {board.total === 0 ? (
            <EmptyState
              title="No interviews in this period"
              description="Nothing is scheduled in the recent and upcoming window. Show all sessions to include older rounds."
              action={
                <Link href={pageHref(BOARD_HREF, { range: "all" }, 1)}>
                  <Button size="sm" variant="outline">Show all sessions</Button>
                </Link>
              }
            />
          ) : board.items.length === 0 ? (
            <PageOutOfRange
              page={board.page}
              pageCount={board.pageCount}
              noun="session"
              href={pageHref(BOARD_HREF, listQuery, 1)}
            />
          ) : (
            <>
              <div className="grid grid-cols-1 gap-3">
                {board.items.map((schedule) => (
                  <Card
                    key={schedule.id}
                    className="border-border hover:border-primary/40 transition-colors shadow-xs"
                  >
                    <CardContent className="p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                      <div className="space-y-1.5 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-sm text-foreground">
                            Round {schedule.roundNumber}: {schedule.roundName}
                          </span>
                          <Badge variant="outline" className="text-[10px]">
                            {schedule.status}
                          </Badge>
                          {schedule.selfScheduled && (
                            <Badge variant="outline" className="text-[10px]">
                              Booked by candidate
                            </Badge>
                          )}
                          {schedule.feedback && getRecommendationBadge(schedule.feedback.recommendation)}
                        </div>

                        <div>
                          <h3 className="text-base font-semibold text-foreground">
                            {schedule.candidateName}
                          </h3>
                          <p className="text-xs text-muted-foreground">
                            Role: {schedule.openingTitle} ({schedule.openingDepartment})
                          </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground pt-1">
                          <span className="flex items-center gap-1.5">
                            <Clock className="h-3.5 w-3.5 text-primary" />
                            <LocalDateTime iso={schedule.scheduledAt.toISOString()} /> ({schedule.durationMinutes}m)
                          </span>
                          {schedule.interviewerName && (
                            <span className="flex items-center gap-1.5">
                              <UserCheck className="h-3.5 w-3.5" />
                              Interviewer: {schedule.interviewerName}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex sm:flex-col items-end justify-between w-full sm:w-auto gap-3 pt-2 sm:pt-0 border-t sm:border-t-0 border-border/60">
                        {schedule.meetingLink && (
                          <a
                            href={schedule.meetingLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-primary hover:underline inline-flex items-center gap-1"
                          >
                            <Video className="h-3.5 w-3.5" /> Join Meeting
                          </a>
                        )}

                        {(schedule.status === "SCHEDULED" || schedule.status === "RESCHEDULED") && (
                          <AddToCalendarButton
                            scheduleId={schedule.id}
                            sequence={schedule.icsSequence}
                            startsAt={schedule.scheduledAt.toISOString()}
                            durationMinutes={schedule.durationMinutes}
                            recipientRole="INTERVIEWER"
                            roundName={schedule.roundName}
                            openingTitle={schedule.openingTitle}
                            candidateName={schedule.candidateName}
                            meetingLink={schedule.meetingLink}
                            detailsUrl={absoluteUrl(`/admin/applications/${schedule.applicationId}`)}
                            host={calendarHost}
                          />
                        )}

                        <Link href={`/admin/applications/${schedule.applicationId}`}>
                          <Button size="sm" variant="outline" className="gap-1.5">
                            Open Cockpit <ArrowRight className="h-3.5 w-3.5" />
                          </Button>
                        </Link>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              <ListPagination
                baseHref={BOARD_HREF}
                query={listQuery}
                page={board.page}
                pageCount={board.pageCount}
                total={board.total}
                noun="session"
                label="Interview board pages"
              />
            </>
          )}
        </div>
      )}
    </div>
  );
}
