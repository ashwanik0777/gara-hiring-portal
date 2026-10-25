"use client";

import React, { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, ThumbsDown, ThumbsUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { respondToConversionOfferAction } from "../actions";
import { AccessibleDialog } from "./accessible-dialog";

interface ConversionOfferResponseProps {
  reviewId: string;
  proposedDesignation: string;
  /** Effective date as shown to the intern (already formatted). */
  effectiveDateLabel: string;
}

type Decision = "ACCEPT" | "DECLINE";

/**
 * Accept / Decline for the intern's own full-time conversion offer. The Server Action is
 * scoped to the signed-in intern's own review and re-checks that the offer is still open.
 */
export function ConversionOfferResponse({
  reviewId,
  proposedDesignation,
  effectiveDateLabel,
}: ConversionOfferResponseProps) {
  const router = useRouter();
  const baseId = useId();
  const titleId = `${baseId}-title`;
  const descriptionId = `${baseId}-description`;

  const [decision, setDecision] = useState<Decision | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  const close = () => {
    if (isSubmitting) return;
    setDecision(null);
    setError(null);
  };

  const confirm = async () => {
    if (!decision) return;
    setIsSubmitting(true);
    setError(null);
    const formData = new FormData();
    formData.append("reviewId", reviewId);
    formData.append("decision", decision);

    try {
      const res = await respondToConversionOfferAction(formData);
      if (!res.success) {
        setError(res.error);
        return;
      }
      setResult(
        res.data.decision === "DECLINE"
          ? "You declined the offer. Your answer has been shared with HR."
          : res.data.converted
            ? `Congratulations! You are now ${proposedDesignation}. Your portal is updating.`
            : `You accepted the offer. Your new role starts on ${effectiveDateLabel}.`
      );
      setDecision(null);
      router.refresh();
    } catch {
      setError("We couldn't send your answer. Please check your connection and try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (result) {
    return (
      <p role="status" className="flex items-start gap-2 text-xs text-success">
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> {result}
      </p>
    );
  }

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" className="gap-1.5" onClick={() => setDecision("ACCEPT")}>
          <ThumbsUp className="h-3.5 w-3.5" aria-hidden="true" /> Accept offer
        </Button>
        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setDecision("DECLINE")}>
          <ThumbsDown className="h-3.5 w-3.5" aria-hidden="true" /> Decline
        </Button>
      </div>

      <AccessibleDialog
        open={decision !== null}
        onClose={close}
        labelledBy={titleId}
        describedBy={descriptionId}
        busy={isSubmitting}
        className="max-w-md"
      >
        <div className="space-y-4 px-5 py-5 text-sm">
          <h2 id={titleId} className="text-base font-semibold text-foreground">
            {decision === "ACCEPT" ? "Accept the full-time offer?" : "Decline the full-time offer?"}
          </h2>
          <p id={descriptionId} className="text-muted-foreground">
            {decision === "ACCEPT"
              ? `You will become ${proposedDesignation} from ${effectiveDateLabel}. Your portal switches to the employee home on that date.`
              : "Your internship continues as it is. You cannot undo this answer from the portal."}
          </p>
          {error && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{error}</span>
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={close} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button
              size="sm"
              variant={decision === "DECLINE" ? "destructive" : "primary"}
              onClick={confirm}
              isLoading={isSubmitting}
            >
              {isSubmitting ? "Sending…" : decision === "ACCEPT" ? "Yes, accept" : "Yes, decline"}
            </Button>
          </div>
        </div>
      </AccessibleDialog>
    </>
  );
}
