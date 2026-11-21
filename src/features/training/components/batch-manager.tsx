"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarDays, CalendarRange, ChevronDown, Clock, GraduationCap, Pencil, Plus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FieldLabelRow, fieldInputClass, fieldOkBorder } from "@/components/ui/form-field";
import { cn } from "@/lib/utils";
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
  /** Seat-taking enrollments (paid and not refunded). */
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

const STATUS_META: Record<BatchFormValues["status"], { label: string; variant: "default" | "secondary" | "success" | "destructive" }> = {
  UPCOMING: { label: "Upcoming", variant: "default" },
  RUNNING: { label: "Running", variant: "success" },
  COMPLETED: { label: "Completed", variant: "secondary" },
  CANCELLED: { label: "Cancelled", variant: "destructive" },
};

const inputClass = cn(fieldInputClass, fieldOkBorder);
const DATE_FORMAT = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const DATE_TIME_FORMAT = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
  timeZone: "UTC",
});

/** "2026-11-27" → "27 Nov 2026" (the key is already a date in India; no zone shift). */
export function formatDateKey(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  return y && m && d ? DATE_FORMAT.format(new Date(Date.UTC(y, m - 1, d))) : key;
}

/** "2026-11-27T19:00" (India time) → "27 Nov, 7:00 pm". */
export function formatLocalDateTime(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return value;
  const [, y, m, d, hh, mm] = match.map(Number);
  return DATE_TIME_FORMAT.format(new Date(Date.UTC(y, m - 1, d, hh, mm)));
}

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
  const idPrefix = React.useId();
  const fid = (name: string) => `${idPrefix}-${name}`;
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
    <form onSubmit={submit} className="space-y-5 rounded-xl border border-border bg-muted/30 p-4 sm:p-5">
      {error && (
        <p role="alert" className="rounded-lg border border-destructive/20 bg-destructive/10 p-2.5 text-xs text-destructive">
          {error}
        </p>
      )}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-[2fr_1fr_1fr]">
        <div className="space-y-2">
          <FieldLabelRow htmlFor={fid("name")} label="Batch name" />
          <input id={fid("name")} className={inputClass} value={values.name} onChange={set("name")} maxLength={80} required placeholder="e.g. January 2027" />
        </div>
        <div className="space-y-2">
          <FieldLabelRow htmlFor={fid("status")} label="Status" />
          <div className="relative">
            <select id={fid("status")} className={cn(inputClass, "appearance-none pr-10")} value={values.status} onChange={set("status")}>
              <option value="UPCOMING">Upcoming</option>
              <option value="RUNNING">Running</option>
              <option value="COMPLETED">Completed</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
            <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          </div>
        </div>
        <div className="space-y-2">
          <FieldLabelRow htmlFor={fid("seats")} label="Seats" />
          <input id={fid("seats")} className={inputClass} type="number" min={1} value={values.seats} onChange={set("seats")} required />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="space-y-2">
          <FieldLabelRow htmlFor={fid("start")} label="Start date" />
          <input id={fid("start")} className={inputClass} type="date" value={values.startDate} onChange={set("startDate")} required />
        </div>
        <div className="space-y-2">
          <FieldLabelRow htmlFor={fid("first")} label="First live class (IST)" optional />
          <input id={fid("first")} className={inputClass} type="datetime-local" value={values.firstClassAt} onChange={set("firstClassAt")} />
        </div>
        <div className="space-y-2">
          <FieldLabelRow htmlFor={fid("end")} label="End date" optional />
          <input id={fid("end")} className={inputClass} type="date" value={values.endDate} onChange={set("endDate")} />
        </div>
        <div className="space-y-2">
          <FieldLabelRow htmlFor={fid("deadline")} label="Last date to enrol" optional />
          <input id={fid("deadline")} className={inputClass} type="date" value={values.enrollmentDeadline} onChange={set("enrollmentDeadline")} />
        </div>
      </div>
      <div className="space-y-2">
        <FieldLabelRow htmlFor={fid("schedule")} label="Schedule" optional />
        <input
          id={fid("schedule")}
          className={inputClass}
          value={values.scheduleText}
          onChange={set("scheduleText")}
          maxLength={300}
          placeholder="e.g. Mon, Wed, Fri, 7–9 pm"
        />
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

