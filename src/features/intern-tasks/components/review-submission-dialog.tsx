"use client";

import React, { lazy } from "react";
import { Button } from "@/components/ui/button";
import { useLazyDialog } from "@/features/employees/components/use-lazy-dialog";
import type { ReviewSubmissionPanelProps } from "./review-submission-panel";

const ReviewSubmissionPanel = lazy(() =>
  import("./review-submission-panel").then((m) => ({ default: m.ReviewSubmissionPanel }))
);

export type ReviewSubmissionDialogProps = Omit<ReviewSubmissionPanelProps, "open" | "onClose">;

/** Trigger for the submission review dialog; the form chunk loads on first use. */
export function ReviewSubmissionDialog(props: ReviewSubmissionDialogProps) {
  const dialog = useLazyDialog();

  return (
    <>
      <Button variant="outline" size="sm" onClick={dialog.show} isLoading={dialog.isPending} className="gap-1.5">
        Review v{props.versionNumber}
      </Button>
      {dialog.requested && <ReviewSubmissionPanel {...props} open={dialog.open} onClose={dialog.close} />}
    </>
  );
}
