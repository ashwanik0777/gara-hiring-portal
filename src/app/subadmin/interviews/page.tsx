import React, { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/guards";
import { ForbiddenError } from "@/lib/errors";
import { getUserPermissions, STAFF_ROLES } from "@/lib/auth/permissions";
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
import { InterviewRecommendation } from "@prisma/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/feedback/empty-state";
import { StatCard, StatGrid } from "@/components/ui/stat-card";
import { UnauthorizedState } from "@/components/feedback/unauthorized-state";
import {
  Calendar,
  Video,
  ArrowRight,
  UserCheck,
  Clock,
  CheckCircle2,
} from "lucide-react";

export const instant = false;

const BOARD_HREF = "/subadmin/interviews";

interface SubAdminInterviewsPageProps {
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

export default async function SubAdminInterviewsPage({ searchParams }: SubAdminInterviewsPageProps) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?callbackUrl=/subadmin/interviews");
  if (user.mustChangePassword) redirect("/set-password");

  const hasStaffOrAdminRole = user.roles.some((r) => STAFF_ROLES.includes(r));
  if (!hasStaffOrAdminRole) redirect("/candidate/dashboard");

  const permissions = await getUserPermissions(user.id, user.roles);
  if (!permissions.canInterviews) redirect("/subadmin");

  // Range and page travel in the URL so links and the back button keep working.
  const { range, page } = await searchParams;
  const boardRange: InterviewBoardRange = range === "all" ? "all" : "window";
  const listQuery = { range: boardRange === "all" ? "all" : undefined };

  let stats: Awaited<ReturnType<typeof recruitmentService.getInterviewBoardStats>>;
  let board: Awaited<ReturnType<typeof recruitmentService.getInterviewSchedules>>;
  try {
    // The service enforces staff role + canInterviews and scopes interviewers to their own
    // rounds and feedback. KPI counts are aggregated in the database; the list loads one
    // page of the selected range.
    [stats, board] = await Promise.all([
      recruitmentService.getInterviewBoardStats(user),
      recruitmentService.getInterviewSchedules(user, {
        order: "desc",
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
      <StatGrid columns={4} label="Interview summary">
        <StatCard label="Total Sessions" value={stats.total} icon={Calendar} tone="blue" hint="Scheduled interview sessions" />
        <StatCard
          label="Upcoming Rounds"
          value={stats.upcoming}
          icon={Clock}
          tone="amber"
          hint="Scheduled & pending evaluation"
        />
        <StatCard
          label="Completed Reviews"
          value={stats.completed}
          icon={CheckCircle2}
          tone="emerald"
          hint="Evaluation feedback logged"
        />
        <StatCard
          label="Positive Endorsements"
          value={stats.positive}
          icon={UserCheck}
          tone="violet"
          hint="Hire & Strong Hire"
        />
      </StatGrid>

      {/* Interview times still waiting for candidates (self-scheduling). Renders nothing
          when there are none, so no skeleton: it would flash and collapse on most loads. */}
      <Suspense fallback={null}>
        <PendingBookingRequestsBoard user={user} applicationHrefBase="/subadmin/applications" />
      </Suspense>

      {/* Main Schedule Content */}
      {stats.total === 0 ? (
        <EmptyState
          title="No interviews scheduled yet"
          description="Schedule candidate evaluations from within the application queue review cockpit."
          action={
            <Link href="/subadmin/applications">
              <Button size="sm">Go to Applications</Button>
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
              <div className="grid grid-cols-1 gap-4">
                {board.items.map((schedule) => (
                  <Card key={schedule.id} className="border-border hover:border-primary/40 transition-colors">
                    <CardContent className="p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                      <div className="space-y-1.5 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="outline" className="font-mono text-xs">
                            Round {schedule.roundNumber}
                          </Badge>
                          <span className="font-semibold text-sm text-foreground">
                            {schedule.roundName}
                          </span>
                          <Badge variant="secondary" className="text-xs">
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
                            detailsUrl={absoluteUrl(`/subadmin/applications/${schedule.applicationId}`)}
                            host={calendarHost}
                          />
                        )}

                        <Link href={`/subadmin/applications/${schedule.applicationId}`}>
                          <Button size="sm" variant="outline" className="gap-1.5">
                            Review & Feedback <ArrowRight className="h-3.5 w-3.5" />
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
