"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  cancelSessionAction,
  createDemoSlotsAction,
  decideTrainingResultAction,
  deleteAssignmentAction,
  deleteDemoSlotAction,
  gradeSubmissionAction,
  recordDemoResultAction,
  reviewProjectAction,
  saveAssignmentAction,
  saveAttendanceAction,
  saveSessionAction,
  setBatchMentorAction,
} from "../../learning-actions";
import { toast } from "@/components/ui/toast";

/*
 * Staff forms of the Industrial Training learning area. Each form calls a server action that
 * authorizes and validates again; these checks are only for a quicker message.
 */

export const fieldClass =
  "flex w-full rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

type ActionResult = { success: true } | { success: false; error: string };

/** Runs a server action, shows its error and refreshes the page on success. */
function useAction() {
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  const run = (action: () => Promise<ActionResult>, onDone?: () => void, doneNotice?: string) => {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.success) {
        setError(result.error);
        return;
      }
      if (doneNotice) toast.success(doneNotice);
      onDone?.();
      router.refresh();
    });
  };
  return { error, pending, run };
}

/** The action error next to the form; confirmations appear as toasts (see useAction). */
export function FormMessages({ error }: { error: string | null }) {
  return error ? (
    <p role="alert" className="text-xs text-destructive">
      {error}
    </p>
  ) : null;
}

function TextArea({ label, value, onChange, rows = 3, maxLength, required }: { label: string; value: string; onChange: (value: string) => void; rows?: number; maxLength?: number; required?: boolean }) {
  const id = React.useId();
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-xs font-semibold text-foreground">
        {label}
      </label>
      <textarea id={id} value={value} rows={rows} maxLength={maxLength} required={required} onChange={(event) => onChange(event.target.value)} className={fieldClass} />
    </div>
  );
}

// ----------------------------------------------------------------------------- mentors

export function MentorManager({
  batchId,
  mentors,
  candidates,
}: {
  batchId: string;
  mentors: Array<{ userId: string; name: string; email: string }>;
  candidates: Array<{ id: string; name: string; email: string }>;
}) {
  const { error, pending, run } = useAction();
  const available = candidates.filter((candidate) => !mentors.some((mentor) => mentor.userId === candidate.id));
  const [selected, setSelected] = React.useState(available[0]?.id ?? "");
  const selectId = React.useId();
  return (
    <div className="space-y-3">
      {mentors.length === 0 ? (
        <p className="text-sm text-muted-foreground">No mentor assigned yet.</p>
      ) : (
        <ul className="grid grid-cols-1 gap-2">
          {mentors.map((mentor) => (
            <li key={mentor.userId} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-background px-4 py-3 text-sm">
              <span className="min-w-0">
                <span className="block font-semibold text-foreground">{mentor.name}</span>
                <span className="block truncate text-xs text-muted-foreground">{mentor.email}</span>
              </span>
              <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => setBatchMentorAction({ batchId, userId: mentor.userId, assigned: false }))}>
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}
      {available.length > 0 ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-1.5">
            <label htmlFor={selectId} className="block text-xs font-semibold">
              Assign a mentor
            </label>
            <select id={selectId} className={`${fieldClass} h-10`} value={selected} onChange={(event) => setSelected(event.target.value)}>
              {available.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.name} ({candidate.email})
                </option>
              ))}
            </select>
          </div>
          <Button size="sm" disabled={pending || !selected} onClick={() => run(() => setBatchMentorAction({ batchId, userId: selected, assigned: true }))}>
            Assign
          </Button>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">All mentors are assigned. Add mentors under Sub-Admins.</p>
      )}
      <FormMessages error={error} />
    </div>
  );
}

// ----------------------------------------------------------------------------- classes

export interface SessionFormValues {
  title: string;
  startsAt: string;
  durationMinutes: number;
  meetingUrl: string;
  recordingUrl: string;
}

