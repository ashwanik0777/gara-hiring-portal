"use client";

import React, { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CalendarClock, CalendarRange } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LocalDateTime } from "@/features/lifecycle/components/local-date-time";
import { cancelInterviewBookingRequestAction } from "../booking-actions";
import type { BookingSlotView, StaffBookingRequestView } from "../types";

/** Status badge for a booking request (pending requests with no future option say so). */
export function BookingRequestStatusBadge({
  request,
}: {
  request: Pick<StaffBookingRequestView, "status" | "noTimesLeft">;
}) {
  if (request.status === "BOOKED") return <Badge variant="success">Booked by candidate</Badge>;
  if (request.status === "CANCELLED") return <Badge variant="outline">Withdrawn</Badge>;
  if (request.noTimesLeft) return <Badge variant="destructive">No times left</Badge>;
  return <Badge variant="warning">Waiting for candidate</Badge>;
}

function slotLabel(slot: BookingSlotView): string {
  if (slot.status === "BOOKED") return "Booked";
  if (slot.status === "RELEASED") return "Released";
  return slot.isPast ? "Passed" : "Open";
}

function CancelRequestForm({ requestId, onDone }: { requestId: string; onDone: () => void }) {
  const router = useRouter();
  const fieldId = useId();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (reason.trim().length < 3) {
      setError("Please give a short reason.");
      return;
    }
    setIsSubmitting(true);
    try {
      const res = await cancelInterviewBookingRequestAction({ requestId, reason: reason.trim() });
      if (!res.success) {
        setError(res.fieldErrors?.reason ?? res.error);
        router.refresh();
      } else {
        onDone();
        router.refresh();
      }
    } catch {
      setError("We couldn't cancel the request. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="mt-3 space-y-2 rounded-lg border border-border/60 bg-muted/30 p-3">
      <label htmlFor={fieldId} className="block text-xs font-medium text-foreground">
        Reason (shared with the candidate)
      </label>
      <textarea
        id={fieldId}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        maxLength={500}
        rows={2}
        className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      {error && (
        <p role="alert" className="flex items-center gap-1.5 text-xs text-destructive">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> {error}
        </p>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onDone} disabled={isSubmitting}>
          Keep request
        </Button>
        <Button type="submit" variant="destructive" size="sm" isLoading={isSubmitting}>
          Withdraw times
        </Button>
      </div>
    </form>
  );
}

function BookingRequestItem({ request }: { request: StaffBookingRequestView }) {
  const [cancelling, setCancelling] = useState(false);

  return (
    <li className="rounded-xl border border-border bg-card/60 p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-foreground">
              Round {request.roundNumber}: {request.roundName}
            </span>
            <BookingRequestStatusBadge request={request} />
          </div>
          <p className="text-xs text-muted-foreground">
            {request.durationMinutes} min
            {request.interviewerName ? ` · Interviewer: ${request.interviewerName}` : " · No interviewer assigned"}
            {" · "}Sent <LocalDateTime iso={request.createdAt} />
          </p>
        </div>
        {request.canCancel && !cancelling && (
          <Button type="button" variant="outline" size="sm" onClick={() => setCancelling(true)}>
            Withdraw times
          </Button>
        )}
      </div>

      {request.bookedInterview ? (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-foreground">
          <CalendarClock className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
          Booked for <LocalDateTime iso={request.bookedInterview.scheduledAt} /> (interview{" "}
          {request.bookedInterview.status.toLowerCase()})
        </p>
      ) : request.noTimesLeft ? (
        <p className="mt-2 text-xs text-muted-foreground">
          Every offered time has passed without a booking. Withdraw this request and offer new times, or
          contact the candidate.
        </p>
      ) : null}

      <ul className="mt-3 flex flex-wrap gap-2" aria-label="Offered times">
        {request.slots.map((slot) => (
          <li
            key={slot.id}
            className={
              slot.status === "BOOKED"
                ? "rounded-full border border-success/40 bg-success/10 px-2.5 py-1 text-[11px] text-foreground"
                : "rounded-full border border-border/70 px-2.5 py-1 text-[11px] text-muted-foreground"
            }
          >
            <LocalDateTime iso={slot.startsAt} /> · {slotLabel(slot)}
          </li>
        ))}
      </ul>

      {cancelling && <CancelRequestForm requestId={request.id} onDone={() => setCancelling(false)} />}
    </li>
  );
}

/** Booking requests of one application, with their status and a withdraw option. */
export function BookingRequestList({ requests }: { requests: StaffBookingRequestView[] }) {
  return (
    <Card className="border-border shadow-xs">
      <CardHeader className="pb-3 border-b border-border/50">
        <CardTitle className="text-base flex items-center gap-2">
          <CalendarRange className="h-4 w-4 text-primary" aria-hidden="true" /> Times offered to the candidate
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-4">
        {requests.length === 0 ? (
          <p className="py-2 text-center text-xs italic text-muted-foreground">
            No interview times have been offered for this application yet.
          </p>
        ) : (
          <ul className="space-y-3">
            {requests.map((request) => (
              <BookingRequestItem key={request.id} request={request} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
