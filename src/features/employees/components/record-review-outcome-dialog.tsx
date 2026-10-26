"use client";

import React, { lazy } from "react";
import { ClipboardCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { RecordReviewOutcomePanelProps } from "./record-review-outcome-panel";
import { useLazyDialog } from "./use-lazy-dialog";

const RecordReviewOutcomePanel = lazy(() =>
  import("./record-review-outcome-panel").then((m) => ({ default: m.RecordReviewOutcomePanel }))
);

export type RecordReviewOutcomeDialogProps = Omit<RecordReviewOutcomePanelProps, "open" | "onClose">;

/**
 * Trigger for the review-outcome dialog. The form itself ships in a separate chunk that is
 * loaded the first time HR opens it (the board lists many reviews; most are never opened).
 */
export function RecordReviewOutcomeDialog(props: RecordReviewOutcomeDialogProps) {
  const dialog = useLazyDialog();

  return (
    <>
      <Button size="sm" className="gap-1.5" onClick={dialog.show} isLoading={dialog.isPending}>
        <ClipboardCheck className="h-3.5 w-3.5" aria-hidden="true" /> Record review outcome
      </Button>
      {dialog.requested && <RecordReviewOutcomePanel {...props} open={dialog.open} onClose={dialog.close} />}
    </>
  );
}
