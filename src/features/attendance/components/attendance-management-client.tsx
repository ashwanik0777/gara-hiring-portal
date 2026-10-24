"use client";

import React, { useState, useEffect, useTransition, useMemo } from "react";
import { AttendanceStatus, AttendanceEntryMethod } from "@/types/enums";
import { recordAttendanceAction, selfCheckInAction, selfCheckOutAction } from "../actions";
import type {
  AttendanceEmployeeOption,
  AttendancePageData,
  AttendanceRecordView,
} from "../types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Clock,
  Calendar,
  CheckCircle2,
  UserCheck,
  AlertCircle,
  X,
  Search,
  Loader2,
  FileText,
  ShieldCheck,
  LogIn,
  LogOut,
} from "lucide-react";

type StaffSettableStatus = "PRESENT" | "HALF_DAY" | "ON_LEAVE" | "ABSENT";

type PortalRole = "ADMIN" | "SUBADMIN" | "HRMS";

/** UTC calendar day key, matching how the server stores attendance dates. */
function utcDayKey(iso: string): string {
  return iso.slice(0, 10);
}

function todayUtcKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function mergeRecords(
  base: AttendanceRecordView[],
  local: AttendanceRecordView[]
): AttendanceRecordView[] {
  const map = new Map<string, AttendanceRecordView>();
  for (const r of base) {
    map.set(`${r.employeeId}-${utcDayKey(r.date)}`, r);
  }
  for (const r of local) {
    map.set(`${r.employeeId}-${utcDayKey(r.date)}`, r);
  }
  return Array.from(map.values()).sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );
}

function formatDuration(checkIn: string | null, checkOut: string | null): string {
  if (!checkIn || !checkOut) return "—";
  const diffMs = new Date(checkOut).getTime() - new Date(checkIn).getTime();
  if (diffMs <= 0) return "—";
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  return `${hours}h ${mins}m`;
}

function formatTime(iso: string | null): string {
  return iso
    ? new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : "—";
}

