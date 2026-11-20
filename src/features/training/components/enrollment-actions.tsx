"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { requestRefundAction, transferEnrollmentAction } from "../checkout-actions";

const fieldClass =
  "flex w-full rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function ErrorText({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="text-xs text-destructive">
      {message}
    </p>
  );
}

/** Student: ask for a full refund while the refund window is open. */
export function RefundRequestForm({ enrollmentId, closesAtLabel, amountLabel }: { enrollmentId: string; closesAtLabel: string; amountLabel: string }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [reason, setReason] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [isPending, startTransition] = React.useTransition();
  const fieldId = `refund-reason-${enrollmentId}`;

  if (!open) {
    return (
      <div className="space-y-1">
        <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
          Request refund
        </Button>
        <p className="text-xs text-muted-foreground">Full refund of {amountLabel} if you ask before {closesAtLabel}.</p>
      </div>
    );
  }

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await requestRefundAction({ enrollmentId, reason });
      if (!result.success) {
        setError(result.error);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  };

  return (
    <form onSubmit={submit} className="space-y-2 rounded-md border border-border/70 bg-muted/20 p-3">
      <label htmlFor={fieldId} className="text-sm font-medium text-foreground">
        Why do you want a refund?
      </label>
      <textarea
        id={fieldId}
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        rows={3}
        minLength={5}
        maxLength={1000}
        required
        className={fieldClass}
      />
      <ErrorText message={error} />
      <p className="text-xs text-muted-foreground">
        The time of your request decides whether it is in the window. An administrator reviews it and the money goes back to
        the original payment method.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" disabled={isPending || reason.trim().length < 5}>
          {isPending ? "Sending…" : "Send refund request"}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={isPending}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

/** Student: move to a later batch of the same programme, free of charge, once. */
export function TransferForm({ enrollmentId, targets }: { enrollmentId: string; targets: Array<{ id: string; label: string }> }) {
  const router = useRouter();
  const [targetBatchId, setTargetBatchId] = React.useState(targets[0]?.id ?? "");
  const [confirming, setConfirming] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [isPending, startTransition] = React.useTransition();
  const fieldId = `transfer-target-${enrollmentId}`;

  if (targets.length === 0) {
    return <p className="text-xs text-muted-foreground">No later batch is open right now. You can transfer once a new batch is announced.</p>;
  }

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!confirming) {
      setConfirming(true);
      return;
    }
    startTransition(async () => {
      const result = await transferEnrollmentAction({ enrollmentId, targetBatchId });
      if (!result.success) {
        setError(result.error);
        setConfirming(false);
        return;
      }
      setConfirming(false);
      router.refresh();
    });
  };

  return (
    <form onSubmit={submit} className="space-y-2">
      <label htmlFor={fieldId} className="text-sm font-medium text-foreground">
        Transfer to a later batch (free, once)
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <select
          id={fieldId}
          value={targetBatchId}
          onChange={(event) => {
            setTargetBatchId(event.target.value);
            setConfirming(false);
          }}
          className={`${fieldClass} h-9 sm:max-w-sm`}
        >
          {targets.map((target) => (
            <option key={target.id} value={target.id}>
              {target.label}
            </option>
          ))}
        </select>
        <Button type="submit" size="sm" variant={confirming ? "primary" : "outline"} disabled={isPending || !targetBatchId}>
          {isPending ? "Transferring…" : confirming ? "Confirm transfer" : "Transfer"}
        </Button>
      </div>
      {confirming && !isPending && (
        <p role="status" className="text-xs text-muted-foreground">
          You can transfer only once. Press “Confirm transfer” to continue.
        </p>
      )}
      <ErrorText message={error} />
    </form>
  );
}
