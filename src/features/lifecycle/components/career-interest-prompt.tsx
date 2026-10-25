"use client";

import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Compass } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CareerInterest } from "@/types/enums";
import { saveCareerInterestAction } from "../actions";
import { CareerInterestPicker } from "./career-interest-picker";

/**
 * Shown on the candidate dashboard when no career interest is recorded yet (for example
 * after a Google sign-up). Saving refreshes the page so recommendations follow the choice.
 */
export function CareerInterestPrompt() {
  const router = useRouter();
  const [value, setValue] = useState<CareerInterest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!value) {
      setError("Please choose whether you are looking for a job, an internship, or both.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await saveCareerInterestAction({ careerInterest: value });
      if (!result.success) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  };

  return (
    <section
      aria-labelledby="career-interest-prompt-heading"
      className="rounded-2xl border border-primary/30 bg-primary/5 p-4 sm:p-5"
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground"
        >
          <Compass className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <h2 id="career-interest-prompt-heading" className="text-sm font-semibold text-foreground sm:text-base">
            Tell us what you are looking for
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            We use this to recommend openings. You can change it later on your profile.
          </p>
        </div>
      </div>
      <form onSubmit={handleSubmit} className="mt-4 space-y-3" noValidate>
        <CareerInterestPicker
          name="dashboard-career-interest"
          value={value}
          onChange={(next) => {
            setValue(next);
            setError(null);
          }}
          error={error}
        />
        <div className="flex justify-end">
          <Button type="submit" size="sm" isLoading={isPending}>
            Save preference
          </Button>
        </div>
      </form>
    </section>
  );
}
