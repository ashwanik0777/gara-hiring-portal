import Link from "next/link";
import {
  Award,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Clock,
  ExternalLink as ExternalLinkIcon,
  FolderGit2,
  Plus,
  Presentation,
  UserCog,
  Users,
  Video,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { StatCard, StatGrid } from "@/components/ui/stat-card";
import { cn } from "@/lib/utils";
import { CERTIFICATE_SIGNATORIES } from "@/config/site";
import { toLocalDateTimeInput } from "../../form-values";
import { batchDateParts, formatBatchDay, formatBatchDayTime } from "../batch-dates";
import { resultBlockers } from "../../progress";
import { LEARNING_STATUSES, type BatchWorkspace as Workspace } from "../../services/batch-staff-service";
import {
  AssignmentForm,
  AttendanceSheet,
  CancelSessionButton,
  DeleteAssignmentButton,
  DeleteDemoSlotButton,
  DemoResultForm,
  DemoSlotForm,
  GradeForm,
  MentorManager,
  ProjectReviewForm,
  ResultDecisionForm,
  SessionForm,
} from "./staff-forms";

export const WORKSPACE_TABS = [
  { key: "students", label: "Students & results" },
  { key: "classes", label: "Classes & attendance" },
  { key: "assignments", label: "Assignments" },
  { key: "projects", label: "Final projects" },
  { key: "demos", label: "Live demos" },
  { key: "mentors", label: "Mentors" },
] as const;

export type WorkspaceTab = (typeof WORKSPACE_TABS)[number]["key"];

const TAB_ICONS: Record<WorkspaceTab, LucideIcon> = {
  students: Users,
  classes: CalendarDays,
  assignments: ClipboardList,
  projects: FolderGit2,
  demos: Presentation,
  mentors: UserCog,
};

export function parseWorkspaceTab(value: string | string[] | undefined): WorkspaceTab {
  const tab = Array.isArray(value) ? value[0] : value;
  return WORKSPACE_TABS.some((item) => item.key === tab) ? (tab as WorkspaceTab) : "students";
}

const STATUS_BADGE: Record<string, { label: string; variant: "success" | "warning" | "destructive" | "outline" | "secondary" }> = {
  ACTIVE: { label: "Learning", variant: "outline" },
  REFUND_REQUESTED: { label: "Refund requested", variant: "warning" },
  COMPLETED: { label: "Passed", variant: "success" },
  FAILED: { label: "Not passed", variant: "destructive" },
};

const BATCH_STATUS: Record<string, { label: string; variant: "default" | "success" | "secondary" | "destructive" }> = {
  UPCOMING: { label: "Upcoming", variant: "default" },
  RUNNING: { label: "Running", variant: "success" },
  COMPLETED: { label: "Completed", variant: "secondary" },
  CANCELLED: { label: "Cancelled", variant: "destructive" },
};

const PROJECT_LABELS: Record<string, string> = {
  SUBMITTED: "Submitted",
  CHANGES_REQUESTED: "Changes requested",
  PASSED: "Passed",
  FAILED: "Failed",
};

const linkButton =
  "inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 text-xs font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase() || "?";
}

function ExternalLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer nofollow" className={linkButton}>
      <ExternalLinkIcon className="h-3.5 w-3.5" aria-hidden="true" />
      {children}
    </a>
  );
}

/** Small status pill (green when done, amber when waiting, neutral otherwise). */
function Pill({ tone, children }: { tone: "done" | "waiting" | "neutral" | "bad"; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
        tone === "done" && "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
        tone === "waiting" && "bg-amber-500/10 text-amber-700 dark:text-amber-300",
        tone === "bad" && "bg-destructive/10 text-destructive",
        tone === "neutral" && "bg-muted text-muted-foreground"
      )}
    >
      {children}
    </span>
  );
}

/** A titled card; the count chip sits next to the title. */
function Section({ title, icon: Icon, count, children }: { title: string; icon: LucideIcon; count?: string | number; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-card shadow-sm" aria-label={title}>
      <header className="flex items-center gap-2 border-b border-border/60 px-5 py-4 sm:px-6">
        <Icon className="h-4 w-4 text-primary" aria-hidden="true" />
        <h3 className="text-base font-semibold text-foreground">{title}</h3>
        {count !== undefined && (
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold tabular-nums text-muted-foreground">{count}</span>
        )}
      </header>
      <div className="space-y-3 p-5 sm:p-6">{children}</div>
    </section>
  );
}

