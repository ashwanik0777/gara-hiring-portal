"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createOpeningSchema, CreateOpeningInput } from "../schemas";
import { createOpeningAction } from "../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import { OpeningType, WorkplaceType } from "@prisma/client";

export function OpeningForm() {
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<CreateOpeningInput>({
    resolver: zodResolver(createOpeningSchema),
    defaultValues: {
      type: OpeningType.INTERNSHIP,
      workplaceType: WorkplaceType.REMOTE,
      location: "Bengaluru, India",
    },
  });

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTitle = e.target.value;
    setValue("title", newTitle, { shouldValidate: true });
    const generatedSlug = newTitle
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    setValue("slug", generatedSlug, { shouldValidate: true });
  };

  const onSubmit = async (values: CreateOpeningInput) => {
    setIsSubmitting(true);
    setError(null);
    try {
      const result = await createOpeningAction(values);
      if (result.success && result.data) {
        router.push(`/recruitment/openings/${result.data.id}/edit`);
      } else if (!result.success) {
        setError(result.error.message);
      }
    } catch {
      setError("An unexpected error occurred while creating the opening.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card className="max-w-3xl mx-auto shadow-sm">
      <CardHeader>
        <CardTitle>Create New Vacancy / Cohort</CardTitle>
      </CardHeader>

      <form onSubmit={handleSubmit(onSubmit)}>
        <CardContent className="space-y-6">
          {error && (
            <div className="p-3 text-sm rounded-lg bg-destructive/10 text-destructive border border-destructive/20">
              {error}
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

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Input
              label="Department"
              placeholder="e.g. Platform Engineering"
              error={errors.department?.message}
              {...register("department")}
            />

            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-foreground">Program Type</label>
              <select
                className="flex h-10 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                {...register("type")}
              >
                <option value={OpeningType.INTERNSHIP}>Internship (7-Day Evaluation)</option>
                <option value={OpeningType.FULL_TIME}>Full-Time Role</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-foreground">Workplace Model</label>
              <select
                className="flex h-10 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                {...register("workplaceType")}
              >
                <option value={WorkplaceType.REMOTE}>Remote</option>
                <option value={WorkplaceType.HYBRID}>Hybrid</option>
                <option value={WorkplaceType.ON_SITE}>On-Site</option>
              </select>
            </div>
          </div>

          <Input
            label="Location"
            placeholder="e.g. Bengaluru, India / Remote"
            error={errors.location?.message}
            {...register("location")}
          />

          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-foreground">Job Description</label>
            <textarea
              rows={4}
              className="flex w-full rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground shadow-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder="Provide a comprehensive overview of the program or role..."
              {...register("description")}
            />
            {errors.description && (
              <p className="text-xs text-destructive">{errors.description.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-foreground">Requirements & Qualifications</label>
            <textarea
              rows={3}
              className="flex w-full rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground shadow-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder="List required skills, technologies, and academic eligibility..."
              {...register("requirements")}
            />
            {errors.requirements && (
              <p className="text-xs text-destructive">{errors.requirements.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-foreground">Key Responsibilities (Optional)</label>
            <textarea
              rows={3}
              className="flex w-full rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground shadow-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder="Detail expected daily deliverables and project milestones..."
              {...register("responsibilities")}
            />
          </div>
        </CardContent>

        <CardFooter className="flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={() => router.back()}>
            Cancel
          </Button>
          <Button type="submit" isLoading={isSubmitting}>
            Create Draft Opening
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
