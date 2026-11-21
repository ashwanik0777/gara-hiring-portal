"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { BookOpen, Briefcase, ExternalLink, Layers, Pencil, Plus } from "lucide-react";
import { createTrackAction, updateTrackAction } from "../actions";
import type { TrackInput } from "../schemas";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export interface TrackManagerRow {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
  openingsCount: number;
  programmesCount: number;
}

const EMPTY_TRACK: TrackInput = { name: "", slug: "", description: "", sortOrder: 0, isActive: true };

const inputClass =
  "h-10 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground shadow-xs outline-none transition-[border-color,box-shadow] placeholder:text-muted-foreground/70 hover:border-foreground/25 focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-primary/15";

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, " ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function FieldLabel({ htmlFor, children, optional }: { htmlFor: string; children: React.ReactNode; optional?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <label htmlFor={htmlFor} className="text-[13px] font-medium text-foreground">
        {children}
        {optional && <span className="sr-only"> (optional)</span>}
      </label>
      {optional && (
        <span aria-hidden="true" className="text-xs text-muted-foreground">
          Optional
        </span>
      )}
    </div>
  );
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
  const idPrefix = React.useId();
  const fid = (name: string) => `${idPrefix}-${name}`;
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
    <form onSubmit={submit} className="space-y-4 rounded-xl border border-border bg-muted/30 p-4 sm:p-5">
      {error && (
        <p role="alert" className="rounded-lg border border-destructive/20 bg-destructive/10 p-2.5 text-xs text-destructive">
          {error}
        </p>
      )}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-[2fr_2fr_1fr]">
        <div className="space-y-2">
          <FieldLabel htmlFor={fid("name")}>Name</FieldLabel>
          <input
            id={fid("name")}
            className={inputClass}
            placeholder="e.g. Data & Analytics"
            value={values.name}
            onChange={(e) => {
              const name = e.target.value;
              setValues((current) => ({ ...current, name, ...(trackId ? {} : { slug: slugify(name) }) }));
            }}
            required
          />
        </div>
        <div className="space-y-2">
          <FieldLabel htmlFor={fid("slug")}>URL slug</FieldLabel>
          <div className="flex h-10 items-stretch overflow-hidden rounded-xl border border-border bg-background shadow-xs transition-[border-color,box-shadow] hover:border-foreground/25 focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/15">
            <span aria-hidden="true" className="flex items-center border-r border-border bg-muted/50 px-2.5 font-mono text-[11px] text-muted-foreground">
              /careers/tracks/
            </span>
            <input
              id={fid("slug")}
              className="min-w-0 flex-1 bg-transparent px-2.5 font-mono text-sm text-foreground outline-none"
              value={values.slug}
              onChange={(e) => setValues((current) => ({ ...current, slug: e.target.value }))}
              spellCheck={false}
              required
            />
          </div>
        </div>
        <div className="space-y-2">
          <FieldLabel htmlFor={fid("order")}>Display order</FieldLabel>
          <input
            id={fid("order")}
            className={inputClass}
            type="number"
            min={0}
            max={1000}
            value={values.sortOrder}
            onChange={(e) => setValues((current) => ({ ...current, sortOrder: Number(e.target.value) || 0 }))}
          />
        </div>
      </div>
      <div className="space-y-2">
        <FieldLabel htmlFor={fid("description")} optional>
          Description
        </FieldLabel>
        <input
          id={fid("description")}
          className={inputClass}
          value={values.description ?? ""}
          onChange={(e) => setValues((current) => ({ ...current, description: e.target.value }))}
        />
      </div>
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
        <label className="inline-flex cursor-pointer items-center gap-2.5 text-sm text-foreground">
          <input
            type="checkbox"
            checked={values.isActive}
            onChange={(e) => setValues((current) => ({ ...current, isActive: e.target.checked }))}
            className="h-4 w-4 rounded border-input accent-primary"
          />
          Show on the careers site
        </label>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onDone} disabled={isPending}>
            Cancel
          </Button>
          <Button type="submit" size="sm" isLoading={isPending}>
            {trackId ? "Save track" : "Add track"}
          </Button>
        </div>
      </div>
    </form>
  );
}

/**
 * Staff list of career tracks: add, rename, reorder or hide them. A hidden track keeps its
 * openings and programmes but disappears from the careers filters, track pages and the sitemap.
 */
export function TrackManager({ tracks }: { tracks: TrackManagerRow[] }) {
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [adding, setAdding] = React.useState(false);

  return (
    <Card className="rounded-2xl shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between gap-3 border-b border-border/60 px-5 py-4 sm:px-6">
        <CardTitle className="flex items-center gap-2 text-base">
          <Layers className="h-4 w-4 text-primary" aria-hidden="true" />
          Career tracks
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold tabular-nums text-muted-foreground">{tracks.length}</span>
        </CardTitle>
        {!adding && (
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setAdding(true)}>
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            Add track
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-3 p-5 sm:p-6">
        {adding && <TrackForm initial={EMPTY_TRACK} onDone={() => setAdding(false)} />}
        {tracks.length === 0 && !adding && <p className="text-sm text-muted-foreground">No tracks yet.</p>}
        {tracks.length > 0 && (
          <ul className="grid grid-cols-1 gap-3">
            {tracks.map((track) =>
              editingId === track.id ? (
                <li key={track.id}>
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
                </li>
              ) : (
                <li
                  key={track.id}
                  className={cn(
                    "flex flex-col gap-3 rounded-xl border border-border bg-background p-4 transition-colors hover:border-primary/40 sm:flex-row sm:items-center sm:justify-between",
                    !track.isActive && "bg-muted/30"
                  )}
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span
                      aria-hidden="true"
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-sm font-bold text-primary"
                    >
                      {track.name.charAt(0).toUpperCase()}
                    </span>
                    <div className="min-w-0 space-y-1">
                      <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-foreground">
                        {track.name}
                        {!track.isActive && (
                          <Badge variant="outline" className="text-[10px]">
                            Hidden
                          </Badge>
                        )}
                      </p>
                      <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <li className="font-mono">/careers/tracks/{track.slug}</li>
                        <li className="inline-flex items-center gap-1">
                          <Briefcase className="h-3 w-3" aria-hidden="true" />
                          {track.openingsCount} opening{track.openingsCount === 1 ? "" : "s"}
                        </li>
                        <li className="inline-flex items-center gap-1">
                          <BookOpen className="h-3 w-3" aria-hidden="true" />
                          {track.programmesCount} programme{track.programmesCount === 1 ? "" : "s"}
                        </li>
                        <li>Order {track.sortOrder}</li>
                      </ul>
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    {track.isActive && (
                      <a
                        href={`/careers/tracks/${track.slug}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 text-xs font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                      >
                        <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                        View
                        <span className="sr-only"> {track.name} page (opens in a new tab)</span>
                      </a>
                    )}
                    <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={() => setEditingId(track.id)}>
                      <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                      Edit
                      <span className="sr-only"> {track.name}</span>
                    </Button>
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
