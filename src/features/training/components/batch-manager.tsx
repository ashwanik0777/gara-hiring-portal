"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { saveTrainingBatchAction } from "../actions";

export interface BatchFormValues {
  name: string;
  /** "YYYY-MM-DD" */
  startDate: string;
  /** "YYYY-MM-DDTHH:MM" in India time, or "" */
  firstClassAt: string;
  endDate: string;
  scheduleText: string;
  seats: number;
  enrollmentDeadline: string;
  status: "UPCOMING" | "RUNNING" | "COMPLETED" | "CANCELLED";
}

export interface BatchRow extends BatchFormValues {
  id: string;
  enrollments: number;
}

const EMPTY: BatchFormValues = {
  name: "",
  startDate: "",
  firstClassAt: "",
  endDate: "",
  scheduleText: "",
  seats: 30,
  enrollmentDeadline: "",
  status: "UPCOMING",
};

const selectClass =
  "flex h-10 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function BatchForm({
  programId,
  programSlug,
  batchId,
  initial,
  onDone,
}: {
  programId: string;
  programSlug: string;
  batchId?: string;
  initial: BatchFormValues;
  onDone: () => void;
}) {
  const router = useRouter();
  const [values, setValues] = React.useState(initial);
  const [error, setError] = React.useState<string | null>(null);
  const [isPending, startTransition] = React.useTransition();
  const set = (key: keyof BatchFormValues) => (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setValues((current) => ({ ...current, [key]: key === "seats" ? Number(event.target.value) || 0 : event.target.value }));

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await saveTrainingBatchAction(batchId ?? null, { ...values, programId }, programSlug);
      if (!result.success) {
        setError(result.error);
        return;
      }
      router.refresh();
      onDone();
    });
  };

  return (
    <form onSubmit={submit} className="space-y-3 rounded-md border border-border/70 bg-muted/20 p-4">
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
        <Input label="Batch name *" value={values.name} onChange={set("name")} maxLength={80} required placeholder="e.g. January 2027" />
        <Input label="Start date *" type="date" value={values.startDate} onChange={set("startDate")} required />
        <Input label="First live class (India time)" type="datetime-local" value={values.firstClassAt} onChange={set("firstClassAt")} />
        <Input label="End date" type="date" value={values.endDate} onChange={set("endDate")} />
        <Input label="Seats *" type="number" min={1} value={values.seats} onChange={set("seats")} required />
        <Input label="Last date to enrol" type="date" value={values.enrollmentDeadline} onChange={set("enrollmentDeadline")} />
        <div className="space-y-1.5">
          <label htmlFor={`batch-status-${batchId ?? "new"}`} className="block text-xs font-semibold text-foreground">
            Status
          </label>
          <select id={`batch-status-${batchId ?? "new"}`} className={selectClass} value={values.status} onChange={set("status")}>
            <option value="UPCOMING">Upcoming (open for enrollment)</option>
            <option value="RUNNING">Running</option>
            <option value="COMPLETED">Completed</option>
            <option value="CANCELLED">Cancelled</option>
          </select>
        </div>
        <Input label="Schedule" value={values.scheduleText} onChange={set("scheduleText")} maxLength={300} placeholder="e.g. Mon, Wed, Fri, 7–9 pm" />
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onDone} disabled={isPending}>
          Cancel
        </Button>
        <Button type="submit" size="sm" isLoading={isPending}>
          {batchId ? "Save batch" : "Add batch"}
        </Button>
      </div>
    </form>
  );
}

/**
 * Batches of a programme. Students enrol in an UPCOMING batch before its start date and last
 * date to enrol; the refund window closes 24 hours after the first live class.
 */
export function BatchManager({ programId, programSlug, batches }: { programId: string; programSlug: string; batches: BatchRow[] }) {
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [adding, setAdding] = React.useState(false);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3 pb-3">
        <CardTitle className="text-base">Batches</CardTitle>
        {!adding && (
          <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
            Add batch
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {adding && <BatchForm programId={programId} programSlug={programSlug} initial={EMPTY} onDone={() => setAdding(false)} />}
        {batches.length === 0 && !adding && <p className="text-sm text-muted-foreground">No batches yet.</p>}
        <ul className="divide-y divide-border/60">
          {batches.map((batch) => (
            <li key={batch.id} className="py-3">
              {editingId === batch.id ? (
                <BatchForm
                  programId={programId}
                  programSlug={programSlug}
                  batchId={batch.id}
                  initial={batch}
                  onDone={() => setEditingId(null)}
                />
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-foreground">
                      {batch.name} <Badge variant={batch.status === "CANCELLED" ? "destructive" : "outline"} className="ml-1">{batch.status}</Badge>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Starts {batch.startDate}
                      {batch.firstClassAt ? ` · first class ${batch.firstClassAt.replace("T", " ")}` : ""} · {batch.enrollments} enrolled of {batch.seats} seats
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Link
                      href={`/admin/training/batches/${batch.id}`}
                      className="inline-flex h-8 items-center rounded-lg border border-border px-3 text-xs font-medium hover:bg-muted"
                    >
                      Learning area
                    </Link>
                    <Button size="sm" variant="outline" onClick={() => setEditingId(batch.id)}>
                      Edit
                    </Button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
