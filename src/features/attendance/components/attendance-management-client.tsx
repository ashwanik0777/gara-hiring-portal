"use client";

import React, { useCallback, useEffect, useState, useTransition } from "react";
import dynamic from "next/dynamic";
import { usePathname, useRouter } from "next/navigation";
import { AttendanceStatus, AttendanceEntryMethod } from "@/types/enums";
import { recordAttendanceAction, selfCheckInAction, selfCheckOutAction } from "../actions";
import type {
  AttendanceEmployeeOption,
  AttendancePageData,
  AttendanceRecordView,
  PageInfo,
} from "../types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PaginationNav } from "@/components/ui/pagination-nav";
import { DialogFallback } from "@/components/ui/dialog-fallback";
import {
  Clock,
  Calendar,
  CheckCircle2,
  UserCheck,
  AlertCircle,
  Search,
  Loader2,
  FileText,
  ShieldCheck,
  LogIn,
  LogOut,
} from "lucide-react";
import type { RecordAttendanceValues } from "./record-attendance-dialog";

// The staff entry form is loaded on first use so the list paints with less JS.
const RecordAttendanceDialog = dynamic(
  () => import("./record-attendance-dialog").then((m) => m.RecordAttendanceDialog),
  { ssr: false, loading: () => <DialogFallback label="Loading attendance form" /> }
);

type PortalRole = "ADMIN" | "SUBADMIN" | "HRMS";

/** UTC calendar day key, matching how the server stores attendance dates. */
function utcDayKey(iso: string): string {
  return iso.slice(0, 10);
}

function todayUtcKey(): string {
  return new Date().toISOString().slice(0, 10);
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
  return iso ? new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—";
}

