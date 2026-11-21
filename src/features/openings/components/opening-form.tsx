"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRight, Briefcase, Building2, ChevronDown, Globe, GraduationCap, Repeat2, type LucideIcon } from "lucide-react";
import { createOpeningSchema, CreateOpeningInput } from "../schemas";
import { createOpeningAction, updateOpeningAction } from "../actions";
import { MAX_SKILLS, normalizeSkills } from "../listing";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  ChoiceTiles,
  FieldErrorText,
  FieldGroup,
  FieldLabelRow,
  fieldControlBase,
  fieldErrorBorder,
  fieldInputClass,
  fieldOkBorder,
  fieldTextareaClass,
} from "@/components/ui/form-field";
import { OpeningType, WorkplaceType } from "@/types/enums";
import { toast } from "@/components/ui/toast";

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

const LIMITS = { title: 150, slug: 150, department: 100, location: 150, duration: 80, summary: 300, eligibility: 500, stipend: 300 } as const;

const PROGRAM_TYPES: Array<{ value: OpeningType; label: string; icon: LucideIcon }> = [
  { value: OpeningType.INTERNSHIP, label: "Internship", icon: GraduationCap },
  { value: OpeningType.FULL_TIME, label: "Full-time", icon: Briefcase },
];
const WORKPLACES: Array<{ value: WorkplaceType; label: string; icon: LucideIcon }> = [
  { value: WorkplaceType.REMOTE, label: "Remote", icon: Globe },
  { value: WorkplaceType.HYBRID, label: "Hybrid", icon: Repeat2 },
  { value: WorkplaceType.ON_SITE, label: "On-site", icon: Building2 },
];

