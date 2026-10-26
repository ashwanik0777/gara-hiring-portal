"use client";

import React, { lazy } from "react";
import { FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLazyDialog } from "@/features/employees/components/use-lazy-dialog";
import type { ProgressReportPanelProps } from "./progress-report-panel";

const ProgressReportPanel = lazy(() =>
  import("./progress-report-panel").then((m) => ({ default: m.ProgressReportPanel }))
);

export type ProgressReportDialogProps = Omit<ProgressReportPanelProps, "open" | "onClose">;

/** Trigger for the progress-report dialog; the form chunk loads on first use. */
export function ProgressReportDialog(props: ProgressReportDialogProps) {
  const dialog = useLazyDialog();

  return (
    <>
      <Button variant="primary" size="sm" onClick={dialog.show} isLoading={dialog.isPending} className="gap-1.5">
        <FileText className="h-4 w-4" aria-hidden="true" />
        Submit Progress Report
      </Button>
      {dialog.requested && <ProgressReportPanel {...props} open={dialog.open} onClose={dialog.close} />}
    </>
  );
}