function formatMonthLabel(month: string): string {
  const [year, m] = month.split("-").map(Number);
  return new Date(Date.UTC(year, m - 1, 1)).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function StatusBadge({ status }: { status: AttendanceStatus }) {
  switch (status) {
    case AttendanceStatus.PRESENT:
      return (
        <Badge variant="outline" className="bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800 text-[10px]">
          Present
        </Badge>
      );
    case AttendanceStatus.HALF_DAY:
      return (
        <Badge variant="outline" className="bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 border-amber-200 dark:border-amber-800 text-[10px]">
          Half Day
        </Badge>
      );
    case AttendanceStatus.ON_LEAVE:
      return (
        <Badge variant="outline" className="bg-purple-50 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300 border-purple-200 dark:border-purple-800 text-[10px]">
          On Leave
        </Badge>
      );
    case AttendanceStatus.ABSENT:
      return (
        <Badge variant="outline" className="bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 border-rose-200 dark:border-rose-800 text-[10px]">
          Absent
        </Badge>
      );
    case AttendanceStatus.REGULARIZATION_PENDING:
      return (
        <Badge variant="outline" className="bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 border-blue-200 dark:border-blue-800 text-[10px]">
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

function FeedbackBanner({ errorMsg, successMsg }: { errorMsg: string | null; successMsg: string | null }) {
  return (
    <>
      {errorMsg && (
        <div role="alert" className="p-3.5 rounded-xl border border-destructive/20 bg-destructive/10 text-destructive text-xs flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}
      {successMsg && (
        <div role="status" className="p-3.5 rounded-xl border border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 text-xs flex items-center gap-2">
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
  busy,
}: {
  records: AttendanceRecordView[];
  showEmployee: boolean;
  emptyHint: string;
  busy: boolean;
}) {
  const columnCount = showEmployee ? 7 : 6;
  return (
    <div className="rounded-2xl border border-border/70 bg-card overflow-hidden shadow-2xs" aria-busy={busy}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-xs text-left">
          <thead className="bg-muted/50 border-b border-border/70 text-muted-foreground font-semibold">
            <tr>
              {showEmployee && <th scope="col" className="py-3 px-4">Employee</th>}
              <th scope="col" className="py-3 px-4">Date (UTC)</th>
              <th scope="col" className="py-3 px-4">Check-In</th>
              <th scope="col" className="py-3 px-4">Check-Out</th>
              <th scope="col" className="py-3 px-4">Duration</th>
              <th scope="col" className="py-3 px-4">Status</th>
              <th scope="col" className="py-3 px-4">Entry Method & Notes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {records.length === 0 ? (
              <tr>
                <td colSpan={columnCount} className="py-10 text-center text-muted-foreground space-y-2">
                  <Clock className="h-7 w-7 mx-auto text-muted-foreground/60 mb-2" />
                  <p className="font-semibold text-foreground text-xs">No attendance logs for this month</p>
                  <p className="text-[11px] text-muted-foreground">{emptyHint}</p>
                </td>
              </tr>
            ) : (
              records.map((record) => {
                const checkOutInProgress =
                  !record.checkOutTime && Boolean(record.checkInTime) && record.status === AttendanceStatus.PRESENT;
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
                        {record.checkInTime && <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" />}
                        <span>{formatTime(record.checkInTime)}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-1.5 font-mono">
                        {checkOutInProgress ? (
                          <Badge variant="outline" className="text-[9px] py-0 px-1.5 bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400 border-blue-200">
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
                        <Badge variant="outline" className="text-[9px] py-0 px-1.5 bg-muted/50 text-muted-foreground">
                          {entryMethodLabel(record.entryMethod)}
                        </Badge>
                        {record.notes && (
                          <span className="text-[11px] text-muted-foreground truncate max-w-[150px]">{record.notes}</span>
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

/** Month picker that navigates through the URL (`?month=YYYY-MM`). */
function MonthFilter({
  month,
  currentMonth,
  onChange,
  id,
}: {
  month: string;
  currentMonth: string;
  onChange: (month: string | null) => void;
  id: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <label htmlFor={id} className="text-[11px] font-semibold text-muted-foreground">
        Month
      </label>
      <input
        id={id}
        type="month"
        value={month}
        max={currentMonth}
        onChange={(e) => onChange(e.target.value || null)}
        className="px-3 py-1.5 text-xs rounded-xl border border-border bg-card text-foreground"
      />
      {month !== currentMonth && (
        <Button type="button" variant="ghost" size="sm" onClick={() => onChange(null)} className="text-xs h-8 px-2">
          This month
        </Button>
      )}
    </div>
  );
}

/** Builds the page URL from the current filters; empty values are dropped. */
function buildAttendanceHref(
  pathname: string,
  current: { month?: string; status?: string; q?: string; employee?: string; page?: number },
  defaultMonth: string
): string {
  const params = new URLSearchParams();
  if (current.month && current.month !== defaultMonth) params.set("month", current.month);
  if (current.status) params.set("status", current.status);
  if (current.q) params.set("q", current.q);
  if (current.employee) params.set("employee", current.employee);
  if (current.page && current.page > 1) params.set("page", String(current.page));
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

// ---------------------------------------------------------------------------
// Self view: own records and server-timed check-in / check-out only
// ---------------------------------------------------------------------------

function SelfAttendancePanel({
  employee,
  records,
  page,
  month,
  todayRecord: serverTodayRecord,
  portalRole,
}: {
  employee: AttendanceEmployeeOption | null;
  records: AttendanceRecordView[];
  page: PageInfo;
  month: string;
  todayRecord: AttendanceRecordView | null;
  portalRole: PortalRole;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [localToday, setLocalToday] = useState<AttendanceRecordView | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const checkInButtonRef = React.useRef<HTMLButtonElement>(null);
  const currentMonth = todayUtcKey().slice(0, 7);

  // The dashboard's "Record Attendance" shortcut focuses the self check-in control.
  useEffect(() => {
    const handleNavbarRecordEvent = () => checkInButtonRef.current?.focus();
    window.addEventListener("record-attendance", handleNavbarRecordEvent);
    return () => window.removeEventListener("record-attendance", handleNavbarRecordEvent);
  }, []);

  const navigateMonth = (next: string | null) => {
    startTransition(() => {
      router.push(buildAttendanceHref(pathname, { month: next ?? undefined }, currentMonth), { scroll: false });
    });
  };

  if (!employee) {
    return (
      <div className="w-full space-y-6">
        <div className="p-6 rounded-2xl border border-border/70 bg-card text-center space-y-2">
          <UserCheck className="h-8 w-8 mx-auto text-muted-foreground/70" />
          <p className="text-sm font-semibold text-foreground">No employee record is linked to your account</p>
          <p className="text-xs text-muted-foreground">Attendance is available once HR has created your employee record.</p>
        </div>
        <PolicyNotice portalRole={portalRole} />
      </div>
    );
  }

  const todayKey = todayUtcKey();
  const todayRecord =
    localToday && utcDayKey(localToday.date) === todayKey ? localToday : serverTodayRecord;
  const staffSetStatus =
    todayRecord !== null && !todayRecord.checkInTime && todayRecord.status !== AttendanceStatus.PRESENT;
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
      setLocalToday(res.record);
      router.refresh();
    });
  };

  return (
    <div className="w-full space-y-6">
      <FeedbackBanner errorMsg={errorMsg} successMsg={successMsg} />

      <div className="p-5 rounded-2xl border border-border/70 bg-card shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <p className="text-[10px] font-bold text-muted-foreground tracking-wider uppercase">Today (UTC {todayKey})</p>
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
          <Button ref={checkInButtonRef} type="button" size="sm" onClick={() => runSelfAction("in")} disabled={isPending || !canCheckIn} className="text-xs gap-1.5">
            {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LogIn className="h-3.5 w-3.5" />}
            Check In
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => runSelfAction("out")} disabled={isPending || !canCheckOut} className="text-xs gap-1.5">
            <LogOut className="h-3.5 w-3.5" />
            Check Out
          </Button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-foreground">Attendance log · {formatMonthLabel(month)}</h2>
        <MonthFilter id="attendance-self-month" month={month} currentMonth={currentMonth} onChange={navigateMonth} />
      </div>

      <AttendanceTable
        records={records}
        showEmployee={false}
        emptyHint={month === currentMonth ? "Use Check In above to record today's attendance." : "No attendance was recorded in this month."}
        busy={isPending}
      />

      <PaginationNav
        page={page.page}
        pageCount={page.pageCount}
        total={page.total}
        hrefFor={(target) => buildAttendanceHref(pathname, { month, page: target }, currentMonth)}
        label="Attendance log pages"
        itemLabel="entries"
      />

      <PolicyNotice portalRole={portalRole} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Team view: staff holding the attendance permission
// ---------------------------------------------------------------------------

function TeamAttendancePanel({
  pageData,
  portalRole,
}: {
  pageData: Extract<AttendancePageData, { view: "team" }>;
  portalRole: PortalRole;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { records, page, filters, employees, employeesTotal, todayCounts, pendingRegularizationCount, selfEmployeeId } = pageData;

  // Staff cannot edit their own attendance through the staff form (separation of duties).
  const editableEmployees = employees.filter((e) => e.id !== selfEmployeeId);
  const editableTotal = selfEmployeeId && employees.some((e) => e.id === selfEmployeeId) ? employeesTotal - 1 : employeesTotal;

  const [isRecordModalOpen, setIsRecordModalOpen] = useState(false);
  const [searchInput, setSearchInput] = useState(filters.search ?? "");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const currentMonth = todayUtcKey().slice(0, 7);

  // Listen to "record-attendance" event from top navbar button
  useEffect(() => {
    const handleNavbarRecordEvent = () => setIsRecordModalOpen(true);
    window.addEventListener("record-attendance", handleNavbarRecordEvent);
    return () => window.removeEventListener("record-attendance", handleNavbarRecordEvent);
  }, []);

  const navigate = useCallback(
    (overrides: { month?: string | null; status?: string | null; q?: string | null; page?: number | null }) => {
      const next = {
        month: overrides.month === undefined ? filters.month : overrides.month ?? undefined,
        status: overrides.status === undefined ? filters.status : overrides.status ?? undefined,
        q: overrides.q === undefined ? filters.search : overrides.q ?? undefined,
        employee: filters.employeeId,
        page: overrides.page === undefined ? page.page : overrides.page ?? undefined,
      };
      startTransition(() => {
        router.push(buildAttendanceHref(pathname, next, currentMonth), { scroll: false });
      });
    },
    [filters, page.page, pathname, router, currentMonth]
  );

  const closeModal = useCallback(() => {
    setIsRecordModalOpen(false);
    setErrorMsg(null);
  }, []);

  const handleRecordSubmit = (values: RecordAttendanceValues) => {
    setErrorMsg(null);
    setSuccessMsg(null);
    if (!values.employeeId) {
      setErrorMsg("Please select an employee.");
      return;
    }
    startTransition(async () => {
      // Times are entered in the browser's local time zone and sent as ISO instants.
      const checkInISO = values.checkInTime ? new Date(`${values.date}T${values.checkInTime}:00`).toISOString() : null;
      const checkOutISO = values.checkOutTime ? new Date(`${values.date}T${values.checkOutTime}:00`).toISOString() : null;

      const res = await recordAttendanceAction({
        employeeId: values.employeeId,
        date: `${values.date}T00:00:00.000Z`,
        checkInTime: checkInISO,
        checkOutTime: checkOutISO,
        status: values.status,
        notes: values.notes.trim() || null,
      });

      if (!res.success) {
        setErrorMsg(res.error);
        return;
      }
      setSuccessMsg("Attendance recorded.");
      setIsRecordModalOpen(false);
      router.refresh();
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
      router.refresh();
    });
  };

  const hasActiveFilters = Boolean(filters.status || filters.search || filters.month !== currentMonth);

  return (
    <div className="w-full space-y-6">
      <FeedbackBanner errorMsg={isRecordModalOpen ? null : errorMsg} successMsg={successMsg} />

      {/* KPI Statistics Cards (counted in the database) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-card border border-border/70 border-l-4 border-l-emerald-500 rounded-xl p-4 shadow-2xs flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold text-muted-foreground tracking-wider uppercase">Present Today (UTC)</p>
            <p className="text-2xl sm:text-3xl font-extrabold font-mono text-foreground mt-1">{todayCounts.present}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Present or half day recorded</p>
          </div>
          <div className="h-9 w-9 rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400 flex items-center justify-center shrink-0">
            <UserCheck className="h-4 w-4" />
          </div>
        </div>

        <div className="bg-card border border-border/70 border-l-4 border-l-amber-500 rounded-xl p-4 shadow-2xs flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold text-muted-foreground tracking-wider uppercase">On Leave / Absent</p>
            <p className="text-2xl sm:text-3xl font-extrabold font-mono text-foreground mt-1">{todayCounts.onLeaveOrAbsent}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Recorded for today</p>
          </div>
          <div className="h-9 w-9 rounded-xl bg-amber-50 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400 flex items-center justify-center shrink-0">
            <Clock className="h-4 w-4" />
          </div>
        </div>

        <div className="bg-card border border-border/70 border-l-4 border-l-blue-500 rounded-xl p-4 shadow-2xs flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold text-muted-foreground tracking-wider uppercase">Entries This Month</p>
            <p className="text-2xl sm:text-3xl font-extrabold font-mono text-foreground mt-1">{page.total}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">{formatMonthLabel(filters.month)}{hasActiveFilters && filters.status ? " · filtered" : ""}</p>
          </div>
          <div className="h-9 w-9 rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400 flex items-center justify-center shrink-0">
            <Calendar className="h-4 w-4" />
          </div>
        </div>

        <div className="bg-card border border-border/70 border-l-4 border-l-violet-500 rounded-xl p-4 shadow-2xs flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold text-muted-foreground tracking-wider uppercase">Pending Regularizations</p>
            <p className="text-2xl sm:text-3xl font-extrabold font-mono text-foreground mt-1">{pendingRegularizationCount}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Correction requests awaiting review</p>
          </div>
          <div className="h-9 w-9 rounded-xl bg-violet-50 text-violet-600 dark:bg-violet-950/60 dark:text-violet-400 flex items-center justify-center shrink-0">
            <FileText className="h-4 w-4" />
          </div>
        </div>
      </div>

      {isRecordModalOpen && (
        <RecordAttendanceDialog
          employees={editableEmployees}
          employeesTotal={editableTotal}
          selfEmployeeId={selfEmployeeId}
          todayKey={todayUtcKey()}
          isPending={isPending}
          errorMsg={errorMsg}
          onClose={closeModal}
          onSubmit={handleRecordSubmit}
          onSelfCheckIn={handleSelfCheckIn}
        />
      )}

      {/* Filter Header (every filter navigates through the URL) */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 flex-1">
          <form
            className="relative min-w-[200px] sm:min-w-[260px] flex-1 sm:flex-none"
            onSubmit={(e) => {
              e.preventDefault();
              navigate({ q: searchInput.trim() || null, page: null });
            }}
          >
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="search"
              aria-label="Search attendance records"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search by name, code or department..."
              className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl border border-border bg-card text-foreground placeholder:text-muted-foreground"
            />
          </form>

          <select
            aria-label="Filter by status"
            value={filters.status ?? "ALL"}
            onChange={(e) => navigate({ status: e.target.value === "ALL" ? null : e.target.value, page: null })}
            className="px-3 py-1.5 text-xs rounded-xl border border-border bg-card text-foreground"
          >
            <option value="ALL">All Statuses</option>
            <option value={AttendanceStatus.PRESENT}>Present</option>
            <option value={AttendanceStatus.HALF_DAY}>Half Day</option>
            <option value={AttendanceStatus.ON_LEAVE}>On Leave</option>
            <option value={AttendanceStatus.ABSENT}>Absent</option>
            <option value={AttendanceStatus.REGULARIZATION_PENDING}>Correction Pending</option>
          </select>

          <MonthFilter id="attendance-team-month" month={filters.month} currentMonth={currentMonth} onChange={(month) => navigate({ month, page: null })} />

          {hasActiveFilters && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearchInput("");
                navigate({ month: null, status: null, q: null, page: null });
              }}
              className="text-xs h-8 px-2"
            >
              Reset
            </Button>
          )}
        </div>
        <Button type="button" size="sm" onClick={() => setIsRecordModalOpen(true)} className="text-xs gap-1.5">
          <Clock className="h-3.5 w-3.5" /> Record Attendance
        </Button>
      </div>

      <AttendanceTable
        records={records}
        showEmployee
        emptyHint={hasActiveFilters ? "Try another month, status or search term." : "Use Record Attendance to log an employee's attendance entry."}
        busy={isPending}
      />

      <PaginationNav
        page={page.page}
        pageCount={page.pageCount}
        total={page.total}
        hrefFor={(target) =>
          buildAttendanceHref(
            pathname,
            { month: filters.month, status: filters.status, q: filters.search, employee: filters.employeeId, page: target },
            currentMonth
          )
        }
        label="Attendance record pages"
        itemLabel="entries"
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
        records={pageData.records}
        page={pageData.page}
        month={pageData.filters.month}
        todayRecord={pageData.todayRecord}
        portalRole={portalRole}
      />
    );
  }
  return <TeamAttendancePanel pageData={pageData} portalRole={portalRole} />;
}
