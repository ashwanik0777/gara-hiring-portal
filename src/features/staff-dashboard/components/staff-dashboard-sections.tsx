import React from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowRight,
  Award,
  BarChart3,
  Briefcase,
  Calendar,
  CalendarDays,
  CalendarOff,
  CheckCircle2,
  Clock,
  CreditCard,
  FileText,
  GraduationCap,
  Users,
  UserCheck,
  Video,
  type LucideIcon,
} from "lucide-react";
import type { AuthenticatedUser } from "@/lib/auth/guards";
import { ForbiddenError } from "@/lib/errors";
import { logger } from "@/lib/logging/logger";
import { BUSINESS_TIME_ZONE, businessDateKey } from "@/lib/time/business-time";
import { Badge } from "@/components/ui/badge";
import { ListCardSkeleton } from "@/components/feedback/page-skeletons";
import { addDaysToKey } from "@/features/automation/schedule";
import {
  EMPLOYEE_STATUS_LABELS,
  LeaveSummarySection,
  QuickLinksSection,
  TodayAttendanceSection,
  type QuickLink,
} from "@/features/lifecycle/components/hr-self-service-sections";
import {
  EmptyHint,
  EVALUATION_STATUS_LABELS,
  formatCalendarDate,
  linkButtonClass,
  SectionCard,
  SectionSkeleton,
  textLinkClass,
} from "@/features/lifecycle/components/self-service-ui";
import {
  staffDashboardService,
  UPCOMING_INTERVIEW_DAYS,
  type StaffInterviewItem,
  type TeamMemberToday,
} from "../services/staff-dashboard-service";
import type { StaffModule, StaffModuleKey } from "../workspace";

/*
 * Async sections of the role-specific staff overviews. Each loads its own data, hides
 * itself when the viewer may not use it, and degrades to a friendly notice when its query
 * fails, so one slow or failing section never blocks the rest of the page.
 */

type SectionLoad<T> = { status: "ok"; data: T } | { status: "hidden" } | { status: "failed" };

async function loadSection<T>(label: string, load: () => Promise<T>): Promise<SectionLoad<T>> {
  try {
    return { status: "ok", data: await load() };
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return { status: "hidden" };
    }
    logger.error(`Staff overview section failed: ${label}`, error);
    return { status: "failed" };
  }
}

function SectionFailed({ id, title, icon }: { id: string; title: string; icon: React.ReactNode }) {
  return (
    <SectionCard id={id} title={title} icon={icon}>
      <p role="alert" className="flex items-start gap-2 text-xs text-muted-foreground">
        <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" aria-hidden="true" />
        This section could not be loaded right now. Refresh the page to try again.
      </p>
    </SectionCard>
  );
}

export function StaffSectionSkeleton({ label, rows = 3 }: { label: string; rows?: number }) {
  return (
    <SectionSkeleton label={label}>
      <ListCardSkeleton rows={rows} />
    </SectionSkeleton>
  );
}

function CountBadge({ count }: { count: number }) {
  return (
    <span className="rounded-full border border-border bg-background px-2.5 py-0.5 text-xs font-semibold text-foreground">
      {count}
    </span>
  );
}

function MoreLink({ href, shown, total, noun }: { href: string; shown: number; total: number; noun: string }) {
  if (total <= shown) {
    return null;
  }
  return (
    <p className="mt-3 text-xs text-muted-foreground">
      Showing {shown} of {total} {noun}.{" "}
      <Link href={href} className={textLinkClass}>
        View all
      </Link>
    </p>
  );
}

// ─── Time formatting (business time zone) ───────────────────────────────────

function formatBusinessTime(iso: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: BUSINESS_TIME_ZONE,
  }).format(new Date(iso));
}

function formatBusinessDay(iso: string, todayKey: string): string {
  const key = businessDateKey(new Date(iso));
  if (key === todayKey) return "Today";
  if (key === addDaysToKey(todayKey, 1)) return "Tomorrow";
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: BUSINESS_TIME_ZONE,
  }).format(new Date(iso));
}

