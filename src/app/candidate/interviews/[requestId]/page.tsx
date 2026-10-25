import React from "react";
import Link from "next/link";
import { z } from "zod";
import { ArrowLeft, ArrowRight, CalendarCheck, CalendarClock, CalendarRange, CalendarX, ExternalLink, Video } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { absoluteUrl, getSiteUrl } from "@/lib/site-url";
import { requirePortalCapability } from "@/features/lifecycle/services/lifecycle-service";
import {
  getOwnInterviewBooking,
  type OwnInterviewBooking,
} from "@/features/lifecycle/services/self-service-dashboard-service";
import { EmptyHint, linkButtonClass, SectionCard, textLinkClass } from "@/features/lifecycle/components/self-service-ui";
import { LocalDateTime } from "@/features/lifecycle/components/local-date-time";
import { InterviewSlotPicker } from "@/features/recruitment/components/interview-slot-picker";
import { AddToCalendarButton } from "@/features/recruitment/components/add-to-calendar-button";

interface CandidateInterviewBookingPageProps {
  params: Promise<{ requestId: string }>;
}

// Next.js 16 Cache Components: Allow runtime data streaming
export const instant = false;

export const metadata = {
  title: "Choose your interview time — Candidate Portal",
  description: "Pick one of the interview times offered by the hiring team.",
};

const RequestIdSchema = z.string().uuid();

function BackToDashboard() {
  return (
    <Link
      href="/candidate/dashboard"
      className="mb-4 inline-flex items-center gap-1.5 rounded-sm text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" /> Back to dashboard
    </Link>
  );
}

function NotAvailable() {
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <BackToDashboard />
      <EmptyHint
        icon={<CalendarX className="h-6 w-6" />}
        title="This interview request isn't available"
        description="The link may be incomplete, or the request belongs to another account. Your current interviews and requests are on your dashboard."
        action={
          <Link href="/candidate/dashboard" className={linkButtonClass("outline")}>
            Go to dashboard
          </Link>
        }
      />
    </div>
  );
}

function BookedInterview({ booking }: { booking: OwnInterviewBooking }) {
  const interview = booking.bookedInterview;
  if (!interview) return null;
  const isOpen = interview.status === "SCHEDULED" || interview.status === "RESCHEDULED";

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-success/30 bg-success/5 p-4">
        <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <CalendarCheck className="h-4 w-4 text-success" aria-hidden="true" />
          {isOpen ? "Your interview is booked" : "Your interview is no longer scheduled"}
        </p>
        <p className="mt-1 text-sm text-foreground">
          <LocalDateTime iso={interview.scheduledAt} /> · {interview.durationMinutes} min
        </p>
        {interview.status === "RESCHEDULED" && (
          <Badge variant="warning" className="mt-2">
            Rescheduled by the hiring team
          </Badge>
        )}
        {interview.status === "CANCELLED" && (
          <p className="mt-2 text-xs text-muted-foreground">
            This interview was cancelled. The hiring team will contact you about next steps.
          </p>
        )}
        {interview.status === "COMPLETED" && (
          <p className="mt-2 text-xs text-muted-foreground">This interview has taken place.</p>
        )}
      </div>

      {isOpen && (
        <div className="flex flex-wrap items-start gap-2">
          {interview.meetingLink ? (
            <a
              href={interview.meetingLink}
              target="_blank"
              rel="noopener noreferrer"
              className={linkButtonClass("outline", "sm")}
            >
              <Video className="h-3.5 w-3.5" aria-hidden="true" /> Join meeting
              <ExternalLink className="h-3 w-3" aria-hidden="true" />
              <span className="sr-only">(opens in a new tab)</span>
            </a>
          ) : (
            <p className="text-xs text-muted-foreground">Joining details will be shared by the hiring team.</p>
          )}
          <AddToCalendarButton
            scheduleId={interview.id}
            sequence={interview.icsSequence}
            startsAt={interview.scheduledAt}
            durationMinutes={interview.durationMinutes}
            recipientRole="CANDIDATE"
            roundName={booking.roundName}
            openingTitle={booking.application.openingTitle}
            meetingLink={interview.meetingLink}
            detailsUrl={absoluteUrl(`/candidate/applications/${booking.application.id}`)}
            host={getSiteUrl()}
          />
        </div>
      )}
      {isOpen && (
        <p className="text-xs text-muted-foreground">
          A confirmation email with a calendar invitation is on its way. You will also get reminders 24 hours and
          1 hour before the interview.
        </p>
      )}
    </div>
  );
}

export default async function CandidateInterviewBookingPage({ params }: CandidateInterviewBookingPageProps) {
  const { requestId } = await params;
  // Candidates (and evaluation-stage users) with active applications; others go to their home.
  const { user } = await requirePortalCapability("applications", {
    callbackPath: `/candidate/interviews/${encodeURIComponent(requestId)}`,
  });

  if (!RequestIdSchema.safeParse(requestId).success) {
    return <NotAvailable />;
  }
  // Ownership is part of the query: other candidates' requests are not found.
  const booking = await getOwnInterviewBooking(user.id, requestId);
  if (!booking) {
    return <NotAvailable />;
  }

  const isPending = booking.status === "PENDING";
  const canChoose = isPending && booking.applicationActive && booking.availableSlots.length > 0;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <BackToDashboard />
        <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
          {booking.status === "BOOKED" ? "Your interview time" : "Choose your interview time"}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Round {booking.roundNumber}: {booking.roundName} · {booking.application.openingTitle} ·{" "}
          <Link href={`/candidate/applications/${booking.application.id}`} className={textLinkClass}>
            {booking.application.referenceCode}
          </Link>
        </p>
      </div>

      <SectionCard
        id="interview-booking"
        title={canChoose ? "Available times" : "Status"}
        icon={canChoose ? <CalendarRange className="h-4 w-4" /> : <CalendarClock className="h-4 w-4" />}
        description={canChoose ? "Times are booked first come, first served." : undefined}
      >
        {canChoose ? (
          <InterviewSlotPicker
            requestId={booking.id}
            slots={booking.availableSlots}
            durationMinutes={booking.durationMinutes}
          />
        ) : booking.status === "BOOKED" ? (
          <BookedInterview booking={booking} />
        ) : booking.status === "CANCELLED" ? (
          <EmptyHint
            icon={<CalendarX className="h-6 w-6" />}
            title="These interview times were withdrawn"
            description="The hiring team will contact you about next steps."
          />
        ) : !booking.applicationActive ? (
          <EmptyHint
            icon={<CalendarX className="h-6 w-6" />}
            title="This interview request is no longer available"
            description="Your application is closed, so no interview can be booked."
          />
        ) : (
          <EmptyHint
            icon={<CalendarClock className="h-6 w-6" />}
            title="No times left"
            description="No times left — the hiring team will contact you."
          />
        )}
      </SectionCard>

      <Link href={`/candidate/applications/${booking.application.id}`} className={linkButtonClass("ghost")}>
        View application <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
      </Link>
    </div>
  );
}