function SeatMeter({ taken, seats }: { taken: number; seats: number }) {
  const percent = seats > 0 ? Math.min(100, Math.round((taken / seats) * 100)) : 0;
  return (
    <div className="w-full space-y-1.5 sm:w-44">
      <div className="flex items-baseline justify-between text-xs">
        <span className="inline-flex items-center gap-1 text-muted-foreground">
          <Users className="h-3.5 w-3.5" aria-hidden="true" />
          Seats
        </span>
        <span className="font-semibold tabular-nums text-foreground">
          {taken}/{seats}
        </span>
      </div>
      <div
        role="meter"
        aria-label="Seats taken"
        aria-valuemin={0}
        aria-valuemax={seats}
        aria-valuenow={taken}
        className="h-1.5 overflow-hidden rounded-full bg-muted-foreground/15"
      >
        <div className={cn("h-full rounded-full", percent >= 100 ? "bg-amber-500" : "bg-primary")} style={{ width: `${percent}%` }} />
      </div>
    </div>
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
    <Card className="rounded-2xl shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between gap-3 border-b border-border/60 px-5 py-4 sm:px-6">
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarRange className="h-4 w-4 text-primary" aria-hidden="true" />
          Batches
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold tabular-nums text-muted-foreground">{batches.length}</span>
        </CardTitle>
        {!adding && (
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setAdding(true)}>
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            Add batch
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-3 p-5 sm:p-6">
        {adding && <BatchForm programId={programId} programSlug={programSlug} initial={EMPTY} onDone={() => setAdding(false)} />}
        {batches.length === 0 && !adding && <p className="text-sm text-muted-foreground">No batches yet.</p>}
        {batches.length > 0 && (
          <ul className="grid grid-cols-1 gap-3" aria-label="Batches">
            {batches.map((batch) =>
              editingId === batch.id ? (
                <li key={batch.id}>
                  <BatchForm programId={programId} programSlug={programSlug} batchId={batch.id} initial={batch} onDone={() => setEditingId(null)} />
                </li>
              ) : (
                <li
                  key={batch.id}
                  className="flex flex-col gap-4 rounded-xl border border-border bg-background p-4 transition-colors hover:border-primary/40 lg:flex-row lg:items-center lg:justify-between"
                >
                  <div className="min-w-0 space-y-2">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-foreground">
                      {batch.name}
                      <Badge variant={STATUS_META[batch.status].variant} className="text-[10px]">
                        {STATUS_META[batch.status].label}
                      </Badge>
                    </p>
                    <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
                      <li className="inline-flex items-center gap-1.5">
                        <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
                        Starts {formatDateKey(batch.startDate)}
                        {batch.endDate ? ` · ends ${formatDateKey(batch.endDate)}` : ""}
                      </li>
                      {batch.firstClassAt && (
                        <li className="inline-flex items-center gap-1.5">
                          <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                          First class {formatLocalDateTime(batch.firstClassAt)}
                        </li>
                      )}
                      {batch.enrollmentDeadline && <li>Enrol by {formatDateKey(batch.enrollmentDeadline)}</li>}
                      {batch.scheduleText && <li>{batch.scheduleText}</li>}
                    </ul>
                  </div>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    <SeatMeter taken={batch.enrollments} seats={batch.seats} />
                    <div className="flex shrink-0 gap-2">
                      <Link
                        href={`/admin/training/batches/${batch.id}`}
                        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 text-xs font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                      >
                        <GraduationCap className="h-3.5 w-3.5" aria-hidden="true" />
                        Learning area
                      </Link>
                      <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={() => setEditingId(batch.id)}>
                        <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                        Edit
                        <span className="sr-only"> {batch.name}</span>
                      </Button>
                    </div>
                  </div>
                </li>
              )
            )}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
