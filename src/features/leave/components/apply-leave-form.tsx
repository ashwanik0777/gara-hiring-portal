"use client";

import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PlusCircle, Loader2, Search } from "lucide-react";
import { searchLeaveEmployeeOptionsAction } from "../actions";
import type { EmployeeOption, LeaveTypeItem } from "../types";
import { todayUtcKey } from "./leave-ui";

export interface ApplyLeaveValues {
  employeeId: string;
  leaveTypeId: string;
  /** `YYYY-MM-DD` UTC calendar days. */
  startDate: string;
  endDate: string;
  reason: string;
}

interface ApplyLeaveFormProps {
  isTeamView: boolean;
  /** First page of the employee picker (server-bounded). */
  employees: EmployeeOption[];
  /** Total selectable employees; when larger than `employees`, a search box narrows the picker. */
  employeesTotal: number;
  leaveTypes: LeaveTypeItem[];
  isPending: boolean;
  onSubmit: (values: ApplyLeaveValues) => void;
  onCancel: () => void;
  onValidationError: (message: string) => void;
}

const SEARCH_DEBOUNCE_MS = 300;

/**
 * Leave request form (self, or on behalf with `canLeave`). Loaded on demand with the
 * "apply" tab. No balance is checked or deducted (OD-007).
 */
