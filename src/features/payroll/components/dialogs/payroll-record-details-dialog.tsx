"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Printer, X, ShieldCheck, Copy, Check } from "lucide-react";
import type { PayrollRecordWithEmployee, PayrollStatus } from "../../types";
import { NOT_CONFIGURED, employmentLabel, formatCurrency, formatDate, PayrollStatusBadge, useEscapeToClose } from "../payroll-ui";

interface PayrollRecordDetailsDialogProps {
  record: PayrollRecordWithEmployee;
  activePeriodStatus: PayrollStatus | null;
  onClose: () => void;
  onDisburse: (record: PayrollRecordWithEmployee) => void;
  onCopy: (text: string) => void;
}

/** Record details (not a payslip: OD-008). Loaded on demand. */
export function PayrollRecordDetailsDialog({ record, activePeriodStatus, onClose, onDisburse, onCopy }: PayrollRecordDetailsDialogProps) {
  useEscapeToClose(onClose);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150"
      role="dialog"
      aria-modal="true"
      aria-labelledby="payroll-record-details-title"
    >
      <div className="bg-card border border-border/80 rounded-3xl w-full max-w-2xl max-h-[92vh] overflow-y-auto shadow-2xl p-6 sm:p-7 space-y-6 print:p-0 print:border-none print:shadow-none">
        <div className="flex items-start justify-between border-b border-border/80 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-xl bg-primary text-primary-foreground flex items-center justify-center font-bold text-sm">G</div>
              <div>
                <h3 id="payroll-record-details-title" className="font-extrabold text-foreground text-sm tracking-tight">
                  GARA INNOVATION
                </h3>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-mono">
                  Payroll Record Details (not a payslip)
                </p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 print:hidden">
            <Button size="sm" variant="outline" onClick={() => window.print()} className="h-8 text-xs gap-1.5 rounded-xl">
              <Printer className="h-3.5 w-3.5" />
              Print Record
            </Button>
            <button
              type="button"
              onClick={onClose}
              className="h-8 w-8 rounded-xl border border-border/80 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Close dialog"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-muted/40 border border-border/60 flex flex-wrap items-center justify-between gap-4">
          <div>
            <span className="text-[10px] text-muted-foreground font-mono uppercase tracking-wider font-bold">Payroll Cycle</span>
            <div className="text-base font-extrabold font-mono text-foreground">{record.payrollPeriodCode}</div>
          </div>
          <div>
            <span className="text-[10px] text-muted-foreground font-mono uppercase tracking-wider font-bold">Employment Status</span>
            <div className="mt-0.5">
              <Badge variant="outline" className="font-mono text-xs">{employmentLabel(record.employmentType)}</Badge>
            </div>
          </div>
          <div>
            <span className="text-[10px] text-muted-foreground font-mono uppercase tracking-wider font-bold">Payout Status</span>
            <div className="mt-0.5"><PayrollStatusBadge status={record.status} /></div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 text-xs">
          <div className="space-y-1">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider font-mono">Employee Name</span>
            <div className="font-bold text-foreground text-sm">{record.employeeName}</div>
            <div className="text-muted-foreground text-[11px]">{record.employeeEmail}</div>
          </div>
          <div className="space-y-1">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider font-mono">Employee ID & Role</span>
            <div className="font-mono font-semibold text-primary">{record.employeeCode}</div>
            <div className="text-muted-foreground text-[11px]">{record.department} • {record.designation}</div>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-card border border-border/80 space-y-2 text-xs">
          <div className="font-bold text-foreground text-xs uppercase tracking-wider font-mono border-b border-border/60 pb-2">
            Disbursement & Banking Destination
          </div>
          <div className="grid grid-cols-2 gap-3 pt-1">
            <div>
              <span className="text-muted-foreground text-[11px]">Beneficiary Bank:</span>
              <div className="font-medium text-foreground">{record.bankName ?? NOT_CONFIGURED}</div>
            </div>
            <div>
              <span className="text-muted-foreground text-[11px]">Account Number:</span>
              <div className="font-mono font-medium text-foreground">{record.accountNumberMasked ?? NOT_CONFIGURED}</div>
            </div>
            <div>
              <span className="text-muted-foreground text-[11px]">IFSC Code:</span>
              <div className="font-mono font-medium text-foreground">{record.ifscCode ?? NOT_CONFIGURED}</div>
            </div>
            <div>
              <span className="text-muted-foreground text-[11px]">Account Holder:</span>
              <div className="font-medium text-foreground">{record.accountHolderName ?? NOT_CONFIGURED}</div>
            </div>
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-emerald-800 dark:text-emerald-300 uppercase tracking-wider font-mono">Configured Amount</span>
            <div className="text-2xl sm:text-3xl font-extrabold font-mono text-emerald-700 dark:text-emerald-400 mt-0.5">
              {formatCurrency(record.stipendAmount)}
            </div>
            <span className="text-[11px] text-emerald-700/80 dark:text-emerald-400/80">
              As entered in the employee payout profile. No salary calculation is performed (OD-008).
            </span>
          </div>
          <ShieldCheck className="h-10 w-10 text-emerald-600 dark:text-emerald-400/50" />
        </div>

        {record.disbursementReference && (
          <div className="p-3.5 rounded-xl bg-muted/40 border border-border/60 text-xs flex items-center justify-between">
            <div>
              <span className="text-[10px] text-muted-foreground font-mono uppercase tracking-wider font-bold">Bank UTR Reference</span>
              <div className="font-mono font-bold text-foreground text-sm">{record.disbursementReference}</div>
              {record.disbursedAt && (
                <div className="text-[10px] text-muted-foreground mt-0.5">Transferred on {formatDate(record.disbursedAt)}</div>
              )}
            </div>
            <button
              type="button"
              onClick={() => onCopy(record.disbursementReference ?? "")}
              className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              title="Copy UTR"
              aria-label="Copy UTR reference"
            >
              <Copy className="h-4 w-4" />
            </button>
          </div>
        )}

        {record.status === "FINALIZED" && activePeriodStatus === "FINALIZED" && (
          <div className="pt-2 flex items-center justify-end gap-2 print:hidden">
            <Button onClick={() => onDisburse(record)} className="text-xs rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5">
              <Check className="h-4 w-4" />
              Mark Disbursed Now
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
