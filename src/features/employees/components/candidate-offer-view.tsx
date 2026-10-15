"use client";

import React, { useState } from "react";
import { OfferStatus, JobOfferDetail } from "../types";
import { candidateDecideOfferAction } from "../actions";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Briefcase,
  Calendar,
  MapPin,
  CheckCircle2,
  AlertCircle,
  ThumbsUp,
  ThumbsDown,
} from "lucide-react";

interface CandidateOfferViewProps {
  offer: JobOfferDetail;
}

export function CandidateOfferView({ offer }: CandidateOfferViewProps) {
  const [decision, setDecision] = useState<"ACCEPT" | "DECLINE" | null>(null);
  const [declineReason, setDeclineReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (chosenDecision: "ACCEPT" | "DECLINE") => {
    if (chosenDecision === "ACCEPT") {
      if (!confirm("Are you sure you want to accept this job offer from GARA Innovation?")) return;
    }
    setError(null);
    setIsSubmitting(true);

    const formData = new FormData();
    formData.append("offerId", offer.id);
    formData.append("decision", chosenDecision);
    if (chosenDecision === "DECLINE") {
      formData.append("declineReason", declineReason);
    }

    try {
      const res = await candidateDecideOfferAction(formData);
      if (!res.success) {
        setError(res.error);
      } else {
        setDecision(null);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card className="border-primary/40 bg-card shadow-xs">
      <CardHeader className="pb-3 border-b border-border/50">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="space-y-1">
            <CardTitle className="text-base flex items-center gap-2 text-primary font-bold">
              <Briefcase className="h-5 w-5" /> Official Employment Offer
            </CardTitle>
          </div>
          {offer.status === OfferStatus.EXTENDED && (
            <Badge variant="warning">Action Required</Badge>
          )}
          {offer.status === OfferStatus.ACCEPTED && (
            <Badge variant="success">Offer Accepted</Badge>
          )}
          {offer.status === OfferStatus.DECLINED && (
            <Badge variant="destructive">Offer Declined</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-6 space-y-4 text-xs">
        {error && (
          <div className="p-3 rounded-md bg-destructive/10 text-destructive border border-destructive/20 flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 rounded-lg bg-muted/40 border border-border/40">
          <div>
            <div className="text-muted-foreground text-[11px]">Position</div>
            <div className="font-semibold text-foreground text-sm mt-0.5">
              {offer.designation}
            </div>
            <div className="text-muted-foreground">{offer.department}</div>
          </div>

          <div>
            <div className="text-muted-foreground text-[11px] flex items-center gap-1">
              <Calendar className="h-3 w-3" /> Target Joining Date
            </div>
            <div className="font-semibold text-foreground text-sm mt-0.5">
              {new Date(offer.expectedJoiningDate).toLocaleDateString(undefined, {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </div>
          </div>

          <div>
            <div className="text-muted-foreground text-[11px] flex items-center gap-1">
              <MapPin className="h-3 w-3" /> Location
            </div>
            <div className="font-semibold text-foreground text-sm mt-0.5">
              {offer.location || "Bangalore / Hybrid"}
            </div>
          </div>
        </div>

        <div>
          <div className="font-semibold text-foreground mb-1 text-sm">Agreed Terms & Conditions:</div>
          <div className="p-4 rounded-md bg-muted/20 border border-border/60 text-foreground whitespace-pre-wrap leading-relaxed text-xs">
            {offer.termsSummary}
          </div>
        </div>

        {offer.status === OfferStatus.ACCEPTED && (
          <div className="p-4 rounded-lg bg-success/10 border border-success/30 text-success flex items-center gap-3">
            <CheckCircle2 className="h-6 w-6 shrink-0" />
            <div>
              <div className="font-semibold text-sm">Congratulations & Welcome!</div>
              <div className="text-xs text-foreground/80 mt-0.5">
                You formally accepted this job offer on {new Date(offer.decisionAt || new Date()).toLocaleDateString()}. Our HR operations team is preparing your onboarding package.
              </div>
            </div>
          </div>
        )}

        {offer.status === OfferStatus.DECLINED && (
          <div className="p-3 rounded-lg bg-muted/40 border border-border/40 text-muted-foreground text-xs">
            You declined this job offer on {new Date(offer.decisionAt || new Date()).toLocaleDateString()}.
          </div>
        )}
      </CardContent>

      {offer.status === OfferStatus.EXTENDED && (
        <CardFooter className="pt-2 border-t border-border/50 flex flex-wrap justify-end gap-3">
          {decision === "DECLINE" ? (
            <div className="w-full space-y-3">
              <div className="text-xs font-medium text-foreground">
                Please share the reason for declining this offer (optional):
              </div>
              <textarea
                rows={2}
                value={declineReason}
                onChange={(e) => setDeclineReason(e.target.value)}
                placeholder="Reason for declining..."
                className="w-full px-3 py-2 text-xs rounded-md border border-input bg-background resize-y"
              />
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setDecision(null)}
                  disabled={isSubmitting}
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => handleSubmit("DECLINE")}
                  disabled={isSubmitting}
                >
                  Confirm Decline
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDecision("DECLINE")}
                disabled={isSubmitting}
                className="gap-1.5"
              >
                <ThumbsDown className="h-3.5 w-3.5" /> Decline Offer
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => handleSubmit("ACCEPT")}
                disabled={isSubmitting}
                className="gap-1.5"
              >
                <ThumbsUp className="h-3.5 w-3.5" /> Accept Job Offer
              </Button>
            </div>
          )}
        </CardFooter>
      )}
    </Card>
  );
}
