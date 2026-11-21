"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, GitMerge, MapPin, Pencil, Search, Users, UserStar, X } from "lucide-react";
import { mergeCollegesAction, updateCollegeAction } from "../actions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/feedback/empty-state";
import { toast } from "@/components/ui/toast";
import { FieldLabelRow, fieldInputClass, fieldOkBorder } from "@/components/ui/form-field";
import { cn } from "@/lib/utils";

export interface CollegeRow {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  status: "APPROVED" | "PENDING";
  students: number;
  ambassadors: number;
}

const inputClass = cn(fieldInputClass, fieldOkBorder);

function CollegeEditor({ college, others, onDone }: { college: CollegeRow; others: CollegeRow[]; onDone: () => void }) {
  const router = useRouter();
  const idPrefix = React.useId();
  const [name, setName] = React.useState(college.name);
  const [city, setCity] = React.useState(college.city ?? "");
  const [state, setState] = React.useState(college.state ?? "");
  const [error, setError] = React.useState<string | null>(null);
  const [isPending, startTransition] = React.useTransition();

  const save = (approve: boolean) => {
    setError(null);
    startTransition(async () => {
      const result = await updateCollegeAction({ id: college.id, name, city: city || null, state: state || null, approve });
      if (!result.success) {
        setError(result.error);
        return;
      }
      toast.success(approve ? `${name} approved.` : "College saved.");
      router.refresh();
      onDone();
    });
  };

  return (
    <div className="space-y-5 border-t border-border/60 bg-muted/20 p-4 sm:p-5">
      {error && (
        <p role="alert" className="rounded-lg border border-destructive/20 bg-destructive/10 p-2.5 text-xs text-destructive">
          {error}
        </p>
      )}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-[2fr_1fr_1fr]">
        <div className="space-y-2">
          <FieldLabelRow htmlFor={`${idPrefix}-name`} label="College name" />
          <input id={`${idPrefix}-name`} className={inputClass} value={name} onChange={(e) => setName(e.target.value)} maxLength={150} />
        </div>
        <div className="space-y-2">
          <FieldLabelRow htmlFor={`${idPrefix}-city`} label="City" optional />
          <input id={`${idPrefix}-city`} className={inputClass} value={city} onChange={(e) => setCity(e.target.value)} maxLength={80} />
        </div>
        <div className="space-y-2">
          <FieldLabelRow htmlFor={`${idPrefix}-state`} label="State" optional />
          <input id={`${idPrefix}-state`} className={inputClass} value={state} onChange={(e) => setState(e.target.value)} maxLength={80} />
        </div>
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onDone} disabled={isPending}>
          Cancel
        </Button>
        <Button type="button" variant={college.status === "PENDING" ? "outline" : "primary"} size="sm" onClick={() => save(false)} isLoading={isPending}>
          Save
        </Button>
        {college.status === "PENDING" && (
          <Button type="button" size="sm" className="gap-1.5" onClick={() => save(true)} isLoading={isPending}>
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
            Save and approve
          </Button>
        )}
      </div>
      {others.length > 0 && <MergeCollege college={college} others={others} />}
    </div>
  );
}

/** Merges this (duplicate) college into another one; asks for a second click. */
function MergeCollege({ college, others }: { college: CollegeRow; others: CollegeRow[] }) {
  const router = useRouter();
  const [targetId, setTargetId] = React.useState("");
  const [confirming, setConfirming] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [isPending, startTransition] = React.useTransition();
  const selectId = React.useId();
  const target = others.find((item) => item.id === targetId);
  const merge = () => {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await mergeCollegesAction({ sourceId: college.id, targetId });
      if (!result.success) {
        setError(result.error);
        setConfirming(false);
        return;
      }
      toast.success(`Merged into ${target?.name ?? "the chosen college"}.`);
      router.refresh();
    });
  };
  return (
    <div className="space-y-3 rounded-xl border border-dashed border-border bg-background p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1 space-y-2">
          <label htmlFor={selectId} className="inline-flex items-center gap-1.5 text-[13px] font-medium text-foreground">
            <GitMerge className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
            Merge this duplicate into
          </label>
          <select
            id={selectId}
            className={inputClass}
            value={targetId}
            onChange={(event) => {
              setTargetId(event.target.value);
              setConfirming(false);
            }}
          >
            <option value="">Choose the college to keep</option>
            {others.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
                {item.city ? ` (${item.city})` : ""}
              </option>
            ))}
          </select>
        </div>
        <Button type="button" size="sm" className="h-11" variant={confirming ? "destructive" : "outline"} disabled={!targetId || isPending} onClick={merge}>
          {confirming ? "Confirm merge" : "Merge"}
        </Button>
      </div>
      {confirming && target && (
        <p role="status" className="text-xs text-amber-700 dark:text-amber-300">
          {college.students} student{college.students === 1 ? "" : "s"} and {college.ambassadors} ambassador{college.ambassadors === 1 ? "" : "s"} move to {target.name}, and
          &quot;{college.name}&quot; is removed.
        </p>
      )}
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

