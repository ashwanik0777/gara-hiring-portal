"use client";

import React, { lazy, useState } from "react";
import { CheckCircle2, UserCog } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLazyDialog } from "@/features/employees/components/use-lazy-dialog";
import type { ChangeSupervisorPanelProps } from "./change-supervisor-panel";

const ChangeSupervisorPanel = lazy(() =>
  import("./change-supervisor-panel").then((m) => ({ default: m.ChangeSupervisorPanel }))
);

export type ChangeSupervisorDialogProps = Omit<ChangeSupervisorPanelProps, "open" | "onClose" | "onChanged">;

/**
 * Trigger for the supervisor-change dialog; the form chunk loads on first use. Shows the
 * confirmation next to the button after a successful change.
 */
export function ChangeSupervisorDialog(props: ChangeSupervisorDialogProps) {
  const dialog = useLazyDialog();
  const [notice, setNotice] = useState<string | null>(null);

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5"
          isLoading={dialog.isPending}
          onClick={() => {
            setNotice(null);
            dialog.show();
          }}
          disabled={props.options.length === 0}
        >
          <UserCog className="h-3.5 w-3.5" aria-hidden="true" /> Change supervisor
        </Button>
        {props.options.length === 0 && (
          <span className="text-[11px] text-muted-foreground">No other eligible staff member is available.</span>
        )}
        {notice && (
          <span role="status" className="flex items-center gap-1 text-[11px] text-success">
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> {notice}
          </span>
        )}
      </div>
      {dialog.requested && (
        <ChangeSupervisorPanel
          {...props}
          open={dialog.open}
          onClose={dialog.close}
          onChanged={(message) => {
            setNotice(message);
            dialog.close();
          }}
        />
      )}
    </>
  );
}
