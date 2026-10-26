"use client";

import React, { lazy } from "react";
import { PlusCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLazyDialog } from "@/features/employees/components/use-lazy-dialog";
import type { CreateTaskPanelProps } from "./create-task-panel";

const CreateTaskPanel = lazy(() => import("./create-task-panel").then((m) => ({ default: m.CreateTaskPanel })));

export type CreateTaskDialogProps = Omit<CreateTaskPanelProps, "open" | "onClose">;

/** Trigger for the task-assignment dialog; the form chunk loads on first use. */
export function CreateTaskDialog(props: CreateTaskDialogProps) {
  const dialog = useLazyDialog();

  return (
    <>
      <Button variant="primary" size="sm" onClick={dialog.show} isLoading={dialog.isPending} className="gap-1.5">
        <PlusCircle className="h-4 w-4" aria-hidden="true" />
        Assign New Task
      </Button>
      {dialog.requested && <CreateTaskPanel {...props} open={dialog.open} onClose={dialog.close} />}
    </>
  );
}
