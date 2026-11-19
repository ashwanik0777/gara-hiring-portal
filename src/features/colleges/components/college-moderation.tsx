"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { updateCollegeAction } from "../actions";
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

/**
 * Staff moderation of the college master list: students add colleges that are not listed;
 * staff correct and approve them so other students find them. Merging duplicates comes later.
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
                <CollegeEditor college={college} onDone={() => setEditingId(null)} />
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