export function SessionForm({ batchId, sessionId, initial, onDone }: { batchId: string; sessionId?: string; initial?: SessionFormValues; onDone?: () => void }) {
  const empty: SessionFormValues = { title: "", startsAt: "", durationMinutes: 90, meetingUrl: "", recordingUrl: "" };
  const [values, setValues] = React.useState<SessionFormValues>(initial ?? empty);
  const { error, pending, run } = useAction();
  const set = (key: keyof SessionFormValues) => (event: React.ChangeEvent<HTMLInputElement>) =>
    setValues((current) => ({ ...current, [key]: key === "durationMinutes" ? Number(event.target.value) || 0 : event.target.value }));
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    run(() => saveSessionAction(sessionId ?? null, { ...values, batchId }), () => {
      if (!sessionId) setValues(empty);
      onDone?.();
    });
  };
  return (
    <form onSubmit={submit} className="space-y-4 rounded-xl border border-border bg-muted/30 p-4 sm:p-5">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
        <Input label="Class title *" value={values.title} onChange={set("title")} maxLength={150} required />
        <Input label="Starts (India time) *" type="datetime-local" value={values.startsAt} onChange={set("startsAt")} required />
        <Input label="Minutes *" type="number" min={1} max={600} value={values.durationMinutes} onChange={set("durationMinutes")} required />
        <Input label="Meeting link" type="url" placeholder="https://" value={values.meetingUrl} onChange={set("meetingUrl")} />
        <Input label="Recording link" type="url" placeholder="https://" value={values.recordingUrl} onChange={set("recordingUrl")} />
      </div>
      <FormMessages error={error} />
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? "Saving…" : sessionId ? "Save class" : "Add class"}
      </Button>
    </form>
  );
}

export function CancelSessionButton({ sessionId }: { sessionId: string }) {
  const { error, pending, run } = useAction();
  const [confirming, setConfirming] = React.useState(false);
  return (
    <span className="inline-flex flex-col gap-1">
      <Button
        size="sm"
        variant={confirming ? "destructive" : "ghost"}
        disabled={pending}
        onClick={() => (confirming ? run(() => cancelSessionAction(sessionId)) : setConfirming(true))}
      >
        {confirming ? "Confirm cancel" : "Cancel class"}
      </Button>
      <FormMessages error={error} />
    </span>
  );
}

export function AttendanceSheet({
  sessionId,
  students,
}: {
  sessionId: string;
  students: Array<{ enrollmentId: string; name: string; present: boolean | null }>;
}) {
  const [present, setPresent] = React.useState<Record<string, boolean>>(() =>
    Object.fromEntries(students.map((student) => [student.enrollmentId, student.present ?? false]))
  );
  const { error, pending, run } = useAction();
  if (students.length === 0) return <p className="text-xs text-muted-foreground">No student is learning in this batch.</p>;
  const save = () =>
    run(
      () => saveAttendanceAction({ sessionId, entries: students.map((student) => ({ enrollmentId: student.enrollmentId, present: present[student.enrollmentId] === true })) }),
      undefined,
      "Attendance saved."
    );
  return (
    <div className="space-y-2">
      <fieldset className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
        <legend className="sr-only">Present students</legend>
        {students.map((student) => (
          <label
            key={student.enrollmentId}
            className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-border bg-background px-3 py-2 text-sm transition-colors hover:border-foreground/25 has-checked:border-primary has-checked:bg-primary/5"
          >
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-input accent-primary"
              checked={present[student.enrollmentId] === true}
              onChange={(event) => setPresent((current) => ({ ...current, [student.enrollmentId]: event.target.checked }))}
            />
            {student.name}
          </label>
        ))}
      </fieldset>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={pending} onClick={save}>
          {pending ? "Saving…" : "Save attendance"}
        </Button>
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => setPresent(Object.fromEntries(students.map((student) => [student.enrollmentId, true])))}>
          Mark all present
        </Button>
      </div>
      <FormMessages error={error} />
    </div>
  );
}

// ----------------------------------------------------------------------------- assignments

export interface AssignmentFormValues {
  title: string;
  description: string;
  dueAt: string;
  maxMarks: number;
}

export function AssignmentForm({ batchId, assignmentId, initial }: { batchId: string; assignmentId?: string; initial?: AssignmentFormValues }) {
  const empty: AssignmentFormValues = { title: "", description: "", dueAt: "", maxMarks: 10 };
  const [values, setValues] = React.useState<AssignmentFormValues>(initial ?? empty);
  const { error, pending, run } = useAction();
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    run(
      () => saveAssignmentAction(assignmentId ?? null, { ...values, batchId }),
      () => {
        if (!assignmentId) setValues(empty);
      },
      assignmentId ? "Saved." : undefined
    );
  };
  return (
    <form onSubmit={submit} className="space-y-4 rounded-xl border border-border bg-muted/30 p-4 sm:p-5">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <Input label="Title *" value={values.title} onChange={(event) => setValues({ ...values, title: event.target.value })} maxLength={150} required />
        <Input label="Due (India time) *" type="datetime-local" value={values.dueAt} onChange={(event) => setValues({ ...values, dueAt: event.target.value })} required />
        <Input label="Maximum marks *" type="number" min={1} max={1000} value={values.maxMarks} onChange={(event) => setValues({ ...values, maxMarks: Number(event.target.value) || 0 })} required />
      </div>
      <TextArea label="Description *" value={values.description} onChange={(description) => setValues({ ...values, description })} maxLength={5000} required />
      <FormMessages error={error} />
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? "Saving…" : assignmentId ? "Save assignment" : "Add assignment"}
      </Button>
    </form>
  );
}

