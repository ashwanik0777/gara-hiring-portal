"use client";

import React, { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CalendarCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { LocalDateTime } from "@/features/lifecycle/components/local-date-time";
import { bookInterviewSlotAction } from "../booking-actions";

interface InterviewSlotPickerProps {
  requestId: string;
  /** Open, future options (ISO start times), soonest first. */
  slots: ReadonlyArray<{ id: string; startsAt: string }>;
  durationMinutes: number;
}

/**
 * Candidate picks one offered interview time. If the time was taken or withdrawn in the
 * meantime, a friendly message is shown and the options are refreshed from the server.
 */
export function InterviewSlotPicker({ requestId, slots, durationMinutes }: InterviewSlotPickerProps) {
  const router = useRouter();
  const groupId = useId();
  const [selected, setSelected] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [booked, setBooked] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!selected) {
      setError("Please choose one of the times.");
      return;
    }
    setIsSubmitting(true);
    try {
      const res = await bookInterviewSlotAction({ requestId, slotId: selected });
      if (res.success) {
        setBooked(true);
        router.refresh();
        return;
      }
      setError(res.error);
      if (res.conflict) {
        setSelected("");
        router.refresh();
      }
    } catch {
      setError("We couldn't book that time. Please check your connection and try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (booked) {
    return (
      <p role="status" className="flex items-center gap-2 rounded-xl border border-success/30 bg-success/10 p-3 text-sm text-foreground">
        <CalendarCheck className="h-4 w-4 text-success" aria-hidden="true" /> Your interview is booked. Loading the
        details…
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <fieldset className="space-y-2">
        <legend className="mb-2 text-sm font-medium text-foreground">
          Choose a time ({durationMinutes} minutes, shown in your time zone)
        </legend>
        {slots.map((slot) => {
          const inputId = `${groupId}-${slot.id}`;
          const isSelected = selected === slot.id;
          return (
            <label
              key={slot.id}
              htmlFor={inputId}
              className={cn(
                "flex cursor-pointer items-center gap-3 rounded-xl border p-3 text-sm transition-colors focus-within:ring-2 focus-within:ring-ring",
                isSelected ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40"
              )}
            >
              <input
                id={inputId}
                type="radio"
                name={`${groupId}-slot`}
                value={slot.id}
                checked={isSelected}
                onChange={() => setSelected(slot.id)}
                className="h-4 w-4 accent-primary"
              />
              <LocalDateTime iso={slot.startsAt} />
            </label>
          );
        })}
      </fieldset>

      {error && (
        <p role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> {error}
        </p>
      )}

      <Button type="submit" isLoading={isSubmitting}>
        Book this time
      </Button>
    </form>
  );
}