export function OpeningForm({ basePath = "/admin/openings", tracks = [], opening }: OpeningFormProps) {
  const router = useRouter();
  const isEdit = Boolean(opening);
  const idPrefix = React.useId();
  const fid = (name: string) => `${idPrefix}-${name}`;
  const errId = (name: string) => `${idPrefix}-${name}-error`;
  const [error, setError] = React.useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [skillsText, setSkillsText] = React.useState((opening?.values.skills ?? []).join(", "));

  const {
    register,
    handleSubmit,
    setValue,
    control,
    formState: { errors },
  } = useForm<CreateOpeningInput>({
    resolver: zodResolver(createOpeningSchema),
    defaultValues: opening?.values ?? {
      type: OpeningType.INTERNSHIP,
      workplaceType: WorkplaceType.REMOTE,
      skills: [],
    },
  });
  const [summary, eligibility, stipend, skills] = useWatch({
    control,
    name: ["summary", "eligibility", "stipendPolicyText", "skills"],
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
    try {
      if (opening) {
        const result = await updateOpeningAction(opening.id, values);
        if (result.success) {
          toast.success("Opening details saved.");
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

  /** Props shared by every text control: id, error state and its error message link. */
  const a11y = (name: string, message: string | undefined) => ({
    id: fid(name),
    "aria-invalid": message ? true : undefined,
    "aria-describedby": message ? errId(name) : undefined,
  });
  const border = (message: string | undefined) => (message ? fieldErrorBorder : fieldOkBorder);
  const skillsError = errors.skills?.message ?? errors.skills?.[0]?.message;
  const skillList = skills ?? [];

  const fields = (
        <>
          {error && (
            <div role="alert" className="rounded-xl border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <FieldGroup name="Basics">
            <div className="space-y-2">
              <FieldLabelRow htmlFor={fid("title")} label="Opening title" />
              <input
                {...a11y("title", errors.title?.message)}
                placeholder="e.g. Software Engineering Intern"
                maxLength={LIMITS.title}
                autoComplete="off"
                className={cn(fieldControlBase, "h-12 px-4 text-base font-medium", border(errors.title?.message))}
                {...register("title", { onChange: handleTitleChange })}
              />
              <FieldErrorText id={errId("title")} message={errors.title?.message} />
            </div>

            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              <div className="space-y-2">
                <FieldLabelRow htmlFor={fid("slug")} label="URL slug" />
                <div
                  className={cn(
                    "flex h-11 items-stretch overflow-hidden rounded-xl border bg-background shadow-xs transition-[border-color,box-shadow] hover:border-foreground/25 focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/15",
                    errors.slug ? "border-destructive focus-within:border-destructive focus-within:ring-destructive/15" : "border-border"
                  )}
                >
                  <span aria-hidden="true" className="flex items-center border-r border-border bg-muted/50 px-3 font-mono text-xs text-muted-foreground">
                    /careers/
                  </span>
                  <input
                    {...a11y("slug", errors.slug?.message)}
                    placeholder="software-engineering-intern"
                    maxLength={LIMITS.slug}
                    autoComplete="off"
                    spellCheck={false}
                    className="min-w-0 flex-1 bg-transparent px-3 font-mono text-sm text-foreground outline-none placeholder:text-muted-foreground/70"
                    {...register("slug")}
                  />
                </div>
                <FieldErrorText id={errId("slug")} message={errors.slug?.message} />
              </div>

              <div className="space-y-2">
                <FieldLabelRow htmlFor={fid("department")} label="Department" />
                <input
                  {...a11y("department", errors.department?.message)}
                  placeholder="e.g. Platform Engineering"
                  maxLength={LIMITS.department}
                  className={cn(fieldInputClass, border(errors.department?.message))}
                  {...register("department")}
                />
                <FieldErrorText id={errId("department")} message={errors.department?.message} />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-5 lg:grid-cols-[2fr_3fr]">
              <ChoiceTiles legend="Program type" options={PROGRAM_TYPES} inputProps={() => register("type")} columns="grid-cols-2" />
              <ChoiceTiles legend="Workplace model" options={WORKPLACES} inputProps={() => register("workplaceType")} columns="grid-cols-3" />
            </div>

            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              <div className="space-y-2">
                <FieldLabelRow htmlFor={fid("location")} label="Location" />
                <input
                  {...a11y("location", errors.location?.message)}
                  placeholder="e.g. Bengaluru, India / Remote"
                  maxLength={LIMITS.location}
                  className={cn(fieldInputClass, border(errors.location?.message))}
                  {...register("location")}
                />
                <FieldErrorText id={errId("location")} message={errors.location?.message} />
              </div>

              <div className="space-y-2">
                <FieldLabelRow htmlFor={fid("track")} label="Track" optional />
                <div className="relative">
                  <select
                    {...a11y("track", errors.trackId?.message)}
                    className={cn(fieldInputClass, "appearance-none pr-10", border(errors.trackId?.message))}
                    {...register("trackId")}
                  >
                    <option value="">No track</option>
                    {tracks.map((track) => (
                      <option key={track.id} value={track.id}>
                        {track.name}
                        {track.isActive ? "" : " (hidden)"}
                      </option>
                    ))}
                  </select>
                  <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                </div>
                <FieldErrorText id={errId("track")} message={errors.trackId?.message} />
              </div>
            </div>
          </FieldGroup>

          <FieldGroup name="Location and timing">
            <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
              <div className="space-y-2">
                <FieldLabelRow htmlFor={fid("duration")} label="Duration" optional />
                <input
                  {...a11y("duration", errors.durationText?.message)}
                  placeholder="e.g. 3 months"
                  maxLength={LIMITS.duration}
                  className={cn(fieldInputClass, border(errors.durationText?.message))}
                  {...register("durationText")}
                />
                <FieldErrorText id={errId("duration")} message={errors.durationText?.message} />
              </div>
              <div className="space-y-2">
                <FieldLabelRow htmlFor={fid("deadline")} label="Last date to apply" optional />
                <input
                  {...a11y("deadline", errors.applyDeadline?.message)}
                  type="date"
                  className={cn(fieldInputClass, border(errors.applyDeadline?.message))}
                  {...register("applyDeadline")}
                />
                <FieldErrorText id={errId("deadline")} message={errors.applyDeadline?.message} />
              </div>
              <div className="space-y-2">
                <FieldLabelRow htmlFor={fid("positions")} label="Number of positions" optional />
                <input
                  {...a11y("positions", errors.openingsCount?.message)}
                  type="number"
                  min={1}
                  max={1000}
                  inputMode="numeric"
                  placeholder="e.g. 5"
                  className={cn(fieldInputClass, border(errors.openingsCount?.message))}
                  {...register("openingsCount", {
                    setValueAs: (value: unknown) => (value === "" || value == null ? null : Number(value)),
                  })}
                />
                <FieldErrorText id={errId("positions")} message={errors.openingsCount?.message} />
              </div>
            </div>
          </FieldGroup>

          <FieldGroup name="Careers listing">
            <div className="space-y-2">
              <FieldLabelRow htmlFor={fid("skills")} label="Skills" optional count={skillList.length} max={MAX_SKILLS} />
              <input
                {...a11y("skills", skillsError)}
                placeholder="React, TypeScript, SQL"
                value={skillsText}
                onChange={handleSkillsChange}
                className={cn(fieldInputClass, border(skillsError))}
              />
              {skillList.length > 0 && (
                <ul className="flex flex-wrap gap-1.5" aria-label="Skills added">
                  {skillList.map((skill, index) => (
                    <li key={`${skill}-${index}`} className="rounded-full border border-primary/20 bg-primary/5 px-2.5 py-1 text-xs font-medium text-primary">
                      {skill}
                    </li>
                  ))}
                </ul>
              )}
              <FieldErrorText id={errId("skills")} message={skillsError} />
            </div>

            <div className="space-y-2">
              <FieldLabelRow htmlFor={fid("summary")} label="Card summary" optional count={summary?.length ?? 0} max={LIMITS.summary} />
              <textarea
                {...a11y("summary", errors.summary?.message)}
                rows={2}
                maxLength={LIMITS.summary}
                placeholder="One or two sentences for the careers listing card"
                className={cn(fieldTextareaClass, border(errors.summary?.message))}
                {...register("summary")}
              />
              <FieldErrorText id={errId("summary")} message={errors.summary?.message} />
            </div>

            <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
              <div className="space-y-2">
                <FieldLabelRow htmlFor={fid("eligibility")} label="Eligibility" optional count={eligibility?.length ?? 0} max={LIMITS.eligibility} />
                <textarea
                  {...a11y("eligibility", errors.eligibility?.message)}
                  rows={3}
                  maxLength={LIMITS.eligibility}
                  placeholder="e.g. Final-year B.Tech students, any branch"
                  className={cn(fieldTextareaClass, border(errors.eligibility?.message))}
                  {...register("eligibility")}
                />
                <FieldErrorText id={errId("eligibility")} message={errors.eligibility?.message} />
              </div>
              <div className="space-y-2">
                <FieldLabelRow htmlFor={fid("stipend")} label="Stipend / pay policy" optional count={stipend?.length ?? 0} max={LIMITS.stipend} />
                <textarea
                  {...a11y("stipend", errors.stipendPolicyText?.message)}
                  rows={3}
                  maxLength={LIMITS.stipend}
                  placeholder="e.g. The stipend terms for this opening"
                  className={cn(fieldTextareaClass, border(errors.stipendPolicyText?.message))}
                  {...register("stipendPolicyText")}
                />
                <FieldErrorText id={errId("stipend")} message={errors.stipendPolicyText?.message} />
              </div>
            </div>
          </FieldGroup>

          <FieldGroup name="Role description">
            <div className="space-y-2">
              <FieldLabelRow htmlFor={fid("description")} label="Job description" />
              <textarea
                {...a11y("description", errors.description?.message)}
                rows={7}
                placeholder="What the role is about, the team, and what the person will work on"
                className={cn(fieldTextareaClass, border(errors.description?.message))}
                {...register("description")}
              />
              <FieldErrorText id={errId("description")} message={errors.description?.message} />
            </div>
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
              <div className="space-y-2">
                <FieldLabelRow htmlFor={fid("requirements")} label="Requirements and qualifications" />
                <textarea
                  {...a11y("requirements", errors.requirements?.message)}
                  rows={5}
                  placeholder="Skills, tools and education the candidate needs"
                  className={cn(fieldTextareaClass, border(errors.requirements?.message))}
                  {...register("requirements")}
                />
                <FieldErrorText id={errId("requirements")} message={errors.requirements?.message} />
              </div>
              <div className="space-y-2">
                <FieldLabelRow htmlFor={fid("responsibilities")} label="Key responsibilities" optional />
                <textarea
                  {...a11y("responsibilities", errors.responsibilities?.message)}
                  rows={5}
                  placeholder="Day-to-day work and deliverables"
                  className={cn(fieldTextareaClass, border(errors.responsibilities?.message))}
                  {...register("responsibilities")}
                />
                <FieldErrorText id={errId("responsibilities")} message={errors.responsibilities?.message} />
              </div>
            </div>
          </FieldGroup>
        </>
  );

  const submitButton = (
    <Button type="submit" isLoading={isSubmitting} className="h-11 gap-2 rounded-xl px-5">
      {isEdit ? "Save details" : "Create draft opening"}
      {!isEdit && !isSubmitting && <ArrowRight className="h-4 w-4" aria-hidden="true" />}
    </Button>
  );

  // Editor: one card among the editor's other cards.
  if (isEdit) {
    return (
      <Card className="w-full rounded-2xl shadow-sm">
        <CardHeader className="px-6 py-5 sm:px-8">
          <CardTitle className="text-base">Opening details</CardTitle>
        </CardHeader>
        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <div className="space-y-7 p-6 sm:p-8">{fields}</div>
          <div className="flex justify-end border-t border-border/60 px-6 py-4 sm:px-8">{submitButton}</div>
        </form>
      </Card>
    );
  }

  // Create page: the form sits on the page itself, and the action bar is pinned to the very
  // bottom edge of the portal's scroll area, full width. Its negative offsets and margins
  // cancel the padding of the shell's <main> (p-4 sm:p-6 lg:p-8); keep them in step.
  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="w-full">
      <div className="space-y-7">{fields}</div>
      <div className="sticky -bottom-4 z-10 -mx-4 -mb-4 mt-10 border-t border-border/70 bg-card/95 px-4 py-4 backdrop-blur-sm sm:-bottom-6 sm:-mx-6 sm:-mb-6 sm:px-6 lg:-bottom-8 lg:-mx-8 lg:-mb-8 lg:px-8">
        {/* pr-14 keeps the buttons clear of the site-wide floating help buttons (bottom-right). */}
        <div className="flex flex-col-reverse gap-3 pr-14 sm:flex-row sm:items-center sm:justify-end">
          <Link
            href={basePath}
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
