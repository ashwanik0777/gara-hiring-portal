import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CERTIFICATE_SIGNATORIES } from "@/config/site";
import { toLocalDateTimeInput } from "../../form-values";
import { formatBatchDay, formatBatchDayTime } from "../batch-dates";
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

const PROJECT_LABELS: Record<string, string> = {
  SUBMITTED: "Submitted",
  CHANGES_REQUESTED: "Changes requested",
  PASSED: "Passed",
  FAILED: "Failed",
};

function percent(value: number | null): string {
  return value === null ? "—" : `${value}%`;
}

function ExternalLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer nofollow" className="font-medium text-primary hover:underline underline-offset-4 break-all">
      {children}
    </a>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
  );
}

function Students({ workspace, now }: { workspace: Workspace; now: Date }) {
  if (workspace.roster.length === 0) return <Section title="Students">{<p className="text-sm text-muted-foreground">No student has enrolled yet.</p>}</Section>;
  return (
    <Section title={`Students (${workspace.roster.length})`}>
      <p className="text-xs text-muted-foreground">
        Pass needs at least {workspace.roster[0].progress.criteria.minMarksPercent}% marks, {workspace.roster[0].progress.criteria.minAttendancePercent}%
        attendance, a passed final project and a passed live demo. A fail can be recorded once the batch has ended.
      </p>
      <ul className="divide-y divide-border/60">
        {workspace.roster.map((student) => {
          const badge = STATUS_BADGE[student.status] ?? { label: student.status, variant: "outline" as const };
          const { progress } = student;
          const learning = student.status === "ACTIVE";
          return (
            <li key={student.id} className="grid grid-cols-1 gap-3 py-4 lg:grid-cols-12">
              <div className="space-y-1 lg:col-span-5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{student.user.name}</span>
                  <Badge variant={badge.variant}>{badge.label}</Badge>
                  {student.reattemptOfId && <Badge variant="secondary">Re-attempt</Badge>}
                </div>
                <p className="text-xs text-muted-foreground">{student.user.email}</p>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4">
                  <div>
                    <dt className="text-muted-foreground">Marks</dt>
                    <dd className={progress.marks.met ? "text-foreground" : "text-destructive"}>
                      {percent(progress.marks.percent)} ({progress.marks.obtained}/{progress.marks.max})
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Attendance</dt>
                    <dd className={progress.attendance.met ? "text-foreground" : "text-destructive"}>
                      {percent(progress.attendance.percent)} ({progress.attendance.present}/{progress.attendance.counted})
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Project</dt>
                    <dd>{progress.project.status ? PROJECT_LABELS[progress.project.status] : "Not submitted"}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Demo</dt>
                    <dd>{progress.demo.passed ? "Passed" : "Not passed yet"}</dd>
                  </div>
                </dl>
              </div>
              <div className="lg:col-span-7">
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
                  <div className="space-y-1 text-xs text-muted-foreground">
                    {student.resultAt && <p>Result recorded {formatBatchDayTime(student.resultAt)}.</p>}
                    {student.resultNote && <p>Note: {student.resultNote}</p>}
                    {student.certificate && (
                      <p>
                        Certificate {student.certificate.verificationCode} ({student.certificate.status.toLowerCase()}) ·{" "}
                        <a href={`/api/certificates/${student.certificate.id}/download`} className="font-medium text-primary hover:underline">
                          Download
                        </a>
                      </p>
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
      <Section title="Add a class">
        <SessionForm batchId={workspace.id} />
      </Section>
      <Section title={`Classes (${workspace.sessions.length})`}>
        {workspace.sessions.length === 0 ? (
          <p className="text-sm text-muted-foreground">No class has been scheduled yet.</p>
        ) : (
          <ul className="divide-y divide-border/60">
            {workspace.sessions.map((session) => {
              const started = session.startsAt.getTime() <= now.getTime();
              const cancelled = session.status === "CANCELLED";
              return (
                <li key={session.id} className="space-y-3 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-medium">
                        {session.title} {cancelled && <Badge variant="outline">Cancelled</Badge>}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatBatchDayTime(session.startsAt)} · {session.durationMinutes} min
                        {session.attendanceTakenAt ? ` · attendance taken ${formatBatchDayTime(session.attendanceTakenAt)}` : started && !cancelled ? " · attendance not taken" : ""}
                      </p>
                      <p className="text-xs">
                        {session.meetingUrl && <ExternalLink href={session.meetingUrl}>Meeting link</ExternalLink>}
                        {session.recordingUrl && (
                          <>
                            {" · "}
                            <ExternalLink href={session.recordingUrl}>Recording</ExternalLink>
                          </>
                        )}
                      </p>
                    </div>
                    {!cancelled && !session.attendanceTakenAt && <CancelSessionButton sessionId={session.id} />}
                  </div>
                  {started && !cancelled && (
                    <AttendanceSheet
                      sessionId={session.id}
                      students={learners.map((student) => ({
                        enrollmentId: student.id,
                        name: student.user.name,
                        present: student.attendance.find((row) => row.sessionId === session.id)?.present ?? null,
                      }))}
                    />
                  )}
                  {!cancelled && (
                    <details>
                      <summary className="cursor-pointer text-xs font-medium text-primary">Edit class</summary>
                      <div className="mt-2">
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
      <Section title="Add an assignment">
        <AssignmentForm batchId={workspace.id} />
      </Section>
      {workspace.assignments.length === 0 ? (
        <Section title="Assignments">
          <p className="text-sm text-muted-foreground">No assignment yet.</p>
        </Section>
      ) : (
        workspace.assignments.map((assignment) => {
          const closed = assignment.dueAt.getTime() < now.getTime();
          return (
            <Section key={assignment.id} title={`${assignment.title} · ${assignment.maxMarks} marks`}>
              <p className="text-xs text-muted-foreground">
                Due {formatBatchDayTime(assignment.dueAt)} {closed ? "(closed)" : "(open)"} · {assignment.submissions.length} of {learnerCount} submitted
              </p>
              <p className="whitespace-pre-line text-sm text-muted-foreground">{assignment.description}</p>
              {assignment.submissions.length > 0 && (
                <ul className="divide-y divide-border/60">
                  {assignment.submissions.map((submission) => (
                    <li key={submission.id} className="space-y-2 py-3">
                      <p className="text-sm">
                        <span className="font-medium">{submission.enrollment.user.name}</span>{" "}
                        <span className="text-xs text-muted-foreground">submitted {formatBatchDayTime(submission.submittedAt)}</span>
                      </p>
                      <p className="text-xs">
                        {submission.repoUrl && <ExternalLink href={submission.repoUrl}>Repository</ExternalLink>}
                        {submission.repoUrl && submission.linkUrl && " · "}
                        {submission.linkUrl && <ExternalLink href={submission.linkUrl}>Link</ExternalLink>}
                      </p>
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
                <summary className="cursor-pointer text-xs font-medium text-primary">Edit assignment</summary>
                <div className="mt-2 space-y-2">
                  <AssignmentForm
                    batchId={workspace.id}
                    assignmentId={assignment.id}
                    initial={{ title: assignment.title, description: assignment.description, dueAt: toLocalDateTimeInput(assignment.dueAt), maxMarks: assignment.maxMarks }}
                  />
                  {assignment.submissions.length === 0 && <DeleteAssignmentButton assignmentId={assignment.id} />}
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
    <Section title={`Final projects (${withProject.length} of ${workspace.roster.length})`}>
      {withProject.length === 0 ? (
        <p className="text-sm text-muted-foreground">No project has been submitted yet.</p>
      ) : (
        <ul className="divide-y divide-border/60">
          {withProject.map((student) => {
            const project = student.finalProject!;
            return (
              <li key={student.id} className="space-y-2 py-4">
                <p className="text-sm">
                  <span className="font-medium">{student.user.name}</span> · {project.title}{" "}
                  <Badge variant={project.status === "PASSED" ? "success" : project.status === "FAILED" ? "destructive" : "outline"}>{PROJECT_LABELS[project.status]}</Badge>
                </p>
                <p className="text-xs">
                  <ExternalLink href={project.repoUrl}>Repository</ExternalLink>
                  {project.liveUrl && (
                    <>
                      {" · "}
                      <ExternalLink href={project.liveUrl}>Live</ExternalLink>
                    </>
                  )}
                  <span className="text-muted-foreground"> · submitted {formatBatchDayTime(project.submittedAt)}</span>
                </p>
                {project.description && <p className="whitespace-pre-line text-xs text-muted-foreground">{project.description}</p>}
                {LEARNING_STATUSES.includes(student.status) ? (
                  <ProjectReviewForm projectId={project.id} status={project.status} marks={project.marks} feedback={project.feedback} />
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
  return (
    <>
      <Section title="Open demo slots">
        <DemoSlotForm batchId={workspace.id} />
      </Section>
      <Section title={`Demo slots (${workspace.demoSlots.length})`}>
        {workspace.demoSlots.length === 0 ? (
          <p className="text-sm text-muted-foreground">No demo slot yet.</p>
        ) : (
          <ul className="divide-y divide-border/60">
            {workspace.demoSlots.map((slot) => {
              const started = slot.startsAt.getTime() <= now.getTime();
              return (
                <li key={slot.id} className="grid grid-cols-1 gap-2 py-3 md:grid-cols-12">
                  <div className="md:col-span-6 text-sm">
                    <p className="font-medium">
                      {formatBatchDayTime(slot.startsAt)} · {slot.durationMinutes} min
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Mentor {slot.mentor.name} · {slot.bookedEnrollment ? `booked by ${slot.bookedEnrollment.user.name}` : "free"}
                      {slot.result ? ` · ${slot.result === "PASSED" ? "passed" : "not passed"}` : ""}
                    </p>
                    {slot.resultNote && <p className="text-xs text-muted-foreground">Note: {slot.resultNote}</p>}
                  </div>
                  <div className="md:col-span-6">
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
  return (
    <div className="w-full space-y-6">
      <div className="space-y-1">
        <h2 className="text-2xl font-bold tracking-tight">
          {workspace.program.title} · {workspace.name}
        </h2>
        <p className="text-sm text-muted-foreground">
          Starts {formatBatchDay(workspace.startDate)}
          {workspace.endDate ? ` · ends ${formatBatchDay(workspace.endDate)}` : ""} · status {workspace.status.toLowerCase()} · mentors:{" "}
          {workspace.mentors.length > 0 ? workspace.mentors.map((mentor) => mentor.user.name).join(", ") : "none"}
        </p>
      </div>
      <nav aria-label="Batch sections" className="flex flex-wrap gap-2">
        {tabs.map((item) => (
          <Link
            key={item.key}
            href={`${basePath}?tab=${item.key}`}
            aria-current={item.key === tab ? "page" : undefined}
            className={`rounded-md border px-3 py-1.5 text-sm font-medium transition-colors ${
              item.key === tab ? "border-primary bg-primary text-primary-foreground" : "border-border text-foreground hover:bg-muted"
            }`}
          >
            {item.label}
          </Link>
        ))}
      </nav>
      {tab === "students" && <Students workspace={workspace} now={now} />}
      {tab === "classes" && <Classes workspace={workspace} now={now} />}
      {tab === "assignments" && <Assignments workspace={workspace} now={now} />}
      {tab === "projects" && <Projects workspace={workspace} />}
      {tab === "demos" && <Demos workspace={workspace} now={now} />}
      {tab === "mentors" && isAdmin && (
        <Section title="Mentors">
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
