"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Archive, ArrowRight, ChevronDown, FilePen, Globe, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChoiceTiles,
  FieldGroup,
  FieldLabelRow,
  fieldAddonClass,
  fieldControlBase,
  fieldGroupClass,
  fieldGroupInputClass,
  fieldInputClass,
  fieldOkBorder,
  fieldTextareaClass,
} from "@/components/ui/form-field";
import { cn } from "@/lib/utils";
import { createTrainingProgramAction, updateTrainingProgramAction } from "../actions";
import { toast } from "@/components/ui/toast";

export interface ProgramFormValues {
  title: string;
  slug: string;
  trackId: string;
  summary: string;
  description: string;
  durationWeeks: number;
  feeRupees: string;
  prerequisites: string;
  outcomes: string;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  /** One week per entry; topics one per line in the editor. */
  syllabus: Array<{ week: number; title: string; topics: string[] }>;
}

const EMPTY: ProgramFormValues = {
  title: "",
  slug: "",
  trackId: "",
  summary: "",
  description: "",
  durationWeeks: 8,
  feeRupees: "",
  prerequisites: "",
  outcomes: "",
  status: "DRAFT",
  syllabus: [{ week: 1, title: "", topics: [] }],
};

const STATUSES = [
  { value: "DRAFT" as const, label: "Draft", icon: FilePen },
  { value: "PUBLISHED" as const, label: "Published", icon: Globe },
  { value: "ARCHIVED" as const, label: "Archived", icon: Archive },
];

const inputClass = cn(fieldInputClass, fieldOkBorder);
const textareaClass = cn(fieldTextareaClass, fieldOkBorder);
const groupClass = cn(fieldGroupClass, fieldOkBorder);

