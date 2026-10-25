import React from "react";
import { Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { JourneyProgress, JourneyStep } from "../services/journey-progress";
import { LocalDateTime } from "./local-date-time";

const STATE_TEXT: Record<JourneyStep["state"], string> = {
  complete: "Completed",
  current: "Current stage",
  stopped: "Stopped at this stage",
  upcoming: "Not reached yet",
};

function StepMarker({ step, index }: { step: JourneyStep; index: number }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 text-xs font-semibold",
        step.state === "complete" && "border-primary bg-primary text-primary-foreground",
        step.state === "current" && "border-primary bg-card text-primary ring-4 ring-primary/15",
        step.state === "stopped" && "border-destructive bg-destructive/10 text-destructive",
        step.state === "upcoming" && "border-border bg-card text-muted-foreground"
      )}
    >
      {step.state === "complete" ? (
        <Check className="h-4 w-4" />
      ) : step.state === "stopped" ? (
        <X className="h-4 w-4" />
      ) : (
        index + 1
      )}
    </span>
  );
}

/**
 * Applied → Screening → Shortlisted → Interview → Evaluation/Offer → Joined, drawn from
 * the application's real status. Vertical on small screens, horizontal from `md`.
 */
export function JourneyStepper({ progress, label }: { progress: JourneyProgress; label: string }) {
  const lastIndex = progress.steps.length - 1;
  return (
    <ol aria-label={label} className="grid grid-cols-1 gap-4 md:grid-cols-6 md:gap-2">
      {progress.steps.map((step, index) => {
        const nextReached = index < lastIndex && progress.steps[index + 1].state !== "upcoming";
        return (
          <li
            key={step.key}
            aria-current={step.state === "current" ? "step" : undefined}
            className="relative flex items-start gap-3 md:flex-col md:items-center md:gap-2 md:text-center"
          >
            {index < lastIndex && (
              <>
                {/* Connector to the next step: vertical on mobile, horizontal on desktop. */}
                <span
                  aria-hidden="true"
                  className={cn(
                    "absolute left-[15px] top-8 h-[calc(100%-1rem)] w-0.5 md:hidden",
                    nextReached ? "bg-primary" : "bg-border"
                  )}
                />
                <span
                  aria-hidden="true"
                  className={cn(
                    "absolute top-[15px] hidden h-0.5 md:block md:left-[calc(50%+1.25rem)] md:right-[calc(-50%+0.75rem)]",
                    nextReached ? "bg-primary" : "bg-border"
                  )}
                />
              </>
            )}
            <StepMarker step={step} index={index} />
            <div className="min-w-0 pt-1 md:pt-0">
              <p
                className={cn(
                  "text-xs font-semibold",
                  step.state === "upcoming" ? "text-muted-foreground" : "text-foreground",
                  step.state === "stopped" && "text-destructive"
                )}
              >
                {step.label}
              </p>
              <p className="text-[11px] text-muted-foreground">
                <span className="sr-only">{STATE_TEXT[step.state]}. </span>
                {step.reachedAt ? (
                  <LocalDateTime iso={step.reachedAt} mode="date" />
                ) : step.state === "current" ? (
                  "In progress"
                ) : (
                  <span aria-hidden="true">—</span>
                )}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
