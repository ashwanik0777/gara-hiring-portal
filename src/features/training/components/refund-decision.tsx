"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { decideRefundAction } from "../checkout-actions";

/**
 * Admin: approve (sends the refund through Razorpay) or reject (the student sees the note and
 * the enrollment becomes active again). Approving asks for a second click.
 */
export function RefundDecision({ refundId, amountLabel }: { refundId: string; amountLabel: string }) {
  const router = useRouter();
  const [note, setNote] = React.useState("");
  const [confirmApprove, setConfirmApprove] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [isPending, startTransition] = React.useTransition();
  const noteId = `refund-note-${refundId}`;

  const decide = (approve: boolean) => {
    setError(null);
    if (approve && !confirmApprove) {
      setConfirmApprove(true);
      return;
    }
    startTransition(async () => {
      const result = await decideRefundAction({ refundId, approve, note });
      setConfirmApprove(false);
      if (!result.success) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  };

  return (
    <div className="space-y-2">
      <label htmlFor={noteId} className="text-xs font-medium text-foreground">
        Note to the student (required to reject)
      </label>
      <textarea
        id={noteId}
        value={note}
        onChange={(event) => setNote(event.target.value)}
        rows={2}
        maxLength={1000}
        className="flex w-full rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant={confirmApprove ? "primary" : "outline"} disabled={isPending} onClick={() => decide(true)}>
          {isPending ? "Saving…" : confirmApprove ? `Confirm refund of ${amountLabel}` : "Approve refund"}
        </Button>
        <Button size="sm" variant="ghost" disabled={isPending || note.trim().length < 5} onClick={() => decide(false)}>
          Reject
        </Button>
      </div>
    </div>
  );
}
