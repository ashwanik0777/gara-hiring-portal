"use client";

import React, { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CalendarRange, CheckCircle2, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { createInterviewBookingRequestAction } from "../booking-actions";
import {
  MAX_BOOKING_SLOTS,
  MIN_BOOKING_SLOTS,
  MIN_BOOKING_SLOT_GAP_MINUTES,
  validateBookingSlotTimes,
} from "../schemas";
import type { InterviewerOption } from "../types";

interface BookingRequestFormProps {
  applicationId: string;
  candidateName: string;
  defaultRoundNumber?: number;
  /** Interviewers this user may assign (HR/Admin: all staff; others: themselves). */
  interviewerOptions: InterviewerOption[];
  /** False for managers and interviewers, who may only assign themselves. */
  canAssignOthers: boolean;
}

const FIELD_CLASS =
  "w-full rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/**
 * Staff form: offer 2-8 interview times; the candidate books one in their portal.
 * Client checks are for convenience only; the server validates everything again.
 */
export function BookingRequestForm({
  applicationId,
  candidateName,
  defaultRoundNumber = 1,
  interviewerOptions,
  canAssignOthers,
}: BookingRequestFormProps) {
  const router = useRouter();
  const formId = useId();
  const [roundNumber, setRoundNumber] = useState(defaultRoundNumber);
  const [roundName, setRoundName] = useState(
    defaultRoundNumber === 1 ? "Technical Evaluation" : `Interview Round ${defaultRoundNumber}`
  );
  const [durationMinutes, setDurationMinutes] = useState(45);
  const [interviewerId, setInterviewerId] = useState("");
  const [meetingLink, setMeetingLink] = useState("");
  const [slots, setSlots] = useState<string[]>(["", ""]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [success, setSuccess] = useState<string | null>(null);

  const updateSlot = (index: number, value: string) => {
    setSlots((current) => current.map((slot, i) => (i === index ? value : slot)));
  };
  const addSlot = () => {
    setSlots((current) => (current.length < MAX_BOOKING_SLOTS ? [...current, ""] : current));
  };
  const removeSlot = (index: number) => {
    setSlots((current) => (current.length > MIN_BOOKING_SLOTS ? current.filter((_, i) => i !== index) : current));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setFieldErrors({});
    setSuccess(null);

    if (slots.some((slot) => slot === "")) {
      setFieldErrors({ slots: "Fill in every time option or remove the empty ones." });
      return;
    }
    // datetime-local values are in the staff member's own time zone.
    const dates = slots.map((slot) => new Date(slot));
    if (dates.some((date) => Number.isNaN(date.getTime()))) {
      setFieldErrors({ slots: "Each time option must be a valid date and time." });
      return;
    }
    const isoSlots = dates.map((date) => date.toISOString());
    const check = validateBookingSlotTimes(isoSlots, new Date());
    if (!check.ok) {
      setFieldErrors({ slots: check.error });
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await createInterviewBookingRequestAction({
        applicationId,
        roundNumber,
        roundName,
        durationMinutes,
        interviewerId: interviewerId || null,
        meetingLink: meetingLink.trim() || null,
        slots: isoSlots,
      });
      if (!res.success) {
        setError(res.error);
        setFieldErrors(res.fieldErrors ?? {});
      } else {
        setSuccess(`Sent ${isoSlots.length} time options to ${candidateName}.`);
        setSlots(["", ""]);
        router.refresh();
      }
    } catch {
      setError("We couldn't send the interview times. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card className="border-border shadow-xs">
      <CardHeader className="pb-3 border-b border-border/50">
        <CardTitle className="text-base flex items-center gap-2">
          <CalendarRange className="h-4 w-4 text-primary" aria-hidden="true" /> Let the candidate choose a time
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Offer {MIN_BOOKING_SLOTS}–{MAX_BOOKING_SLOTS} times at least {MIN_BOOKING_SLOT_GAP_MINUTES} minutes apart.{" "}
          {candidateName} gets an email and books one in their portal; the interview is then scheduled
          automatically with reminders and calendar invites.
        </p>
      </CardHeader>
      <form onSubmit={handleSubmit} noValidate>
        <CardContent className="pt-4 space-y-4">
          {error && (
            <div
              role="alert"
              className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-xs flex items-center gap-2"
            >
              <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{error}</span>
            </div>
          )}
          {success && (
            <div
              role="status"
              className="p-3 rounded-lg bg-success/10 border border-success/20 text-success text-xs flex items-center gap-2"
            >
              <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{success}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label htmlFor={`${formId}-round-number`} className="block text-xs font-medium text-foreground">
                Round Number
              </label>
              <input
                id={`${formId}-round-number`}
                type="number"
                min={1}
                max={10}
                value={roundNumber}
                onChange={(e) => setRoundNumber(Number(e.target.value))}
                className={FIELD_CLASS}
                required
              />
              {fieldErrors.roundNumber && <p className="text-xs text-destructive">{fieldErrors.roundNumber}</p>}
            </div>
            <div className="space-y-1.5">
              <label htmlFor={`${formId}-round-name`} className="block text-xs font-medium text-foreground">
                Round Name
              </label>
              <input
                id={`${formId}-round-name`}
                type="text"
                value={roundName}
                onChange={(e) => setRoundName(e.target.value)}
                className={FIELD_CLASS}
                maxLength={100}
                required
              />
              {fieldErrors.roundName && <p className="text-xs text-destructive">{fieldErrors.roundName}</p>}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label htmlFor={`${formId}-duration`} className="block text-xs font-medium text-foreground">
                Duration (Minutes)
              </label>
              <select
                id={`${formId}-duration`}
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(Number(e.target.value))}
                className={FIELD_CLASS}
              >
                <option value={30}>30 Minutes</option>
                <option value={45}>45 Minutes</option>
                <option value={60}>60 Minutes</option>
                <option value={90}>90 Minutes</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label htmlFor={`${formId}-interviewer`} className="block text-xs font-medium text-foreground">
                Interviewer (optional)
              </label>
              <select
                id={`${formId}-interviewer`}
                value={interviewerId}
                onChange={(e) => setInterviewerId(e.target.value)}
                className={FIELD_CLASS}
              >
                <option value="">Not assigned yet</option>
                {interviewerOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {canAssignOthers ? `${option.name} (${option.email}) — ${option.roles.join(", ")}` : `Me (${option.name})`}
                  </option>
                ))}
              </select>
              {fieldErrors.interviewerId && <p className="text-xs text-destructive">{fieldErrors.interviewerId}</p>}
            </div>
          </div>

          <Input
            id={`${formId}-meeting-link`}
            label="Meeting Link (optional, https)"
            type="url"
            placeholder="https://meet.google.com/xyz-abcd-efg"
            value={meetingLink}
            onChange={(e) => setMeetingLink(e.target.value)}
            error={fieldErrors.meetingLink}
          />

          <fieldset className="space-y-2">
            <legend className="text-xs font-medium text-foreground">Time options (your local time)</legend>
            {slots.map((slot, index) => (
              <div key={index} className="flex items-center gap-2">
                <label htmlFor={`${formId}-slot-${index}`} className="sr-only">
                  Time option {index + 1}
                </label>
                <input
                  id={`${formId}-slot-${index}`}
                  type="datetime-local"
                  value={slot}
                  onChange={(e) => updateSlot(index, e.target.value)}
                  className={FIELD_CLASS}
                  required
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => removeSlot(index)}
                  disabled={slots.length <= MIN_BOOKING_SLOTS}
                  aria-label={`Remove time option ${index + 1}`}
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </Button>
              </div>
            ))}
            {fieldErrors.slots && (
              <p role="alert" className="text-xs text-destructive">
                {fieldErrors.slots}
              </p>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addSlot}
              disabled={slots.length >= MAX_BOOKING_SLOTS}
              iconLeft={<Plus className="h-3.5 w-3.5" aria-hidden="true" />}
            >
              Add time option
            </Button>
          </fieldset>
        </CardContent>
        <CardFooter className="py-3 border-t border-border/50 flex justify-end">
          <Button type="submit" size="sm" isLoading={isSubmitting}>
            Send times to candidate
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
