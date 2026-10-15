import React from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { InterviewRecommendation, Role } from "@prisma/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/feedback/empty-state";
import {
  Calendar,
  Video,
  ArrowRight,
  UserCheck,
  Clock,
  CheckCircle2,
} from "lucide-react";

const STAFF_ROLES: Role[] = [Role.ADMIN, Role.HR, Role.INTERVIEWER, Role.MANAGER];

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

export default async function RecruitmentInterviewsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const isStaff = user.roles.some((r) => STAFF_ROLES.includes(r));
  if (!isStaff) redirect("/candidate/dashboard");

  const schedules = await prisma.interviewSchedule.findMany({
    include: {
      application: {
        include: {
          candidate: {
            include: {
              user: {
                select: { name: true, email: true },
              },
            },
          },
          opening: {
            select: { title: true, department: true },
          },
        },
      },
      interviewer: {
        select: { name: true, email: true },
      },
      feedback: {
        select: {
          recommendation: true,
          summaryNotes: true,
        },
      },
    },
    orderBy: { scheduledAt: "asc" },
  });

  // KPI Metrics Calculation
  const totalSessions = schedules.length;
  const upcomingSessions = schedules.filter(
    (s) => s.status === "SCHEDULED" || s.status === "RESCHEDULED"
  ).length;
  const completedSessions = schedules.filter(
    (s) => s.status === "COMPLETED" || Boolean(s.feedback)
  ).length;
  const positiveRecommendations = schedules.filter(
    (s) =>
      s.feedback?.recommendation === InterviewRecommendation.HIRE ||
      s.feedback?.recommendation === InterviewRecommendation.STRONG_HIRE
  ).length;

  return (
    <div className="w-full space-y-6">
      {/* 4 KPI Statistics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Total Interviews */}
        <div className="bg-card border border-border/70 border-l-4 border-l-blue-500 rounded-xl p-4 shadow-2xs hover:shadow-xs transition-shadow flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold text-muted-foreground tracking-wider uppercase">
              Total Sessions
            </p>
            <p className="text-2xl sm:text-3xl font-extrabold font-mono text-foreground mt-1">
              {totalSessions}
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
              {upcomingSessions}
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
              {completedSessions}
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
              {positiveRecommendations}
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

      {/* Main Schedule Content */}
      {schedules.length === 0 ? (
        <EmptyState
          title="No interviews scheduled yet"
          description="Schedule candidate interview sessions from the application queue cockpit."
          action={
            <Link href="/recruitment/applications">
              <Button size="sm">Go to Application Queue</Button>
            </Link>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {schedules.map((schedule) => (
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
                    {schedule.feedback && getRecommendationBadge(schedule.feedback.recommendation)}
                  </div>

                  <div>
                    <h3 className="text-base font-semibold text-foreground">
                      {schedule.application.candidate.user.name}
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      Role: {schedule.application.opening.title} ({schedule.application.opening.department})
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground pt-1">
                    <span className="flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5 text-primary" />
                      {new Date(schedule.scheduledAt).toLocaleString()} ({schedule.durationMinutes}m)
                    </span>
                    {schedule.interviewer && (
                      <span className="flex items-center gap-1.5">
                        <UserCheck className="h-3.5 w-3.5" />
                        Interviewer: {schedule.interviewer.name}
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

                  <Link href={`/recruitment/applications/${schedule.applicationId}`}>
                    <Button size="sm" variant="outline" className="gap-1.5">
                      Open Cockpit <ArrowRight className="h-3.5 w-3.5" />
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
