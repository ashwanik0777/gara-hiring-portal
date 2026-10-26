"use client";

import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { FileText, ShieldCheck, X, Check, Info, PieChart, CalendarCheck } from "lucide-react";
import { getEmployeeLeaveSummaryAction } from "../../actions";
import type { EmployeeLeaveSummary, LeaveRequestItem } from "../../types";
import { formatDisplayDate, LeaveStatusBadge, LeaveTypeBadge } from "../leave-ui";

interface LeaveDetailsDialogProps {
  target: LeaveRequestItem;
  canReview: boolean;
  onClose: () => void;
  onReview: (action: "APPROVED" | "REJECTED") => void;
}

type SummaryState =
  | { status: "loading" }
  | { status: "ready"; data: EmployeeLeaveSummary }
  | { status: "unavailable"; message: string };

/**
 * Full details of one request. The employee's recorded-days summary is fetched when the
 * dialog opens (summed in the database), so the list page never loads every request.
 */
export function LeaveDetailsDialog({ target, canReview, onClose, onReview }: LeaveDetailsDialogProps) {
  // Keyed by request id so a new target shows the loading state without a synchronous reset.
  const [loaded, setLoaded] = useState<{ key: string; state: SummaryState } | null>(null);
  const summary: SummaryState = loaded?.key === target.id ? loaded.state : { status: "loading" };

  useEffect(() => {
    let cancelled = false;
    getEmployeeLeaveSummaryAction({ employeeId: target.employeeId, excludeRequestId: target.id }).then(
      (res) => {
        if (cancelled) return;
        setLoaded({
          key: target.id,
          state: res.success
            ? { status: "ready", data: res.data }
            : { status: "unavailable", message: res.error },
        });
      }
    );
    return () => {
      cancelled = true;
    };
  }, [target.employeeId, target.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="leave-details-dialog-title"
    >
      <div className="bg-card border border-border/80 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="p-4 sm:p-5 border-b border-border/60 flex items-center justify-between bg-muted/20 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-10 w-10 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold text-sm shrink-0 border border-blue-500/20 shadow-2xs">
              {target.employeeName.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 id="leave-details-dialog-title" className="font-bold text-foreground text-sm sm:text-base truncate">
                  {target.employeeName}
                </h3>
                <span className="font-mono text-[11px] font-semibold text-primary px-2 py-0.5 rounded-md bg-primary/10 border border-primary/20">
                  {target.employeeCode}
                </span>
              </div>
              <p className="text-xs text-muted-foreground truncate mt-0.5">
                {target.employeeDepartment} • {target.employeeDesignation}
                {target.employeeEmail && ` • ${target.employeeEmail}`}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors shrink-0 cursor-pointer"
            aria-label="Close dialog"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-5 text-xs">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-bold text-foreground text-xs uppercase tracking-wider font-mono flex items-center gap-1.5">
                <FileText className="h-3.5 w-3.5 text-primary" /> Application Details
              </span>
              <div>
                <LeaveStatusBadge status={target.status} />
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 p-3.5 rounded-xl bg-muted/30 border border-border/60">
              <div>
                <span className="text-muted-foreground block text-[10px] uppercase font-mono font-medium">Category</span>
                <div className="mt-1">
                  <LeaveTypeBadge code={target.leaveTypeCode} name={target.leaveTypeName} isPaid={target.isPaid} />
                </div>
              </div>
              <div>
                <span className="text-muted-foreground block text-[10px] uppercase font-mono font-medium">Duration</span>
                <span className="font-bold text-foreground block mt-1 font-mono text-xs">
                  {target.durationDays} {target.durationDays === 1 ? "Day" : "Days"}
                </span>
              </div>
              <div className="col-span-2">
                <span className="text-muted-foreground block text-[10px] uppercase font-mono font-medium">Date Range</span>
                <span className="font-semibold text-foreground block mt-1">
                  {formatDisplayDate(target.startDate)} – {formatDisplayDate(target.endDate)}
                </span>
              </div>
            </div>

            <div>
              <span className="font-semibold text-foreground block mb-1 text-xs">Reason for Absence:</span>
              <div className="p-3.5 rounded-xl bg-muted/20 border border-border/60 text-foreground text-xs leading-relaxed">
                &ldquo;{target.reason}&rdquo;
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-muted/40 border border-border/60 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Submitted On:</span>
                <span className="text-foreground font-medium">{formatDisplayDate(target.createdAt)}</span>
              </div>
              {target.reviewedByName && (
                <div className="flex items-center justify-between text-xs pt-1.5 border-t border-border/40">
                  <span className="text-muted-foreground">Reviewed By:</span>
                  <span className="text-foreground font-semibold flex items-center gap-1">
                    <ShieldCheck className="h-3.5 w-3.5 text-primary" />
                    {target.reviewedByName}
                  </span>
                </div>
              )}
              {target.reviewedAt && (
                <div className="flex items-center justify-between text-xs pt-1.5 border-t border-border/40">
                  <span className="text-muted-foreground">Reviewed At:</span>
                  <span className="text-foreground font-medium">{formatDisplayDate(target.reviewedAt)}</span>
                </div>
              )}
              {target.reviewNotes && (
                <div className="pt-2 border-t border-border/40">
                  <span className="text-muted-foreground block text-[11px] font-medium">Reviewer Remarks:</span>
                  <p className="text-foreground italic mt-0.5 bg-background/60 p-2 rounded-lg border border-border/40">
                    &ldquo;{target.reviewNotes}&rdquo;
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="pt-3 border-t border-border/60 space-y-3">
            <div>
              <h4 className="font-bold text-foreground text-xs uppercase tracking-wider font-mono flex items-center gap-1.5">
                <PieChart className="h-3.5 w-3.5 text-primary" /> Recorded Leave
              </h4>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Calendar days on record for {target.employeeName}.
              </p>
            </div>

            {summary.status === "loading" ? (
              <div role="status" aria-live="polite" aria-busy="true" className="grid grid-cols-3 gap-2.5">
                <span className="sr-only">Loading recorded leave</span>
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} className="h-16 rounded-xl" />
                ))}
              </div>
            ) : summary.status === "unavailable" ? (
              <div role="status" className="p-3 rounded-xl bg-muted/20 border border-border/50 text-[11px] text-muted-foreground">
                Recorded leave is unavailable right now. {summary.message}
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-2.5">
                <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-center">
                  <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400 uppercase font-mono block">
                    Approved
                  </span>
                  <span className="text-lg sm:text-xl font-extrabold font-mono text-emerald-700 dark:text-emerald-300 block mt-0.5">
                    {summary.data.approvedDays} <span className="text-xs font-normal">days</span>
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-center">
                  <span className="text-[10px] font-bold text-amber-700 dark:text-amber-400 uppercase font-mono block">
                    Pending Approvals
                  </span>
                  <span className="text-lg sm:text-xl font-extrabold font-mono text-amber-700 dark:text-amber-300 block mt-0.5">
                    {summary.data.pendingDays} <span className="text-xs font-normal">days</span>
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 text-center">
                  <span className="text-[10px] font-bold text-blue-700 dark:text-blue-400 uppercase font-mono block">
                    Total Applications
                  </span>
                  <span className="text-lg sm:text-xl font-extrabold font-mono text-blue-700 dark:text-blue-300 block mt-0.5">
                    {summary.data.totalRequests}
                  </span>
                </div>
              </div>
            )}

            <div className="p-3 rounded-xl border border-amber-500/30 bg-amber-500/10 text-[11px] text-amber-800 dark:text-amber-300 flex items-start gap-2">
              <Info className="h-4 w-4 shrink-0 mt-0.5" />
              <span>Leave balance policy pending approval (OD-007). Entitlements and remaining balances are not calculated.</span>
            </div>
          </div>

          <div className="pt-3 border-t border-border/60 space-y-2.5">
            <span className="font-bold text-foreground text-xs uppercase tracking-wider font-mono flex items-center gap-1.5">
              <CalendarCheck className="h-3.5 w-3.5 text-primary" /> Other Leave Applications
            </span>
            {summary.status === "ready" && summary.data.recentOther.length > 0 ? (
              <div className="space-y-2">
                {summary.data.recentOther.map((hist) => (
                  <div
                    key={hist.id}
                    className="p-2.5 rounded-xl border border-border/60 bg-muted/20 flex items-center justify-between gap-3 text-xs"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-foreground">
                          {formatDisplayDate(hist.startDate)} – {formatDisplayDate(hist.endDate)}
                        </span>
                        <span className="text-[10px] text-muted-foreground font-mono font-bold">({hist.durationDays}d)</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground truncate max-w-xs mt-0.5">{hist.reason}</p>
                    </div>
                    <div className="shrink-0">
                      <LeaveStatusBadge status={hist.status} />
                    </div>
                  </div>
                ))}
              </div>
            ) : summary.status === "loading" ? (
              <Skeleton className="h-12 rounded-xl" />
            ) : (
              <div className="p-3 rounded-xl bg-muted/20 border border-border/50 text-[11px] text-muted-foreground">
                No other leave records found for this employee.
              </div>
            )}
          </div>
        </div>

        <div className="p-4 bg-muted/20 border-t border-border/60 flex items-center justify-between gap-2 shrink-0">
          {canReview ? (
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => onReview("REJECTED")}
                className="rounded-xl text-xs h-8 text-rose-600 border-rose-500/30 hover:bg-rose-500/10 gap-1"
              >
                <X className="h-3.5 w-3.5" /> Reject
              </Button>
              <Button
                size="sm"
                onClick={() => onReview("APPROVED")}
                className="rounded-xl text-xs h-8 bg-emerald-600 hover:bg-emerald-700 text-white gap-1 shadow-xs"
              >
                <Check className="h-3.5 w-3.5" /> Approve
              </Button>
            </div>
          ) : (
            <div className="text-[11px] text-muted-foreground italic">Status: {target.status}</div>
          )}
          <Button variant="outline" size="sm" onClick={onClose} className="rounded-xl text-xs h-8 ml-auto">
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}
