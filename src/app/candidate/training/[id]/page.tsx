import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { z } from "zod";
import type { Metadata } from "next";
import { ArrowLeft, Award, Download } from "lucide-react";
import { requirePortalCapability } from "@/features/lifecycle/services/lifecycle-service";
import { linkButtonClass } from "@/features/lifecycle/components/self-service-ui";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { NotFoundError } from "@/lib/errors";
import { getLearningArea, type LearningArea } from "@/features/training/services/learning-service";
import { listTransferTargets } from "@/features/training/services/enrollment-service";
import { LEARNING_STATUSES } from "@/features/training/services/batch-staff-service";
import { formatBatchDay, formatBatchDayTime } from "@/features/training/components/batch-dates";
import { BookDemoButton, CancelDemoButton, ProjectForm, ReattemptForm, SubmissionForm } from "@/features/training/components/learning-forms";

export const instant = false;

export const metadata: Metadata = { title: "Learning Area", robots: { index: false, follow: false } };

function ExternalLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer nofollow" className="font-medium text-primary hover:underline underline-offset-4 break-all">
      {children}
    </a>
  );
}

function Meter({ label, value, target, met, detail }: { label: string; value: number | null; target: number; met: boolean; detail: string }) {
  const width = Math.max(0, Math.min(100, value ?? 0));
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className={met ? "text-success" : "text-muted-foreground"}>
          {value === null ? "—" : `${value}%`} <span className="text-xs text-muted-foreground">(need {target}%)</span>
        </span>
      </div>
      <div className="h-2 w-full rounded-full bg-muted" role="progressbar" aria-label={label} aria-valuenow={value ?? 0} aria-valuemin={0} aria-valuemax={100}>
        <div className={`h-2 rounded-full ${met ? "bg-success" : "bg-primary"}`} style={{ width: `${width}%` }} />
      </div>
      <p className="text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}

function Check({ label, met, detail }: { label: string; met: boolean; detail: string }) {
  return (
    <div className="flex items-start justify-between gap-2 text-sm">
      <div>
        <p className="font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{detail}</p>
      </div>
      <Badge variant={met ? "success" : "outline"}>{met ? "Done" : "Pending"}</Badge>
    </div>
  );
}

function Progress({ area }: { area: LearningArea }) {
  const { progress } = area;
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Progress against the pass criteria</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <Meter
          label="Marks"
          value={progress.marks.percent}
          target={progress.criteria.minMarksPercent}
          met={progress.marks.met}
          detail={`${progress.marks.obtained} of ${progress.marks.max} marks across all assignments${progress.marks.ungraded ? ` · ${progress.marks.ungraded} waiting for grading` : ""}. A missed assignment counts as 0.`}
        />
        <Meter
          label="Attendance"
          value={progress.attendance.percent}
          target={progress.criteria.minAttendancePercent}
          met={progress.attendance.met}
          detail={`${progress.attendance.present} of ${progress.attendance.counted} classes attended.`}
        />
        {progress.project.required && (
          <Check
            label="Final project"
            met={progress.project.met}
            detail={progress.project.status ? `Status: ${progress.project.status.replace("_", " ").toLowerCase()}` : "Not submitted yet"}
          />
        )}
        {progress.demo.required && <Check label="Live demo" met={progress.demo.met} detail={progress.demo.passed ? "Passed" : "Book a demo slot below"} />}
      </CardContent>
    </Card>
  );
}

