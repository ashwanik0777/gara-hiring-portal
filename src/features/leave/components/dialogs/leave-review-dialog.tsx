"use client";

import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle, X, Loader2, Info } from "lucide-react";
import type { LeaveRequestItem } from "../../types";
import { formatDisplayDate } from "../leave-ui";

interface LeaveReviewDialogProps {
  target: LeaveRequestItem;
  action: "APPROVED" | "REJECTED";
  isPending: boolean;
  onClose: () => void;
  onConfirm: (notes: string) => void;
}

/** Approve / reject confirmation. Loaded on demand; the notes stay local to the dialog. */
export function LeaveReviewDialog({ target, action, isPending, onClose, onConfirm }: LeaveReviewDialogProps) {
  const [notes, setNotes] = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isPending) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isPending, onClose]);

  const approving = action === "APPROVED";

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="leave-review-dialog-title"
    >
      <div className="bg-card border border-border/80 rounded-2xl w-full max-w-md shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="p-5 border-b border-border/60 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {approving ? (
              <div className="h-8 w-8 rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                <CheckCircle2 className="h-4 w-4" />
              </div>
            ) : (
              <div className="h-8 w-8 rounded-xl bg-rose-500/15 text-rose-600 dark:text-rose-400 flex items-center justify-center">
                <XCircle className="h-4 w-4" />
              </div>
            )}
            <div>
              <h3 id="leave-review-dialog-title" className="font-semibold text-foreground text-sm">
                {approving ? "Approve Leave Request" : "Reject Leave Request"}
              </h3>
              <p className="text-xs text-muted-foreground">
                For {target.employeeName} ({target.employeeCode})
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground"
            aria-label="Close dialog"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-4 text-xs">
          <div className="p-3 rounded-xl bg-muted/40 border border-border/60 space-y-1.5">
            <div className="flex justify-between text-muted-foreground">
              <span>Category:</span>
              <span className="font-semibold text-foreground">{target.leaveTypeName}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Dates:</span>
              <span className="font-medium text-foreground">
                {formatDisplayDate(target.startDate)} – {formatDisplayDate(target.endDate)}
              </span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Duration:</span>
              <span className="font-bold text-foreground">{target.durationDays} days</span>
            </div>
            <div className="pt-1.5 border-t border-border/40 text-muted-foreground">
              <span>Reason:</span>
              <p className="text-foreground italic mt-0.5">&ldquo;{target.reason}&rdquo;</p>
            </div>
          </div>

          <div>
            <label htmlFor="leave-management-client-field" className="block font-semibold text-foreground mb-1">
              {approving ? "Approval Notes (Optional):" : "Rejection Reason / Notes (Recommended):"}
            </label>
            <textarea
              id="leave-management-client-field"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={
                approving
                  ? "e.g. Approved. Team coverage confirmed with department manager."
                  : "e.g. Peak release window; please reschedule or consult manager."
              }
              className="w-full p-2.5 rounded-xl border border-border/80 bg-background text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary placeholder:text-muted-foreground"
            />
          </div>

          {approving && (
            <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-300 text-[11px] flex items-start gap-2">
              <Info className="h-4 w-4 shrink-0 mt-0.5" />
              <span>
                Approving marks days in this window as <strong>ON LEAVE</strong> in Attendance where
                no attendance is recorded. Days with a check-in, present/half-day status or a pending
                correction are left unchanged and listed after approval.
              </span>
            </div>
          )}
        </div>

        <div className="p-4 bg-muted/20 border-t border-border/60 flex items-center justify-end gap-2.5">
          <Button variant="outline" size="sm" onClick={onClose} disabled={isPending} className="rounded-xl text-xs h-8">
            Cancel
          </Button>
          <Button
            size="sm"
            variant={approving ? "primary" : "destructive"}
            onClick={() => onConfirm(notes)}
            disabled={isPending}
            className="rounded-xl text-xs h-8 shadow-xs"
          >
            {isPending ? (
              <>
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Processing...
              </>
            ) : approving ? (
              "Confirm Approval"
            ) : (
              "Confirm Rejection"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
