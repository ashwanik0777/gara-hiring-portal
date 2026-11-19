"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createOpeningSchema, CreateOpeningInput } from "../schemas";
import { createOpeningAction, updateOpeningAction } from "../actions";
import { MAX_SKILLS, normalizeSkills } from "../listing";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import { OpeningType, WorkplaceType } from "@/types/enums";

export interface OpeningFormTrackOption {
  id: string;
  name: string;
  isActive: boolean;
}

interface OpeningFormProps {
  /**
   * Base path of the openings workspace the user is in. After creation the user is sent
   * to `${basePath}/{id}/edit`, so sub-admins stay inside their own portal.
   */
  basePath?: "/admin/openings" | "/subadmin/openings";
  /** Tracks staff can choose from (active ones, plus the opening's current track). */
  tracks?: OpeningFormTrackOption[];
  /** Edit an existing opening instead of creating one. */
  opening?: { id: string; values: CreateOpeningInput };
}

const selectClass =
  "flex h-10 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const textareaClass =
  "flex w-full rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground shadow-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function FieldError({ message }: { message?: string }) {
  return message ? <p className="text-xs text-destructive">{message}</p> : null;
}

export function OpeningForm({ basePath = "/admin/openings", tracks = [], opening }: OpeningFormProps) {
  const router = useRouter();
  const isEdit = Boolean(opening);
  const [error, setError] = React.useState<string | null>(null);
  const [saved, setSaved] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [skillsText, setSkillsText] = React.useState((opening?.values.skills ?? []).join(", "));

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<CreateOpeningInput>({
    resolver: zodResolver(createOpeningSchema),
    defaultValues: opening?.values ?? {
      type: OpeningType.INTERNSHIP,
      workplaceType: WorkplaceType.REMOTE,
      skills: [],
    },
  });

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isEdit) return; // An existing slug is a public URL; it changes only on purpose.
    const newTitle = e.target.value;
    setValue("title", newTitle, { shouldValidate: true });
    const generatedSlug = newTitle
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    setValue("slug", generatedSlug, { shouldValidate: true });
  };

  const handleSkillsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSkillsText(e.target.value);
    setValue("skills", normalizeSkills(e.target.value), { shouldValidate: true });
  };

  const onSubmit = async (values: CreateOpeningInput) => {
    setIsSubmitting(true);
    setError(null);
    setSaved(false);
    try {
      if (opening) {
        const result = await updateOpeningAction(opening.id, values);
        if (result.success) {
          setSaved(true);
          router.refresh();
        } else {
          setError(result.error);
        }
      } else {
        const result = await createOpeningAction(values);
        if (result.success) {
          router.push(`${basePath}/${result.data.id}/edit`);
        } else {
          setError(result.error);
        }
      }
    } catch {
      setError(isEdit ? "An unexpected error occurred while saving the opening." : "An unexpected error occurred while creating the opening.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card className="w-full shadow-sm">
      <CardHeader>
        <CardTitle>{isEdit ? "Opening details" : "Create New Vacancy / Cohort"}</CardTitle>
      </CardHeader>

      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        <CardContent className="space-y-6">
          {error && (
            <div role="alert" className="p-3 text-sm rounded-lg bg-destructive/10 text-destructive border border-destructive/20">
              {error}
            </div>
          )}
          {saved && (
            <div role="status" className="p-3 text-sm rounded-lg bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20">
              Opening details saved.
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Opening Title"
              placeholder="e.g. Software Engineering Intern"
              error={errors.title?.message}
              {...register("title", {
                onChange: handleTitleChange,
              })}
            />

            <Input
              label="URL Slug"
              placeholder="e.g. software-engineering-intern"
              error={errors.slug?.message}
              {...register("slug")}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            <Input
              label="Department"
              placeholder="e.g. Platform Engineering"
              error={errors.department?.message}
              {...register("department")}
            />

            <div className="space-y-1.5">
              <label htmlFor="opening-form-program-type" className="block text-sm font-medium text-foreground">Program Type</label>
              <select id="opening-form-program-type" className={selectClass} {...register("type")}>
                <option value={OpeningType.INTERNSHIP}>Internship (7-Working-Day Evaluation)</option>
                <option value={OpeningType.FULL_TIME}>Full-Time Role</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="opening-form-workplace-model" className="block text-sm font-medium text-foreground">Workplace Model</label>
              <select id="opening-form-workplace-model" className={selectClass} {...register("workplaceType")}>
                <option value={WorkplaceType.REMOTE}>Remote</option>
                <option value={WorkplaceType.HYBRID}>Hybrid</option>
                <option value={WorkplaceType.ON_SITE}>On-Site</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="opening-form-track" className="block text-sm font-medium text-foreground">Track</label>
              <select id="opening-form-track" className={selectClass} {...register("trackId")}>
                <option value="">No track</option>
                {tracks.map((track) => (
                  <option key={track.id} value={track.id}>
                    {track.name}
                    {track.isActive ? "" : " (hidden)"}
                  </option>
                ))}
              </select>
              <FieldError message={errors.trackId?.message} />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Location"
              placeholder="e.g. Bengaluru, India / Remote"
              error={errors.location?.message}
              {...register("location")}
            />
            <Input
              label="Duration (optional)"
              placeholder="e.g. 3 months, extendable"
              error={errors.durationText?.message}
              {...register("durationText")}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            <Input
              label="Last date to apply (optional)"
              type="date"
              error={errors.applyDeadline?.message}
              {...register("applyDeadline")}
            />
            <Input
              label="Number of positions (optional)"
              type="number"
              min={1}
              max={1000}
              inputMode="numeric"
              error={errors.openingsCount?.message}
              {...register("openingsCount", {
                setValueAs: (value: unknown) => (value === "" || value == null ? null : Number(value)),
              })}
            />
            <Input
              label={`Skills (optional, comma-separated, up to ${MAX_SKILLS})`}
              placeholder="e.g. React, TypeScript, SQL"
              value={skillsText}
              onChange={handleSkillsChange}
              error={errors.skills?.message ?? errors.skills?.[0]?.message}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label htmlFor="opening-form-summary" className="block text-sm font-medium text-foreground">Card summary (optional)</label>
              <textarea id="opening-form-summary" rows={2} className={textareaClass} placeholder="One or two sentences shown on the careers listing." {...register("summary")} />
              <FieldError message={errors.summary?.message} />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="opening-form-stipend" className="block text-sm font-medium text-foreground">Stipend / pay policy (optional)</label>
              <textarea id="opening-form-stipend" rows={2} className={textareaClass} placeholder="As decided for this opening, e.g. the stipend terms." {...register("stipendPolicyText")} />
              <FieldError message={errors.stipendPolicyText?.message} />
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="opening-form-eligibility" className="block text-sm font-medium text-foreground">Eligibility (optional)</label>
            <textarea id="opening-form-eligibility" rows={2} className={textareaClass} placeholder="e.g. years of study and branches that can apply" {...register("eligibility")} />
            <FieldError message={errors.eligibility?.message} />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="opening-form-job-description" className="block text-sm font-medium text-foreground">Job Description</label>
            <textarea
              id="opening-form-job-description"
              rows={4}
              className={textareaClass}
              placeholder="Provide a comprehensive overview of the program or role..."
              {...register("description")}
            />
            <FieldError message={errors.description?.message} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label htmlFor="opening-form-requirements-qualifications" className="block text-sm font-medium text-foreground">Requirements & Qualifications</label>
              <textarea
                id="opening-form-requirements-qualifications"
                rows={4}
                className={textareaClass}
                placeholder="List required skills, technologies, and academic eligibility..."
                {...register("requirements")}
              />
              <FieldError message={errors.requirements?.message} />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="opening-form-key-responsibilities" className="block text-sm font-medium text-foreground">Key Responsibilities (Optional)</label>
              <textarea
                id="opening-form-key-responsibilities"
                rows={4}
                className={textareaClass}
                placeholder="Detail expected daily deliverables and project milestones..."
                {...register("responsibilities")}
              />
            </div>
          </div>
        </CardContent>

        <CardFooter className="flex justify-end gap-3">
          {!isEdit && (
            <Button type="button" variant="outline" onClick={() => router.back()}>
              Cancel
            </Button>
          )}
          <Button type="submit" isLoading={isSubmitting}>
            {isEdit ? "Save details" : "Create Draft Opening"}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