function StatusBadge({ status }: { status: AttendanceStatus }) {
  switch (status) {
    case AttendanceStatus.PRESENT:
      return (
        <Badge
          variant="outline"
          className="bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800 text-[10px]"
        >
          Present
        </Badge>
      );
    case AttendanceStatus.HALF_DAY:
      return (
        <Badge
          variant="outline"
          className="bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 border-amber-200 dark:border-amber-800 text-[10px]"
        >
          Half Day
        </Badge>
      );
    case AttendanceStatus.ON_LEAVE:
      return (
        <Badge
          variant="outline"
          className="bg-purple-50 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300 border-purple-200 dark:border-purple-800 text-[10px]"
        >
          On Leave
        </Badge>
      );
    case AttendanceStatus.ABSENT:
      return (
        <Badge
          variant="outline"
          className="bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 border-rose-200 dark:border-rose-800 text-[10px]"
        >
          Absent
        </Badge>
      );
    case AttendanceStatus.REGULARIZATION_PENDING:
      return (
        <Badge
          variant="outline"
          className="bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 border-blue-200 dark:border-blue-800 text-[10px]"
        >
          Correction Pending
        </Badge>
      );
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

function entryMethodLabel(method: AttendanceEntryMethod): string {
  if (method === AttendanceEntryMethod.WEB_PORTAL) return "Self check-in";
  if (method === AttendanceEntryMethod.SYSTEM_IMPORT) return "System";
  return "Staff entry";
}

function FeedbackBanner({
  errorMsg,
  successMsg,
}: {
  errorMsg: string | null;
  successMsg: string | null;
}) {
  return (
    <>
      {errorMsg && (
        <div
          role="alert"
          className="p-3.5 rounded-xl border border-destructive/20 bg-destructive/10 text-destructive text-xs flex items-center gap-2"
        >
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}
      {successMsg && (
        <div
          role="status"
          className="p-3.5 rounded-xl border border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 text-xs flex items-center gap-2"
        >
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}
    </>
  );
}

function AttendanceTable({
  records,
  showEmployee,
  emptyHint,
}: {
  records: AttendanceRecordView[];
  showEmployee: boolean;
  emptyHint: string;
}) {
  const columnCount = showEmployee ? 7 : 6;
  return (
    <div className="rounded-2xl border border-border/70 bg-card overflow-hidden shadow-2xs">
      <div className="overflow-x-auto">
        <table className="w-full text-xs text-left">
          <thead className="bg-muted/50 border-b border-border/70 text-muted-foreground font-semibold">
            <tr>
              {showEmployee && <th className="py-3 px-4">Employee</th>}
              <th className="py-3 px-4">Date (UTC)</th>
              <th className="py-3 px-4">Check-In</th>
              <th className="py-3 px-4">Check-Out</th>
              <th className="py-3 px-4">Duration</th>
              <th className="py-3 px-4">Status</th>
              <th className="py-3 px-4">Entry Method & Notes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {records.length === 0 ? (
              <tr>
                <td colSpan={columnCount} className="py-10 text-center text-muted-foreground space-y-2">
                  <Clock className="h-7 w-7 mx-auto text-muted-foreground/60 mb-2" />
                  <p className="font-semibold text-foreground text-xs">No attendance logs recorded yet</p>
                  <p className="text-[11px] text-muted-foreground">{emptyHint}</p>
                </td>
              </tr>
            ) : (
              records.map((record) => {
                const checkOutInProgress =
                  !record.checkOutTime &&
                  Boolean(record.checkInTime) &&
                  record.status === AttendanceStatus.PRESENT;

                const initials = record.employeeName
                  .split(" ")
                  .map((n) => n[0])
                  .filter(Boolean)
                  .slice(0, 2)
                  .join("")
                  .toUpperCase();

                return (
                  <tr key={record.id} className="hover:bg-muted/20 transition-colors">
                    {showEmployee && (
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2.5">
                          <div className="h-7 w-7 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/60 dark:text-blue-300 font-bold text-[10px] flex items-center justify-center shrink-0 border border-blue-200 dark:border-blue-800">
                            {initials}
                          </div>
                          <div>
                            <div className="font-bold text-foreground">{record.employeeName}</div>
                            <div className="text-[10px] text-muted-foreground font-mono">
                              {record.employeeCode} • {record.department}
                            </div>
                          </div>
                        </div>
                      </td>
                    )}

                    <td className="py-3 px-4 font-medium text-foreground">
                      {new Date(record.date).toLocaleDateString([], {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                        timeZone: "UTC",
                      })}
                    </td>

                    <td className="py-3 px-4">
                      <div className="flex items-center gap-1.5 font-mono">
                        {record.checkInTime && (
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" />
                        )}
                        <span>{formatTime(record.checkInTime)}</span>
                      </div>
                    </td>

                    <td className="py-3 px-4">
                      <div className="flex items-center gap-1.5 font-mono">
                        {checkOutInProgress ? (
                          <Badge
                            variant="outline"
                            className="text-[9px] py-0 px-1.5 bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400 border-blue-200"
                          >
                            In Progress
                          </Badge>
                        ) : (
                          <span>{formatTime(record.checkOutTime)}</span>
                        )}
                      </div>
                    </td>

                    <td className="py-3 px-4 font-mono text-muted-foreground">
                      {formatDuration(record.checkInTime, record.checkOutTime)}
                    </td>

                    <td className="py-3 px-4">
                      <StatusBadge status={record.status} />
                    </td>

                    <td className="py-3 px-4">
                      <div className="flex items-center gap-1.5">
                        <Badge
                          variant="outline"
                          className="text-[9px] py-0 px-1.5 bg-muted/50 text-muted-foreground"
                        >
                          {entryMethodLabel(record.entryMethod)}
                        </Badge>
                        {record.notes && (
                          <span className="text-[11px] text-muted-foreground truncate max-w-[150px]">
                            {record.notes}
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PolicyNotice({ portalRole }: { portalRole: PortalRole }) {
  return (
    <div className="p-4 rounded-xl border border-border/70 bg-card shadow-2xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-muted-foreground">
      <div className="flex items-center gap-2 text-foreground font-semibold">
        <ShieldCheck className="h-4 w-4 text-primary shrink-0" />
        <span>Attendance recording</span>
        <Badge variant="outline" className="text-[10px] uppercase font-mono tracking-wide py-0">
          {portalRole} Scope
        </Badge>
      </div>
      <div>
        Check-in and check-out use server time; days are UTC calendar days. Work hours, grace
        periods, overtime and correction rules are pending approval (OD-006).
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Self view: own records and server-timed check-in / check-out only
// ---------------------------------------------------------------------------

function SelfAttendancePanel({
  employee,
  initialRecords,
  portalRole,
}: {
  employee: AttendanceEmployeeOption | null;
  initialRecords: AttendanceRecordView[];
  portalRole: PortalRole;
}) {
  const [localRecords, setLocalRecords] = useState<AttendanceRecordView[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const checkInButtonRef = React.useRef<HTMLButtonElement>(null);

  // The dashboard's "Record Attendance" shortcut focuses the self check-in control.
  useEffect(() => {
    const handleNavbarRecordEvent = () => checkInButtonRef.current?.focus();
    window.addEventListener("record-attendance", handleNavbarRecordEvent);
    return () => window.removeEventListener("record-attendance", handleNavbarRecordEvent);
  }, []);

  const records = useMemo(
    () => mergeRecords(initialRecords, localRecords),
    [initialRecords, localRecords]
  );

  if (!employee) {
    return (
      <div className="w-full space-y-6">
        <div className="p-6 rounded-2xl border border-border/70 bg-card text-center space-y-2">
          <UserCheck className="h-8 w-8 mx-auto text-muted-foreground/70" />
          <p className="text-sm font-semibold text-foreground">No employee record is linked to your account</p>
          <p className="text-xs text-muted-foreground">
            Attendance is available once HR has created your employee record.
          </p>
        </div>
        <PolicyNotice portalRole={portalRole} />
      </div>
    );
  }

  const todayKey = todayUtcKey();
  const todayRecord = records.find((r) => utcDayKey(r.date) === todayKey) ?? null;
  const staffSetStatus =
    todayRecord !== null &&
    !todayRecord.checkInTime &&
    todayRecord.status !== AttendanceStatus.PRESENT;
  const canCheckIn = !todayRecord || (!todayRecord.checkInTime && !staffSetStatus);
  const canCheckOut =
    todayRecord !== null &&
    Boolean(todayRecord.checkInTime) &&
    !todayRecord.checkOutTime &&
    todayRecord.status !== AttendanceStatus.ABSENT &&
    todayRecord.status !== AttendanceStatus.ON_LEAVE;

  const runSelfAction = (kind: "in" | "out") => {
    setErrorMsg(null);
    setSuccessMsg(null);
    startTransition(async () => {
      const res = kind === "in" ? await selfCheckInAction() : await selfCheckOutAction();
      if (!res.success) {
        setErrorMsg(res.error);
        return;
      }
      setSuccessMsg(kind === "in" ? "Checked in for today." : "Checked out for today.");
      setLocalRecords((prev) => [
        res.record,
        ...prev.filter((r) => r.id !== res.record.id),
      ]);
    });
  };

  return (
    <div className="w-full space-y-6">
      <FeedbackBanner errorMsg={errorMsg} successMsg={successMsg} />

      <div className="p-5 rounded-2xl border border-border/70 bg-card shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <p className="text-[10px] font-bold text-muted-foreground tracking-wider uppercase">
            Today (UTC {todayKey})
          </p>
          <p className="text-sm font-semibold text-foreground mt-1">
            {employee.name} <span className="font-mono text-xs text-muted-foreground">({employee.employeeCode})</span>
          </p>
          <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
            {todayRecord ? (
              <>
                <StatusBadge status={todayRecord.status} />
                <span>
                  In {formatTime(todayRecord.checkInTime)} · Out {formatTime(todayRecord.checkOutTime)}
                </span>
              </>
            ) : (
              <span>Not checked in yet.</span>
            )}
          </div>
          {staffSetStatus && (
            <p className="mt-2 text-[11px] text-muted-foreground">
              Today&apos;s attendance was recorded by staff. Contact your supervisor for corrections.
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            ref={checkInButtonRef}
            type="button"
            size="sm"
            onClick={() => runSelfAction("in")}
            disabled={isPending || !canCheckIn}
            className="text-xs gap-1.5"
          >
            {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LogIn className="h-3.5 w-3.5" />}
            Check In
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => runSelfAction("out")}
            disabled={isPending || !canCheckOut}
            className="text-xs gap-1.5"
          >
            <LogOut className="h-3.5 w-3.5" />
            Check Out
          </Button>
        </div>
      </div>

      <AttendanceTable
        records={records}
        showEmployee={false}
        emptyHint="Use Check In above to record today's attendance."
      />

      <PolicyNotice portalRole={portalRole} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Team view: staff holding the attendance permission
// ---------------------------------------------------------------------------

function TeamAttendancePanel({
  initialRecords,
  employees,
  pendingRegularizationCount,
  selfEmployeeId,
  portalRole,
}: {
  initialRecords: AttendanceRecordView[];
  employees: AttendanceEmployeeOption[];
  pendingRegularizationCount: number;
  selfEmployeeId: string | null;
  portalRole: PortalRole;
}) {
  // Staff cannot edit their own attendance through the staff form (separation of duties).
  const editableEmployees = useMemo(
    () => employees.filter((e) => e.id !== selfEmployeeId),
    [employees, selfEmployeeId]
  );

  const [localRecords, setLocalRecords] = useState<AttendanceRecordView[]>([]);
  const [isRecordModalOpen, setIsRecordModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");

  const todayKey = todayUtcKey();
  const [formEmployeeId, setFormEmployeeId] = useState<string>(editableEmployees[0]?.id || "");
  const [formDate, setFormDate] = useState<string>(todayKey);
  const [formCheckInTime, setFormCheckInTime] = useState<string>("");
  const [formCheckOutTime, setFormCheckOutTime] = useState<string>("");
  const [formStatus, setFormStatus] = useState<StaffSettableStatus>("PRESENT");
  const [formNotes, setFormNotes] = useState<string>("");

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Listen to "record-attendance" event from top navbar button
  useEffect(() => {
    const handleNavbarRecordEvent = () => setIsRecordModalOpen(true);
    window.addEventListener("record-attendance", handleNavbarRecordEvent);
    return () => window.removeEventListener("record-attendance", handleNavbarRecordEvent);
  }, []);

  // Close modal on Escape key press
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isRecordModalOpen) {
        setIsRecordModalOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isRecordModalOpen]);

  // Lock body scroll when modal is open
  useEffect(() => {
    document.body.style.overflow = isRecordModalOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [isRecordModalOpen]);

  const records = useMemo(
    () => mergeRecords(initialRecords, localRecords),
    [initialRecords, localRecords]
  );

  const upsertLocal = (record: AttendanceRecordView) => {
    setLocalRecords((prev) => [
      record,
      ...prev.filter(
        (r) => !(r.employeeId === record.employeeId && utcDayKey(r.date) === utcDayKey(record.date))
      ),
    ]);
  };

  const handleRecordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!formEmployeeId) {
      setErrorMsg("Please select an employee.");
      return;
    }

    startTransition(async () => {
      // Times are entered in the browser's local time zone and sent as ISO instants.
      const checkInISO = formCheckInTime
        ? new Date(`${formDate}T${formCheckInTime}:00`).toISOString()
        : null;
      const checkOutISO = formCheckOutTime
        ? new Date(`${formDate}T${formCheckOutTime}:00`).toISOString()
        : null;

      const res = await recordAttendanceAction({
        employeeId: formEmployeeId,
        date: `${formDate}T00:00:00.000Z`,
        checkInTime: checkInISO,
        checkOutTime: checkOutISO,
        status: formStatus,
        notes: formNotes.trim() || null,
      });

      if (!res.success) {
        setErrorMsg(res.error);
        return;
      }
      setSuccessMsg("Attendance recorded.");
      setIsRecordModalOpen(false);
      upsertLocal(res.record);
    });
  };

  // Staff member's own check-in uses the self-service action (server time only).
  const handleSelfCheckIn = () => {
    setErrorMsg(null);
    setSuccessMsg(null);
    startTransition(async () => {
      const res = await selfCheckInAction();
      if (!res.success) {
        setErrorMsg(res.error);
        return;
      }
      setSuccessMsg("Checked in for today.");
      setIsRecordModalOpen(false);
      upsertLocal(res.record);
    });
  };

  const todayRecords = records.filter((r) => utcDayKey(r.date) === todayKey);
  const todayPresentCount = todayRecords.filter(
    (r) => r.status === AttendanceStatus.PRESENT || r.status === AttendanceStatus.HALF_DAY
  ).length;
  const todayLeaveCount = todayRecords.filter(
    (r) => r.status === AttendanceStatus.ON_LEAVE || r.status === AttendanceStatus.ABSENT
  ).length;

  const normalizedQuery = searchQuery.toLowerCase();
  const filteredRecords = records.filter((r) => {
    const matchesSearch =
      r.employeeName.toLowerCase().includes(normalizedQuery) ||
      r.employeeCode.toLowerCase().includes(normalizedQuery) ||
      r.department.toLowerCase().includes(normalizedQuery);
    const matchesStatus = statusFilter === "ALL" || r.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="w-full space-y-6">
      <FeedbackBanner errorMsg={errorMsg} successMsg={successMsg} />

      {/* KPI Statistics Cards (counts of loaded records only) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-card border border-border/70 border-l-4 border-l-emerald-500 rounded-xl p-4 shadow-2xs flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold text-muted-foreground tracking-wider uppercase">
              Present Today (UTC)
            </p>
            <p className="text-2xl sm:text-3xl font-extrabold font-mono text-foreground mt-1">
              {todayPresentCount}
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Present or half day recorded</p>
          </div>
          <div className="h-9 w-9 rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400 flex items-center justify-center shrink-0">
            <UserCheck className="h-4 w-4" />
          </div>
        </div>

        <div className="bg-card border border-border/70 border-l-4 border-l-amber-500 rounded-xl p-4 shadow-2xs flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold text-muted-foreground tracking-wider uppercase">
              On Leave / Absent
            </p>
            <p className="text-2xl sm:text-3xl font-extrabold font-mono text-foreground mt-1">
              {todayLeaveCount}
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Recorded for today</p>
          </div>
          <div className="h-9 w-9 rounded-xl bg-amber-50 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400 flex items-center justify-center shrink-0">
            <Clock className="h-4 w-4" />
          </div>
        </div>

        <div className="bg-card border border-border/70 border-l-4 border-l-blue-500 rounded-xl p-4 shadow-2xs flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold text-muted-foreground tracking-wider uppercase">
              Entries Loaded
            </p>
            <p className="text-2xl sm:text-3xl font-extrabold font-mono text-foreground mt-1">
              {records.length}
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Most recent attendance entries</p>
          </div>
          <div className="h-9 w-9 rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400 flex items-center justify-center shrink-0">
            <Calendar className="h-4 w-4" />
          </div>
        </div>

        <div className="bg-card border border-border/70 border-l-4 border-l-violet-500 rounded-xl p-4 shadow-2xs flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold text-muted-foreground tracking-wider uppercase">
              Pending Regularizations
            </p>
            <p className="text-2xl sm:text-3xl font-extrabold font-mono text-foreground mt-1">
              {pendingRegularizationCount}
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Correction requests awaiting review</p>
          </div>
          <div className="h-9 w-9 rounded-xl bg-violet-50 text-violet-600 dark:bg-violet-950/60 dark:text-violet-400 flex items-center justify-center shrink-0">
            <FileText className="h-4 w-4" />
          </div>
        </div>
      </div>

      {isRecordModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in-50 duration-150"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setIsRecordModalOpen(false);
            }
          }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="record-attendance-title"
        >
          <div className="relative w-full max-w-xl bg-card border border-border/80 shadow-2xl rounded-2xl p-5 sm:p-6 overflow-hidden max-h-[90vh] overflow-y-auto animate-in zoom-in-95 duration-150 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-border/60">
              <div className="flex items-center gap-2.5">
                <div className="h-8 w-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                  <Clock className="h-4 w-4" />
                </div>
                <div>
                  <h3 id="record-attendance-title" className="text-sm font-bold text-foreground">
                    Record Employee Attendance Entry
                  </h3>
                  <p className="text-[11px] text-muted-foreground">
                    Staff entries are recorded as manual entries and audit logged.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsRecordModalOpen(false)}
                className="text-muted-foreground hover:text-foreground h-8 w-8 rounded-lg hover:bg-muted/60 flex items-center justify-center transition-colors cursor-pointer"
                aria-label="Close dialog"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {errorMsg && (
              <div className="p-3 rounded-xl border border-destructive/20 bg-destructive/10 text-destructive text-xs flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            {selfEmployeeId && (
              <div className="flex items-center justify-between bg-muted/30 dark:bg-muted/10 p-3 rounded-xl border border-border/50">
                <span className="text-[11px] text-muted-foreground">
                  Your own attendance uses server-timed self check-in.
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleSelfCheckIn}
                  disabled={isPending}
                  className="h-6 text-[10px] px-2 text-primary hover:text-primary hover:bg-primary/10"
                >
                  <Clock className="h-3 w-3 mr-1" /> Check In for Me
                </Button>
              </div>
            )}

            <form onSubmit={handleRecordSubmit} className="space-y-4 pt-1">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <label htmlFor="attendance-employee" className="text-[11px] font-semibold text-muted-foreground block mb-1">
                    Employee / Intern
                  </label>
                  <select
                    id="attendance-employee"
                    required
                    value={formEmployeeId}
                    onChange={(e) => setFormEmployeeId(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-border bg-background text-foreground"
                  >
                    {editableEmployees.length === 0 ? (
                      <option value="">No employees found</option>
                    ) : (
                      editableEmployees.map((emp) => (
                        <option key={emp.id} value={emp.id}>
                          {emp.name} ({emp.employeeCode} - {emp.department})
                        </option>
                      ))
                    )}
                  </select>
                </div>

                <div>
                  <label htmlFor="attendance-date" className="text-[11px] font-semibold text-muted-foreground block mb-1">
                    Attendance Date (UTC day)
                  </label>
                  <input
                    id="attendance-date"
                    type="date"
                    required
                    value={formDate}
                    onChange={(e) => setFormDate(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-border bg-background text-foreground"
                  />
                </div>

                <div>
                  <label htmlFor="attendance-status" className="text-[11px] font-semibold text-muted-foreground block mb-1">
                    Attendance Status
                  </label>
                  <select
                    id="attendance-status"
                    value={formStatus}
                    onChange={(e) => setFormStatus(e.target.value as StaffSettableStatus)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-border bg-background text-foreground"
                  >
                    <option value="PRESENT">Present</option>
                    <option value="HALF_DAY">Half Day</option>
                    <option value="ON_LEAVE">On Leave</option>
                    <option value="ABSENT">Absent</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="attendance-check-in" className="text-[11px] font-semibold text-muted-foreground block mb-1">
                    Check-In Time (Optional)
                  </label>
                  <input
                    id="attendance-check-in"
                    type="time"
                    value={formCheckInTime}
                    onChange={(e) => setFormCheckInTime(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-border bg-background text-foreground"
                  />
                </div>

                <div>
                  <label htmlFor="attendance-check-out" className="text-[11px] font-semibold text-muted-foreground block mb-1">
                    Check-Out Time (Optional)
                  </label>
                  <input
                    id="attendance-check-out"
                    type="time"
                    value={formCheckOutTime}
                    onChange={(e) => setFormCheckOutTime(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-border bg-background text-foreground"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label htmlFor="attendance-notes" className="text-[11px] font-semibold text-muted-foreground block mb-1">
                    Notes & Audit Reason (Optional)
                  </label>
                  <input
                    id="attendance-notes"
                    type="text"
                    maxLength={1000}
                    value={formNotes}
                    onChange={(e) => setFormNotes(e.target.value)}
                    placeholder="Reason for this entry or correction"
                    className="w-full px-3 py-2 text-xs rounded-xl border border-border bg-background text-foreground"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-border/60">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsRecordModalOpen(false)}
                  className="text-xs"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={isPending || editableEmployees.length === 0}
                  className="text-xs"
                >
                  {isPending ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Recording...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" /> Save Record
                    </>
                  )}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Filter Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 flex-1">
          <div className="relative min-w-[200px] sm:min-w-[260px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="text"
              aria-label="Search attendance records"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name, code or department..."
              className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl border border-border bg-card text-foreground placeholder:text-muted-foreground"
            />
          </div>

          <select
            aria-label="Filter by status"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-1.5 text-xs rounded-xl border border-border bg-card text-foreground"
          >
            <option value="ALL">All Statuses</option>
            <option value={AttendanceStatus.PRESENT}>Present</option>
            <option value={AttendanceStatus.HALF_DAY}>Half Day</option>
            <option value={AttendanceStatus.ON_LEAVE}>On Leave</option>
            <option value={AttendanceStatus.ABSENT}>Absent</option>
            <option value={AttendanceStatus.REGULARIZATION_PENDING}>Correction Pending</option>
          </select>
        </div>
        <Button
          type="button"
          size="sm"
          onClick={() => setIsRecordModalOpen(true)}
          className="text-xs gap-1.5"
        >
          <Clock className="h-3.5 w-3.5" /> Record Attendance
        </Button>
      </div>

      <AttendanceTable
        records={filteredRecords}
        showEmployee
        emptyHint="Use Record Attendance to log an employee's attendance entry."
      />

      <PolicyNotice portalRole={portalRole} />
    </div>
  );
}

export function AttendanceManagementClient({
  pageData,
  portalRole,
}: {
  pageData: Exclude<AttendancePageData, { view: "forbidden" }>;
  portalRole: PortalRole;
}) {
  if (pageData.view === "self") {
    return (
      <SelfAttendancePanel
        employee={pageData.employee}
        initialRecords={pageData.records}
        portalRole={portalRole}
      />
    );
  }
  return (
    <TeamAttendancePanel
      initialRecords={pageData.records}
      employees={pageData.employees}
      pendingRegularizationCount={pageData.pendingRegularizationCount}
      selfEmployeeId={pageData.selfEmployeeId}
      portalRole={portalRole}
    />
  );
}