// ─── Interviews ─────────────────────────────────────────────────────────────

function InterviewList({
  items,
  base,
  now,
  showInterviewer,
}: {
  items: StaffInterviewItem[];
  base: string;
  now: Date;
  showInterviewer: boolean;
}) {
  const todayKey = businessDateKey(now);
  return (
    <ul className="divide-y divide-border/60">
      {items.map((interview) => {
        const startsAt = new Date(interview.scheduledAt);
        const endsAt = new Date(startsAt.getTime() + interview.durationMinutes * 60_000);
        const isOver = endsAt.getTime() <= now.getTime();
        const isLive = !isOver && startsAt.getTime() <= now.getTime();
        const canJoin = Boolean(interview.meetingLink?.startsWith("https://")) && !isOver;
        return (
          <li key={interview.id} className="flex flex-col gap-3 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center">
            <div className="flex w-full shrink-0 items-baseline gap-2 sm:w-24 sm:flex-col sm:gap-0">
              <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                {formatBusinessDay(interview.scheduledAt, todayKey)}
              </span>
              <span className="text-sm font-bold tabular-nums text-foreground">{formatBusinessTime(interview.scheduledAt)}</span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-foreground">{interview.candidateName}</p>
              <p className="truncate text-xs text-muted-foreground">
                {interview.openingTitle} · Round {interview.roundNumber}: {interview.roundName} · {interview.durationMinutes} min
                {showInterviewer && ` · ${interview.interviewerName ?? "No interviewer assigned"}`}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {isLive && <Badge variant="success">In progress</Badge>}
              {isOver && !interview.hasFeedback && <Badge variant="warning">Feedback due</Badge>}
              {isOver && interview.hasFeedback && <Badge variant="outline">Feedback submitted</Badge>}
              {canJoin && interview.meetingLink && (
                <a
                  href={interview.meetingLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={linkButtonClass("primary")}
                  aria-label={`Join the meeting with ${interview.candidateName} (opens in a new tab)`}
                >
                  <Video className="h-3.5 w-3.5" aria-hidden="true" /> Join
                </a>
              )}
              <Link
                href={`${base}/applications/${interview.applicationId}`}
                className={linkButtonClass("outline")}
                aria-label={`Open the application of ${interview.candidateName}`}
              >
                Open
              </Link>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** Interviews the viewer runs: today and the next week. */
export async function MyInterviewsSection({ user, base }: { user: AuthenticatedUser; base: string }) {
  const now = new Date();
  const result = await loadSection("my interviews", () => staffDashboardService.getMyUpcomingInterviews(user, now));
  const id = "my-interviews";
  const title = "My interviews";
  const icon = <Calendar className="h-4 w-4" />;
  if (result.status === "hidden") return null;
  if (result.status === "failed") return <SectionFailed id={id} title={title} icon={icon} />;

  const { items, total } = result.data;
  return (
    <SectionCard
      id={id}
      title={title}
      icon={icon}
      description={`Today and the next ${UPCOMING_INTERVIEW_DAYS} days.`}
      action={<CountBadge count={total} />}
    >
      {items.length === 0 ? (
        <EmptyHint
          icon={<Calendar className="h-6 w-6" />}
          title="No interviews planned for you"
          description="Interviews assigned to you appear here with their time and meeting link."
        />
      ) : (
        <>
          <InterviewList items={items} base={base} now={now} showInterviewer={false} />
          <MoreLink href={`${base}/interviews`} shown={items.length} total={total} noun="interviews" />
        </>
      )}
    </SectionCard>
  );
}

/** Every interview today, for HR. */
export async function TodayInterviewsSection({ user, base }: { user: AuthenticatedUser; base: string }) {
  const now = new Date();
  const result = await loadSection("today's interviews", () => staffDashboardService.getTodaysInterviewSchedule(user, now));
  const id = "todays-interviews";
  const title = "Today's interviews";
  const icon = <Calendar className="h-4 w-4" />;
  if (result.status === "hidden") return null;
  if (result.status === "failed") return <SectionFailed id={id} title={title} icon={icon} />;

  const { items, total } = result.data;
  return (
    <SectionCard
      id={id}
      title={title}
      icon={icon}
      action={
        <Link href={`${base}/interviews`} className={linkButtonClass("ghost")}>
          All interviews <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      }
    >
      {items.length === 0 ? (
        <EmptyHint icon={<Calendar className="h-6 w-6" />} title="No interviews today" />
      ) : (
        <>
          <InterviewList items={items} base={base} now={now} showInterviewer />
          <MoreLink href={`${base}/interviews`} shown={items.length} total={total} noun="interviews" />
        </>
      )}
    </SectionCard>
  );
}

// ─── Hiring pipeline ────────────────────────────────────────────────────────

export async function PipelineSection({ user, base }: { user: AuthenticatedUser; base: string }) {
  const result = await loadSection("pipeline", () => staffDashboardService.getPipelineSnapshot(user));
  const id = "hiring-pipeline";
  const title = "Hiring pipeline";
  const icon = <FileText className="h-4 w-4" />;
  if (result.status === "hidden") return null;
  if (result.status === "failed") return <SectionFailed id={id} title={title} icon={icon} />;

  const { stages, total } = result.data;
  return (
    <SectionCard
      id={id}
      title={title}
      icon={icon}
      description={`${total} active ${total === 1 ? "application" : "applications"} by stage.`}
      action={
        <Link href={`${base}/applications`} className={linkButtonClass("ghost")}>
          Open queue <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      }
    >
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {stages.map((stage) => (
          <li key={stage.status}>
            <Link
              href={`${base}/applications?status=${stage.status}`}
              className="flex h-full flex-col rounded-xl border border-border/60 bg-muted/30 p-3 transition-colors hover:border-primary/50 hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="text-lg font-bold tabular-nums text-foreground">{stage.count}</span>
              <span className="text-[11px] leading-tight text-muted-foreground">{stage.label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}

// ─── Evaluations ────────────────────────────────────────────────────────────

export async function EvaluationCohortSection({ user, base }: { user: AuthenticatedUser; base: string }) {
  const result = await loadSection("evaluation cohort", () => staffDashboardService.getEvaluationCohort(user));
  const id = "evaluation-cohort";
  const title = "Internship evaluations";
  const icon = <Award className="h-4 w-4" />;
  if (result.status === "hidden") return null;
  if (result.status === "failed") return <SectionFailed id={id} title={title} icon={icon} />;

  const counts = result.data;
  const tiles: Array<[string, number]> = [
    ["Waiting to start", counts.waitingToStart],
    ["In progress", counts.inProgress],
    ["Under review", counts.underReview],
  ];
  return (
    <SectionCard
      id={id}
      title={title}
      icon={icon}
      action={
        <Link href={`${base}/evaluations`} className={linkButtonClass("ghost")}>
          Open evaluations <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      }
    >
      <dl className="grid grid-cols-3 gap-2">
        {tiles.map(([label, value]) => (
          <div key={label} className="rounded-xl border border-border/60 bg-muted/30 p-3">
            <dt className="text-[11px] leading-tight text-muted-foreground">{label}</dt>
            <dd className="mt-0.5 text-lg font-bold tabular-nums text-foreground">{value}</dd>
          </div>
        ))}
      </dl>
    </SectionCard>
  );
}

function PendingChip({ count, singular, plural }: { count: number; singular: string; plural: string }) {
  if (count === 0) return null;
  return <Badge variant="warning">{`${count} ${count === 1 ? singular : plural}`}</Badge>;
}

/**
 * Interns the viewer supervises. Mentors always see it; other roles only when they
 * supervise someone (`hideWhenEmpty`).
 */
export async function SupervisedInternsSection({
  user,
  base,
  hideWhenEmpty,
}: {
  user: AuthenticatedUser;
  base: string;
  hideWhenEmpty: boolean;
}) {
  const result = await loadSection("supervised interns", () => staffDashboardService.getMySupervisedInterns(user));
  const id = "my-interns";
  const title = "Interns I supervise";
  const icon = <GraduationCap className="h-4 w-4" />;
  if (result.status === "hidden") return null;
  if (result.status === "failed") return <SectionFailed id={id} title={title} icon={icon} />;

  const { items, total } = result.data;
  if (items.length === 0 && hideWhenEmpty) return null;

  return (
    <SectionCard
      id={id}
      title={title}
      icon={icon}
      description="Open 7-working-day evaluations assigned to you."
      action={<CountBadge count={total} />}
    >
      {items.length === 0 ? (
        <EmptyHint
          icon={<GraduationCap className="h-6 w-6" />}
          title="No interns assigned to you"
          description="When HR selects you as the supervisor of an evaluation, the intern appears here."
        />
      ) : (
        <>
          <ul className="divide-y divide-border/60">
            {items.map((intern) => (
              <li key={intern.enrollmentId} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-semibold text-foreground">{intern.internName}</p>
                    <Badge variant="outline">{EVALUATION_STATUS_LABELS[intern.status]}</Badge>
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    {intern.openingTitle}
                    {intern.startDate ? ` · Started ${formatCalendarDate(intern.startDate)}` : " · Start date not set"}
                    {intern.checkpointsTotal > 0 &&
                      ` · ${intern.checkpointsReviewed} of ${intern.checkpointsTotal} checkpoints reviewed`}
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    <PendingChip count={intern.checkpointsToReview} singular="checkpoint to review" plural="checkpoints to review" />
                    <PendingChip count={intern.tasksToReview} singular="task to review" plural="tasks to review" />
                    <PendingChip count={intern.reportsToReview} singular="progress report" plural="progress reports" />
                  </div>
                </div>
                <Link
                  href={`${base}/evaluations/${intern.enrollmentId}`}
                  className={linkButtonClass("outline")}
                  aria-label={`Open the evaluation of ${intern.internName}`}
                >
                  Open <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
          <MoreLink href={`${base}/evaluations`} shown={items.length} total={total} noun="interns" />
        </>
      )}
    </SectionCard>
  );
}

// ─── People ─────────────────────────────────────────────────────────────────

export async function AwayTodaySection({ user, base }: { user: AuthenticatedUser; base: string }) {
  const result = await loadSection("away today", () => staffDashboardService.getAwayToday(user));
  const id = "away-today";
  const title = "On leave today";
  const icon = <CalendarOff className="h-4 w-4" />;
  if (result.status === "hidden") return null;
  if (result.status === "failed") return <SectionFailed id={id} title={title} icon={icon} />;

  const { items, total } = result.data;
  return (
    <SectionCard id={id} title={title} icon={icon} action={<CountBadge count={total} />}>
      {items.length === 0 ? (
        <EmptyHint title="No approved leave today" />
      ) : (
        <>
          <ul className="divide-y divide-border/60">
            {items.map((item) => (
              <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{item.employeeName}</p>
                  <p className="truncate text-[11px] text-muted-foreground">{item.designation}</p>
                </div>
                <p className="text-right text-[11px] text-muted-foreground">
                  {item.leaveType}
                  <br />
                  until {formatCalendarDate(item.endDate)}
                </p>
              </li>
            ))}
          </ul>
          <MoreLink href={`${base}/leave`} shown={items.length} total={total} noun="people" />
        </>
      )}
    </SectionCard>
  );
}

function TeamTodayLabel({ today }: { today: TeamMemberToday }) {
  switch (today.kind) {
    case "ON_LEAVE":
      return <Badge variant="secondary">{`On leave · ${today.leaveType}`}</Badge>;
    case "CHECKED_IN":
      return <Badge variant="success">{`In since ${formatBusinessTime(today.at)}`}</Badge>;
    case "CHECKED_OUT":
      return <Badge variant="outline">{`Checked out ${formatBusinessTime(today.at)}`}</Badge>;
    case "MARKED":
      return <Badge variant="outline">{today.status.replace(/_/g, " ").toLowerCase()}</Badge>;
    case "NOT_CHECKED_IN":
      return <span className="text-[11px] text-muted-foreground">Not checked in yet</span>;
  }
}

/** The viewer's direct reports and where they are today. */
export async function MyTeamSection({ user }: { user: AuthenticatedUser }) {
  const result = await loadSection("my team", () => staffDashboardService.getMyTeam(user));
  const id = "my-team";
  const title = "My team today";
  const icon = <Users className="h-4 w-4" />;
  if (result.status === "hidden") return null;
  if (result.status === "failed") return <SectionFailed id={id} title={title} icon={icon} />;

  const { hasEmployeeRecord, members, total } = result.data;
  return (
    <SectionCard
      id={id}
      title={title}
      icon={icon}
      description="People who report to you on their employee record."
      action={<CountBadge count={total} />}
    >
      {!hasEmployeeRecord ? (
        <EmptyHint
          icon={<Users className="h-6 w-6" />}
          title="Your account has no employee record"
          description="Reporting lines are set on employee records. Ask HR to link your account to your employee record."
        />
      ) : members.length === 0 ? (
        <EmptyHint
          icon={<Users className="h-6 w-6" />}
          title="No one reports to you yet"
          description="HR sets the reporting manager on each employee record."
        />
      ) : (
        <>
          <ul className="divide-y divide-border/60">
            {members.map((member) => (
              <li key={member.employeeId} className="flex flex-wrap items-center justify-between gap-2 py-2.5 first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{member.name}</p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {member.designation} · {member.department} · {EMPLOYEE_STATUS_LABELS[member.status]}
                  </p>
                </div>
                {member.today && <TeamTodayLabel today={member.today} />}
              </li>
            ))}
          </ul>
          {total > members.length && (
            <p className="mt-3 text-xs text-muted-foreground">
              Showing {members.length} of {total} direct reports.
            </p>
          )}
        </>
      )}
    </SectionCard>
  );
}

// ─── The viewer's own workday ───────────────────────────────────────────────

/** Own check-in and leave for staff who also have an employee record; hidden otherwise. */
export async function MyWorkdaySection({ user }: { user: AuthenticatedUser }) {
  const result = await loadSection("my workday", () => staffDashboardService.hasActiveEmployeeRecord(user.id));
  if (result.status !== "ok" || !result.data) return null;

  return (
    <>
      <TodayAttendanceSection userId={user.id} canRecord />
      <LeaveSummarySection userId={user.id} />
    </>
  );
}

// ─── Module shortcuts ───────────────────────────────────────────────────────

const MODULE_ICONS: Record<StaffModuleKey, LucideIcon> = {
  applications: FileText,
  openings: Briefcase,
  interviews: Calendar,
  evaluations: Award,
  employees: UserCheck,
  internReviews: CheckCircle2,
  attendance: Clock,
  leave: CalendarDays,
  payroll: CreditCard,
  reports: BarChart3,
};

export function WorkspaceModulesSection({ modules, base }: { modules: StaffModule[]; base: string }) {
  if (modules.length === 0) {
    return (
      <SectionCard id="quick-links" title="Your modules">
        <EmptyHint
          title="No modules assigned yet"
          description="An administrator grants module access in the Sub-Admins panel."
        />
      </SectionCard>
    );
  }
  const links: QuickLink[] = modules.map((module) => ({
    href: `${base}${module.path}`,
    label: module.label,
    description: module.description,
    icon: MODULE_ICONS[module.key],
  }));
  return <QuickLinksSection links={links} title="Your modules" />;
}
