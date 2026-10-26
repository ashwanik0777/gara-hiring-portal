"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { X } from "lucide-react";
import type { PayrollPeriodDetail } from "../../types";
import { useEscapeToClose } from "../payroll-ui";

interface BulkDisbursementDialogProps {
  period: PayrollPeriodDetail;
  isPending: boolean;
  onClose: () => void;
  onSubmit: (values: { reference: string; notes: string }) => void;
}

/** One staff-entered batch reference for a FINALIZED period. Loaded on demand. */
export function BulkDisbursementDialog({ period, isPending, onClose, onSubmit }: BulkDisbursementDialogProps) {
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  useEscapeToClose(onClose, isPending);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150"
      role="dialog"
      aria-modal="true"
      aria-labelledby="bulk-disbursement-title"
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit({ reference, notes });
        }}
        className="bg-card border border-border/80 rounded-3xl w-full max-w-md shadow-2xl p-6 space-y-5"
      >
        <div className="flex items-center justify-between border-b border-border/80 pb-3">
          <div>
            <h3 id="bulk-disbursement-title" className="font-bold text-foreground text-sm">Bulk Payout & Batch Disbursement</h3>
            <p className="text-[11px] text-muted-foreground mt-0.5">Record one bank batch reference for {period.code}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="h-8 w-8 rounded-xl border border-border/80 flex items-center justify-center text-muted-foreground hover:text-foreground"
            aria-label="Close dialog"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-xs space-y-1">
          <div className="font-bold text-amber-800 dark:text-amber-300">Action Summary:</div>
          <div className="text-amber-700 dark:text-amber-400">
            Every <strong>FINALIZED</strong> record in cycle <strong>{period.code}</strong> whose employee is
            configured as paid will be marked <strong>PAID</strong> with the reference below. Records of employees
            not configured as paid are skipped.
          </div>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="bulk-disbursement-reference" className="text-[11px] font-bold text-muted-foreground uppercase font-mono">
            Bank Batch Reference *
          </label>
          <Input
            id="bulk-disbursement-reference"
            required
            placeholder="Batch reference issued by your bank"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            className="font-mono text-xs rounded-xl h-9"
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="payroll-management-client-audit-notes-2" className="text-[11px] font-bold text-muted-foreground uppercase font-mono">
            Audit Notes
          </label>
          <Input
            id="payroll-management-client-audit-notes-2"
            placeholder="e.g. Authorized by CFO for monthly bank payout"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="text-xs rounded-xl h-9"
          />
        </div>

        <div className="pt-2 flex items-center justify-end gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={isPending} className="text-xs rounded-xl">
            Cancel
          </Button>
          <Button type="submit" size="sm" disabled={isPending} className="text-xs rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white">
            {isPending ? "Recording..." : "Record Bulk Disbursement"}
          </Button>
        </div>
      </form>
    </div>
  );
}
