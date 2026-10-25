"use client";

import React, { useState } from "react";
import { CalendarPlus } from "lucide-react";
import { cn } from "@/lib/utils";
import { buildInterviewEventText, buildInterviewIcs } from "@/infrastructure/email/ics";

export interface AddToCalendarButtonProps {
  scheduleId: string;
  /** InterviewSchedule.icsSequence, so the file updates an event added from an earlier invite. */
  sequence: number;
  /** ISO start time. */
  startsAt: string;
  durationMinutes: number;
  recipientRole: "CANDIDATE" | "INTERVIEWER";
  roundName: string;
  openingTitle: string;
  candidateName?: string | null;
  meetingLink?: string | null;
  /** Absolute portal URL with the interview details. */
  detailsUrl?: string | null;
  /** Site host for the event UID (same UID as the emailed invite). */
  host: string;
  className?: string;
}

/**
 * Downloads an .ics file for one interview. The file is generated in the browser from
 * fields the page already shows this viewer (no download route, no extra data), using the
 * same escaping RFC 5545 generator and UID as the emailed invite.
 */
export function AddToCalendarButton({ className, ...event }: AddToCalendarButtonProps) {
  const [error, setError] = useState<string | null>(null);

  const handleClick = () => {
    setError(null);
    try {
      const { summary, description } = buildInterviewEventText({
        recipientRole: event.recipientRole,
        roundName: event.roundName,
        openingTitle: event.openingTitle,
        candidateName: event.candidateName,
        durationMinutes: event.durationMinutes,
        meetingLink: event.meetingLink,
        detailsUrl: event.detailsUrl,
      });
      const content = buildInterviewIcs({
        scheduleId: event.scheduleId,
        host: event.host,
        sequence: event.sequence,
        method: "PUBLISH",
        startsAt: event.startsAt,
        durationMinutes: event.durationMinutes,
        summary,
        description,
        meetingLink: event.meetingLink,
      });
      const url = URL.createObjectURL(new Blob([content], { type: "text/calendar;charset=utf-8" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = "interview.ics";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setError("We couldn't create the calendar file. Please add the time manually.");
    }
  };

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={handleClick}
        className={cn(
          "inline-flex h-8 items-center justify-center gap-1.5 rounded-xl border border-border bg-card px-3 text-xs font-medium text-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          className
        )}
      >
        <CalendarPlus className="h-3.5 w-3.5" aria-hidden="true" /> Add to calendar
      </button>
      {error && (
        <span role="alert" className="text-[11px] text-destructive">
          {error}
        </span>
      )}
    </span>
  );
}
