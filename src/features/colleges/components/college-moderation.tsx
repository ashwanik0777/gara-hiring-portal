"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { mergeCollegesAction, updateCollegeAction } from "../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

export interface CollegeRow {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  status: "APPROVED" | "PENDING";
  students: number;
}

function CollegeEditor({ college, onDone }: { college: CollegeRow; onDone: () => void }) {
  const router = useRouter();
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
      router.refresh();
      onDone();
    });
  };

  return (
    <div className="space-y-3 rounded-md border border-border/70 bg-muted/20 p-4">
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Input label="College name" value={name} onChange={(e) => setName(e.target.value)} maxLength={150} />
        <Input label="City (optional)" value={city} onChange={(e) => setCity(e.target.value)} maxLength={80} />
        <Input label="State (optional)" value={state} onChange={(e) => setState(e.target.value)} maxLength={80} />
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onDone} disabled={isPending}>
          Cancel
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => save(false)} isLoading={isPending}>
          Save
        </Button>
        {college.status === "PENDING" && (
          <Button type="button" size="sm" onClick={() => save(true)} isLoading={isPending}>
            Save and approve
          </Button>
        )}
      </div>
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
      router.refresh();
    });
  };
  return (
    <div className="mt-3 space-y-2">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="flex-1 space-y-1">
          <label htmlFor={selectId} className="block text-xs font-semibold">
            Merge this duplicate into
          </label>
          <select
            id={selectId}
            className="flex h-9 w-full rounded-lg border border-input bg-card px-3 text-sm"
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
        <Button type="button" size="sm" variant={confirming ? "destructive" : "outline"} disabled={!targetId || isPending} onClick={merge}>
          {confirming ? "Confirm merge" : "Merge"}
        </Button>
      </div>
      {confirming && target && (
        <p className="text-xs text-muted-foreground">
          {college.students} student{college.students === 1 ? "" : "s"} move to {target.name} and &quot;{college.name}&quot; is removed.
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

/**
 * Staff moderation of the college master list: students add colleges that are not listed;
 * staff correct and approve them so other students find them, and merge duplicates.
 */
export function CollegeModeration({ colleges }: { colleges: CollegeRow[] }) {
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const pending = colleges.filter((college) => college.status === "PENDING").length;

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        {pending === 0 ? "No colleges are waiting for approval." : `${pending} college${pending === 1 ? "" : "s"} waiting for approval.`}
      </p>
      {colleges.length === 0 ? (
        <p className="text-sm text-muted-foreground">No colleges yet. They appear here when students add them on the apply form.</p>
      ) : (
        <ul className="divide-y divide-border/60 rounded-md border border-border/70 bg-card">
          {colleges.map((college) => (
            <li key={college.id} className="p-4">
              {editingId === college.id ? (
                <>
                  <CollegeEditor college={college} onDone={() => setEditingId(null)} />
                  <MergeCollege college={college} others={colleges.filter((item) => item.id !== college.id)} />
                </>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-foreground">
                      {college.name}{" "}
                      {college.status === "PENDING" ? (
                        <Badge variant="warning" className="ml-1">
                          Pending
                        </Badge>
                      ) : (
                        <Badge variant="success" className="ml-1">
                          Approved
                        </Badge>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {[college.city, college.state].filter(Boolean).join(", ") || "Place not set"} · {college.students} student
                      {college.students === 1 ? "" : "s"}
                    </p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => setEditingId(college.id)}>
                    {college.status === "PENDING" ? "Review" : "Edit"}
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
