"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { X } from "lucide-react";
import type { PayrollRecordWithEmployee } from "../../types";
import { formatCurrency, useEscapeToClose } from "../payroll-ui";

interface RecordDisbursementDialogProps {
  record: PayrollRecordWithEmployee;
  isPending: boolean;
  onClose: () => void;
  onSubmit: (values: { reference: string; notes: string }) => void;
}

/** Staff-entered bank reference for one FINALIZED record. Loaded on demand. */
export function RecordDisbursementDialog({ record, isPending, onClose, onSubmit }: RecordDisbursementDialogProps) {
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  useEscapeToClose(onClose, isPending);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150"
      role="dialog"
      aria-modal="true"
      aria-labelledby="record-disbursement-title"
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
            <h3 id="record-disbursement-title" className="font-bold text-foreground text-sm">Record Payout Disbursement</h3>
            <p className="text-[11px] text-muted-foreground mt-0.5">Confirm bank transfer and log UTR reference</p>
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

        <div className="p-3.5 rounded-2xl bg-muted/40 border border-border/60 text-xs space-y-1">
          <div className="font-bold text-foreground">{record.employeeName}</div>
          <div className="text-muted-foreground">{record.employeeCode} • {record.department}</div>
          <div className="font-mono font-bold text-emerald-600 dark:text-emerald-400 pt-1">
            Amount: {formatCurrency(record.stipendAmount)}
          </div>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="payroll-management-client-bank-transfer-utr-reference" className="text-[11px] font-bold text-muted-foreground uppercase font-mono">
            Bank Transfer / UTR Reference *
          </label>
          <Input
            id="payroll-management-client-bank-transfer-utr-reference"
            required
            placeholder="Reference issued by your bank"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            className="font-mono text-xs rounded-xl h-9"
          />
          <p className="text-[10px] text-muted-foreground">
            Enter the reference exactly as issued by the bank. The system never generates references.
          </p>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="payroll-management-client-audit-notes" className="text-[11px] font-bold text-muted-foreground uppercase font-mono">
            Audit Notes (Optional)
          </label>
          <Input
            id="payroll-management-client-audit-notes"
            placeholder="e.g. Verified via corporate netbanking"
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
            {isPending ? "Recording..." : "Confirm & Mark as Paid"}
          </Button>
        </div>
      </form>
    </div>
  );
}
