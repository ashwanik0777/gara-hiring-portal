"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { createTrackAction, updateTrackAction } from "../actions";
import type { TrackInput } from "../schemas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export interface TrackManagerRow {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
  openingsCount: number;
}

const EMPTY_TRACK: TrackInput = { name: "", slug: "", description: "", sortOrder: 0, isActive: true };

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, " ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function TrackForm({
  initial,
  trackId,
  onDone,
}: {
  initial: TrackInput;
  trackId?: string;
  onDone: () => void;
}) {
  const router = useRouter();
  const [values, setValues] = React.useState<TrackInput>(initial);
  const [error, setError] = React.useState<string | null>(null);
  const [isPending, startTransition] = React.useTransition();

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = trackId ? await updateTrackAction(trackId, values) : await createTrackAction(values);
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
        <Input
          label="Name"
          value={values.name}
          onChange={(e) => {
            const name = e.target.value;
            setValues((current) => ({ ...current, name, ...(trackId ? {} : { slug: slugify(name) }) }));
          }}
          required
        />
        <Input
          label="URL slug"
          value={values.slug}
          onChange={(e) => setValues((current) => ({ ...current, slug: e.target.value }))}
          required
        />
        <Input
          label="Display order"
          type="number"
          min={0}
          max={1000}
          value={values.sortOrder}
          onChange={(e) => setValues((current) => ({ ...current, sortOrder: Number(e.target.value) || 0 }))}
        />
        <label className="flex items-center gap-2 self-end pb-2 text-sm text-foreground">
          <input
            type="checkbox"
            checked={values.isActive}
            onChange={(e) => setValues((current) => ({ ...current, isActive: e.target.checked }))}
            className="h-4 w-4 rounded border-input"
          />
          Shown on the careers site
        </label>
      </div>
      <Input
        label="Description (optional, shown on the track page)"
        value={values.description ?? ""}
        onChange={(e) => setValues((current) => ({ ...current, description: e.target.value }))}
      />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onDone} disabled={isPending}>
          Cancel
        </Button>
        <Button type="submit" size="sm" isLoading={isPending}>
          {trackId ? "Save track" : "Add track"}
        </Button>
      </div>
    </form>
  );
}

/**
 * Staff list of career tracks: add, rename, reorder or hide them. A hidden track keeps its
 * openings but disappears from the careers filters, track pages and the sitemap.
 */
export function TrackManager({ tracks }: { tracks: TrackManagerRow[] }) {
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [adding, setAdding] = React.useState(false);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3 pb-3">
        <CardTitle className="text-base">Career tracks</CardTitle>
        {!adding && (
          <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
            Add track
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {adding && <TrackForm initial={EMPTY_TRACK} onDone={() => setAdding(false)} />}
        {tracks.length === 0 && !adding && <p className="text-sm text-muted-foreground">No tracks yet.</p>}
        <ul className="divide-y divide-border/60">
          {tracks.map((track) => (
            <li key={track.id} className="py-3">
              {editingId === track.id ? (
                <TrackForm
                  trackId={track.id}
                  initial={{
                    name: track.name,
                    slug: track.slug,
                    description: track.description ?? "",
                    sortOrder: track.sortOrder,
                    isActive: track.isActive,
                  }}
                  onDone={() => setEditingId(null)}
                />
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-foreground">
                      {track.name}{" "}
                      {!track.isActive && (
                        <Badge variant="outline" className="ml-1">
                          Hidden
                        </Badge>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      /careers/tracks/{track.slug} · {track.openingsCount} opening{track.openingsCount === 1 ? "" : "s"} · order {track.sortOrder}
                    </p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => setEditingId(track.id)}>
                    Edit
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
