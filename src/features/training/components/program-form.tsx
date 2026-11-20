"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { createTrainingProgramAction, updateTrainingProgramAction } from "../actions";

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

const fieldClass =
  "flex w-full rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function slugify(text: string): string {
  return text.toLowerCase().replace(/&/g, " ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

/**
 * Staff form of an Industrial Training programme. The fee is typed in rupees and stored in paise;
 * the syllabus is a list of weeks. Published programmes appear on /training.
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
  const [values, setValues] = React.useState<ProgramFormValues>(initial ?? EMPTY);
  const [topicsText, setTopicsText] = React.useState<string[]>((initial ?? EMPTY).syllabus.map((week) => week.topics.join("\n")));
  const [error, setError] = React.useState<string | null>(null);
  const [saved, setSaved] = React.useState(false);
  const [isPending, startTransition] = React.useTransition();

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
    setSaved(false);
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
        setSaved(true);
        router.refresh();
      } else {
        router.push(`/admin/training/${result.data.id}`);
      }
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{programId ? "Programme details" : "New Industrial Training programme"}</CardTitle>
      </CardHeader>
      <form onSubmit={submit}>
        <CardContent className="space-y-6">
          {error && (
            <p role="alert" className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </p>
          )}
          {saved && (
            <p role="status" className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:text-emerald-300">
              Programme saved.
            </p>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            <Input
              label="Title *"
              value={values.title}
              onChange={(e) => {
                const title = e.target.value;
                setValues((current) => ({ ...current, title, ...(programId ? {} : { slug: slugify(title) }) }));
              }}
              maxLength={150}
              required
            />
            <Input label="URL slug *" value={values.slug} onChange={(e) => update("slug", e.target.value)} maxLength={120} required />
            <div className="space-y-1.5">
              <label htmlFor="training-track" className="block text-xs font-semibold text-foreground">
                Track
              </label>
              <select id="training-track" className={`${fieldClass} h-10`} value={values.trackId} onChange={(e) => update("trackId", e.target.value)}>
                <option value="">No track</option>
                {tracks.map((track) => (
                  <option key={track.id} value={track.id}>
                    {track.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="training-status" className="block text-xs font-semibold text-foreground">
                Status
              </label>
              <select
                id="training-status"
                className={`${fieldClass} h-10`}
                value={values.status}
                onChange={(e) => update("status", e.target.value as ProgramFormValues["status"])}
              >
                <option value="DRAFT">Draft (not shown)</option>
                <option value="PUBLISHED">Published on /training</option>
                <option value="ARCHIVED">Archived</option>
              </select>
            </div>
            <Input
              label="Fee in rupees *"
              inputMode="decimal"
              value={values.feeRupees}
              onChange={(e) => update("feeRupees", e.target.value)}
              placeholder="e.g. 4999"
              required
            />
            <Input
              label="Duration in weeks *"
              type="number"
              min={1}
              max={104}
              value={values.durationWeeks}
              onChange={(e) => update("durationWeeks", Number(e.target.value) || 1)}
              required
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="training-summary" className="block text-xs font-semibold text-foreground">
              Summary * (shown on the programme card)
            </label>
            <textarea id="training-summary" rows={2} maxLength={300} className={fieldClass} value={values.summary} onChange={(e) => update("summary", e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="training-description" className="block text-xs font-semibold text-foreground">
              Description *
            </label>
            <textarea id="training-description" rows={5} className={fieldClass} value={values.description} onChange={(e) => update("description", e.target.value)} required />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label htmlFor="training-prerequisites" className="block text-xs font-semibold text-foreground">
                Prerequisites
              </label>
              <textarea id="training-prerequisites" rows={3} className={fieldClass} value={values.prerequisites} onChange={(e) => update("prerequisites", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="training-outcomes" className="block text-xs font-semibold text-foreground">
                What students will be able to do
              </label>
              <textarea id="training-outcomes" rows={3} className={fieldClass} value={values.outcomes} onChange={(e) => update("outcomes", e.target.value)} />
            </div>
          </div>

          <fieldset className="space-y-3">
            <legend className="text-sm font-semibold text-foreground">Weekly syllabus</legend>
            {values.syllabus.map((week, index) => (
              <div key={index} className="grid grid-cols-1 lg:grid-cols-12 gap-3 rounded-md border border-border/70 p-3">
                <div className="lg:col-span-4">
                  <Input label={`Week ${index + 1} title`} value={week.title} onChange={(e) => setWeek(index, e.target.value)} maxLength={120} />
                </div>
                <div className="lg:col-span-7 space-y-1.5">
                  <label htmlFor={`training-week-${index}-topics`} className="block text-xs font-semibold text-foreground">
                    Topics (one per line)
                  </label>
                  <textarea
                    id={`training-week-${index}-topics`}
                    rows={3}
                    className={fieldClass}
                    value={topicsText[index] ?? ""}
                    onChange={(e) => setTopicsText((current) => current.map((text, i) => (i === index ? e.target.value : text)))}
                  />
                </div>
                <div className="lg:col-span-1 flex items-end">
                  <Button type="button" variant="ghost" size="sm" onClick={() => removeWeek(index)} aria-label={`Remove week ${index + 1}`}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={addWeek} className="gap-1.5">
              <Plus className="h-4 w-4" /> Add week
            </Button>
          </fieldset>
        </CardContent>
        <CardFooter className="flex justify-end">
          <Button type="submit" isLoading={isPending}>
            {programId ? "Save programme" : "Create programme"}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