function slugify(text: string): string {
  return text.toLowerCase().replace(/&/g, " ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

/**
 * Staff form of an Industrial Training programme. The fee is typed in rupees and stored in paise;
 * the syllabus is a list of weeks. Published programmes appear on /training. On the "new" page
 * the form sits on the page with an action bar pinned to the bottom; in the editor it is a card.
 */
export function TrainingProgramForm({
  programId,
  initial,
  tracks,
}: {
  programId?: string;
  initial?: ProgramFormValues;
  tracks: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const idPrefix = React.useId();
  const fid = (name: string) => `${idPrefix}-${name}`;
  const [values, setValues] = React.useState<ProgramFormValues>(initial ?? EMPTY);
  const [topicsText, setTopicsText] = React.useState<string[]>((initial ?? EMPTY).syllabus.map((week) => week.topics.join("\n")));
  const [error, setError] = React.useState<string | null>(null);
  const [isPending, startTransition] = React.useTransition();
  const isEdit = Boolean(programId);

  const update = <K extends keyof ProgramFormValues>(key: K, value: ProgramFormValues[K]) =>
    setValues((current) => ({ ...current, [key]: value }));

  const setWeek = (index: number, title: string) =>
    update(
      "syllabus",
      values.syllabus.map((week, i) => (i === index ? { ...week, title } : week))
    );

  const addWeek = () => {
    update("syllabus", [...values.syllabus, { week: values.syllabus.length + 1, title: "", topics: [] }]);
    setTopicsText((current) => [...current, ""]);
  };

  const removeWeek = (index: number) => {
    update(
      "syllabus",
      values.syllabus.filter((_, i) => i !== index).map((week, i) => ({ ...week, week: i + 1 }))
    );
    setTopicsText((current) => current.filter((_, i) => i !== index));
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    const payload = {
      ...values,
      syllabus: values.syllabus.map((week, index) => ({
        week: index + 1,
        title: week.title,
        topics: (topicsText[index] ?? "")
          .split("\n")
          .map((topic) => topic.trim())
          .filter(Boolean),
      })),
    };
    startTransition(async () => {
      const result = programId
        ? await updateTrainingProgramAction(programId, payload)
        : await createTrainingProgramAction(payload);
      if (!result.success) {
        setError(result.error);
        return;
      }
      if (programId) {
        toast.success("Programme saved.");
        router.refresh();
      } else {
        router.push(`/admin/training/${result.data.id}`);
      }
    });
  };

  const fields = (
    <>
      {error && (
        <p role="alert" className="rounded-xl border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </p>
      )}

      <FieldGroup name="Basics">
        <div className="space-y-2">
          <FieldLabelRow htmlFor={fid("title")} label="Programme title" />
          <input
            id={fid("title")}
            className={cn(fieldControlBase, fieldOkBorder, "h-12 px-4 text-base font-medium")}
            placeholder="e.g. Full-Stack Web Development"
            value={values.title}
            onChange={(e) => {
              const title = e.target.value;
              setValues((current) => ({ ...current, title, ...(programId ? {} : { slug: slugify(title) }) }));
            }}
            maxLength={150}
            autoComplete="off"
            required
          />
        </div>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <div className="space-y-2">
            <FieldLabelRow htmlFor={fid("slug")} label="URL slug" />
            <div className={groupClass}>
              <span aria-hidden="true" className={cn(fieldAddonClass, "border-r border-border font-mono")}>
                /training/
              </span>
              <input
                id={fid("slug")}
                className={cn(fieldGroupInputClass, "font-mono")}
                placeholder="full-stack-web-development"
                value={values.slug}
                onChange={(e) => update("slug", e.target.value)}
                maxLength={120}
                spellCheck={false}
                autoComplete="off"
                required
              />
            </div>
          </div>
          <div className="space-y-2">
            <FieldLabelRow htmlFor={fid("track")} label="Track" optional />
            <div className="relative">
              <select
                id={fid("track")}
                className={cn(inputClass, "appearance-none pr-10")}
                value={values.trackId}
                onChange={(e) => update("trackId", e.target.value)}
              >
                <option value="">No track</option>
                {tracks.map((track) => (
                  <option key={track.id} value={track.id}>
                    {track.name}
                  </option>
                ))}
              </select>
              <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[3fr_2fr_2fr]">
          <ChoiceTiles
            legend="Status"
            options={STATUSES}
            columns="grid-cols-3"
            inputProps={(value) => ({
              name: fid("status"),
              checked: values.status === value,
              onChange: () => update("status", value),
            })}
          />
          <div className="space-y-2">
            <FieldLabelRow htmlFor={fid("fee")} label="Fee" />
            <div className={groupClass}>
              <span aria-hidden="true" className={cn(fieldAddonClass, "border-r border-border text-sm font-semibold")}>
                ₹
              </span>
              <input
                id={fid("fee")}
                className={fieldGroupInputClass}
                inputMode="decimal"
                placeholder="4999"
                value={values.feeRupees}
                onChange={(e) => update("feeRupees", e.target.value)}
                required
              />
            </div>
          </div>
          <div className="space-y-2">
            <FieldLabelRow htmlFor={fid("duration")} label="Duration" />
            <div className={groupClass}>
              <input
                id={fid("duration")}
                className={fieldGroupInputClass}
                type="number"
                min={1}
                max={104}
                value={values.durationWeeks}
                onChange={(e) => update("durationWeeks", Number(e.target.value) || 1)}
                required
              />
              <span aria-hidden="true" className={cn(fieldAddonClass, "border-l border-border")}>
                weeks
              </span>
            </div>
          </div>
        </div>
      </FieldGroup>

      <FieldGroup name="Programme content">
        <div className="space-y-2">
          <FieldLabelRow htmlFor={fid("summary")} label="Summary" count={values.summary.length} max={300} />
          <textarea
            id={fid("summary")}
            rows={2}
            maxLength={300}
            className={textareaClass}
            placeholder="One or two sentences for the programme card"
            value={values.summary}
            onChange={(e) => update("summary", e.target.value)}
            required
          />
        </div>
        <div className="space-y-2">
          <FieldLabelRow htmlFor={fid("description")} label="Description" />
          <textarea
            id={fid("description")}
            rows={6}
            className={textareaClass}
            placeholder="What the programme covers, how classes run and what students build"
            value={values.description}
            onChange={(e) => update("description", e.target.value)}
            required
          />
        </div>
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <div className="space-y-2">
            <FieldLabelRow htmlFor={fid("prerequisites")} label="Prerequisites" optional />
            <textarea
              id={fid("prerequisites")}
              rows={4}
              maxLength={2000}
              className={textareaClass}
              placeholder="e.g. Basic HTML and a laptop"
              value={values.prerequisites}
              onChange={(e) => update("prerequisites", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <FieldLabelRow htmlFor={fid("outcomes")} label="Learning outcomes" optional />
            <textarea
              id={fid("outcomes")}
              rows={4}
              maxLength={2000}
              className={textareaClass}
              placeholder="What students will be able to do"
              value={values.outcomes}
              onChange={(e) => update("outcomes", e.target.value)}
            />
          </div>
        </div>
      </FieldGroup>

      <FieldGroup name="Weekly syllabus">
        <ol className="space-y-3" aria-label="Weeks">
          {values.syllabus.map((week, index) => (
            <li key={index} className="rounded-xl border border-border bg-muted/20 p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <span className="rounded-lg bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">Week {index + 1}</span>
                <button
                  type="button"
                  onClick={() => removeWeek(index)}
                  aria-label={`Remove week ${index + 1}`}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-[2fr_3fr]">
                <div className="space-y-2">
                  <FieldLabelRow htmlFor={fid(`week-${index}-title`)} label={`Week ${index + 1} title`} />
                  <input
                    id={fid(`week-${index}-title`)}
                    className={inputClass}
                    placeholder="e.g. Foundations"
                    value={week.title}
                    onChange={(e) => setWeek(index, e.target.value)}
                    maxLength={120}
                  />
                </div>
                <div className="space-y-2">
                  <FieldLabelRow htmlFor={fid(`week-${index}-topics`)} label={`Week ${index + 1} topics`} />
                  <textarea
                    id={fid(`week-${index}-topics`)}
                    rows={3}
                    className={textareaClass}
                    placeholder="One topic per line"
                    value={topicsText[index] ?? ""}
                    onChange={(e) => setTopicsText((current) => current.map((text, i) => (i === index ? e.target.value : text)))}
                  />
                </div>
              </div>
            </li>
          ))}
        </ol>
        <button
          type="button"
          onClick={addWeek}
          className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border text-sm font-medium text-muted-foreground transition-colors hover:border-primary/50 hover:bg-primary/5 hover:text-primary focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/15"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Add week
        </button>
      </FieldGroup>
    </>
  );

  const submitButton = (
    <Button type="submit" isLoading={isPending} className="h-11 gap-2 rounded-xl px-5">
      {isEdit ? "Save programme" : "Create programme"}
      {!isEdit && !isPending && <ArrowRight className="h-4 w-4" aria-hidden="true" />}
    </Button>
  );

  if (isEdit) {
    return (
      <Card className="w-full rounded-2xl shadow-sm">
        <CardHeader className="px-6 py-5 sm:px-8">
          <CardTitle className="text-base">Programme details</CardTitle>
        </CardHeader>
        <form onSubmit={submit}>
          <div className="space-y-7 p-6 sm:p-8">{fields}</div>
          <div className="flex justify-end border-t border-border/60 px-6 py-4 sm:px-8">{submitButton}</div>
        </form>
      </Card>
    );
  }

  // New programme page: the action bar is pinned to the very bottom edge of the portal's scroll
  // area, full width; its negative offsets cancel the shell <main> padding (p-4 sm:p-6 lg:p-8).
  return (
    <form onSubmit={submit} className="w-full">
      <div className="space-y-7">{fields}</div>
      <div className="sticky -bottom-4 z-10 -mx-4 -mb-4 mt-10 border-t border-border/70 bg-card/95 px-4 py-4 backdrop-blur-sm sm:-bottom-6 sm:-mx-6 sm:-mb-6 sm:px-6 lg:-bottom-8 lg:-mx-8 lg:-mb-8 lg:px-8">
        {/* pr-14 keeps the buttons clear of the site-wide floating help buttons (bottom-right). */}
        <div className="flex flex-col-reverse gap-3 pr-14 sm:flex-row sm:items-center sm:justify-end">
          <Link
            href="/admin/training"
            className="inline-flex h-11 items-center justify-center rounded-xl border border-border bg-background px-5 text-sm font-medium text-foreground shadow-xs transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/15"
          >
            Cancel
          </Link>
          {submitButton}
        </div>
      </div>
    </form>
  );
}