export function DeleteAssignmentButton({ assignmentId }: { assignmentId: string }) {
  const { error, pending, run } = useAction();
  const [confirming, setConfirming] = React.useState(false);
  return (
    <span className="inline-flex flex-col gap-1">
      <Button size="sm" variant={confirming ? "destructive" : "ghost"} disabled={pending} onClick={() => (confirming ? run(() => deleteAssignmentAction(assignmentId)) : setConfirming(true))}>
        {confirming ? "Confirm remove" : "Remove"}
      </Button>
      <FormMessages error={error} />
    </span>
  );
}

export function GradeForm({ submissionId, maxMarks, marks, feedback }: { submissionId: string; maxMarks: number; marks: number | null; feedback: string | null }) {
  const [value, setValue] = React.useState(marks === null ? "" : String(marks));
  const [text, setText] = React.useState(feedback ?? "");
  const { error, pending, run } = useAction();
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    run(() => gradeSubmissionAction({ submissionId, marks: value, feedback: text }), undefined, "Marks saved.");
  };
  return (
    <form onSubmit={submit} className="flex flex-col gap-2 sm:flex-row sm:items-end">
      <div className="w-28">
        <Input label={`Marks / ${maxMarks}`} type="number" min={0} max={maxMarks} value={value} onChange={(event) => setValue(event.target.value)} required />
      </div>
      <div className="flex-1">
        <Input label="Feedback" value={text} maxLength={2000} onChange={(event) => setText(event.target.value)} />
      </div>
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? "Saving…" : marks === null ? "Grade" : "Update"}
      </Button>
      <FormMessages error={error} />
    </form>
  );
}

// ----------------------------------------------------------------------------- project and demo

export function ProjectReviewForm({ projectId, status, marks, feedback }: { projectId: string; status: string; marks: number | null; feedback: string | null }) {
  const [values, setValues] = React.useState({ status: status === "SUBMITTED" ? "PASSED" : status, marks: marks === null ? "" : String(marks), feedback: feedback ?? "" });
  const { error, pending, run } = useAction();
  const selectId = React.useId();
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    run(() => reviewProjectAction({ projectId, ...values }), undefined, "Review saved.");
  };
  return (
    <form onSubmit={submit} className="space-y-2">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <div className="space-y-1.5">
          <label htmlFor={selectId} className="block text-xs font-semibold">
            Decision
          </label>
          <select id={selectId} className={`${fieldClass} h-10`} value={values.status} onChange={(event) => setValues({ ...values, status: event.target.value })}>
            <option value="PASSED">Passed</option>
            <option value="CHANGES_REQUESTED">Changes requested</option>
            <option value="FAILED">Failed</option>
          </select>
        </div>
        <Input label="Marks (0–100, optional)" type="number" min={0} max={100} value={values.marks} onChange={(event) => setValues({ ...values, marks: event.target.value })} />
        <Input label="Feedback" value={values.feedback} maxLength={2000} onChange={(event) => setValues({ ...values, feedback: event.target.value })} />
      </div>
      <FormMessages error={error} />
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? "Saving…" : "Save review"}
      </Button>
    </form>
  );
}

export function DemoSlotForm({ batchId }: { batchId: string }) {
  const [starts, setStarts] = React.useState<string[]>([""]);
  const [duration, setDuration] = React.useState(20);
  const [meetingUrl, setMeetingUrl] = React.useState("");
  const { error, pending, run } = useAction();
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    run(
      () => createDemoSlotsAction({ batchId, startsAt: starts.filter(Boolean), durationMinutes: duration, meetingUrl }),
      () => setStarts([""]),
      "Slots added."
    );
  };
  return (
    <form onSubmit={submit} className="space-y-4 rounded-xl border border-border bg-muted/30 p-4 sm:p-5">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {starts.map((value, index) => (
          <Input
            key={index}
            label={`Slot ${index + 1} starts (India time)`}
            type="datetime-local"
            value={value}
            required={index === 0}
            onChange={(event) => setStarts((current) => current.map((item, position) => (position === index ? event.target.value : item)))}
          />
        ))}
      </div>
      <Button type="button" size="sm" variant="ghost" disabled={starts.length >= 30} onClick={() => setStarts((current) => [...current, ""])}>
        Add another time
      </Button>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <Input label="Minutes per demo" type="number" min={5} max={240} value={duration} onChange={(event) => setDuration(Number(event.target.value) || 0)} required />
        <Input label="Meeting link (shown to the booked student)" type="url" placeholder="https://" value={meetingUrl} onChange={(event) => setMeetingUrl(event.target.value)} />
      </div>
      <FormMessages error={error} />
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? "Saving…" : "Open demo slots"}
      </Button>
    </form>
  );
}

