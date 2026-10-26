"use client";

import React, { lazy } from "react";
import { UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLazyDialog } from "@/features/employees/components/use-lazy-dialog";
import type { TaskSubmissionPanelProps } from "./task-submission-panel";

const TaskSubmissionPanel = lazy(() =>
  import("./task-submission-panel").then((m) => ({ default: m.TaskSubmissionPanel }))
);

export type TaskSubmissionDialogProps = Omit<TaskSubmissionPanelProps, "open" | "onClose">;

/** Trigger for the deliverable submission dialog; the form chunk loads on first use. */
export function TaskSubmissionDialog(props: TaskSubmissionDialogProps) {
  const dialog = useLazyDialog();

  return (
    <>
      <Button variant="primary" size="sm" onClick={dialog.show} isLoading={dialog.isPending} className="gap-1.5">
        <UploadCloud className="h-4 w-4" aria-hidden="true" />
        {props.versionNumber > 0 ? `Resubmit (v${props.versionNumber + 1})` : "Submit Deliverables"}
      </Button>
      {dialog.requested && <TaskSubmissionPanel {...props} open={dialog.open} onClose={dialog.close} />}
    </>
  );
}
