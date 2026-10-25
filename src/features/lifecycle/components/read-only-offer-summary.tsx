import React from "react";
import { Briefcase } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { OfferStatus } from "@/types/enums";
import { formatCalendarDate, SectionCard } from "./self-service-ui";

/** Candidate-visible offer fields; the candidate projection never contains staff notes. */
export interface ReadOnlyOfferData {
  status: OfferStatus;
  designation: string;
  department: string;
  location?: string | null;
  expectedJoiningDate: Date | string;
  termsSummary: string;
  decisionAt?: Date | string | null;
}

const STATUS_BADGES: Partial<Record<OfferStatus, { label: string; variant: "success" | "destructive" | "outline" }>> = {
  EXTENDED: { label: "Not answered", variant: "outline" },
  ACCEPTED: { label: "Accepted", variant: "success" },
  DECLINED: { label: "Declined", variant: "destructive" },
};

/**
 * History view of an offer for users who already joined: the same facts as the
 * candidate offer card, without the accept / decline actions.
 */
export function ReadOnlyOfferSummary({ offer }: { offer: ReadOnlyOfferData }) {
  const badge = STATUS_BADGES[offer.status];
  if (!badge) {
    return null;
  }

  return (
    <SectionCard
      id="offer-history"
      title="Employment offer"
      icon={<Briefcase className="h-4 w-4" />}
      action={<Badge variant={badge.variant}>{badge.label}</Badge>}
    >
      <dl className="grid grid-cols-1 gap-3 text-xs sm:grid-cols-3">
        <div className="rounded-xl border border-border/60 bg-muted/30 p-3">
          <dt className="text-muted-foreground">Position</dt>
          <dd className="mt-0.5 font-semibold text-foreground">{offer.designation}</dd>
          <dd className="text-muted-foreground">{offer.department}</dd>
        </div>
        <div className="rounded-xl border border-border/60 bg-muted/30 p-3">
          <dt className="text-muted-foreground">Target joining date</dt>
          <dd className="mt-0.5 font-semibold text-foreground">{formatCalendarDate(offer.expectedJoiningDate)}</dd>
        </div>
        <div className="rounded-xl border border-border/60 bg-muted/30 p-3">
          <dt className="text-muted-foreground">Location</dt>
          <dd className="mt-0.5 font-semibold text-foreground">{offer.location || "Not specified"}</dd>
        </div>
      </dl>
      <div className="mt-4">
        <p className="mb-1 text-xs font-semibold text-foreground">Agreed terms</p>
        <p className="whitespace-pre-wrap rounded-xl border border-border/60 bg-muted/20 p-3 text-xs leading-relaxed text-foreground">
          {offer.termsSummary}
        </p>
      </div>
      {offer.decisionAt && offer.status !== OfferStatus.EXTENDED && (
        <p className="mt-3 text-xs text-muted-foreground">
          {offer.status === OfferStatus.ACCEPTED ? "Accepted" : "Declined"} on {formatCalendarDate(offer.decisionAt)}.
        </p>
      )}
    </SectionCard>
  );
}