export function DeleteDemoSlotButton({ slotId }: { slotId: string }) {
  const { error, pending, run } = useAction();
  return (
    <span className="inline-flex flex-col gap-1">
      <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => deleteDemoSlotAction(slotId))}>
        Remove
      </Button>
      <FormMessages error={error} />
    </span>
  );
}

export function DemoResultForm({ slotId }: { slotId: string }) {
  const [note, setNote] = React.useState("");
  const { error, pending, run } = useAction();
  return (
    <div className="space-y-2">
      <Input label="Note (optional)" value={note} maxLength={1000} onChange={(event) => setNote(event.target.value)} />
      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={pending} onClick={() => run(() => recordDemoResultAction({ slotId, result: "PASSED", note }))}>
          Passed
        </Button>
        <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => recordDemoResultAction({ slotId, result: "FAILED", note }))}>
          Not passed
        </Button>
      </div>
      <FormMessages error={error} />
    </div>
  );
}

// ----------------------------------------------------------------------------- result

export function ResultDecisionForm({
  enrollmentId,
  passBlockers,
  failBlockers,
  signatories,
}: {
  enrollmentId: string;
  passBlockers: string[];
  failBlockers: string[];
  signatories: { primary: { name: string | null; title: string }; secondary: { name: string | null; title: string } };
}) {
  const [mode, setMode] = React.useState<"PASS" | "FAIL" | null>(null);
  const [values, setValues] = React.useState({
    signatoryName: signatories.primary.name ?? "",
    signatoryTitle: signatories.primary.title,
    secondSignatoryName: signatories.secondary.name ?? "",
    secondSignatoryTitle: signatories.secondary.name ? signatories.secondary.title : "",
    grade: "",
    note: "",
  });
  const { error, pending, run } = useAction();
  const set = (key: keyof typeof values) => (event: React.ChangeEvent<HTMLInputElement>) => setValues({ ...values, [key]: event.target.value });

  if (mode === null) {
    return (
      <div className="space-y-2">
        <div className="flex flex-wrap gap-2">
          <Button size="sm" disabled={passBlockers.length > 0} onClick={() => setMode("PASS")}>
            Record pass and issue certificate
          </Button>
          <Button size="sm" variant="outline" disabled={failBlockers.length > 0} onClick={() => setMode("FAIL")}>
            Record fail
          </Button>
        </div>
        {passBlockers.length > 0 && <p className="text-xs text-muted-foreground">Pass not available: {passBlockers.join(" ")}</p>}
        {failBlockers.length > 0 && passBlockers.length > 0 && <p className="text-xs text-muted-foreground">Fail not available: {failBlockers.join(" ")}</p>}
      </div>
    );
  }

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    run(() => decideTrainingResultAction({ enrollmentId, result: mode, ...values }));
  };
  return (
    <form onSubmit={submit} className="space-y-4 rounded-xl border border-border bg-muted/30 p-4 sm:p-5">
      {mode === "PASS" ? (
        <>
          <p className="text-sm font-medium">Certificate details</p>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Input label="Signatory name *" value={values.signatoryName} onChange={set("signatoryName")} maxLength={120} required />
            <Input label="Signatory title *" value={values.signatoryTitle} onChange={set("signatoryTitle")} maxLength={120} required />
            <Input label="Second signatory name" value={values.secondSignatoryName} onChange={set("secondSignatoryName")} maxLength={120} />
            <Input label="Second signatory title" value={values.secondSignatoryTitle} onChange={set("secondSignatoryTitle")} maxLength={120} />
            <Input label="Grade (optional, printed)" value={values.grade} onChange={set("grade")} maxLength={40} />
            <Input label="Note (optional)" value={values.note} onChange={set("note")} maxLength={1000} />
          </div>
        </>
      ) : (
        <Input label="Reason shown to the student *" value={values.note} onChange={set("note")} maxLength={1000} required />
      )}
      <FormMessages error={error} />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" variant={mode === "PASS" ? "primary" : "destructive"} disabled={pending}>
          {pending ? "Saving…" : mode === "PASS" ? "Confirm pass" : "Confirm fail"}
        </Button>
        <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => setMode(null)}>
          Back
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">The result is final and the student is emailed.</p>
    </form>
  );
}
