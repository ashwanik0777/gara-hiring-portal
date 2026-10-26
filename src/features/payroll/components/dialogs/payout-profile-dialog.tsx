"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { X, UserCheck, UserX } from "lucide-react";
import type { PayoutProfileTarget } from "../../types";
import { NOT_CONFIGURED, useEscapeToClose } from "../payroll-ui";

export interface PayoutProfileFormValues {
  isPaid: boolean;
  employmentType: "INTERN" | "FULL_TIME" | null;
  stipendAmount: string;
  bankName: string;
  /** Empty keeps the stored number: the browser only ever receives masked values. */
  accountNumber: string;
  ifscCode: string;
  accountHolderName: string;
  panNumber: string;
}

interface PayoutProfileDialogProps {
  target: PayoutProfileTarget;
  isPending: boolean;
  onClose: () => void;
  onSubmit: (values: PayoutProfileFormValues) => void;
}

/** Paid / unpaid flag, employment category and banking details. Loaded on demand. */
export function PayoutProfileDialog({ target, isPending, onClose, onSubmit }: PayoutProfileDialogProps) {
  const [form, setForm] = useState<PayoutProfileFormValues>({
    isPaid: target.isPaid === true,
    employmentType: target.employmentType,
    stipendAmount: target.stipendAmount !== null ? String(target.stipendAmount) : "",
    bankName: target.bankName ?? "",
    accountNumber: "",
    ifscCode: target.ifscCode ?? "",
    accountHolderName: target.accountHolderName ?? "",
    panNumber: "",
  });
  useEscapeToClose(onClose, isPending);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150"
      role="dialog"
      aria-modal="true"
      aria-labelledby="payout-profile-title"
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit(form);
        }}
        className="bg-card border border-border/80 rounded-3xl w-full max-w-lg max-h-[92vh] overflow-y-auto shadow-2xl p-6 space-y-4"
      >
        <div className="flex items-center justify-between border-b border-border/80 pb-3">
          <div>
            <h3 id="payout-profile-title" className="font-bold text-foreground text-sm">Configure Compensation & Payout Status</h3>
            <p className="text-[11px] text-muted-foreground mt-0.5">Set whether {target.employeeName} is Paid or Unpaid</p>
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

        <div className="p-3.5 rounded-2xl bg-muted/40 border border-border/60 space-y-3">
          <p id="payroll-profile-compensation-label" className="text-[11px] font-bold text-muted-foreground uppercase font-mono">
            Compensation Status *
          </p>
          <div role="group" aria-labelledby="payroll-profile-compensation-label" className="grid grid-cols-2 gap-2">
            <button
              type="button"
              aria-pressed={form.isPaid}
              onClick={() => setForm({ ...form, isPaid: true })}
              className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                form.isPaid
                  ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-900 dark:text-emerald-300 ring-1 ring-emerald-500/30"
                  : "bg-background border-border/60 text-muted-foreground hover:text-foreground"
              }`}
            >
              <div className="flex items-center gap-2 font-bold text-xs">
                <UserCheck className="h-4 w-4 text-emerald-600" />
                Paid (Stipend/Salary)
              </div>
              <div className="text-[10px] text-muted-foreground mt-1">Can be enrolled into payroll cycles.</div>
            </button>
            <button
              type="button"
              aria-pressed={!form.isPaid}
              onClick={() => setForm({ ...form, isPaid: false })}
              className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                !form.isPaid
                  ? "bg-zinc-500/10 border-zinc-500/40 text-foreground ring-1 ring-zinc-500/30"
                  : "bg-background border-border/60 text-muted-foreground hover:text-foreground"
              }`}
            >
              <div className="flex items-center gap-2 font-bold text-xs">
                <UserX className="h-4 w-4 text-zinc-500" />
                Unpaid (Non-stipendiary)
              </div>
              <div className="text-[10px] text-muted-foreground mt-1">Not enrolled; existing open records cannot be disbursed.</div>
            </button>
          </div>
        </div>

        <div className="space-y-1.5">
          <p id="payroll-profile-employment-label" className="text-[11px] font-bold text-muted-foreground uppercase font-mono">
            Employment Category {form.employmentType === null && `(${NOT_CONFIGURED})`}
          </p>
          <div role="group" aria-labelledby="payroll-profile-employment-label" className="flex gap-2">
            <button
              type="button"
              aria-pressed={form.employmentType === "INTERN"}
              onClick={() => setForm({ ...form, employmentType: "INTERN" })}
              className={`flex-1 py-2 px-3 rounded-xl border text-xs font-semibold cursor-pointer transition-all ${
                form.employmentType === "INTERN"
                  ? "bg-purple-500/15 border-purple-500/30 text-purple-700 dark:text-purple-300"
                  : "bg-background border-border/60 text-muted-foreground"
              }`}
            >
              Internship
            </button>
            <button
              type="button"
              aria-pressed={form.employmentType === "FULL_TIME"}
              onClick={() => setForm({ ...form, employmentType: "FULL_TIME" })}
              className={`flex-1 py-2 px-3 rounded-xl border text-xs font-semibold cursor-pointer transition-all ${
                form.employmentType === "FULL_TIME"
                  ? "bg-blue-500/15 border-blue-500/30 text-blue-700 dark:text-blue-300"
                  : "bg-background border-border/60 text-muted-foreground"
              }`}
            >
              Full-Time Staff
            </button>
          </div>
        </div>

        {form.isPaid ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <div className="space-y-1.5 sm:col-span-2">
              <label htmlFor="payout-amount" className="text-[11px] font-bold text-muted-foreground uppercase font-mono">
                Configured Amount (₹)
              </label>
              <Input
                id="payout-amount"
                type="number"
                min="0"
                step="any"
                placeholder={NOT_CONFIGURED}
                value={form.stipendAmount}
                onChange={(e) => setForm({ ...form, stipendAmount: e.target.value })}
                className="font-mono text-xs rounded-xl h-9"
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="payroll-management-client-bank-name" className="text-[11px] font-bold text-muted-foreground uppercase font-mono">
                Bank Name
              </label>
              <Input
                id="payroll-management-client-bank-name"
                placeholder={NOT_CONFIGURED}
                value={form.bankName}
                onChange={(e) => setForm({ ...form, bankName: e.target.value })}
                className="text-xs rounded-xl h-9"
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="payout-account-number" className="text-[11px] font-bold text-muted-foreground uppercase font-mono">
                Account Number
              </label>
              <Input
                id="payout-account-number"
                autoComplete="off"
                placeholder={target.accountNumberMasked ? `Current ${target.accountNumberMasked}; leave blank to keep` : NOT_CONFIGURED}
                value={form.accountNumber}
                onChange={(e) => setForm({ ...form, accountNumber: e.target.value })}
                className="font-mono text-xs rounded-xl h-9"
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="payroll-management-client-ifsc-code" className="text-[11px] font-bold text-muted-foreground uppercase font-mono">
                IFSC Code
              </label>
              <Input
                id="payroll-management-client-ifsc-code"
                placeholder={NOT_CONFIGURED}
                value={form.ifscCode}
                onChange={(e) => setForm({ ...form, ifscCode: e.target.value.toUpperCase() })}
                className="font-mono text-xs rounded-xl h-9 uppercase"
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="payroll-management-client-account-holder-name" className="text-[11px] font-bold text-muted-foreground uppercase font-mono">
                Account Holder Name
              </label>
              <Input
                id="payroll-management-client-account-holder-name"
                placeholder="Name as per passbook"
                value={form.accountHolderName}
                onChange={(e) => setForm({ ...form, accountHolderName: e.target.value })}
                className="text-xs rounded-xl h-9"
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <label htmlFor="payout-pan" className="text-[11px] font-bold text-muted-foreground uppercase font-mono">
                PAN
              </label>
              <Input
                id="payout-pan"
                autoComplete="off"
                placeholder={target.panMasked ? `Current ${target.panMasked}; leave blank to keep` : NOT_CONFIGURED}
                value={form.panNumber}
                onChange={(e) => setForm({ ...form, panNumber: e.target.value.toUpperCase() })}
                className="font-mono text-xs rounded-xl h-9 uppercase"
              />
            </div>
          </div>
        ) : (
          <div className="p-3.5 rounded-xl bg-muted/60 text-xs text-muted-foreground space-y-1">
            <p className="font-semibold text-foreground">Unpaid status active:</p>
            <p>
              This member will not be enrolled into payroll cycles. Stored banking details are kept unchanged;
              existing payroll records are kept for the audit trail.
            </p>
          </div>
        )}

        <div className="pt-2 flex items-center justify-end gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={isPending} className="text-xs rounded-xl">
            Cancel
          </Button>
          <Button type="submit" size="sm" disabled={isPending} className="text-xs rounded-xl">
            {isPending ? "Saving..." : "Save Settings"}
          </Button>
        </div>
      </form>
    </div>
  );
}
