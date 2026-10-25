"use client";

import React, { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, Clock, LogIn, LogOut } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { selfCheckInAction, selfCheckOutAction } from "@/features/attendance/actions";
import { AttendanceStatus } from "@/types/enums";
import { linkButtonClass } from "./self-service-ui";

interface TodayAttendanceCardProps {
  /** `YYYY-MM-DD` of today's UTC calendar day. */
  dateKey: string;
  record: {
    status: AttendanceStatus;
    checkInTime: string | null;
    checkOutTime: string | null;
  } | null;
  /** False when no active employee record is linked, so self check-in is unavailable. */
  canRecord: boolean;
  unavailableReason?: string;
}

const STATUS_LABELS: Record<AttendanceStatus, string> = {
  PRESENT: "Present",
  ABSENT: "Absent",
  HALF_DAY: "Half day",
  ON_LEAVE: "On leave",
  REGULARIZATION_PENDING: "Correction pending",
};

/** Times are shown in UTC, matching the UTC calendar day attendance is recorded against. */
function formatUtcTime(iso: string | null): string {
  if (!iso) return "—";
  return `${new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(new Date(iso))} UTC`;
}

/**
 * Today's attendance with the existing self-service check-in / check-out actions. The
 * buttons only mirror the server rules for convenience; the actions decide (server time,
 * own employee record only, never overriding a status recorded by staff).
 */
export function TodayAttendanceCard({ dateKey, record, canRecord, unavailableReason }: TodayAttendanceCardProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ kind: "error" | "success"; text: string } | null>(null);

  const staffSetStatus = record !== null && !record.checkInTime && record.status !== AttendanceStatus.PRESENT;
  const canCheckIn = canRecord && (!record || (!record.checkInTime && !staffSetStatus));
  const canCheckOut =
    canRecord &&
    record !== null &&
    Boolean(record.checkInTime) &&
    !record.checkOutTime &&
    record.status !== AttendanceStatus.ABSENT &&
    record.status !== AttendanceStatus.ON_LEAVE;

  const run = (kind: "in" | "out") => {
    setFeedback(null);
    startTransition(async () => {
      const result = kind === "in" ? await selfCheckInAction() : await selfCheckOutAction();
      if (!result.success) {
        setFeedback({ kind: "error", text: result.error });
        return;
      }
      setFeedback({ kind: "success", text: kind === "in" ? "Checked in for today." : "Checked out for today." });
      router.refresh();
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <Clock className="h-3.5 w-3.5" aria-hidden="true" />
        <span>Today (UTC {dateKey})</span>
        {record ? (
          <Badge variant={record.status === AttendanceStatus.PRESENT ? "success" : "outline"}>
            {STATUS_LABELS[record.status] ?? record.status}
          </Badge>
        ) : (
          <Badge variant="outline">Not recorded yet</Badge>
        )}
      </div>

      <dl className="grid grid-cols-2 gap-3 text-xs">
        <div className="rounded-xl border border-border/60 bg-muted/30 p-3">
          <dt className="text-muted-foreground">Check in</dt>
          <dd className="mt-0.5 font-mono font-semibold text-foreground">{formatUtcTime(record?.checkInTime ?? null)}</dd>
        </div>
        <div className="rounded-xl border border-border/60 bg-muted/30 p-3">
          <dt className="text-muted-foreground">Check out</dt>
          <dd className="mt-0.5 font-mono font-semibold text-foreground">{formatUtcTime(record?.checkOutTime ?? null)}</dd>
        </div>
      </dl>

      {staffSetStatus && (
        <p className="text-[11px] text-muted-foreground">
          Today&apos;s attendance was recorded by staff. Contact your supervisor for corrections.
        </p>
      )}
      {!canRecord && unavailableReason && <p className="text-[11px] text-muted-foreground">{unavailableReason}</p>}

      <div aria-live="polite">
        {feedback && (
          <p
            role={feedback.kind === "error" ? "alert" : undefined}
            className={
              feedback.kind === "error"
                ? "flex items-center gap-1.5 text-xs text-destructive"
                : "flex items-center gap-1.5 text-xs text-success"
            }
          >
            {feedback.kind === "error" ? (
              <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            ) : (
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            )}
            {feedback.text}
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {canRecord && (
          <>
            <Button type="button" size="sm" onClick={() => run("in")} disabled={isPending || !canCheckIn}>
              <LogIn className="h-3.5 w-3.5" aria-hidden="true" /> Check in
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => run("out")}
              disabled={isPending || !canCheckOut}
            >
              <LogOut className="h-3.5 w-3.5" aria-hidden="true" /> Check out
            </Button>
          </>
        )}
        <Link href="/hrms/attendance" className={linkButtonClass("ghost")}>
          Attendance history
        </Link>
      </div>
    </div>
  );
}
