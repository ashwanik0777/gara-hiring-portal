import React from "react";
import { Badge } from "@/components/ui/badge";
import { Clock, CheckCircle2, XCircle } from "lucide-react";
import type { LeaveRequestStatus } from "../types";

/** `YYYY-MM-DD` of today's UTC calendar day (leave dates are stored as UTC days). */
export function todayUtcKey(): string {
  return new Date().toISOString().slice(0, 10);
}

export function formatDisplayDate(isoStr: string): string {
  try {
    return new Date(isoStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    });
  } catch {
    return isoStr;
  }
}

export function LeaveStatusBadge({ status }: { status: LeaveRequestStatus }) {
  switch (status) {
    case "PENDING":
      return (
        <Badge
          variant="warning"
          className="gap-1.5 bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30 px-2.5 py-0.5 text-[11px] font-semibold"
        >
          <Clock className="h-3 w-3 animate-pulse" /> Pending
        </Badge>
      );
    case "APPROVED":
      return (
        <Badge
          variant="default"
          className="gap-1.5 bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30 px-2.5 py-0.5 text-[11px] font-semibold"
        >
          <CheckCircle2 className="h-3 w-3" /> Approved
        </Badge>
      );
    case "REJECTED":
      return (
        <Badge
          variant="destructive"
          className="gap-1.5 bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-500/30 px-2.5 py-0.5 text-[11px] font-semibold"
        >
          <XCircle className="h-3 w-3" /> Rejected
        </Badge>
      );
    case "CANCELLED":
      return (
        <Badge variant="outline" className="gap-1 text-muted-foreground px-2.5 py-0.5 text-[11px]">
          Cancelled
        </Badge>
      );
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

export function LeaveTypeBadge({
  code,
  name,
  isPaid,
}: {
  code: string;
  name: string;
  isPaid: boolean;
}) {
  let dotColor = "bg-blue-500";
  let colorClasses = "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/20";
  if (code.includes("SICK") || code.includes("MED")) {
    dotColor = "bg-rose-500";
    colorClasses = "bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/20";
  } else if (code.includes("EARN") || code.includes("PL")) {
    dotColor = "bg-emerald-500";
    colorClasses = "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20";
  } else if (code.includes("PARENT") || code.includes("MATERN")) {
    dotColor = "bg-purple-500";
    colorClasses = "bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/20";
  } else if (code.includes("UNPAID") || code.includes("LWP") || !isPaid) {
    dotColor = "bg-amber-500";
    colorClasses = "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20";
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium border max-w-full truncate ${colorClasses}`}
      title={`${name} (${isPaid ? "Paid" : "Unpaid"})`}
    >
      <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${dotColor}`} />
      <span className="truncate">{name}</span>
    </span>
  );
}