export default async function LearningAreaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user } = await requirePortalCapability("training", { callbackPath: `/candidate/training/${id}` });
  if (!z.uuid().safeParse(id).success) notFound();
  await connection();
  const now = new Date();

  let area: LearningArea;
  try {
    area = await getLearningArea(user, id, now);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
  const { batch } = area;
  const learning = LEARNING_STATUSES.includes(area.status);
  const submissions = new Map(area.submissions.map((submission) => [submission.assignmentId, submission]));
  const attendance = new Map(area.attendance.map((row) => [row.sessionId, row.present]));
  const myDemos = batch.demoSlots.filter((slot) => slot.bookedEnrollmentId === area.id);
  const openSlots = batch.demoSlots.filter((slot) => slot.bookedEnrollmentId === null);
  const hasUpcomingBooking = myDemos.some((slot) => slot.result === null);
  const reattemptTargets = area.canReattempt ? await listTransferTargets(batch.programId, batch.id, now) : [];
  const project = area.finalProject;
  const projectLocked = project?.status === "PASSED" || project?.status === "FAILED";

  return (
    <div className="w-full space-y-6">
      <Link href="/candidate/training" className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" /> My Training
      </Link>
      <header className="space-y-1">
        <h2 className="text-xl font-bold tracking-tight sm:text-2xl">{batch.program.title}</h2>
        <p className="text-sm text-muted-foreground">
          {batch.name} · starts {formatBatchDay(batch.startDate)}
          {batch.endDate ? ` · ends ${formatBatchDay(batch.endDate)}` : ""}
          {area.reattemptOfId ? " · free re-attempt" : ""}
        </p>
      </header>

      {area.status === "COMPLETED" && (
        <Card className="border-success/40">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-5">
            <p className="flex items-center gap-2 text-sm">
              <Award className="h-5 w-5 text-success" aria-hidden="true" />
              You passed. Certificate ID <span className="font-mono">{area.certificate?.verificationCode}</span>
            </p>
            {area.certificate?.status === "ACTIVE" && (
              <span className="flex flex-wrap gap-2">
                <a href={`/api/certificates/${area.certificate.id}/download`} className={linkButtonClass("primary", "md")}>
                  <Download className="h-4 w-4" aria-hidden="true" /> Download certificate
                </a>
                <Link href={`/candidate/training/${area.id}/print`} className={linkButtonClass("outline", "md")}>
                  Order a printed copy
                </Link>
              </span>
            )}
          </CardContent>
        </Card>
      )}
      {area.status === "FAILED" && (
        <Card>
          <CardContent className="space-y-3 p-5">
            <p className="text-sm">
              You did not meet every pass criterion in this batch.{area.resultNote ? ` Mentor's note: ${area.resultNote}` : ""}
            </p>
            {area.reattempt ? (
              <p className="text-sm">
                Your re-attempt is in {area.reattempt.batch.name}.{" "}
                <Link href={`/candidate/training/${area.reattempt.id}`} className="font-medium text-primary hover:underline">
                  Open it
                </Link>
              </p>
            ) : area.canReattempt ? (
              <ReattemptForm
                enrollmentId={area.id}
                targets={reattemptTargets.map((target) => ({
                  id: target.id,
                  label: `${target.name} · starts ${formatBatchDay(target.startDate)} · ${target.seatsLeft} seat${target.seatsLeft === 1 ? "" : "s"} left`,
                }))}
              />
            ) : (
              <p className="text-sm text-muted-foreground">The free re-attempt has been used.</p>
            )}
          </CardContent>
        </Card>
      )}

      <Progress area={area} />

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Live classes</CardTitle>
        </CardHeader>
        <CardContent>
          {batch.sessions.length === 0 ? (
            <p className="text-sm text-muted-foreground">The class schedule will appear here.</p>
          ) : (
            <ul className="divide-y divide-border/60">
              {batch.sessions.map((session) => {
                const started = session.startsAt.getTime() <= now.getTime();
                const mark = attendance.get(session.id);
                return (
                  <li key={session.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                    <div>
                      <p className="font-medium">{session.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatBatchDayTime(session.startsAt)} · {session.durationMinutes} min
                      </p>
                    </div>
                    <div className="text-xs">
                      {session.status === "CANCELLED" ? (
                        <Badge variant="outline">Cancelled</Badge>
                      ) : started ? (
                        <span className="flex flex-wrap items-center gap-2">
                          {session.attendanceTakenAt ? (
                            <Badge variant={mark ? "success" : "destructive"}>{mark ? "Present" : "Absent"}</Badge>
                          ) : (
                            <Badge variant="outline">Attendance pending</Badge>
                          )}
                          {session.recordingUrl && <ExternalLink href={session.recordingUrl}>Recording</ExternalLink>}
                        </span>
                      ) : session.meetingUrl ? (
                        <ExternalLink href={session.meetingUrl}>Join link</ExternalLink>
                      ) : (
                        <span className="text-muted-foreground">Link shared before the class</span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Assignments</CardTitle>
        </CardHeader>
        <CardContent>
          {batch.assignments.length === 0 ? (
            <p className="text-sm text-muted-foreground">Assignments will appear here.</p>
          ) : (
            <ul className="divide-y divide-border/60">
              {batch.assignments.map((assignment) => {
                const submission = submissions.get(assignment.id);
                const open = assignment.dueAt.getTime() >= now.getTime();
                return (
                  <li key={assignment.id} className="space-y-2 py-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-medium">{assignment.title}</p>
                      <span className="text-xs text-muted-foreground">
                        Due {formatBatchDayTime(assignment.dueAt)} · {assignment.maxMarks} marks
                      </span>
                    </div>
                    <p className="whitespace-pre-line text-sm text-muted-foreground">{assignment.description}</p>
                    {submission?.marks !== null && submission?.marks !== undefined ? (
                      <p className="text-sm">
                        Marks: <span className="font-semibold">{submission.marks}</span> / {assignment.maxMarks}
                        {submission.feedback ? <span className="block text-xs text-muted-foreground">Feedback: {submission.feedback}</span> : null}
                      </p>
                    ) : submission ? (
                      <p className="text-xs text-muted-foreground">Submitted {formatBatchDayTime(submission.submittedAt)} · waiting for grading</p>
                    ) : !open ? (
                      <p className="text-xs text-destructive">Not submitted · closed (0 marks)</p>
                    ) : null}
                    {learning && open && (submission?.marks ?? null) === null && (
                      <SubmissionForm
                        enrollmentId={area.id}
                        assignmentId={assignment.id}
                        initial={submission ? { repoUrl: submission.repoUrl ?? "", linkUrl: submission.linkUrl ?? "", notes: submission.notes ?? "" } : null}
                      />
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Final project</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {project && (
            <div className="space-y-1 text-sm">
              <p>
                <span className="font-medium">{project.title}</span>{" "}
                <Badge variant={project.status === "PASSED" ? "success" : project.status === "FAILED" ? "destructive" : "outline"}>
                  {project.status.replace("_", " ").toLowerCase()}
                </Badge>
              </p>
              <p className="text-xs">
                <ExternalLink href={project.repoUrl}>Repository</ExternalLink>
                {project.liveUrl && (
                  <>
                    {" · "}
                    <ExternalLink href={project.liveUrl}>Live</ExternalLink>
                  </>
                )}
              </p>
              {project.feedback && <p className="text-xs text-muted-foreground">Feedback: {project.feedback}</p>}
            </div>
          )}
          {learning && !projectLocked && !area.batchEnded ? (
            <ProjectForm
              enrollmentId={area.id}
              initial={project ? { title: project.title, description: project.description ?? "", repoUrl: project.repoUrl, liveUrl: project.liveUrl ?? "" } : null}
            />
          ) : !project ? (
            <p className="text-sm text-muted-foreground">No project was submitted.</p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Live demo</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {myDemos.length > 0 && (
            <ul className="divide-y divide-border/60">
              {myDemos.map((slot) => (
                <li key={slot.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                  <span>
                    {formatBatchDayTime(slot.startsAt)} with {slot.mentor.name}
                    {slot.result ? ` · ${slot.result === "PASSED" ? "passed" : "not passed"}` : ""}
                    {slot.resultNote ? <span className="block text-xs text-muted-foreground">Note: {slot.resultNote}</span> : null}
                  </span>
                  <span className="flex items-center gap-2 text-xs">
                    {!slot.result && slot.meetingUrl && <ExternalLink href={slot.meetingUrl}>Join link</ExternalLink>}
                    {learning && !slot.result && slot.startsAt.getTime() > now.getTime() && <CancelDemoButton enrollmentId={area.id} slotId={slot.id} />}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {learning && !area.progress.demo.passed && !hasUpcomingBooking && !area.batchEnded && (
            openSlots.length === 0 ? (
              <p className="text-sm text-muted-foreground">No demo slot is open right now. Your mentor will open slots.</p>
            ) : (
              <div className="space-y-2">
                <p className="text-sm font-medium">Book a demo slot</p>
                <ul className="divide-y divide-border/60">
                  {openSlots.map((slot) => (
                    <li key={slot.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                      <span>
                        {formatBatchDayTime(slot.startsAt)} · {slot.durationMinutes} min with {slot.mentor.name}
                      </span>
                      <BookDemoButton enrollmentId={area.id} slotId={slot.id} />
                    </li>
                  ))}
                </ul>
              </div>
            )
          )}
        </CardContent>
      </Card>
    </div>
  );
}