export function ApplyLeaveForm({
  isTeamView,
  employees,
  employeesTotal,
  leaveTypes,
  isPending,
  onSubmit,
  onCancel,
  onValidationError,
}: ApplyLeaveFormProps) {
  const firstActiveTypeId = leaveTypes.find((t) => t.isActive)?.id || "";
  const [employeeQuery, setEmployeeQuery] = useState("");
  // Last server search; the visible options are derived from it so no effect sets state synchronously.
  const [searchResult, setSearchResult] = useState<{ query: string; options: EmployeeOption[] } | null>(null);
  const [form, setForm] = useState<ApplyLeaveValues>({
    employeeId: employees[0]?.id || "",
    leaveTypeId: firstActiveTypeId,
    startDate: todayUtcKey(),
    endDate: todayUtcKey(),
    reason: "",
  });

  const pickerNeedsSearch = isTeamView && employeesTotal > employees.length;
  const trimmedQuery = pickerNeedsSearch ? employeeQuery.trim() : "";
  const options = trimmedQuery && searchResult?.query === trimmedQuery ? searchResult.options : employees;
  const isSearching = trimmedQuery !== "" && searchResult?.query !== trimmedQuery;
  // The selection stays valid when the option list changes.
  const selectedEmployeeId = options.some((o) => o.id === form.employeeId) ? form.employeeId : options[0]?.id || "";

  // Narrow the picker on the server (bounded) instead of loading every employee.
  useEffect(() => {
    if (!trimmedQuery) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      searchLeaveEmployeeOptionsAction({ query: trimmedQuery }).then((res) => {
        if (cancelled) return;
        if (res.success) {
          setSearchResult({ query: trimmedQuery, options: res.data.options });
        } else {
          setSearchResult({ query: trimmedQuery, options: [] });
          onValidationError(res.error);
        }
      });
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [trimmedQuery, onValidationError]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const values = { ...form, employeeId: selectedEmployeeId };
    if (!values.employeeId || !values.leaveTypeId || !values.reason.trim()) {
      onValidationError("Please fill in all required fields.");
      return;
    }
    if (values.endDate < values.startDate) {
      onValidationError("End date cannot precede start date.");
      return;
    }
    onSubmit(values);
  };

  const calendarDays = (() => {
    const s = Date.parse(`${form.startDate}T00:00:00Z`);
    const e = Date.parse(`${form.endDate}T00:00:00Z`);
    if (isNaN(s) || isNaN(e) || e < s) return "—";
    const diff = Math.round((e - s) / (1000 * 60 * 60 * 24)) + 1;
    return `${diff} ${diff === 1 ? "day" : "days"}`;
  })();

  return (
    <Card className="rounded-2xl border-border/80 bg-card w-full shadow-xs">
      <CardHeader className="pb-4 border-b border-border/60 bg-muted/20 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
            <PlusCircle className="h-4 w-4 text-primary" />{" "}
            {isTeamView ? "Apply / Grant Employee Leave" : "Request Leave"}
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-0.5">
            {isTeamView
              ? "Submit a leave request on behalf of a staff member or intern. It still requires review by another authorized reviewer."
              : "Submit a leave request for review. No leave balance is checked or deducted (OD-007)."}
          </p>
        </div>
        <span className="text-[11px] font-mono font-medium px-2.5 py-1 rounded-full bg-primary/10 text-primary border border-primary/20 w-fit">
          {employeesTotal} {employeesTotal === 1 ? "Employee" : "Employees"} Available
        </span>
      </CardHeader>
      <CardContent className="p-6">
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="leave-management-client-apply-leave-employee" className="block text-xs font-semibold text-foreground mb-1.5">
                Select Employee <span className="text-destructive">*</span>
              </label>
              {employees.length === 0 ? (
                <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-700 dark:text-amber-400">
                  {isTeamView
                    ? "No employee records found. Employee records are created in the Employees module."
                    : "No employee record is linked to your account. Leave can be requested once HR has created it."}
                </div>
              ) : (
                <div className="space-y-2" aria-busy={isSearching}>
                  {pickerNeedsSearch && (
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                      <Input
                        type="search"
                        aria-label="Search employees by name, code or department"
                        placeholder={`Search ${employeesTotal} employees by name, code or department`}
                        value={employeeQuery}
                        onChange={(e) => setEmployeeQuery(e.target.value)}
                        className="pl-8 h-9 text-xs rounded-xl"
                      />
                    </div>
                  )}
                  <select
                    id="leave-management-client-apply-leave-employee"
                    value={selectedEmployeeId}
                    onChange={(e) => setForm({ ...form, employeeId: e.target.value })}
                    className="w-full h-10 px-3 rounded-xl border border-border/80 bg-background text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer"
                    required
                  >
                    {options.length === 0 && <option value="">No employees match this search</option>}
                    {options.map((emp) => (
                      <option key={emp.id} value={emp.id}>
                        {emp.name} ({emp.employeeCode}) — {emp.department} • {emp.designation}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <p className="text-[11px] text-muted-foreground mt-1">
                {pickerNeedsSearch
                  ? `Showing ${options.length} of ${employeesTotal} employees. Search to find others.`
                  : "Select the staff member or intern requesting time-off."}
              </p>
            </div>

            <div>
              <label htmlFor="leave-management-client-apply-leave-leave-category" className="block text-xs font-semibold text-foreground mb-1.5">
                Leave Category <span className="text-destructive">*</span>
              </label>
              <select
                id="leave-management-client-apply-leave-leave-category"
                value={form.leaveTypeId}
                onChange={(e) => setForm({ ...form, leaveTypeId: e.target.value })}
                className="w-full h-10 px-3 rounded-xl border border-border/80 bg-background text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer"
                required
              >
                {leaveTypes
                  .filter((t) => t.isActive)
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.code}) — {t.isPaid ? "Paid Leave" : "Unpaid (LWP)"}
                    </option>
                  ))}
              </select>
              <p className="text-[11px] text-muted-foreground mt-1">Only active leave categories are listed.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
            <div>
              <label htmlFor="leave-management-client-apply-leave-start-date" className="block text-xs font-semibold text-foreground mb-1.5">
                Start Date <span className="text-destructive">*</span>
              </label>
              <Input
                id="leave-management-client-apply-leave-start-date"
                type="date"
                value={form.startDate}
                onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                className="h-10 text-xs rounded-xl"
                required
              />
            </div>
            <div>
              <label htmlFor="leave-management-client-apply-leave-end-date" className="block text-xs font-semibold text-foreground mb-1.5">
                End Date <span className="text-destructive">*</span>
              </label>
              <Input
                id="leave-management-client-apply-leave-end-date"
                type="date"
                value={form.endDate}
                onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                className="h-10 text-xs rounded-xl"
                required
              />
            </div>
            <div className="h-10 px-3.5 rounded-xl border border-border/70 bg-muted/30 flex items-center justify-between text-xs">
              <span className="text-muted-foreground font-medium">Calendar Days:</span>
              <span className="font-bold text-foreground font-mono">{calendarDays}</span>
            </div>
          </div>

          <div>
            <label htmlFor="leave-management-client-apply-leave-reason-for-absence" className="block text-xs font-semibold text-foreground mb-1.5">
              Reason for Absence <span className="text-destructive">*</span>
            </label>
            <textarea
              id="leave-management-client-apply-leave-reason-for-absence"
              rows={4}
              value={form.reason}
              onChange={(e) => setForm({ ...form, reason: e.target.value })}
              placeholder="Provide clear reason or details for this absence (minimum 5 characters)..."
              className="w-full p-3.5 rounded-xl border border-border/80 bg-background text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary placeholder:text-muted-foreground resize-y min-h-[90px]"
              required
            />
          </div>

          <div className="pt-2 border-t border-border/60 flex items-center justify-end gap-3">
            <Button type="button" variant="outline" onClick={onCancel} className="rounded-xl text-xs h-9 px-4">
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isPending || options.length === 0 || !firstActiveTypeId}
              className="rounded-xl text-xs h-9 px-5 shadow-xs"
            >
              {isPending ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Submitting...
                </>
              ) : (
                "Submit Application"
              )}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
