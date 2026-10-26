"use client";

import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Clock, X, AlertCircle, Loader2, CheckCircle2, Search } from "lucide-react";
import { searchAttendanceEmployeeOptionsAction } from "../actions";
import type { AttendanceEmployeeOption } from "../types";

export type StaffSettableStatus = "PRESENT" | "HALF_DAY" | "ON_LEAVE" | "ABSENT";

export interface RecordAttendanceValues {
  employeeId: string;
  /** `YYYY-MM-DD` UTC calendar day. */
  date: string;
  /** `HH:MM` in the browser's local time zone, or empty. */
  checkInTime: string;
  checkOutTime: string;
  status: StaffSettableStatus;
  notes: string;
}

interface RecordAttendanceDialogProps {
  /** First page of selectable employees (the staff member's own record is excluded). */
  employees: AttendanceEmployeeOption[];
  employeesTotal: number;
  selfEmployeeId: string | null;
  todayKey: string;
  isPending: boolean;
  errorMsg: string | null;
  onClose: () => void;
  onSubmit: (values: RecordAttendanceValues) => void;
  onSelfCheckIn: () => void;
}

const SEARCH_DEBOUNCE_MS = 300;

/** Staff entry / correction form. Loaded on demand; audit logged by the service. */
export function RecordAttendanceDialog({
  employees,
  employeesTotal,
  selfEmployeeId,
  todayKey,
  isPending,
  errorMsg,
  onClose,
  onSubmit,
  onSelfCheckIn,
}: RecordAttendanceDialogProps) {
  const [employeeQuery, setEmployeeQuery] = useState("");
  // Last server search; the visible options are derived from it so no effect sets state synchronously.
  const [searchResult, setSearchResult] = useState<{
    query: string;
    options: AttendanceEmployeeOption[];
    error: string | null;
  } | null>(null);
  const [form, setForm] = useState<RecordAttendanceValues>({
    employeeId: employees[0]?.id || "",
    date: todayKey,
    checkInTime: "",
    checkOutTime: "",
    status: "PRESENT",
    notes: "",
  });

  const pickerNeedsSearch = employeesTotal > employees.length;
  const trimmedQuery = pickerNeedsSearch ? employeeQuery.trim() : "";
  const options = trimmedQuery && searchResult?.query === trimmedQuery ? searchResult.options : employees;
  const isSearching = trimmedQuery !== "" && searchResult?.query !== trimmedQuery;
  const searchError = trimmedQuery && searchResult?.query === trimmedQuery ? searchResult.error : null;
  // The selection stays valid when the option list changes.
  const selectedEmployeeId = options.some((o) => o.id === form.employeeId) ? form.employeeId : options[0]?.id || "";

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isPending) onClose();
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [isPending, onClose]);

  // Narrow the picker on the server (bounded) instead of loading every employee.
  useEffect(() => {
    if (!trimmedQuery) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      searchAttendanceEmployeeOptionsAction({ query: trimmedQuery }).then((res) => {
        if (cancelled) return;
        setSearchResult(
          res.success
            ? { query: trimmedQuery, options: res.data.options.filter((o) => o.id !== selfEmployeeId), error: null }
            : { query: trimmedQuery, options: [], error: res.error }
        );
      });
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [trimmedQuery, selfEmployeeId]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({ ...form, employeeId: selectedEmployeeId });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in-50 duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isPending) onClose();
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
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground h-8 w-8 rounded-lg hover:bg-muted/60 flex items-center justify-center transition-colors cursor-pointer"
            aria-label="Close dialog"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {(errorMsg || searchError) && (
          <div role="alert" className="p-3 rounded-xl border border-destructive/20 bg-destructive/10 text-destructive text-xs flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{errorMsg ?? searchError}</span>
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
              onClick={onSelfCheckIn}
              disabled={isPending}
              className="h-6 text-[10px] px-2 text-primary hover:text-primary hover:bg-primary/10"
            >
              <Clock className="h-3 w-3 mr-1" /> Check In for Me
            </Button>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 pt-1">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2 space-y-2" aria-busy={isSearching}>
              <label htmlFor="attendance-employee" className="text-[11px] font-semibold text-muted-foreground block mb-1">
                Employee / Intern
              </label>
              {pickerNeedsSearch && (
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <input
                    type="search"
                    aria-label="Search employees by name, code or department"
                    placeholder={`Search ${employeesTotal} employees by name, code or department`}
                    value={employeeQuery}
                    onChange={(e) => setEmployeeQuery(e.target.value)}
                    className="w-full pl-8 pr-3 py-2 text-xs rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground"
                  />
                </div>
              )}
              <select
                id="attendance-employee"
                required
                value={selectedEmployeeId}
                onChange={(e) => setForm({ ...form, employeeId: e.target.value })}
                className="w-full px-3 py-2 text-xs rounded-xl border border-border bg-background text-foreground"
              >
                {options.length === 0 ? (
                  <option value="">{employeeQuery ? "No employees match this search" : "No employees found"}</option>
                ) : (
                  options.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.name} ({emp.employeeCode} - {emp.department})
                    </option>
                  ))
                )}
              </select>
              {pickerNeedsSearch && (
                <p className="text-[10px] text-muted-foreground">
                  Showing {options.length} of {employeesTotal} employees. Search to find others.
                </p>
              )}
            </div>

            <div>
              <label htmlFor="attendance-date" className="text-[11px] font-semibold text-muted-foreground block mb-1">
                Attendance Date (UTC day)
              </label>
              <input
                id="attendance-date"
                type="date"
                required
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
                className="w-full px-3 py-2 text-xs rounded-xl border border-border bg-background text-foreground"
              />
            </div>

            <div>
              <label htmlFor="attendance-status" className="text-[11px] font-semibold text-muted-foreground block mb-1">
                Attendance Status
              </label>
              <select
                id="attendance-status"
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value as StaffSettableStatus })}
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
                value={form.checkInTime}
                onChange={(e) => setForm({ ...form, checkInTime: e.target.value })}
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
                value={form.checkOutTime}
                onChange={(e) => setForm({ ...form, checkOutTime: e.target.value })}
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
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Reason for this entry or correction"
                className="w-full px-3 py-2 text-xs rounded-xl border border-border bg-background text-foreground"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-border/60">
            <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={isPending} className="text-xs">
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={isPending || options.length === 0} className="text-xs">
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
  );
}
