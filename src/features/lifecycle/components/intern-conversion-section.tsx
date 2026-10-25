import React from "react";
import { BadgeCheck, CalendarClock, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ConversionOfferResponse } from "@/features/employees/components/conversion-offer-response";
import { REVIEW_OUTCOME_LABELS, type ReviewOutcome } from "@/features/employees/conversion-rules";
import { getOwnConversionStatus } from "../services/self-service-dashboard-service";
import { EmptyHint, formatCalendarDate, SectionCard } from "./self-service-ui";
import { EMPLOYEE_STATUS_LABELS } from "./hr-self-service-sections";

/** How each decided outcome is described to the intern (never the internal notes). */
const OUTCOME_COPY: Record<ReviewOutcome, string> = {
  CONVERT: "Your review recommended a full-time role.",
  EXTEND: "Your internship has been extended.",
  END_INTERNSHIP: "Your review concluded that the internship will end.",
};

/**
 * Intern progress review in the intern workspace: next review date, a pending full-time
 * offer with Accept / Decline, an accepted offer waiting for its effective date, and the
 * summary HR chose to share. Reads only the signed-in intern's own reviews.
 */
export async function InternConversionSection({ userId }: { userId: string }) {
  const status = await getOwnConversionStatus(userId);
  const { nextReview, pendingOffer, acceptedOffer, latestDecision } = status;
  const nothingYet = !nextReview && !pendingOffer && !acceptedOffer && !latestDecision;

  return (
    <SectionCard
      id="progress-review"
      title="Progress review"
      icon={<CalendarClock className="h-4 w-4" />}
      description="HR reviews your internship and decides on a full-time role, an extension or its end."
    >
      {nothingYet ? (
        <EmptyHint
          title="No progress review scheduled"
          description="HR schedules your progress review when you join. It will appear here."
        />
      ) : (
        <div className="space-y-4 text-xs">
          {pendingOffer && (
            <div className="space-y-3 rounded-xl border border-primary/40 bg-primary/5 p-4">
              <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Sparkles className="h-4 w-4 text-primary" aria-hidden="true" /> Full-time offer
              </p>
              <dl className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <div>
                  <dt className="text-muted-foreground">Role</dt>
                  <dd className="font-semibold text-foreground">{pendingOffer.proposedDesignation}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Department</dt>
                  <dd className="font-semibold text-foreground">{pendingOffer.proposedDepartment}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Starts on</dt>
                  <dd className="font-semibold text-foreground">{formatCalendarDate(pendingOffer.effectiveDate)}</dd>
                </div>
                {pendingOffer.initialStatus && (
                  <div>
                    <dt className="text-muted-foreground">Starting status</dt>
                    <dd className="font-semibold text-foreground">{EMPLOYEE_STATUS_LABELS[pendingOffer.initialStatus]}</dd>
                  </div>
                )}
              </dl>
              {pendingOffer.sharedSummary && (
                <p className="whitespace-pre-wrap text-muted-foreground">{pendingOffer.sharedSummary}</p>
              )}
              <ConversionOfferResponse
                reviewId={pendingOffer.reviewId}
                proposedDesignation={pendingOffer.proposedDesignation}
                effectiveDateLabel={formatCalendarDate(pendingOffer.effectiveDate)}
              />
            </div>
          )}

          {acceptedOffer && (
            <p className="flex items-start gap-2 rounded-xl border border-success/30 bg-success/10 p-3 text-foreground">
              <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden="true" />
              <span>
                You accepted the full-time offer. You become {acceptedOffer.proposedDesignation}
                {` (${acceptedOffer.proposedDepartment})`} on {formatCalendarDate(acceptedOffer.effectiveDate)}.
              </span>
            </p>
          )}

          {nextReview && (
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border/60 bg-muted/30 p-3">
              <span className="text-muted-foreground">Next review</span>
              <span className="font-semibold text-foreground">{formatCalendarDate(nextReview.scheduledFor)}</span>
              <Badge variant="outline">after {nextReview.reviewPeriodMonths} months</Badge>
            </div>
          )}

          {latestDecision && !pendingOffer && (
            <div className="space-y-1 rounded-xl border border-border/60 p-3">
              <p className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-foreground">Latest review</span>
                <Badge variant="secondary">{REVIEW_OUTCOME_LABELS[latestDecision.outcome]}</Badge>
              </p>
              <p className="text-muted-foreground">
                {latestDecision.outcome === "CONVERT" && latestDecision.offerStatus === "DECLINED"
                  ? "You declined the full-time offer."
                  : OUTCOME_COPY[latestDecision.outcome]}
              </p>
              {latestDecision.sharedSummary && (
                <p className="whitespace-pre-wrap text-foreground">{latestDecision.sharedSummary}</p>
              )}
            </div>
          )}
        </div>
      )}
    </SectionCard>
  );
}
