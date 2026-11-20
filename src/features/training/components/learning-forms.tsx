"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  bookDemoSlotAction,
  cancelDemoBookingAction,
  startReattemptAction,
  submitAssignmentAction,
  submitFinalProjectAction,
} from "../learning-actions";
import { fieldClass, FormMessages } from "./staff/staff-forms";

type ActionResult = { success: true } | { success: false; error: string };

function useAction() {
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  const run = (action: () => Promise<ActionResult>, doneNotice?: string, onDone?: () => void) => {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const result = await action();
      if (!result.success) {
        setError(result.error);
        return;
      }
      if (doneNotice) setNotice(doneNotice);
      onDone?.();
      router.refresh();
    });
  };
  return { error, notice, pending, run };
}

/** Submit or replace an assignment before its due time. */
export function SubmissionForm({
  enrollmentId,
  assignmentId,
  initial,
}: {
  enrollmentId: string;
  assignmentId: string;
  initial: { repoUrl: string; linkUrl: string; notes: string } | null;
}) {
  const [values, setValues] = React.useState(initial ?? { repoUrl: "", linkUrl: "", notes: "" });
  const { error, notice, pending, run } = useAction();
  const notesId = React.useId();
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    run(() => submitAssignmentAction({ enrollmentId, assignmentId, ...values }), "Submitted. You can replace it until the due time or until it is graded.");
  };
  return (
    <form onSubmit={submit} className="space-y-2">
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        <Input label="Repository link (GitHub or similar)" type="url" placeholder="https://github.com/…" value={values.repoUrl} onChange={(event) => setValues({ ...values, repoUrl: event.target.value })} />
        <Input label="Other link (Drive, deployed app…)" type="url" placeholder="https://" value={values.linkUrl} onChange={(event) => setValues({ ...values, linkUrl: event.target.value })} />
      </div>
      <div className="space-y-1.5">
        <label htmlFor={notesId} className="block text-xs font-semibold">
          Notes for the mentor (optional)
        </label>
        <textarea id={notesId} rows={2} maxLength={2000} className={fieldClass} value={values.notes} onChange={(event) => setValues({ ...values, notes: event.target.value })} />
      </div>
      <FormMessages error={error} notice={notice} />
      <Button type="submit" size="sm" disabled={pending || (!values.repoUrl.trim() && !values.linkUrl.trim())}>
        {pending ? "Submitting…" : initial ? "Replace submission" : "Submit"}
      </Button>
    </form>
  );
}

/** Submit or update the final project until it is reviewed as passed or failed. */
export function ProjectForm({
  enrollmentId,
  initial,
}: {
  enrollmentId: string;
  initial: { title: string; description: string; repoUrl: string; liveUrl: string } | null;
}) {
  const [values, setValues] = React.useState(initial ?? { title: "", description: "", repoUrl: "", liveUrl: "" });
  const { error, notice, pending, run } = useAction();
  const descriptionId = React.useId();
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    run(() => submitFinalProjectAction({ enrollmentId, ...values }), "Project submitted for review.");
  };
  return (
    <form onSubmit={submit} className="space-y-2">
      <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
        <Input label="Project title *" value={values.title} maxLength={150} required onChange={(event) => setValues({ ...values, title: event.target.value })} />
        <Input label="Repository link *" type="url" placeholder="https://github.com/…" value={values.repoUrl} required onChange={(event) => setValues({ ...values, repoUrl: event.target.value })} />
        <Input label="Live link" type="url" placeholder="https://" value={values.liveUrl} onChange={(event) => setValues({ ...values, liveUrl: event.target.value })} />
      </div>
      <div className="space-y-1.5">
        <label htmlFor={descriptionId} className="block text-xs font-semibold">
          What does it do? (optional)
        </label>
        <textarea id={descriptionId} rows={3} maxLength={2000} className={fieldClass} value={values.description} onChange={(event) => setValues({ ...values, description: event.target.value })} />
      </div>
      <FormMessages error={error} notice={notice} />
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? "Saving…" : initial ? "Resubmit project" : "Submit project"}
      </Button>
    </form>
  );
}

export function BookDemoButton({ enrollmentId, slotId }: { enrollmentId: string; slotId: string }) {
  const { error, pending, run } = useAction();
  return (
    <span className="inline-flex flex-col gap-1">
      <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => bookDemoSlotAction({ enrollmentId, slotId }))}>
        {pending ? "Booking…" : "Book"}
      </Button>
      <FormMessages error={error} />
    </span>
  );
}

export function CancelDemoButton({ enrollmentId, slotId }: { enrollmentId: string; slotId: string }) {
  const { error, pending, run } = useAction();
  return (
    <span className="inline-flex flex-col gap-1">
      <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => cancelDemoBookingAction({ enrollmentId, slotId }))}>
        Cancel booking
      </Button>
      <FormMessages error={error} />
    </span>
  );
}

/** Free re-attempt in a later batch of the same programme (once). */
export function ReattemptForm({ enrollmentId, targets }: { enrollmentId: string; targets: Array<{ id: string; label: string }> }) {
  const router = useRouter();
  const [target, setTarget] = React.useState(targets[0]?.id ?? "");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  const selectId = React.useId();
  if (targets.length === 0) {
    return <p className="text-sm text-muted-foreground">No later batch is open right now. Your free re-attempt stays available; check back when a new batch is announced.</p>;
  }
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await startReattemptAction({ enrollmentId, targetBatchId: target });
      if (!result.success) {
        setError(result.error);
        return;
      }
      router.push(`/candidate/training/${result.data.enrollmentId}`);
    });
  };
  return (
    <form onSubmit={submit} className="space-y-2">
      <label htmlFor={selectId} className="block text-sm font-medium">
        Re-attempt in a later batch (free, once)
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <select id={selectId} className={`${fieldClass} h-9 sm:max-w-sm`} value={target} onChange={(event) => setTarget(event.target.value)}>
          {targets.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
        <Button type="submit" size="sm" disabled={pending || !target}>
          {pending ? "Starting…" : "Start re-attempt"}
        </Button>
      </div>
      <FormMessages error={error} />
    </form>
  );
}
