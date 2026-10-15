"use client";

import React, { useState, useEffect, useTransition, useMemo } from "react";
import { AttendanceStatus, AttendanceEntryMethod } from "@prisma/client";
import { recordAttendanceAction, ensureEmployeeForUserAction } from "../actions";
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
} from "lucide-react";

export interface AttendanceRecordItem {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  department: string;
  designation: string;
  date: string; // ISO string
  checkInTime: string | null;
  checkOutTime: string | null;
  status: AttendanceStatus;
  entryMethod: AttendanceEntryMethod;
  notes: string | null;
}

export interface EmployeeOption {
  id: string;
  employeeCode: string;
  name: string;
  email: string;
  department: string;
  designation: string;
}

export function AttendanceManagementClient({
  initialRecords,
  employees,
  currentUserId,
  portalRole,
}: {
  initialRecords: AttendanceRecordItem[];
  employees: EmployeeOption[];
  currentUserId: string;
  portalRole: "ADMIN" | "SUBADMIN" | "HRMS";
}) {
  const [localRecords, setLocalRecords] = useState<AttendanceRecordItem[]>([]);
  const [isRecordModalOpen, setIsRecordModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");

  // Form State
  const todayStr = new Date().toISOString().split("T")[0];
  const [formEmployeeId, setFormEmployeeId] = useState<string>(
    employees[0]?.id || ""
  );
  const [formDate, setFormDate] = useState<string>(todayStr);
  const [formCheckInTime, setFormCheckInTime] = useState<string>("09:00");
  const [formCheckOutTime, setFormCheckOutTime] = useState<string>("18:00");
  const [formStatus, setFormStatus] = useState<AttendanceStatus>(
    AttendanceStatus.PRESENT
  );
  const [formEntryMethod, setFormEntryMethod] = useState<AttendanceEntryMethod>(
    AttendanceEntryMethod.WEB_PORTAL
  );
  const [formNotes, setFormNotes] = useState<string>("");

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Listen to "record-attendance" event from top navbar button
  useEffect(() => {
    const handleNavbarRecordEvent = () => {
      setIsRecordModalOpen(true);
    };

    window.addEventListener("record-attendance", handleNavbarRecordEvent);
    return () => {
      window.removeEventListener("record-attendance", handleNavbarRecordEvent);
    };
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
    if (isRecordModalOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isRecordModalOpen]);

  // Merged records from server initialRecords + local optimistic entries
  const records = useMemo(() => {
    const map = new Map<string, AttendanceRecordItem>();
    for (const r of initialRecords) {
      map.set(`${r.employeeId}-${r.date.split("T")[0]}`, r);
    }
    for (const r of localRecords) {
      map.set(`${r.employeeId}-${r.date.split("T")[0]}`, r);
    }
    return Array.from(map.values()).sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );
  }, [initialRecords, localRecords]);

  // Handle Form Submission
  const handleRecordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!formEmployeeId) {
      setErrorMsg("Please select an employee.");
      return;
    }

    startTransition(async () => {
      // Build ISO check-in and check-out strings
      const checkInISO = formCheckInTime
        ? new Date(`${formDate}T${formCheckInTime}:00`).toISOString()
        : null;

      const checkOutISO = formCheckOutTime
        ? new Date(`${formDate}T${formCheckOutTime}:00`).toISOString()
        : null;

      const res = await recordAttendanceAction({
        employeeId: formEmployeeId,
        date: new Date(`${formDate}T00:00:00Z`).toISOString(),
        checkInTime: checkInISO,
        checkOutTime: checkOutISO,
        status: formStatus,
        entryMethod: formEntryMethod,
        notes: formNotes || null,
      });

      if (!res.success) {
        setErrorMsg(res.error || "Failed to record attendance.");
      } else {
        setSuccessMsg("Attendance successfully recorded!");
        setIsRecordModalOpen(false);

        // Optimistically update or prepend record in local view
        const targetEmp = employees.find((e) => e.id === formEmployeeId);
        if (targetEmp) {
          const newRecord: AttendanceRecordItem = {
            id: res.record?.id || Math.random().toString(),
            employeeId: targetEmp.id,
            employeeName: targetEmp.name,
            employeeCode: targetEmp.employeeCode,
            department: targetEmp.department,
            designation: targetEmp.designation,
            date: new Date(`${formDate}T00:00:00Z`).toISOString(),
            checkInTime: checkInISO,
            checkOutTime: checkOutISO,
            status: formStatus,
            entryMethod: formEntryMethod,
            notes: formNotes || null,
          };

          setLocalRecords((prev) => [
            newRecord,
            ...prev.filter(
              (r) =>
                !(
                  r.employeeId === formEmployeeId &&
                  r.date.split("T")[0] === formDate
                )
            ),
          ]);
        }
      }
    });
  };

  // Self Quick Clock-In
  const handleQuickSelfClockIn = () => {
    setErrorMsg(null);
    setSuccessMsg(null);

    startTransition(async () => {
      let empId = employees.find((e) => e.email === currentUserId)?.id;

      if (!empId) {
        const ensured = await ensureEmployeeForUserAction(currentUserId);
        if (ensured.success && ensured.employeeId) {
          empId = ensured.employeeId;
        } else {
          setErrorMsg(ensured.error || "Could not resolve employee profile.");
          return;
        }
      }

      const now = new Date();
      const res = await recordAttendanceAction({
        employeeId: empId,
        date: new Date(todayStr + "T00:00:00Z").toISOString(),
        checkInTime: now.toISOString(),
        status: AttendanceStatus.PRESENT,
        entryMethod: AttendanceEntryMethod.WEB_PORTAL,
        notes: "Quick self check-in via dashboard",
      });

      if (!res.success) {
        setErrorMsg(res.error || "Check-in failed");
      } else {
        setSuccessMsg("Checked in successfully for today!");
        const selfEmp = employees.find((e) => e.id === empId);
        if (selfEmp) {
          const newRecord: AttendanceRecordItem = {
            id: res.record?.id || Math.random().toString(),
            employeeId: selfEmp.id,
            employeeName: selfEmp.name,
            employeeCode: selfEmp.employeeCode,
            department: selfEmp.department,
            designation: selfEmp.designation,
            date: new Date(todayStr + "T00:00:00Z").toISOString(),
            checkInTime: now.toISOString(),
            checkOutTime: null,
            status: AttendanceStatus.PRESENT,
            entryMethod: AttendanceEntryMethod.WEB_PORTAL,
            notes: "Quick self check-in via dashboard",
          };
          setLocalRecords((prev) => [
            newRecord,
            ...prev.filter(
              (r) =>
                !(
                  r.employeeId === empId &&
                  r.date.split("T")[0] === todayStr
                )
            ),
          ]);
        }
      }
    });
  };

  // Quick preset buttons for the modal
  const applyPreset = (type: "full" | "checkin" | "leave" | "half") => {
    if (type === "full") {
      setFormStatus(AttendanceStatus.PRESENT);
      setFormCheckInTime("09:00");
      setFormCheckOutTime("18:00");
    } else if (type === "checkin") {
      setFormStatus(AttendanceStatus.PRESENT);
      setFormCheckInTime("09:00");
      setFormCheckOutTime("");
    } else if (type === "half") {
      setFormStatus(AttendanceStatus.HALF_DAY);
      setFormCheckInTime("09:00");
      setFormCheckOutTime("13:30");
    } else if (type === "leave") {
      setFormStatus(AttendanceStatus.ON_LEAVE);
      setFormCheckInTime("");
      setFormCheckOutTime("");
    }
  };

  // KPI Metrics
  const todayDatePrefix = todayStr;
  const todayRecords = records.filter(
    (r) => r.date.split("T")[0] === todayDatePrefix
  );

  const todayPresentCount = todayRecords.filter(
    (r) =>
      r.status === AttendanceStatus.PRESENT ||
      r.status === AttendanceStatus.HALF_DAY
  ).length;

  const todayLeaveCount = todayRecords.filter(
    (r) =>
      r.status === AttendanceStatus.ON_LEAVE ||
      r.status === AttendanceStatus.ABSENT
  ).length;

  const totalLogsCount = records.length;

  const pendingRegularizations = records.filter(
    (r) => r.status === AttendanceStatus.REGULARIZATION_PENDING
  ).length;

  // Filter records based on search and status
  const filteredRecords = records.filter((r) => {
    const matchesSearch =
      r.employeeName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.employeeCode.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.department.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus =
      statusFilter === "ALL" || r.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  // Duration Helper
  const formatDuration = (
    checkIn: string | null,
    checkOut: string | null
  ): string => {
    if (!checkIn || !checkOut) return "—";
    const diffMs =
      new Date(checkOut).getTime() - new Date(checkIn).getTime();
    if (diffMs <= 0) return "—";
    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    return `${hours}h ${mins}m`;
  };

  const getStatusBadge = (status: AttendanceStatus) => {
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
  };

  return (
    <div className="w-full space-y-6">
      {/* Toast Notifications */}
      {errorMsg && (
        <div className="p-3.5 rounded-xl border border-destructive/20 bg-destructive/10 text-destructive text-xs flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {successMsg && (
        <div className="p-3.5 rounded-xl border border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 text-xs flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* 4 KPI Statistics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Today's Present */}
        <div className="bg-card border border-border/70 border-l-4 border-l-emerald-500 rounded-xl p-4 shadow-2xs hover:shadow-xs transition-shadow flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold text-muted-foreground tracking-wider uppercase">
              Today&apos;s Present
            </p>
            <p className="text-2xl sm:text-3xl font-extrabold font-mono text-foreground mt-1">
              {todayPresentCount}
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Logged active on duty today
            </p>
          </div>
          <div className="h-9 w-9 rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400 flex items-center justify-center shrink-0">
            <UserCheck className="h-4 w-4" />
          </div>
        </div>

        {/* Card 2: On Leave / Absent */}
        <div className="bg-card border border-border/70 border-l-4 border-l-amber-500 rounded-xl p-4 shadow-2xs hover:shadow-xs transition-shadow flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold text-muted-foreground tracking-wider uppercase">
              On Leave / Absent
            </p>
            <p className="text-2xl sm:text-3xl font-extrabold font-mono text-foreground mt-1">
              {todayLeaveCount}
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Authorized leaves & off duty
            </p>
          </div>
          <div className="h-9 w-9 rounded-xl bg-amber-50 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400 flex items-center justify-center shrink-0">
            <Clock className="h-4 w-4" />
          </div>
        </div>

        {/* Card 3: Total Logs Recorded */}
        <div className="bg-card border border-border/70 border-l-4 border-l-blue-500 rounded-xl p-4 shadow-2xs hover:shadow-xs transition-shadow flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold text-muted-foreground tracking-wider uppercase">
              Total Logs Recorded
            </p>
            <p className="text-2xl sm:text-3xl font-extrabold font-mono text-foreground mt-1">
              {totalLogsCount}
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Verified daily timestamp punches
            </p>
          </div>
          <div className="h-9 w-9 rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400 flex items-center justify-center shrink-0">
            <Calendar className="h-4 w-4" />
          </div>
        </div>

        {/* Card 4: Correction Requests */}
        <div className="bg-card border border-border/70 border-l-4 border-l-violet-500 rounded-xl p-4 shadow-2xs hover:shadow-xs transition-shadow flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold text-muted-foreground tracking-wider uppercase">
              Pending Regularizations
            </p>
            <p className="text-2xl sm:text-3xl font-extrabold font-mono text-foreground mt-1">
              {pendingRegularizations}
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Discrepancies awaiting review
            </p>
          </div>
          <div className="h-9 w-9 rounded-xl bg-violet-50 text-violet-600 dark:bg-violet-950/60 dark:text-violet-400 flex items-center justify-center shrink-0">
            <FileText className="h-4 w-4" />
          </div>
        </div>
      </div>

      {/* Centered Modal Dialog Popup */}
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
        >
          <div className="relative w-full max-w-xl bg-card border border-border/80 shadow-2xl rounded-2xl p-5 sm:p-6 overflow-hidden max-h-[90vh] overflow-y-auto animate-in zoom-in-95 duration-150 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-border/60">
              <div className="flex items-center gap-2.5">
                <div className="h-8 w-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                  <Clock className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-foreground">
                    Record Employee Attendance Entry
                  </h3>
                  <p className="text-[11px] text-muted-foreground">
                    Log verified shift punch or duty status for staff and interns
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsRecordModalOpen(false)}
                className="text-muted-foreground hover:text-foreground h-8 w-8 rounded-lg hover:bg-muted/60 flex items-center justify-center transition-colors cursor-pointer"
                title="Close modal"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Error Message inside modal if any */}
            {errorMsg && (
              <div className="p-3 rounded-xl border border-destructive/20 bg-destructive/10 text-destructive text-xs flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Quick Presets */}
            <div className="space-y-1.5 bg-muted/30 dark:bg-muted/10 p-3 rounded-xl border border-border/50">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-muted-foreground font-semibold block">
                  Quick Shift Presets:
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleQuickSelfClockIn}
                  disabled={isPending}
                  className="h-6 text-[10px] px-2 text-primary hover:text-primary hover:bg-primary/10"
                  title="Punch in for yourself right now"
                >
                  <Clock className="h-3 w-3 mr-1" /> Quick Punch for Me
                </Button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => applyPreset("full")}
                  className="h-6 text-[10px] px-2"
                >
                  Full Day (9 AM - 6 PM)
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => applyPreset("checkin")}
                  className="h-6 text-[10px] px-2"
                >
                  Morning Check-In Only
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => applyPreset("half")}
                  className="h-6 text-[10px] px-2"
                >
                  Half Day (9 AM - 1:30 PM)
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => applyPreset("leave")}
                  className="h-6 text-[10px] px-2"
                >
                  Mark Leave
                </Button>
              </div>
            </div>

            <form onSubmit={handleRecordSubmit} className="space-y-4 pt-1">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Employee Selector */}
                <div className="sm:col-span-2">
                  <label className="text-[11px] font-semibold text-muted-foreground block mb-1">
                    Employee / Intern
                  </label>
                  <select
                    required
                    value={formEmployeeId}
                    onChange={(e) => setFormEmployeeId(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-border bg-background text-foreground"
                  >
                    {employees.length === 0 ? (
                      <option value="">No employees found</option>
                    ) : (
                      employees.map((emp) => (
                        <option key={emp.id} value={emp.id}>
                          {emp.name} ({emp.employeeCode} - {emp.department})
                        </option>
                      ))
                    )}
                  </select>
                </div>

                {/* Attendance Date */}
                <div>
                  <label className="text-[11px] font-semibold text-muted-foreground block mb-1">
                    Attendance Date
                  </label>
                  <input
                    type="date"
                    required
                    value={formDate}
                    onChange={(e) => setFormDate(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-border bg-background text-foreground"
                  />
                </div>

                {/* Status */}
                <div>
                  <label className="text-[11px] font-semibold text-muted-foreground block mb-1">
                    Attendance Status
                  </label>
                  <select
                    value={formStatus}
                    onChange={(e) =>
                      setFormStatus(e.target.value as AttendanceStatus)
                    }
                    className="w-full px-3 py-2 text-xs rounded-xl border border-border bg-background text-foreground"
                  >
                    <option value={AttendanceStatus.PRESENT}>Present</option>
                    <option value={AttendanceStatus.HALF_DAY}>Half Day</option>
                    <option value={AttendanceStatus.ON_LEAVE}>On Leave</option>
                    <option value={AttendanceStatus.ABSENT}>Absent</option>
                    <option value={AttendanceStatus.REGULARIZATION_PENDING}>
                      Regularization Pending
                    </option>
                  </select>
                </div>

                {/* Check-In Time */}
                <div>
                  <label className="text-[11px] font-semibold text-muted-foreground block mb-1">
                    Check-In Time
                  </label>
                  <input
                    type="time"
                    value={formCheckInTime}
                    onChange={(e) => setFormCheckInTime(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-border bg-background text-foreground"
                  />
                </div>

                {/* Check-Out Time */}
                <div>
                  <label className="text-[11px] font-semibold text-muted-foreground block mb-1">
                    Check-Out Time (Optional)
                  </label>
                  <input
                    type="time"
                    value={formCheckOutTime}
                    onChange={(e) => setFormCheckOutTime(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-border bg-background text-foreground"
                  />
                </div>

                {/* Entry Method */}
                <div className="sm:col-span-2">
                  <label className="text-[11px] font-semibold text-muted-foreground block mb-1">
                    Entry Method
                  </label>
                  <select
                    value={formEntryMethod}
                    onChange={(e) =>
                      setFormEntryMethod(
                        e.target.value as AttendanceEntryMethod
                      )
                    }
                    className="w-full px-3 py-2 text-xs rounded-xl border border-border bg-background text-foreground"
                  >
                    <option value={AttendanceEntryMethod.WEB_PORTAL}>
                      Web Portal
                    </option>
                    <option value={AttendanceEntryMethod.MANUAL_ENTRY}>
                      Manual Entry
                    </option>
                  </select>
                </div>

                {/* Notes */}
                <div className="sm:col-span-2">
                  <label className="text-[11px] font-semibold text-muted-foreground block mb-1">
                    Notes & Audit Reason (Optional)
                  </label>
                  <input
                    type="text"
                    value={formNotes}
                    onChange={(e) => setFormNotes(e.target.value)}
                    placeholder="e.g. On-site client deployment, verified via admin console"
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
                  disabled={isPending}
                  className="text-xs"
                >
                  {isPending ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />{" "}
                      Recording...
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
          {/* Search Input */}
          <div className="relative min-w-[200px] sm:min-w-[260px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name, code or department..."
              className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl border border-border bg-card text-foreground placeholder:text-muted-foreground"
            />
          </div>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-1.5 text-xs rounded-xl border border-border bg-card text-foreground"
          >
            <option value="ALL">All Statuses</option>
            <option value={AttendanceStatus.PRESENT}>Present</option>
            <option value={AttendanceStatus.HALF_DAY}>Half Day</option>
            <option value={AttendanceStatus.ON_LEAVE}>On Leave</option>
            <option value={AttendanceStatus.ABSENT}>Absent</option>
            <option value={AttendanceStatus.REGULARIZATION_PENDING}>
              Correction Pending
            </option>
          </select>
        </div>
      </div>

      {/* Attendance Records Table */}
      <div className="rounded-2xl border border-border/70 bg-card overflow-hidden shadow-2xs">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-muted/50 border-b border-border/70 text-muted-foreground font-semibold">
              <tr>
                <th className="py-3 px-4">Employee</th>
                <th className="py-3 px-4">Date</th>
                <th className="py-3 px-4">Check-In</th>
                <th className="py-3 px-4">Check-Out</th>
                <th className="py-3 px-4">Duration</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Entry Method & Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {filteredRecords.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="py-10 text-center text-muted-foreground space-y-2"
                  >
                    <Clock className="h-7 w-7 mx-auto text-muted-foreground/60 mb-2" />
                    <p className="font-semibold text-foreground text-xs">
                      No attendance logs recorded yet
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      Click &quot;Record Attendance&quot; in the top navigation bar to log an employee&apos;s daily shift punch.
                    </p>
                  </td>
                </tr>
              ) : (
                filteredRecords.map((record) => {
                  const checkInDisplay = record.checkInTime
                    ? new Date(record.checkInTime).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    : "—";

                  const checkOutDisplay = record.checkOutTime
                    ? new Date(record.checkOutTime).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    : record.status === AttendanceStatus.PRESENT
                      ? "In Progress"
                      : "—";

                  const duration = formatDuration(
                    record.checkInTime,
                    record.checkOutTime
                  );

                  const initials = record.employeeName
                    .split(" ")
                    .map((n) => n[0])
                    .filter(Boolean)
                    .slice(0, 2)
                    .join("")
                    .toUpperCase();

                  return (
                    <tr
                      key={record.id}
                      className="hover:bg-muted/20 transition-colors"
                    >
                      {/* Employee */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2.5">
                          <div className="h-7 w-7 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/60 dark:text-blue-300 font-bold text-[10px] flex items-center justify-center shrink-0 border border-blue-200 dark:border-blue-800">
                            {initials}
                          </div>
                          <div>
                            <div className="font-bold text-foreground">
                              {record.employeeName}
                            </div>
                            <div className="text-[10px] text-muted-foreground font-mono">
                              {record.employeeCode} • {record.department}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Date */}
                      <td className="py-3 px-4 font-medium text-foreground">
                        {new Date(record.date).toLocaleDateString([], {
                          weekday: "short",
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </td>

                      {/* Check-In */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1.5 font-mono">
                          {record.checkInTime && (
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" />
                          )}
                          <span>{checkInDisplay}</span>
                        </div>
                      </td>

                      {/* Check-Out */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1.5 font-mono">
                          {checkOutDisplay === "In Progress" ? (
                            <Badge
                              variant="outline"
                              className="text-[9px] py-0 px-1.5 bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400 border-blue-200"
                            >
                              In Progress
                            </Badge>
                          ) : (
                            <span>{checkOutDisplay}</span>
                          )}
                        </div>
                      </td>

                      {/* Duration */}
                      <td className="py-3 px-4 font-mono text-muted-foreground">
                        {duration}
                      </td>

                      {/* Status */}
                      <td className="py-3 px-4">{getStatusBadge(record.status)}</td>

                      {/* Entry Method & Notes */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1.5">
                          <Badge
                            variant="outline"
                            className="text-[9px] py-0 px-1.5 bg-muted/50 text-muted-foreground"
                          >
                            {record.entryMethod === AttendanceEntryMethod.WEB_PORTAL
                              ? "Web Portal"
                              : "Manual"}
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

      {/* Enterprise Policy Standards Card */}
      <div className="p-4 rounded-xl border border-border/70 bg-card shadow-2xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-muted-foreground">
        <div className="flex items-center gap-2 text-foreground font-semibold">
          <ShieldCheck className="h-4 w-4 text-primary shrink-0" />
          <span>Standard Enterprise Attendance Policy</span>
          <Badge
            variant="outline"
            className="text-[10px] uppercase font-mono tracking-wide py-0"
          >
            {portalRole} Scope
          </Badge>
        </div>
        <div>
          Timestamps are canonically recorded in real-time UTC without background telemetry or idle guessing.
        </div>
      </div>
    </div>
  );
}