/** A collapsed "add" panel (native disclosure, keyboard friendly). */
function AddPanel({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <details className="group rounded-2xl border border-dashed border-border bg-card open:border-solid open:shadow-sm">
      <summary className="flex cursor-pointer list-none items-center gap-2 rounded-2xl px-5 py-4 text-sm font-semibold text-primary transition-colors hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/15 sm:px-6 [&::-webkit-details-marker]:hidden">
        <Plus className="h-4 w-4 transition-transform group-open:rotate-45" aria-hidden="true" />
        {label}
      </summary>
      <div className="px-5 pb-5 sm:px-6 sm:pb-6">{children}</div>
    </details>
  );
}

/** A "Day Month" block for a dated row. */
function DateBlock({ date }: { date: Date }) {
  const parts = batchDateParts(date);
  return (
    <div aria-hidden="true" className="flex w-14 shrink-0 flex-col items-center justify-center rounded-xl border border-border bg-muted/40 py-1.5">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{parts.month}</span>
      <span className="text-lg font-bold leading-tight text-foreground">{parts.day}</span>
      <span className="text-[10px] text-muted-foreground">{parts.weekday}</span>
    </div>
  );
}

function Meter({ label, value, met, detail }: { label: string; value: number | null; met: boolean; detail: string }) {
  const width = value === null ? 0 : Math.max(0, Math.min(100, value));
  return (
    <div className="space-y-1.5 rounded-xl border border-border/70 bg-muted/20 p-3">
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className={cn("font-semibold tabular-nums", met ? "text-foreground" : "text-destructive")}>{value === null ? "—" : `${value}%`}</span>
      </div>
      <div role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={value ?? 0} className="h-1.5 overflow-hidden rounded-full bg-muted-foreground/15">
        <div className={cn("h-full rounded-full", met ? "bg-emerald-500" : "bg-amber-500")} style={{ width: `${width}%` }} />
      </div>
      <p className="text-[11px] tabular-nums text-muted-foreground">{detail}</p>
    </div>
  );
}

