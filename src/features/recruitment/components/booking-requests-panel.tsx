import React from "react";
import { ApplicationStatus, Role } from "@prisma/client";
import type { AuthenticatedUser } from "@/lib/auth/guards";
import { ForbiddenError } from "@/lib/errors";
import { ListCardSkeleton } from "@/components/feedback/page-skeletons";
import { interviewBookingService } from "../services/interview-booking-service";
import { INTERVIEW_CLOSED_APPLICATION_STATUSES } from "../schemas";
import { BookingRequestForm } from "./booking-request-form";
import { BookingRequestList } from "./booking-request-list";

interface BookingRequestsPanelProps {
  user: AuthenticatedUser;
  applicationId: string;
  applicationStatus: ApplicationStatus;
  candidateName: string;
  defaultRoundNumber: number;
}

/**
 * Staff self-scheduling panel on the application detail page: offer interview times and
 * follow the requests already sent. Renders nothing for users without access (the service
 * enforces role, canInterviews and record scope).
 */
export async function BookingRequestsPanel({
  user,
  applicationId,
  applicationStatus,
  candidateName,
  defaultRoundNumber,
}: BookingRequestsPanelProps) {
  let requests: Awaited<ReturnType<typeof interviewBookingService.listRequestsForApplication>>;
  let interviewerOptions: Awaited<ReturnType<typeof interviewBookingService.listInterviewerOptions>>;
  try {
    [requests, interviewerOptions] = await Promise.all([
      interviewBookingService.listRequestsForApplication(user, applicationId),
      interviewBookingService.listInterviewerOptions(user),
    ]);
  } catch (error) {
    if (error instanceof ForbiddenError) return null;
    throw error;
  }

  // Same rule as staff scheduling: no new interviews on closed applications.
  const canOfferTimes = !INTERVIEW_CLOSED_APPLICATION_STATUSES.includes(applicationStatus);
  if (!canOfferTimes && requests.length === 0) return null;
  const canAssignOthers = user.roles.includes(Role.ADMIN) || user.roles.includes(Role.HR);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      {canOfferTimes && (
        <BookingRequestForm
          applicationId={applicationId}
          candidateName={candidateName}
          defaultRoundNumber={defaultRoundNumber}
          interviewerOptions={interviewerOptions}
          canAssignOthers={canAssignOthers}
        />
      )}
      <BookingRequestList requests={requests} />
    </div>
  );
}

export function BookingRequestsPanelSkeleton() {
  return (
    <div role="status" aria-label="Loading interview times" className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <ListCardSkeleton rows={3} />
      <ListCardSkeleton rows={2} />
    </div>
  );
}