/** One-click approval of a college as it was entered. */
function QuickApprove({ college }: { college: CollegeRow }) {
  const router = useRouter();
  const [isPending, startTransition] = React.useTransition();
  const approve = () =>
    startTransition(async () => {
      const result = await updateCollegeAction({ id: college.id, name: college.name, city: college.city, state: college.state, approve: true });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(`${college.name} approved.`);
      router.refresh();
    });
  return (
    <Button size="sm" className="h-8 gap-1.5" onClick={approve} isLoading={isPending}>
      <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
      Approve
      <span className="sr-only"> {college.name}</span>
    </Button>
  );
}

/**
 * Staff moderation of the college master list: students add colleges that are not listed;
 * staff correct and approve them so other students find them, and merge duplicates.
 */
export function CollegeModeration({ colleges, all }: { colleges: CollegeRow[]; all: CollegeRow[] }) {
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [query, setQuery] = React.useState("");
  const needle = query.trim().toLowerCase();
  const visible = needle
    ? colleges.filter((college) => [college.name, college.city, college.state].some((value) => value?.toLowerCase().includes(needle)))
    : colleges;

  return (
    <div className="space-y-4">
      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <input
          type="search"
          aria-label="Search colleges"
          placeholder="Search by name, city or state"
          className={cn(inputClass, "pl-10 pr-10")}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery("")}
            className="absolute right-2.5 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="sr-only">Clear search</span>
          </button>
        )}
      </div>

      {visible.length === 0 ? (
        <EmptyState title={needle ? "No college matches your search" : colleges.length === all.length ? "No colleges yet" : "No colleges here"} />
      ) : (
        <ul className="grid grid-cols-1 gap-3" aria-label="Colleges">
          {visible.map((college) => {
            const editing = editingId === college.id;
            const place = [college.city, college.state].filter(Boolean).join(", ");
            return (
              <li
                key={college.id}
                className={cn(
                  "overflow-hidden rounded-xl border bg-card shadow-xs transition-colors",
                  editing ? "border-primary/40 shadow-sm" : "border-border hover:border-primary/40"
                )}
              >
                <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 items-center gap-3">
                    <span
                      aria-hidden="true"
                      className={cn(
                        "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-bold",
                        college.status === "PENDING" ? "bg-amber-500/10 text-amber-700 dark:text-amber-300" : "bg-primary/10 text-primary"
                      )}
                    >
                      {college.name.charAt(0).toUpperCase()}
                    </span>
                    <div className="min-w-0 space-y-1">
                      <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-foreground">
                        <span className="wrap-break-word">{college.name}</span>
                        <Badge variant={college.status === "PENDING" ? "warning" : "success"} className="text-[10px]">
                          {college.status === "PENDING" ? "Pending" : "Approved"}
                        </Badge>
                      </p>
                      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        <li className="inline-flex items-center gap-1.5">
                          <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                          {place || "Place not set"}
                        </li>
                        <li className="inline-flex items-center gap-1.5">
                          <Users className="h-3.5 w-3.5" aria-hidden="true" />
                          {college.students} student{college.students === 1 ? "" : "s"}
                        </li>
                        <li className="inline-flex items-center gap-1.5">
                          <UserStar className="h-3.5 w-3.5" aria-hidden="true" />
                          {college.ambassadors} ambassador{college.ambassadors === 1 ? "" : "s"}
                        </li>
                      </ul>
                    </div>
                  </div>
                  {!editing && (
                    <div className="flex shrink-0 gap-2">
                      {college.status === "PENDING" && <QuickApprove college={college} />}
                      <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={() => setEditingId(college.id)}>
                        <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                        {college.status === "PENDING" ? "Review" : "Edit"}
                        <span className="sr-only"> {college.name}</span>
                      </Button>
                    </div>
                  )}
                </div>
                {editing && <CollegeEditor college={college} others={all.filter((item) => item.id !== college.id)} onDone={() => setEditingId(null)} />}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