function Students({ workspace, now }: { workspace: Workspace; now: Date }) {
  if (workspace.roster.length === 0) {
    return (
      <Section title="Students" icon={Users} count={0}>
        <p className="text-sm text-muted-foreground">No student has enrolled yet.</p>
      </Section>
    );
  }
  const criteria = workspace.roster[0].progress.criteria;
  return (
    <Section title="Students" icon={Users} count={workspace.roster.length}>
      <ul aria-label="Pass criteria" className="flex flex-wrap gap-2">
        {[`Marks ≥ ${criteria.minMarksPercent}%`, `Attendance ≥ ${criteria.minAttendancePercent}%`, "Final project passed", "Live demo passed"].map((item) => (
          <li key={item} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-1 text-xs text-muted-foreground">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
            {item}
          </li>
        ))}
      </ul>
      <ul className="grid grid-cols-1 gap-3" aria-label="Students">
        {workspace.roster.map((student) => {
          const badge = STATUS_BADGE[student.status] ?? { label: student.status, variant: "outline" as const };
          const { progress } = student;
          const learning = student.status === "ACTIVE";
          return (
            <li key={student.id} className="space-y-4 rounded-xl border border-border bg-background p-4">
              <div className="flex flex-wrap items-center gap-3">
                <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                  {initials(student.user.name)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-foreground">
                    {student.user.name}
                    <Badge variant={badge.variant} className="text-[10px]">
                      {badge.label}
                    </Badge>
                    {student.reattemptOfId && (
                      <Badge variant="secondary" className="text-[10px]">
                        Re-attempt
                      </Badge>
                    )}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">{student.user.email}</p>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
                <Meter
                  label="Marks"
                  value={progress.marks.percent}
                  met={progress.marks.met}
                  detail={`${progress.marks.obtained} of ${progress.marks.max} marks`}
                />
                <Meter
                  label="Attendance"
                  value={progress.attendance.percent}
                  met={progress.attendance.met}
                  detail={`${progress.attendance.present} of ${progress.attendance.counted} classes`}
                />
                <div className="space-y-1.5 rounded-xl border border-border/70 bg-muted/20 p-3 text-xs">
                  <span className="text-muted-foreground">Final project</span>
                  <div>
                    {progress.project.status ? (
                      <Pill tone={progress.project.status === "PASSED" ? "done" : progress.project.status === "FAILED" ? "bad" : "waiting"}>
                        {PROJECT_LABELS[progress.project.status]}
                      </Pill>
                    ) : (
                      <Pill tone="neutral">Not submitted</Pill>
                    )}
                  </div>
                </div>
                <div className="space-y-1.5 rounded-xl border border-border/70 bg-muted/20 p-3 text-xs">
                  <span className="text-muted-foreground">Live demo</span>
                  <div>{progress.demo.passed ? <Pill tone="done">Passed</Pill> : <Pill tone="neutral">Not passed yet</Pill>}</div>
                </div>
              </div>
              <div className="border-t border-border/60 pt-3">
                {learning ? (
                  <ResultDecisionForm
                    enrollmentId={student.id}
                    passBlockers={resultBlockers("PASS", progress, workspace, now)}
                    failBlockers={resultBlockers("FAIL", progress, workspace, now)}
                    signatories={CERTIFICATE_SIGNATORIES}
                  />
                ) : student.status === "REFUND_REQUESTED" ? (
                  <p className="text-xs text-muted-foreground">Decide the refund request first (Training Refunds).</p>
                ) : (
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
                    {student.resultAt && <span>Result recorded {formatBatchDayTime(student.resultAt)}</span>}
                    {student.resultNote && <span>Note: {student.resultNote}</span>}
                    {student.certificate && (
                      <span className="inline-flex flex-wrap items-center gap-2">
                        <Award className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                        Certificate {student.certificate.verificationCode} ({student.certificate.status.toLowerCase()})
                        <a href={`/api/certificates/${student.certificate.id}/download`} className="font-medium text-primary hover:underline">
                          Download
                        </a>
                      </span>
                    )}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}

function Classes({ workspace, now }: { workspace: Workspace; now: Date }) {
  const learners = workspace.roster.filter((student) => LEARNING_STATUSES.includes(student.status));
  return (
    <>
      <AddPanel label="Add a class">
        <SessionForm batchId={workspace.id} />
      </AddPanel>
      <Section title="Classes" icon={CalendarDays} count={workspace.sessions.length}>
        {workspace.sessions.length === 0 ? (
          <p className="text-sm text-muted-foreground">No class has been scheduled yet.</p>
        ) : (
          <ul className="grid grid-cols-1 gap-3" aria-label="Classes">
            {workspace.sessions.map((session) => {
              const started = session.startsAt.getTime() <= now.getTime();
              const cancelled = session.status === "CANCELLED";
              return (
                <li key={session.id} className={cn("space-y-4 rounded-xl border border-border bg-background p-4", cancelled && "opacity-70")}>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex min-w-0 gap-3">
                      <DateBlock date={session.startsAt} />
                      <div className="min-w-0 space-y-1.5">
                        <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-foreground">
                          {session.title}
                          {cancelled ? (
                            <Pill tone="bad">Cancelled</Pill>
                          ) : session.attendanceTakenAt ? (
                            <Pill tone="done">Attendance taken</Pill>
                          ) : started ? (
                            <Pill tone="waiting">Attendance pending</Pill>
                          ) : (
                            <Pill tone="neutral">Upcoming</Pill>
                          )}
                        </p>
                        <p className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                          {formatBatchDayTime(session.startsAt)} · {session.durationMinutes} min
                        </p>
                        {(session.meetingUrl || session.recordingUrl) && (
                          <div className="flex flex-wrap gap-2 pt-1">
                            {session.meetingUrl && <ExternalLink href={session.meetingUrl}>Meeting link</ExternalLink>}
                            {session.recordingUrl && (
                              <a href={session.recordingUrl} target="_blank" rel="noopener noreferrer nofollow" className={linkButton}>
                                <Video className="h-3.5 w-3.5" aria-hidden="true" />
                                Recording
                              </a>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                    {!cancelled && !session.attendanceTakenAt && <CancelSessionButton sessionId={session.id} />}
                  </div>
                  {started && !cancelled && (
                    <div className="rounded-xl border border-border/70 bg-muted/20 p-3">
                      <AttendanceSheet
                        sessionId={session.id}
                        students={learners.map((student) => ({
                          enrollmentId: student.id,
                          name: student.user.name,
                          present: student.attendance.find((row) => row.sessionId === session.id)?.present ?? null,
                        }))}
                      />
                    </div>
                  )}
                  {!cancelled && (
                    <details className="group">
                      <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 text-xs font-medium text-primary hover:underline [&::-webkit-details-marker]:hidden">
                        Edit class
                      </summary>
                      <div className="mt-3">
                        <SessionForm
                          batchId={workspace.id}
                          sessionId={session.id}
                          initial={{
                            title: session.title,
                            startsAt: toLocalDateTimeInput(session.startsAt),
                            durationMinutes: session.durationMinutes,
                            meetingUrl: session.meetingUrl ?? "",
                            recordingUrl: session.recordingUrl ?? "",
                          }}
                        />
                      </div>
                    </details>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Section>
    </>
  );
}

function Assignments({ workspace, now }: { workspace: Workspace; now: Date }) {
  const learnerCount = workspace.roster.filter((student) => LEARNING_STATUSES.includes(student.status)).length;
  return (
    <>
      <AddPanel label="Add an assignment">
        <AssignmentForm batchId={workspace.id} />
      </AddPanel>
      {workspace.assignments.length === 0 ? (
        <Section title="Assignments" icon={ClipboardList} count={0}>
          <p className="text-sm text-muted-foreground">No assignment yet.</p>
        </Section>
      ) : (
        workspace.assignments.map((assignment) => {
          const closed = assignment.dueAt.getTime() < now.getTime();
          const submitted = assignment.submissions.length;
          const percent = learnerCount > 0 ? Math.min(100, Math.round((submitted / learnerCount) * 100)) : 0;
          return (
            <Section key={assignment.id} title={assignment.title} icon={ClipboardList} count={`${assignment.maxMarks} marks`}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                  Due {formatBatchDayTime(assignment.dueAt)}
                  {closed ? <Pill tone="neutral">Closed</Pill> : <Pill tone="done">Open</Pill>}
                </p>
                <div className="w-full space-y-1 sm:w-48">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Submitted</span>
                    <span className="font-semibold tabular-nums text-foreground">
                      {submitted}/{learnerCount}
                    </span>
                  </div>
                  <div role="meter" aria-label="Submissions" aria-valuemin={0} aria-valuemax={learnerCount} aria-valuenow={submitted} className="h-1.5 overflow-hidden rounded-full bg-muted-foreground/15">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
                  </div>
                </div>
              </div>
              <p className="whitespace-pre-line rounded-xl border border-border/70 bg-muted/20 p-3 text-sm text-muted-foreground">{assignment.description}</p>
              {submitted > 0 && (
                <ul className="grid grid-cols-1 gap-3" aria-label="Submissions">
                  {assignment.submissions.map((submission) => (
                    <li key={submission.id} className="space-y-3 rounded-xl border border-border bg-background p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="flex items-center gap-2 text-sm">
                          <span aria-hidden="true" className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                            {initials(submission.enrollment.user.name)}
                          </span>
                          <span className="font-semibold text-foreground">{submission.enrollment.user.name}</span>
                          <span className="text-xs text-muted-foreground">submitted {formatBatchDayTime(submission.submittedAt)}</span>
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {submission.repoUrl && <ExternalLink href={submission.repoUrl}>Repository</ExternalLink>}
                          {submission.linkUrl && <ExternalLink href={submission.linkUrl}>Link</ExternalLink>}
                        </div>
                      </div>
                      {submission.notes && <p className="whitespace-pre-line text-xs text-muted-foreground">{submission.notes}</p>}
                      {LEARNING_STATUSES.includes(submission.enrollment.status) ? (
                        <GradeForm submissionId={submission.id} maxMarks={assignment.maxMarks} marks={submission.marks} feedback={submission.feedback} />
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          {submission.marks ?? "—"} / {assignment.maxMarks} (result recorded)
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              <details>
                <summary className="inline-flex cursor-pointer list-none items-center text-xs font-medium text-primary hover:underline [&::-webkit-details-marker]:hidden">
                  Edit assignment
                </summary>
                <div className="mt-3 space-y-2">
                  <AssignmentForm
                    batchId={workspace.id}
                    assignmentId={assignment.id}
                    initial={{ title: assignment.title, description: assignment.description, dueAt: toLocalDateTimeInput(assignment.dueAt), maxMarks: assignment.maxMarks }}
                  />
                  {submitted === 0 && <DeleteAssignmentButton assignmentId={assignment.id} />}
                </div>
              </details>
            </Section>
          );
        })
      )}
    </>
  );
}

function Projects({ workspace }: { workspace: Workspace }) {
  const withProject = workspace.roster.filter((student) => student.finalProject);
  return (
    <Section title="Final projects" icon={FolderGit2} count={`${withProject.length} of ${workspace.roster.length}`}>
      {withProject.length === 0 ? (
        <p className="text-sm text-muted-foreground">No project has been submitted yet.</p>
      ) : (
        <ul className="grid grid-cols-1 gap-3" aria-label="Final projects">
          {withProject.map((student) => {
            const project = student.finalProject!;
            return (
              <li key={student.id} className="space-y-3 rounded-xl border border-border bg-background p-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="space-y-1">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-foreground">
                      {project.title}
                      <Pill tone={project.status === "PASSED" ? "done" : project.status === "FAILED" ? "bad" : "waiting"}>{PROJECT_LABELS[project.status]}</Pill>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {student.user.name} · submitted {formatBatchDayTime(project.submittedAt)}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <ExternalLink href={project.repoUrl}>Repository</ExternalLink>
                    {project.liveUrl && <ExternalLink href={project.liveUrl}>Live</ExternalLink>}
                  </div>
                </div>
                {project.description && <p className="whitespace-pre-line text-xs text-muted-foreground">{project.description}</p>}
                {LEARNING_STATUSES.includes(student.status) ? (
                  <div className="border-t border-border/60 pt-3">
                    <ProjectReviewForm projectId={project.id} status={project.status} marks={project.marks} feedback={project.feedback} />
                  </div>
                ) : (
                  project.feedback && <p className="text-xs text-muted-foreground">Feedback: {project.feedback}</p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Section>
  );
}

function Demos({ workspace, now }: { workspace: Workspace; now: Date }) {
  const booked = workspace.demoSlots.filter((slot) => slot.bookedEnrollment).length;
  return (
    <>
      <AddPanel label="Open demo slots">
        <DemoSlotForm batchId={workspace.id} />
      </AddPanel>
      <Section title="Demo slots" icon={Presentation} count={`${booked} of ${workspace.demoSlots.length} booked`}>
        {workspace.demoSlots.length === 0 ? (
          <p className="text-sm text-muted-foreground">No demo slot yet.</p>
        ) : (
          <ul className="grid grid-cols-1 gap-3" aria-label="Demo slots">
            {workspace.demoSlots.map((slot) => {
              const started = slot.startsAt.getTime() <= now.getTime();
              return (
                <li key={slot.id} className="flex flex-col gap-3 rounded-xl border border-border bg-background p-4 md:flex-row md:items-center md:justify-between">
                  <div className="flex min-w-0 gap-3">
                    <DateBlock date={slot.startsAt} />
                    <div className="min-w-0 space-y-1.5">
                      <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-foreground">
                        {formatBatchDayTime(slot.startsAt)} · {slot.durationMinutes} min
                        {slot.result ? (
                          <Pill tone={slot.result === "PASSED" ? "done" : "bad"}>{slot.result === "PASSED" ? "Passed" : "Not passed"}</Pill>
                        ) : slot.bookedEnrollment ? (
                          <Pill tone="waiting">Booked</Pill>
                        ) : (
                          <Pill tone="neutral">Free</Pill>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Mentor {slot.mentor.name}
                        {slot.bookedEnrollment ? ` · ${slot.bookedEnrollment.user.name}` : ""}
                      </p>
                      {slot.resultNote && <p className="text-xs text-muted-foreground">Note: {slot.resultNote}</p>}
                    </div>
                  </div>
                  <div className="md:w-80">
                    {!slot.bookedEnrollment ? (
                      <DeleteDemoSlotButton slotId={slot.id} />
                    ) : !slot.result && started && LEARNING_STATUSES.includes(slot.bookedEnrollment.status) ? (
                      <DemoResultForm slotId={slot.id} />
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Section>
    </>
  );
}

/** The staff workspace of one batch (administrators and the batch's mentors). */
export function BatchWorkspaceView({
  workspace,
  tab,
  basePath,
  isAdmin,
  mentorCandidates,
  now,
}: {
  workspace: Workspace;
  tab: WorkspaceTab;
  basePath: string;
  isAdmin: boolean;
  mentorCandidates: Array<{ id: string; name: string; email: string }>;
  now: Date;
}) {
  const tabs = WORKSPACE_TABS.filter((item) => item.key !== "mentors" || isAdmin);
  const status = BATCH_STATUS[workspace.status] ?? { label: workspace.status, variant: "secondary" as const };
  const passed = workspace.roster.filter((student) => student.status === "COMPLETED").length;
  const classes = workspace.sessions.filter((session) => session.status !== "CANCELLED").length;
  const counts: Record<WorkspaceTab, number> = {
    students: workspace.roster.length,
    classes: workspace.sessions.length,
    assignments: workspace.assignments.length,
    projects: workspace.roster.filter((student) => student.finalProject).length,
    demos: workspace.demoSlots.length,
    mentors: workspace.mentors.length,
  };
  const tabHref = (key: WorkspaceTab) => `${basePath}?tab=${key}`;
  const programHref = basePath.startsWith("/admin/") ? `/admin/training/${workspace.program.id}` : null;

  return (
    <div className="w-full space-y-6">
      <Card className="rounded-2xl shadow-sm">
        <CardContent className="space-y-3 p-5 sm:p-6">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={status.variant}>{status.label}</Badge>
            {programHref ? (
              <Link href={programHref} className="rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                <Badge variant="outline" className="border-primary/30 text-primary hover:bg-primary/5">
                  {workspace.program.title}
                </Badge>
              </Link>
            ) : (
              <Badge variant="outline" className="border-primary/30 text-primary">
                {workspace.program.title}
              </Badge>
            )}
          </div>
          <h2 className="text-xl font-bold tracking-tight text-foreground wrap-break-word sm:text-2xl">{workspace.name}</h2>
          <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground" aria-label="Batch facts">
            <li className="inline-flex items-center gap-1.5">
              <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
              Starts {formatBatchDay(workspace.startDate)}
              {workspace.endDate ? ` · ends ${formatBatchDay(workspace.endDate)}` : ""}
            </li>
            {workspace.firstClassAt && (
              <li className="inline-flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                First class {formatBatchDayTime(workspace.firstClassAt)}
              </li>
            )}
            <li className="inline-flex items-center gap-1.5">
              <UserCog className="h-3.5 w-3.5" aria-hidden="true" />
              {workspace.mentors.length > 0 ? workspace.mentors.map((mentor) => mentor.user.name).join(", ") : "No mentor assigned"}
            </li>
          </ul>
        </CardContent>
      </Card>

      <StatGrid columns={4} label="Batch summary">
        <StatCard label="Students" value={workspace.roster.length} icon={Users} tone="blue" href={tabHref("students")} />
        <StatCard label="Classes" value={classes} icon={CalendarDays} tone="amber" href={tabHref("classes")} />
        <StatCard label="Assignments" value={workspace.assignments.length} icon={ClipboardList} tone="violet" href={tabHref("assignments")} />
        <StatCard label="Passed" value={passed} icon={Award} tone="emerald" href={tabHref("students")} />
      </StatGrid>

      <nav aria-label="Batch sections" className="-mx-1 overflow-x-auto px-1">
        <div className="inline-flex min-w-full gap-1 rounded-xl border border-border bg-muted/40 p-1 sm:min-w-0">
          {tabs.map((item) => {
            const Icon = TAB_ICONS[item.key];
            const active = item.key === tab;
            return (
              <Link
                key={item.key}
                href={tabHref(item.key)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                  active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:bg-background/60 hover:text-foreground"
                )}
              >
                <Icon className={cn("h-4 w-4", active ? "text-primary" : "")} aria-hidden="true" />
                {item.label}
                <span
                  className={cn(
                    "rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums",
                    active ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                  )}
                >
                  {counts[item.key]}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>

      {tab === "students" && <Students workspace={workspace} now={now} />}
      {tab === "classes" && <Classes workspace={workspace} now={now} />}
      {tab === "assignments" && <Assignments workspace={workspace} now={now} />}
      {tab === "projects" && <Projects workspace={workspace} />}
      {tab === "demos" && <Demos workspace={workspace} now={now} />}
      {tab === "mentors" && isAdmin && (
        <Section title="Mentors" icon={UserCog} count={workspace.mentors.length}>
          <MentorManager
            batchId={workspace.id}
            mentors={workspace.mentors.map((mentor) => ({ userId: mentor.userId, name: mentor.user.name, email: mentor.user.email }))}
            candidates={mentorCandidates}
          />
        </Section>
      )}
    </div>
  );
}
