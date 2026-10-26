import React from "react";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Lock, Clock } from "lucide-react";
import type { PayrollStatus } from "../types";

export const NOT_CONFIGURED = "Not configured";

/** Neutralises spreadsheet formula injection and quotes a CSV cell. */
export function csvCell(value: string | number | null | undefined): string {
  let text = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(text)) {
    text = `'${text}`;
  }
  return `"${text.replace(/"/g, '""')}"`;
}

export function employmentLabel(type: "INTERN" | "FULL_TIME" | null): string {
  if (type === "INTERN") return "Intern";
  if (type === "FULL_TIME") return "Full-Time";
  return "Type not configured";
}

export function formatDate(isoStr?: string | null): string {
  if (!isoStr) return "—";
  try {
    return new Date(isoStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return isoStr;
  }
}

/** Indian Rupee formatter. Unset amounts are never shown as ₹0. */
export function formatCurrency(amount?: number | null): string {
  if (amount === undefined || amount === null) return NOT_CONFIGURED;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function PayrollStatusBadge({ status }: { status: PayrollStatus }) {
  switch (status) {
    case "PAID":
      return (
        <Badge variant="default" className="gap-1.5 bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30 px-2.5 py-0.5 text-[11px] font-semibold whitespace-nowrap">
          <CheckCircle2 className="h-3 w-3" /> Paid
        </Badge>
      );
    case "FINALIZED":
      return (
        <Badge variant="default" className="gap-1.5 bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30 px-2.5 py-0.5 text-[11px] font-semibold whitespace-nowrap">
          <Lock className="h-3 w-3" /> Finalized
        </Badge>
      );
    case "DRAFT":
      return (
        <Badge variant="warning" className="gap-1.5 bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30 px-2.5 py-0.5 text-[11px] font-semibold whitespace-nowrap">
          <Clock className="h-3 w-3 animate-pulse" /> Draft
        </Badge>
      );
    case "VOID":
      return (
        <Badge variant="outline" className="gap-1 text-muted-foreground px-2.5 py-0.5 text-[11px] whitespace-nowrap">
          Void
        </Badge>
      );
    default:
      return <Badge variant="outline" className="whitespace-nowrap">{status}</Badge>;
  }
}

/** Closes a dialog on Escape unless an action is in flight. */
export function useEscapeToClose(onClose: () => void, isPending = false) {
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isPending) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, isPending]);
}
