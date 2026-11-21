"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Banknote, CheckCircle2, ChevronDown, GraduationCap, Send, Wallet, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { FieldLabelRow, fieldInputClass, fieldOkBorder } from "@/components/ui/form-field";
import { cn } from "@/lib/utils";
import { formatInr } from "@/features/training/money";
import { payViaRazorpayXAction, recordManualPayoutAction, reviewCommissionsAction } from "../actions";
import type { PayoutAmbassadorGroup } from "../services/commission-service";

const inputClass = cn(fieldInputClass, fieldOkBorder);
const DAY = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase() || "?";
}

export type ReviewMode = "review" | "approved" | "declined" | "waiting";

/**
 * One ambassador's open commissions with the administrator's decision tools. Approving makes the
 * chosen commissions payable; declining needs a reason and keeps them unpaid (they can be approved
 * later). Paying covers every approved commission of the ambassador.
 */
export function CommissionReviewCard({
  group,
  mode,
  payment,
}: {
  group: PayoutAmbassadorGroup;
  mode: ReviewMode;
  /** Ready-to-pay cards only: whether RazorpayX can be used, or why not. */
  payment?: { canUseRazorpayX: boolean; razorpayXReason: string | null };
}) {
  const router = useRouter();
  const idPrefix = React.useId();
  const [selected, setSelected] = React.useState<Set<string>>(() => new Set(group.commissions.map((row) => row.id)));
  const [note, setNote] = React.useState("");
  const [declining, setDeclining] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  const selectedRows = group.commissions.filter((row) => selected.has(row.id));
  const selectedPaise = selectedRows.reduce((sum, row) => sum + row.amountPaise, 0);
  const selectable = mode !== "waiting";

  const toggle = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const allChecked = selected.size === group.commissions.length;

  const decide = (decision: "APPROVE" | "DECLINE") => {
    setError(null);
    startTransition(async () => {
      const result = await reviewCommissionsAction({ ambassadorId: group.ambassador.id, commissionIds: [...selected], decision, note });
      if (!result.success) {
        setError(result.error);
        return;
      }
      toast.success(
        decision === "APPROVE"
          ? `Approved ${formatInr(result.data.amountPaise)} for ${group.ambassador.name}.`
          : `Declined ${result.data.count} enrollment${result.data.count === 1 ? "" : "s"} for ${group.ambassador.name}.`
      );
      setDeclining(false);
      setNote("");
      router.refresh();
    });
  };

  return (
    <article className="rounded-2xl border border-border bg-card shadow-sm" aria-label={group.ambassador.name}>
      <header className="flex flex-col gap-3 border-b border-border/60 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div className="flex min-w-0 items-center gap-3">
          <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
            {initials(group.ambassador.name)}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground">{group.ambassador.name}</p>
            <p className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <GraduationCap className="h-3.5 w-3.5" aria-hidden="true" />
                {group.ambassador.college ?? "No college"}
              </span>
              <span className="inline-flex items-center gap-1">
                <Wallet className="h-3.5 w-3.5" aria-hidden="true" />
                {group.ambassador.upiIdMasked ?? "No UPI ID"}
              </span>
            </p>
          </div>
        </div>
        <div className="text-left sm:text-right">
          <p className="text-lg font-bold tabular-nums text-foreground">{formatInr(group.amountPaise)}</p>
          <p className="text-xs text-muted-foreground">
            {group.commissions.length} enrollment{group.commissions.length === 1 ? "" : "s"}
          </p>
        </div>
      </header>

      <div className="space-y-4 p-4 sm:p-5">
        {selectable && group.commissions.length > 1 && (
          <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-medium text-muted-foreground">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-input accent-primary"
              checked={allChecked}
              onChange={() => setSelected(allChecked ? new Set() : new Set(group.commissions.map((row) => row.id)))}
            />
            Select all
          </label>
        )}
        <ul className="grid grid-cols-1 gap-2" aria-label={`Enrollments referred by ${group.ambassador.name}`}>
          {group.commissions.map((row) => {
            const id = `${idPrefix}-${row.id}`;
            return (
              <li key={row.id}>
                <label
                  htmlFor={selectable ? id : undefined}
                  className={cn(
                    "flex items-center gap-3 rounded-xl border border-border bg-background px-3 py-2.5 transition-colors",
                    selectable && "cursor-pointer hover:border-foreground/25 has-checked:border-primary/50 has-checked:bg-primary/5"
                  )}
                >
                  {selectable && (
                    <input id={id} type="checkbox" className="h-4 w-4 shrink-0 rounded border-input accent-primary" checked={selected.has(row.id)} onChange={() => toggle(row.id)} />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-foreground">{row.student}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {row.programme} · {row.batch} · {mode === "waiting" ? `review from ${DAY.format(row.payableAt)}` : `enrolled ${DAY.format(row.createdAt)}`}
                    </span>
                    {mode === "declined" && row.reviewNote && <span className="mt-0.5 block text-xs text-destructive">Reason: {row.reviewNote}</span>}
                  </span>
                  <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground">{formatInr(row.amountPaise)}</span>
                </label>
              </li>
            );
          })}
        </ul>

        {error && (
          <p role="alert" className="rounded-lg border border-destructive/20 bg-destructive/10 p-2.5 text-xs text-destructive">
            {error}
          </p>
        )}

        {mode !== "waiting" && (
          <div className="space-y-3 border-t border-border/60 pt-4">
            <div className="flex flex-wrap items-center gap-2">
              {(mode === "review" || mode === "declined") && (
                <Button size="sm" className="gap-1.5" disabled={pending || selected.size === 0} onClick={() => decide("APPROVE")}>
                  <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                  Approve {selected.size > 0 ? formatInr(selectedPaise) : ""}
                </Button>
              )}
              {(mode === "review" || mode === "approved") && (
                <Button size="sm" variant="outline" className="gap-1.5" disabled={pending || selected.size === 0} onClick={() => setDeclining((value) => !value)} aria-expanded={declining}>
                  <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
                  Decline{mode === "approved" ? " instead" : ""}
                </Button>
              )}
            </div>
            {declining && (
              <div className="flex flex-col gap-2 rounded-xl border border-border bg-muted/30 p-3 sm:flex-row sm:items-end">
                <div className="flex-1 space-y-2">
                  <FieldLabelRow htmlFor={`${idPrefix}-note`} label="Reason" />
                  <input
                    id={`${idPrefix}-note`}
                    className={inputClass}
                    value={note}
                    maxLength={1000}
                    placeholder="e.g. Referrals did not meet the expected quality"
                    onChange={(event) => setNote(event.target.value)}
                  />
                </div>
                <Button size="sm" variant="destructive" disabled={pending || note.trim().length < 5 || selected.size === 0} onClick={() => decide("DECLINE")}>
                  Confirm decline
                </Button>
              </div>
            )}
            {mode === "approved" && payment && <PayoutPanel ambassadorId={group.ambassador.id} amountPaise={group.amountPaise} {...payment} />}
          </div>
        )}
      </div>
    </article>
  );
}

/** Pay every approved commission of one ambassador: RazorpayX, or record a bank transfer. */
function PayoutPanel({
  ambassadorId,
  amountPaise,
  canUseRazorpayX,
  razorpayXReason,
}: {
  ambassadorId: string;
  amountPaise: number;
  canUseRazorpayX: boolean;
  razorpayXReason: string | null;
}) {
  const router = useRouter();
  const idPrefix = React.useId();
  const [utr, setUtr] = React.useState("");
  const [tds, setTds] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  const pay = () => {
    setError(null);
    startTransition(async () => {
      const result = await payViaRazorpayXAction(ambassadorId);
      if (!result.success) return setError(result.error);
      toast.success("Payout sent to RazorpayX.");
      router.refresh();
    });
  };
  const record = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await recordManualPayoutAction({ ambassadorId, utr, tdsRupees: tds });
      if (!result.success) return setError(result.error);
      toast.success("Bank payout recorded.");
      router.refresh();
    });
  };

  return (
    <div className="space-y-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 sm:p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" className="gap-1.5" disabled={pending || !canUseRazorpayX} onClick={pay}>
          <Send className="h-3.5 w-3.5" aria-hidden="true" />
          Pay {formatInr(amountPaise)} via RazorpayX
        </Button>
        {razorpayXReason && <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] text-muted-foreground">{razorpayXReason}</span>}
      </div>
      <details className="group">
        <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 text-xs font-semibold text-primary [&::-webkit-details-marker]:hidden">
          <Banknote className="h-3.5 w-3.5" aria-hidden="true" />
          Record a bank transfer
          <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" aria-hidden="true" />
        </summary>
        <form onSubmit={record} className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-[2fr_1fr_auto] sm:items-end">
          <div className="space-y-2">
            <FieldLabelRow htmlFor={`${idPrefix}-utr`} label="Bank UTR" />
            <input id={`${idPrefix}-utr`} className={inputClass} value={utr} onChange={(event) => setUtr(event.target.value)} maxLength={30} required />
          </div>
          <div className="space-y-2">
            <FieldLabelRow htmlFor={`${idPrefix}-tds`} label="TDS (₹)" optional />
            <input id={`${idPrefix}-tds`} className={inputClass} type="number" min={0} step="0.01" value={tds} onChange={(event) => setTds(event.target.value)} />
          </div>
          <Button type="submit" size="sm" variant="outline" className="h-11" disabled={pending}>
            Record payout
          </Button>
        </form>
      </details>
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
