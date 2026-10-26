"use client";

import React, { lazy, useState } from "react";
import { CheckCircle2, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { MarkInternJoinedPanelProps } from "./mark-intern-joined-panel";
import { useLazyDialog } from "./use-lazy-dialog";

const MarkInternJoinedPanel = lazy(() =>
  import("./mark-intern-joined-panel").then((m) => ({ default: m.MarkInternJoinedPanel }))
);

export type MarkInternJoinedDialogProps = Omit<MarkInternJoinedPanelProps, "open" | "onClose" | "onJoined">;

/**
 * Trigger for "Mark as joined" / "Mark as re-joined". The joining form (and its field helpers)
 * ships in a separate chunk loaded on first use; after a successful joining the trigger is
 * replaced by the confirmation and the page refreshes.
 */
export function MarkInternJoinedDialog(props: MarkInternJoinedDialogProps) {
  const isRejoin = Boolean(props.existingEmployeeCode);
  const dialog = useLazyDialog();
  const [joined, setJoined] = useState(false);

  if (joined) {
    return (
      <div
        role="status"
        className="flex items-center gap-2 rounded-lg border border-success/20 bg-success/10 p-3 text-xs text-success"
      >
        <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span>
          {props.candidateName} is now marked as {isRejoin ? "re-joined" : "joined"} as an intern. The welcome
          email has been queued and the first progress review is scheduled.
        </span>
      </div>
    );
  }

  return (
    <>
      <Button size="sm" className="gap-1.5" onClick={dialog.show} isLoading={dialog.isPending}>
        <UserPlus className="h-3.5 w-3.5" aria-hidden="true" /> {isRejoin ? "Mark as re-joined" : "Mark as joined"}
      </Button>
      {dialog.requested && (
        <MarkInternJoinedPanel
          {...props}
          open={dialog.open}
          onClose={dialog.close}
          onJoined={() => {
            dialog.close();
            setJoined(true);
          }}
        />
      )}
    </>
  );
}
