"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { X } from "lucide-react";
import { useEscapeToClose } from "../payroll-ui";

export interface CreatePeriodValues {
  code: string;
  startDate: string;
  endDate: string;
  notes: string;
}

interface CreatePeriodDialogProps {
  isPending: boolean;
  onClose: () => void;
  onSubmit: (values: CreatePeriodValues) => void;
}

/** New payroll cycle (explicit staff action, no calculation). Loaded on demand. */
export function CreatePeriodDialog({ isPending, onClose, onSubmit }: CreatePeriodDialogProps) {
  const [form, setForm] = useState<CreatePeriodValues>({ code: "", startDate: "", endDate: "", notes: "" });
  useEscapeToClose(onClose, isPending);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150"
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-period-title"
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit(form);
        }}
        className="bg-card border border-border/80 rounded-3xl w-full max-w-md shadow-2xl p-6 space-y-4"
      >
        <div className="flex items-center justify-between border-b border-border/80 pb-3">
          <div>
            <h3 id="create-period-title" className="font-bold text-foreground text-sm">Create Operational Payroll Cycle</h3>
            <p className="text-[11px] text-muted-foreground mt-0.5">Set cycle code and start/end dates</p>
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

        <div className="space-y-1.5">
          <label htmlFor="payroll-management-client-cycle-code" className="text-[11px] font-bold text-muted-foreground uppercase font-mono">
            Cycle Code (e.g. 2026-11) *
          </label>
          <Input
            id="payroll-management-client-cycle-code"
            required
            placeholder="2026-11"
            value={form.code}
            onChange={(e) => setForm({ ...form, code: e.target.value })}
            className="font-mono text-xs rounded-xl h-9"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label htmlFor="payroll-management-client-start-date" className="text-[11px] font-bold text-muted-foreground uppercase font-mono">
              Start Date *
            </label>
            <Input
              id="payroll-management-client-start-date"
              required
              type="date"
              value={form.startDate}
              onChange={(e) => setForm({ ...form, startDate: e.target.value })}
              className="text-xs rounded-xl h-9"
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="payroll-management-client-end-date" className="text-[11px] font-bold text-muted-foreground uppercase font-mono">
              End Date *
            </label>
            <Input
              id="payroll-management-client-end-date"
              required
              type="date"
              value={form.endDate}
              onChange={(e) => setForm({ ...form, endDate: e.target.value })}
              className="text-xs rounded-xl h-9"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="payroll-management-client-notes" className="text-[11px] font-bold text-muted-foreground uppercase font-mono">
            Notes (Optional)
          </label>
          <Input
            id="payroll-management-client-notes"
            placeholder="e.g. November 2026 monthly cycle"
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            className="text-xs rounded-xl h-9"
          />
        </div>

        <div className="pt-2 flex items-center justify-end gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={isPending} className="text-xs rounded-xl">
            Cancel
          </Button>
          <Button type="submit" size="sm" disabled={isPending} className="text-xs rounded-xl">
            {isPending ? "Creating..." : "Create Cycle"}
          </Button>
        </div>
      </form>
    </div>
  );
}
