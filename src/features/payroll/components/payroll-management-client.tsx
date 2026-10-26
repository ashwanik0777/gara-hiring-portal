"use client";

import React, { useCallback, useState, useTransition } from "react";
import dynamic from "next/dynamic";
import { usePathname, useRouter } from "next/navigation";
import {
  Calendar,
  CreditCard,
  Users,
  CheckCircle2,
  Clock,
  AlertCircle,
  Download,
  PlusCircle,
  Search,
  X,
  Eye,
  Check,
  Pencil,
  Building,
  Copy,
  CheckCheck,
  RefreshCw,
  Lock,
  ShieldCheck,
  FileSpreadsheet,
  UserX,
  Sparkles,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PaginationNav } from "@/components/ui/pagination-nav";
import { DialogFallback } from "@/components/ui/dialog-fallback";
import type {
  PayrollDashboardData,
  PayrollRecordWithEmployee,
  PayrollPeriodDetail,
  PayoutProfileTarget,
  PayrollTab,
} from "../types";
import {
  createPayrollPeriodAction,
  updatePayrollPeriodStatusAction,
  generatePayrollRecordsAction,
  recordDisbursementAction,
  bulkDisburseAction,
  updateEmployeePayoutProfileAction,
} from "../actions";
import { NOT_CONFIGURED, csvCell, employmentLabel, formatCurrency, formatDate, PayrollStatusBadge } from "./payroll-ui";
import type { PayoutProfileFormValues } from "./dialogs/payout-profile-dialog";
import type { CreatePeriodValues } from "./dialogs/create-period-dialog";

// Dialogs are loaded on first use so the register paints with less JS.
const PayrollRecordDetailsDialog = dynamic(
  () => import("./dialogs/payroll-record-details-dialog").then((m) => m.PayrollRecordDetailsDialog),
  { ssr: false, loading: () => <DialogFallback label="Loading record details" /> }
);
const RecordDisbursementDialog = dynamic(
  () => import("./dialogs/record-disbursement-dialog").then((m) => m.RecordDisbursementDialog),
  { ssr: false, loading: () => <DialogFallback label="Loading disbursement form" /> }
);
const BulkDisbursementDialog = dynamic(
  () => import("./dialogs/bulk-disbursement-dialog").then((m) => m.BulkDisbursementDialog),
  { ssr: false, loading: () => <DialogFallback label="Loading bulk disbursement form" /> }
);
const PayoutProfileDialog = dynamic(
  () => import("./dialogs/payout-profile-dialog").then((m) => m.PayoutProfileDialog),
  { ssr: false, loading: () => <DialogFallback label="Loading payout profile form" /> }
);
const CreatePeriodDialog = dynamic(
  () => import("./dialogs/create-period-dialog").then((m) => m.CreatePeriodDialog),
  { ssr: false, loading: () => <DialogFallback label="Loading cycle form" /> }
);

interface PayrollManagementClientProps {
  /** Server-prepared page: account numbers and PANs are already masked. */
  initialData: PayrollDashboardData;
  /** Tab from the URL (`?tab=`), so links and the back button restore it. */
  initialTab?: PayrollTab;
}

type TypeFilter = "ALL" | "INTERN" | "FULL_TIME";
type StatusPill = "ALL" | "PAID" | "FINALIZED" | "DRAFT";

export function PayrollManagementClient({ initialData, initialTab }: PayrollManagementClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const data = initialData;
  const activePeriod = data.activePeriod;
  const { recordsPage, recordFilters, periodsPage, employeesPage } = data;

  const [activeTab, setActiveTab] = useState<PayrollTab>(initialTab ?? "records");
  const [searchInput, setSearchInput] = useState(recordFilters.search ?? "");
  const [directorySearchInput, setDirectorySearchInput] = useState(data.directorySearch ?? "");
  // Employment category lives in the payout profile, not in a column, so it filters the loaded page.
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("ALL");
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [isPending, startTransition] = useTransition();
  const [copiedUtr, setCopiedUtr] = useState<string | null>(null);

  const [detailsRecord, setDetailsRecord] = useState<PayrollRecordWithEmployee | null>(null);
  const [disburseRecord, setDisburseRecord] = useState<PayrollRecordWithEmployee | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [profileTarget, setProfileTarget] = useState<PayoutProfileTarget | null>(null);
  const [newPeriodOpen, setNewPeriodOpen] = useState(false);

  const showFeedback = useCallback((type: "success" | "error", message: string) => {
    setFeedback({ type, message });
    window.setTimeout(() => setFeedback(null), 6000);
  }, []);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedUtr(text);
    window.setTimeout(() => setCopiedUtr(null), 2000);
  };

  // Every filter and page lives in the URL so links, reloads and the back button work.
  const buildHref = useCallback(
    (overrides: {
      period?: string | null;
      status?: string | null;
      q?: string | null;
      page?: number | null;
      ppage?: number | null;
      dpage?: number | null;
      dq?: string | null;
      tab?: PayrollTab | null;
    } = {}) => {
      const pick = <T,>(override: T | null | undefined, current: T | undefined): T | undefined =>
        override === undefined ? current : override ?? undefined;
      const params = new URLSearchParams();
      const period = pick(overrides.period, activePeriod?.id);
      const status = pick(overrides.status, recordFilters.status);
      const q = pick(overrides.q, recordFilters.search);
      const page = pick(overrides.page, recordsPage.page);
      const ppage = pick(overrides.ppage, periodsPage.page);
      const dpage = pick(overrides.dpage, employeesPage.page);
      const dq = pick(overrides.dq, data.directorySearch);
      const tab = pick(overrides.tab, activeTab);
      if (period) params.set("period", period);
      if (status) params.set("status", status);
      if (q) params.set("q", q);
      if (page && page > 1) params.set("page", String(page));
      if (ppage && ppage > 1) params.set("ppage", String(ppage));
      if (dpage && dpage > 1) params.set("dpage", String(dpage));
      if (dq) params.set("dq", dq);
      if (tab && tab !== "records") params.set("tab", tab);
      const query = params.toString();
      return query ? `${pathname}?${query}` : pathname;
    },
    [activePeriod?.id, recordFilters, recordsPage.page, periodsPage.page, employeesPage.page, data.directorySearch, activeTab, pathname]
  );

  const navigate = (href: string) => {
    startTransition(() => {
      router.push(href, { scroll: false });
    });
  };

  const switchTab = (tab: PayrollTab) => {
    setActiveTab(tab);
    const params = new URLSearchParams(window.location.search);
    if (tab === "records") params.delete("tab");
    else params.set("tab", tab);
    const query = params.toString();
    window.history.replaceState(null, "", query ? `${pathname}?${query}` : pathname);
  };

  const visibleRecords = typeFilter === "ALL" ? data.records : data.records.filter((r) => r.employmentType === typeFilter);
  const statusPill: StatusPill =
    recordFilters.status === "PAID" || recordFilters.status === "FINALIZED" || recordFilters.status === "DRAFT"
      ? recordFilters.status
      : "ALL";
  const hasRecordFilters = Boolean(recordFilters.status || recordFilters.search || typeFilter !== "ALL");

  // ─── ACTION HANDLERS (the server re-renders stats and rows after each success) ─────

  const handleRecordDisbursement = ({ reference, notes }: { reference: string; notes: string }) => {
    if (!disburseRecord) return;
    const ref = reference.trim();
    if (!ref) {
      showFeedback("error", "Please enter the bank UTR / payment reference from your bank.");
      return;
    }
    const record = disburseRecord;
    startTransition(async () => {
      const res = await recordDisbursementAction({ payrollRecordId: record.id, disbursementReference: ref, notes: notes.trim() || null });
      if (!res.success) {
        showFeedback("error", res.error || "Failed to record disbursement.");
        return;
      }
      setDisburseRecord(null);
      showFeedback("success", `Disbursement logged with reference ${ref}`);
      router.refresh();
    });
  };

  const handleBulkDisbursement = ({ reference, notes }: { reference: string; notes: string }) => {
    if (!activePeriod) return;
    const ref = reference.trim();
    if (!ref) {
      showFeedback("error", "Please enter the batch reference from your bank.");
      return;
    }
    startTransition(async () => {
      const res = await bulkDisburseAction({ periodId: activePeriod.id, disbursementReference: ref, notes: notes.trim() || null });
      if (!res.success) {
        showFeedback("error", res.error || "Failed to record bulk disbursement.");
        return;
      }
      setBulkOpen(false);
      const skipped = res.data.skippedNotPaidCount;
      showFeedback(
        "success",
        `Recorded reference ${ref} for ${res.data.updatedCount} finalized record(s).` +
          (skipped > 0 ? ` ${skipped} record(s) skipped: employee not configured as paid.` : "")
      );
      router.refresh();
    });
  };

  const handleGenerateRecords = () => {
    if (!activePeriod) return;
    startTransition(async () => {
      const res = await generatePayrollRecordsAction({ periodId: activePeriod.id });
      if (!res.success) {
        showFeedback("error", res.error || "Failed to enroll employees.");
        return;
      }
      const { enrolledCount, skippedUnconfiguredCount } = res.data;
      showFeedback(
        "success",
        `Enrolled ${enrolledCount} employee(s) configured as paid.` +
          (skippedUnconfiguredCount > 0 ? ` ${skippedUnconfiguredCount} employee(s) skipped: payout profile not configured.` : "")
      );
      router.refresh();
    });
  };

  const handlePeriodTransition = (period: PayrollPeriodDetail, status: "DRAFT" | "FINALIZED" | "VOID") => {
    if (status === "VOID" && !window.confirm(`Void payroll cycle ${period.code}? This cannot be undone.`)) return;
    if (status === "DRAFT" && !window.confirm(`Reopen payroll cycle ${period.code} as a draft?`)) return;
    startTransition(async () => {
      const res = await updatePayrollPeriodStatusAction({ periodId: period.id, status });
      if (!res.success) {
        showFeedback("error", res.error || "Failed to update payroll cycle status.");
        return;
      }
      const verb = status === "FINALIZED" ? "finalized" : status === "DRAFT" ? "reopened as draft" : "voided";
      showFeedback("success", `Payroll cycle ${period.code} ${verb}.`);
      router.refresh();
    });
  };

  const handleCreatePeriod = (values: CreatePeriodValues) => {
    if (!values.code.trim() || !values.startDate || !values.endDate) {
      showFeedback("error", "Period code, start date, and end date are required.");
      return;
    }
    startTransition(async () => {
      const res = await createPayrollPeriodAction({
        code: values.code.trim(),
        startDate: new Date(values.startDate).toISOString(),
        endDate: new Date(values.endDate).toISOString(),
        notes: values.notes.trim() || null,
      });
      if (!res.success) {
        showFeedback("error", res.error || "Failed to create payroll period.");
        return;
      }
      setNewPeriodOpen(false);
      showFeedback("success", `Payroll cycle ${values.code} created.`);
      router.push(buildHref({ period: res.data.id, page: null, status: null, q: null, tab: "records" }));
    });
  };

  const handleSaveProfile = (values: PayoutProfileFormValues) => {
    if (!profileTarget) return;
    const target = profileTarget;
    const amountText = values.stipendAmount.trim();
    const amount = amountText === "" ? null : Number(amountText);
    if (amount !== null && (!Number.isFinite(amount) || amount < 0)) {
      showFeedback("error", "Configured amount must be a non-negative number, or left empty.");
      return;
    }
    startTransition(async () => {
      const res = await updateEmployeePayoutProfileAction({
        employeeId: target.employeeId,
        isPaid: values.isPaid,
        employmentType: values.employmentType,
        // Fields left untouched for unpaid employees keep their stored values.
        ...(values.isPaid
          ? {
              stipendAmount: amount,
              bankName: values.bankName.trim() || null,
              ifscCode: values.ifscCode.trim() || null,
              accountHolderName: values.accountHolderName.trim() || null,
              // Empty means "keep the stored value" (the browser never has the full number).
              accountNumber: values.accountNumber.trim() || undefined,
              panNumber: values.panNumber.trim() || undefined,
            }
          : {}),
      });
      if (!res.success) {
        showFeedback("error", res.error || "Failed to update employee payout profile.");
        return;
      }
      const open = res.data.openRecordCount;
      showFeedback(
        "success",
        `Updated ${target.employeeName}: marked as ${values.isPaid ? "Paid" : "Unpaid"}.` +
          (!values.isPaid && open > 0 ? ` ${open} open payroll record(s) remain and cannot be disbursed while unpaid.` : "")
      );
      setProfileTarget(null);
      router.refresh();
    });
  };

  // Toggle quick paid/unpaid from card. Other payout fields keep their stored values.
  const handleQuickTogglePaid = (emp: PayoutProfileTarget) => {
    startTransition(async () => {
      const newPaid = emp.isPaid !== true;
      const res = await updateEmployeePayoutProfileAction({ employeeId: emp.employeeId, isPaid: newPaid });
      if (!res.success) {
        showFeedback("error", res.error || "Failed to toggle status.");
        return;
      }
      showFeedback("success", `${emp.employeeName} is now marked as ${newPaid ? "PAID" : "UNPAID"}.`);
      router.refresh();
    });
  };

  // Register export of the loaded page. Account numbers are masked (the browser never
  // receives full numbers); a bank upload file format is pending approval (OD-008).
  const downloadRegisterCsv = () => {
    if (!visibleRecords.length) return;
    const headers = ["Employee Code", "Employee Name", "Account Holder", "Bank", "Account Number (masked)", "IFSC Code", "Configured Amount", "Employment Type", "Reference", "Status"];
    const rows = visibleRecords.map((r) => [
      csvCell(r.employeeCode),
      csvCell(r.employeeName),
      csvCell(r.accountHolderName ?? NOT_CONFIGURED),
      csvCell(r.bankName ?? NOT_CONFIGURED),
      csvCell(r.accountNumberMasked ?? NOT_CONFIGURED),
      csvCell(r.ifscCode ?? NOT_CONFIGURED),
      csvCell(typeof r.stipendAmount === "number" ? r.stipendAmount : NOT_CONFIGURED),
      csvCell(employmentLabel(r.employmentType)),
      csvCell(r.disbursementReference ?? ""),
      csvCell(r.status),
    ]);
    const csvContent = [headers.map(csvCell).join(","), ...rows.map((row) => row.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `Payroll_Register_${activePeriod?.code || "Current"}_page${recordsPage.page}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const tabClass = (tab: PayrollTab) =>
    `flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
      activeTab === tab ? "bg-background text-foreground shadow-xs border border-border/60" : "text-muted-foreground hover:text-foreground"
    }`;

  return (
    <div className="w-full space-y-6">
      {feedback && (
        <div
          role={feedback.type === "error" ? "alert" : "status"}
          className={`p-3.5 rounded-2xl flex items-center justify-between text-xs font-medium border shadow-xs animate-in fade-in duration-200 ${
            feedback.type === "success"
              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-800 dark:text-emerald-300"
              : "bg-destructive/10 border-destructive/30 text-destructive"
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === "success" ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" /> : <AlertCircle className="h-4 w-4 shrink-0 text-destructive" />}
            <span>{feedback.message}</span>
          </div>
          <button type="button" onClick={() => setFeedback(null)} className="hover:opacity-75 transition-opacity p-1" aria-label="Dismiss message">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* ─── Header banner: cycle details and actions ─── */}
      <Card className="rounded-2xl border border-border/80 bg-card/80 backdrop-blur-xs p-4 sm:p-5 shadow-2xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="min-w-0">
              <div className="flex items-center gap-2.5 flex-wrap">
                <h2 className="text-base sm:text-lg font-bold text-foreground whitespace-nowrap tracking-tight">
                  Payroll Cycle: <span className="font-mono text-primary font-extrabold">{activePeriod?.code || "No Cycle"}</span>
                </h2>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5 flex-wrap">
                <span className="font-medium">
                  {activePeriod ? `${formatDate(activePeriod.startDate)} – ${formatDate(activePeriod.endDate)}` : "No period active"}
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 justify-start lg:justify-end">
            <select
              value={activePeriod?.id ?? ""}
              onChange={(e) => navigate(buildHref({ period: e.target.value, page: null }))}
              aria-label="Select payroll cycle"
              className="h-9 px-3 text-xs rounded-xl border border-border/80 bg-background text-foreground font-mono font-medium cursor-pointer shadow-2xs hover:border-primary/50 transition-colors max-w-full"
            >
              {data.periods.length === 0 && <option value="">No cycles</option>}
              {data.periods.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code} ({formatDate(p.startDate)})
                </option>
              ))}
            </select>

            <Button size="sm" variant="outline" onClick={() => setNewPeriodOpen(true)} className="h-9 rounded-xl text-xs gap-1.5">
              <PlusCircle className="h-3.5 w-3.5" />
              New Cycle
            </Button>

            {activePeriod && activePeriod.status === "DRAFT" && (
              <Button size="sm" variant="outline" disabled={isPending} onClick={handleGenerateRecords} className="h-9 rounded-xl text-xs gap-1.5 font-medium" title="Enroll active employees whose payout profile is configured as paid">
                <RefreshCw className={`h-3.5 w-3.5 ${isPending ? "animate-spin" : ""}`} />
                Enroll Paid Workforce
              </Button>
            )}

            {activePeriod && activePeriod.status === "DRAFT" && (
              <Button size="sm" variant="outline" disabled={isPending} onClick={() => handlePeriodTransition(activePeriod, "FINALIZED")} className="h-9 rounded-xl text-xs gap-1.5 text-blue-600 dark:text-blue-400 border-blue-500/30 hover:bg-blue-500/10">
                <Lock className="h-3.5 w-3.5" />
                Finalize
              </Button>
            )}

            {activePeriod && activePeriod.status === "FINALIZED" && (
              <Button size="sm" onClick={() => setBulkOpen(true)} className="h-9 rounded-xl text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white shadow-2xs font-semibold">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Bulk Disburse
              </Button>
            )}

            <Button size="sm" variant="outline" onClick={downloadRegisterCsv} disabled={visibleRecords.length === 0} className="h-9 rounded-xl text-xs gap-1.5" title="Download the loaded register page (account numbers masked)">
              <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
              Register CSV
            </Button>
          </div>
        </div>
      </Card>

      {/* ─── Metric Cards Grid (counted in the database) ─── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5 sm:gap-4">
        <div className="bg-card border border-border/80 border-l-4 border-l-blue-500 rounded-2xl p-4 sm:p-5 shadow-2xs hover:shadow-xs hover:border-blue-500/40 transition-all flex flex-col justify-between">
          <div className="flex items-center justify-between gap-2 mb-2">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider font-mono">Active Cycle</span>
            <div className="h-8 w-8 rounded-xl bg-blue-500/15 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0"><Calendar className="h-4 w-4" /></div>
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold font-mono text-foreground tracking-tight whitespace-nowrap">{activePeriod?.code || "—"}</div>
          <div className="mt-2 text-[11px] text-muted-foreground truncate">{activePeriod ? `${formatDate(activePeriod.startDate)}` : "No cycle"}</div>
        </div>

        <div className="bg-card border border-border/80 border-l-4 border-l-purple-500 rounded-2xl p-4 sm:p-5 shadow-2xs hover:shadow-xs hover:border-purple-500/40 transition-all flex flex-col justify-between">
          <div className="flex items-center justify-between gap-2 mb-2">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider font-mono">Enrolled Records</span>
            <div className="h-8 w-8 rounded-xl bg-purple-500/15 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0"><Users className="h-4 w-4" /></div>
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold font-mono text-foreground tracking-tight">{data.stats.totalEnrolled}</div>
          <div className="mt-2 text-[11px] text-purple-700 dark:text-purple-300 font-medium flex items-center gap-1">
            <Sparkles className="h-3 w-3" />
            {data.stats.totalPaidWorkforce} configured as paid
          </div>
        </div>

        <div className="bg-card border border-border/80 border-l-4 border-l-emerald-500 rounded-2xl p-4 sm:p-5 shadow-2xs hover:shadow-xs hover:border-emerald-500/40 transition-all flex flex-col justify-between">
          <div className="flex items-center justify-between gap-2 mb-2">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider font-mono">Disbursed & Paid</span>
            <div className="h-8 w-8 rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0"><CheckCircle2 className="h-4 w-4" /></div>
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold font-mono text-foreground tracking-tight">{data.stats.paidCount}</div>
          <div className="mt-2 flex items-center gap-1.5 text-[11px]">
            <span className="font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-500/15 px-2 py-0.5 rounded-md font-mono">{data.stats.completionRate}% Done</span>
          </div>
        </div>

        <div className="bg-card border border-border/80 border-l-4 border-l-amber-500 rounded-2xl p-4 sm:p-5 shadow-2xs hover:shadow-xs hover:border-amber-500/40 transition-all flex flex-col justify-between">
          <div className="flex items-center justify-between gap-2 mb-2">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider font-mono">Pending Payouts</span>
            <div className="h-8 w-8 rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0"><Clock className="h-4 w-4" /></div>
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold font-mono text-foreground tracking-tight">{data.stats.draftCount + data.stats.finalizedCount}</div>
          <div className="mt-2 text-[11px] text-muted-foreground">Awaiting bank disbursement</div>
        </div>

        <div className="col-span-2 sm:col-span-1 bg-card border border-border/80 border-l-4 border-l-zinc-500 rounded-2xl p-4 sm:p-5 shadow-2xs hover:shadow-xs hover:border-zinc-500/40 transition-all flex flex-col justify-between">
          <div className="flex items-center justify-between gap-2 mb-2">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider font-mono">Unpaid Workforce</span>
            <div className="h-8 w-8 rounded-xl bg-muted text-muted-foreground flex items-center justify-center shrink-0"><UserX className="h-4 w-4" /></div>
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold font-mono text-muted-foreground tracking-tight">{data.stats.totalUnpaidWorkforce}</div>
          <div className="mt-2 text-[11px] text-muted-foreground">{data.stats.totalUnconfiguredWorkforce} payout {NOT_CONFIGURED.toLowerCase()}</div>
        </div>
      </div>

      {/* ─── Navigation Tabs ─── */}
      <div role="tablist" aria-label="Payroll sections" className="flex items-center gap-1.5 p-1 rounded-2xl bg-muted/60 border border-border/60 max-w-full overflow-x-auto">
        <button type="button" role="tab" aria-selected={activeTab === "records"} onClick={() => switchTab("records")} className={tabClass("records")}>
          <CreditCard className="h-3.5 w-3.5" />
          Payout Register
          <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">{recordsPage.total} Enrolled</span>
        </button>
        <button type="button" role="tab" aria-selected={activeTab === "profiles"} onClick={() => switchTab("profiles")} className={tabClass("profiles")}>
          <Building className="h-3.5 w-3.5" />
          Paid & Unpaid Directory ({employeesPage.total})
        </button>
        <button type="button" role="tab" aria-selected={activeTab === "periods"} onClick={() => switchTab("periods")} className={tabClass("periods")}>
          <Calendar className="h-3.5 w-3.5" />
          Cycles & Periods ({periodsPage.total})
        </button>
        <button type="button" role="tab" aria-selected={activeTab === "export"} onClick={() => switchTab("export")} className={tabClass("export")}>
          <Download className="h-3.5 w-3.5" />
          Register Export
        </button>
      </div>

      {/* ══════════════ TAB 1: PAYOUT REGISTER ══════════════ */}
      {activeTab === "records" && (
        <div className="space-y-4">
          <div className="p-4 rounded-2xl border border-border/80 bg-card/70 flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between shadow-2xs">
            <form
              className="relative flex-1 max-w-md"
              onSubmit={(e) => {
                e.preventDefault();
                navigate(buildHref({ q: searchInput.trim() || null, page: null }));
              }}
            >
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="search"
                aria-label="Search payroll records"
                placeholder="Search by name, code, dept, or UTR..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="pl-9 pr-8 h-9 rounded-xl border-border/80 bg-background/80 text-xs"
              />
              {(searchInput || recordFilters.search) && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchInput("");
                    navigate(buildHref({ q: null, page: null }));
                  }}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label="Clear search"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </form>

            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1 p-1 rounded-xl bg-muted/60 border border-border/60 text-xs" role="group" aria-label="Filter loaded page by employment type">
                {(["ALL", "INTERN", "FULL_TIME"] as const).map((tp) => (
                  <button
                    key={tp}
                    type="button"
                    aria-pressed={typeFilter === tp}
                    onClick={() => setTypeFilter(tp)}
                    className={`px-2.5 py-1 rounded-lg font-medium transition-all cursor-pointer ${
                      typeFilter === tp ? "bg-background text-foreground shadow-2xs font-semibold" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {tp === "ALL" ? "All Types" : tp === "INTERN" ? "Interns" : "Full-Time"}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-1 p-1 rounded-xl bg-muted/60 border border-border/60 text-xs" role="group" aria-label="Filter by status">
                {(["ALL", "PAID", "FINALIZED", "DRAFT"] as const).map((st) => (
                  <button
                    key={st}
                    type="button"
                    aria-pressed={statusPill === st}
                    onClick={() => navigate(buildHref({ status: st === "ALL" ? null : st, page: null }))}
                    className={`px-2.5 py-1 rounded-lg font-medium transition-all cursor-pointer ${
                      statusPill === st ? "bg-background text-foreground shadow-2xs font-semibold" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {st === "ALL" ? "All Status" : st.charAt(0) + st.slice(1).toLowerCase()}
                  </button>
                ))}
              </div>

              {hasRecordFilters && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setTypeFilter("ALL");
                    setSearchInput("");
                    navigate(buildHref({ status: null, q: null, page: null }));
                  }}
                  className="text-xs text-muted-foreground hover:text-foreground h-9 px-2.5"
                >
                  Reset
                </Button>
              )}
            </div>
          </div>

          <Card className="rounded-2xl border border-border/80 bg-card overflow-hidden shadow-2xs" aria-busy={isPending}>
            <div className="w-full overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-xs border-collapse table-fixed">
                <thead>
                  <tr className="border-b border-border/80 bg-muted/40 text-muted-foreground text-[11px] uppercase tracking-wider font-mono font-bold">
                    <th scope="col" className="py-3 px-4 w-[28%]">Employee</th>
                    <th scope="col" className="py-3 px-4 w-[18%]">Configured Amount</th>
                    <th scope="col" className="py-3 px-4 w-[22%]">Bank Details</th>
                    <th scope="col" className="py-3 px-4 w-[18%]">UTR / Payout Status</th>
                    <th scope="col" className="py-3 px-4 w-[14%] text-right pr-4">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {visibleRecords.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-12 text-center text-muted-foreground">
                        <div className="flex flex-col items-center justify-center gap-2">
                          <CreditCard className="h-8 w-8 text-muted-foreground/60 mb-1" />
                          <p className="text-sm font-semibold text-foreground">{activePeriod ? "No payroll records found in this cycle" : "No payroll cycle yet"}</p>
                          <p className="text-xs text-muted-foreground max-w-sm">
                            {!activePeriod
                              ? "Create a payroll cycle with 'New Cycle' to start recording disbursements."
                              : hasRecordFilters
                                ? "Try adjusting search or status filters."
                                : "Configure employees as Paid in the Directory, then use 'Enroll Paid Workforce' on a draft cycle."}
                          </p>
                          {activePeriod && activePeriod.status === "DRAFT" && !hasRecordFilters && (
                            <Button variant="outline" size="sm" onClick={handleGenerateRecords} disabled={isPending} className="mt-2 text-xs rounded-xl">
                              <RefreshCw className="h-3.5 w-3.5 mr-1" /> Enroll Paid Workforce
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ) : (
                    visibleRecords.map((req) => (
                      <tr key={req.id} className="hover:bg-muted/30 transition-colors group">
                        <td className="py-3.5 px-4">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-foreground truncate text-xs" title={req.employeeName}>{req.employeeName}</span>
                              <span className="font-mono text-[10px] bg-primary/10 text-primary px-1.5 py-0.2 rounded font-medium border border-primary/20 shrink-0">{req.employeeCode}</span>
                            </div>
                            <div className="text-[11px] text-muted-foreground flex items-center gap-1.5 truncate mt-0.5">
                              <span className="truncate">{req.department}</span>
                              <span>•</span>
                              <span className="truncate text-muted-foreground/80">{req.designation}</span>
                            </div>
                            <div className="mt-1 flex items-center gap-1.5">
                              <span
                                className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.2 rounded font-mono ${
                                  req.employmentType === "INTERN"
                                    ? "bg-purple-500/15 text-purple-700 dark:text-purple-300 border border-purple-500/20"
                                    : "bg-blue-500/15 text-blue-700 dark:text-blue-300 border border-blue-500/20"
                                }`}
                              >
                                {employmentLabel(req.employmentType)}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="space-y-1">
                            <div className="font-mono font-bold text-foreground text-sm">{formatCurrency(req.stipendAmount)}</div>
                            <div className="text-[10px] text-muted-foreground/80 font-medium">
                              {req.isPaid === true ? "From payout profile" : req.isPaid === false ? "Employee marked unpaid" : "Payout profile not configured"}
                            </div>
                          </div>
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-1.5 font-medium text-foreground text-xs">
                            <Building className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            <span className="truncate">{req.bankName ?? NOT_CONFIGURED}</span>
                          </div>
                          <div className="text-[11px] text-muted-foreground mt-1 flex items-center gap-2">
                            <span className="font-mono text-foreground font-semibold bg-muted/80 border border-border/60 px-1.5 py-0.2 rounded text-[10px]">A/C {req.accountNumberMasked ?? NOT_CONFIGURED}</span>
                            <span className="text-[10px] font-mono text-muted-foreground/75 truncate">IFSC: {req.ifscCode ?? NOT_CONFIGURED}</span>
                          </div>
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="space-y-1">
                            <div className="flex items-center gap-1.5"><PayrollStatusBadge status={req.status} /></div>
                            {req.disbursementReference ? (
                              <button
                                type="button"
                                onClick={() => copyToClipboard(req.disbursementReference ?? "")}
                                className="group/utr flex items-center gap-1 text-[10px] font-mono text-muted-foreground hover:text-foreground transition-colors cursor-pointer bg-muted/40 hover:bg-muted px-1.5 py-0.5 rounded border border-border/60 truncate max-w-full"
                                title="Click to copy UTR reference"
                              >
                                <span className="truncate">{req.disbursementReference}</span>
                                {copiedUtr === req.disbursementReference ? <CheckCheck className="h-3 w-3 text-emerald-500 shrink-0" /> : <Copy className="h-3 w-3 opacity-60 group-hover/utr:opacity-100 shrink-0" />}
                              </button>
                            ) : (
                              <div className="text-[10px] text-muted-foreground/70">
                                {req.status === "FINALIZED" ? "Ready for disbursement" : req.status === "VOID" ? "Voided" : "Draft: finalize the cycle first"}
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="py-3.5 px-4 text-right pr-4 whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => setDetailsRecord(req)}
                              className="h-8 w-8 rounded-lg border border-border/80 bg-background hover:bg-muted text-muted-foreground hover:text-primary transition-all flex items-center justify-center shadow-2xs cursor-pointer group/eye"
                              title="View Full Payslip & Disbursement Details"
                              aria-label="View record details"
                            >
                              <Eye className="h-4 w-4 group-hover/eye:scale-110 transition-transform" />
                            </button>
                            {req.status === "FINALIZED" && activePeriod?.status === "FINALIZED" && (
                              <button
                                type="button"
                                onClick={() => setDisburseRecord(req)}
                                className="h-8 w-8 rounded-lg bg-emerald-50 hover:bg-emerald-600 text-emerald-600 hover:text-white dark:bg-emerald-950/50 dark:hover:bg-emerald-600 dark:text-emerald-400 dark:hover:text-white border border-emerald-500/30 hover:border-emerald-600 transition-all flex items-center justify-center shadow-2xs cursor-pointer group/pay"
                                title="Record Disbursement & Bank UTR"
                                aria-label="Record disbursement"
                              >
                                <Check className="h-4 w-4 stroke-[2.5]" />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => setProfileTarget(req)}
                              className="h-8 w-8 rounded-lg border border-border/80 bg-background hover:bg-muted text-muted-foreground hover:text-foreground transition-all flex items-center justify-center shadow-2xs cursor-pointer"
                              title="Edit Employee Bank & Stipend Settings"
                              aria-label="Edit payout profile"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>

          <PaginationNav
            page={recordsPage.page}
            pageCount={recordsPage.pageCount}
            total={recordsPage.total}
            hrefFor={(target) => buildHref({ page: target })}
            label="Payout register pages"
            itemLabel="records"
          />
        </div>
      )}

      {/* ══════════════ TAB 2: EMPLOYEE DIRECTORY ══════════════ */}
      {activeTab === "profiles" && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl bg-card border border-border/80 shadow-2xs">
            <div>
              <h3 className="text-sm font-bold text-foreground">Employee Compensation & Payout Directory</h3>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-mono font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-xl border border-emerald-500/20">{data.stats.totalPaidWorkforce} Paid Eligible</span>
              <span className="text-xs font-mono font-bold text-muted-foreground bg-muted/60 px-2.5 py-1 rounded-xl border border-border/60">{data.stats.totalUnpaidWorkforce} Unpaid</span>
              <span className="text-xs font-mono font-bold text-amber-700 dark:text-amber-400 bg-amber-500/10 px-2.5 py-1 rounded-xl border border-amber-500/20">{data.stats.totalUnconfiguredWorkforce} {NOT_CONFIGURED}</span>
            </div>
          </div>

          <form
            className="relative max-w-md"
            onSubmit={(e) => {
              e.preventDefault();
              navigate(buildHref({ dq: directorySearchInput.trim() || null, dpage: null }));
            }}
          >
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              aria-label="Search employees by name, code or department"
              placeholder="Search employees by name, code or department..."
              value={directorySearchInput}
              onChange={(e) => setDirectorySearchInput(e.target.value)}
              className="pl-9 pr-8 h-9 rounded-xl border-border/80 bg-background/80 text-xs"
            />
            {(directorySearchInput || data.directorySearch) && (
              <button
                type="button"
                onClick={() => {
                  setDirectorySearchInput("");
                  navigate(buildHref({ dq: null, dpage: null }));
                }}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label="Clear search"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </form>

          {data.employees.length === 0 ? (
            <div className="p-10 rounded-2xl border border-dashed border-border bg-card/50 text-center text-xs text-muted-foreground">
              {data.directorySearch ? "No employees match this search." : "No employee records exist yet. Employee records are created in the Employees module."}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4" aria-busy={isPending}>
              {data.employees.map((emp) => (
                <Card key={emp.employeeId} className={`rounded-2xl border p-5 shadow-2xs hover:shadow-xs transition-all flex flex-col justify-between ${emp.isPaid !== false ? "border-border/80 bg-card" : "border-border/60 bg-muted/20 opacity-90"}`}>
                  <div>
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-2xl bg-primary/10 text-primary flex items-center justify-center font-bold text-sm shrink-0 border border-primary/20">{emp.employeeName.charAt(0).toUpperCase()}</div>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-foreground text-sm">{emp.employeeName}</span>
                            <span className="font-mono text-[10px] bg-primary/10 text-primary px-1.5 py-0.2 rounded font-medium border border-primary/20">{emp.employeeCode}</span>
                          </div>
                          <div className="text-[11px] text-muted-foreground mt-0.5">{emp.department} • {emp.designation}</div>
                        </div>
                      </div>
                      <div className="text-right">
                        {emp.isPaid === true ? (
                          <div>
                            <div className="font-mono font-extrabold text-foreground text-base">{formatCurrency(emp.stipendAmount)}</div>
                            <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 font-mono">Paid · {employmentLabel(emp.employmentType)}</span>
                          </div>
                        ) : emp.isPaid === false ? (
                          <div>
                            <div className="font-mono font-bold text-muted-foreground text-sm">Unpaid</div>
                            <span className="text-[10px] font-bold text-muted-foreground font-mono bg-muted/60 px-2 py-0.5 rounded">Non-Stipendiary</span>
                          </div>
                        ) : (
                          <div>
                            <div className="font-mono font-bold text-amber-700 dark:text-amber-400 text-sm">{NOT_CONFIGURED}</div>
                            <span className="text-[10px] font-bold text-muted-foreground font-mono bg-muted/60 px-2 py-0.5 rounded">Payout profile missing</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {emp.isPaid !== false ? (
                      <div className="p-3 rounded-xl bg-muted/40 border border-border/60 text-xs space-y-1.5">
                        <div className="flex justify-between"><span className="text-muted-foreground">Bank Name:</span><span className="font-medium text-foreground">{emp.bankName ?? NOT_CONFIGURED}</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">Account Number:</span><span className="font-mono font-medium text-foreground">{emp.accountNumberMasked ?? NOT_CONFIGURED}</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">IFSC Code:</span><span className="font-mono font-medium text-foreground">{emp.ifscCode ?? NOT_CONFIGURED}</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">PAN:</span><span className="font-mono font-medium text-foreground">{emp.panMasked ?? NOT_CONFIGURED}</span></div>
                      </div>
                    ) : (
                      <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-800 dark:text-amber-300 flex items-center gap-2">
                        <UserX className="h-4 w-4 shrink-0 text-amber-600" />
                        <span>Non-stipendiary employee. This member does not receive monthly bank disbursements or tax receipts.</span>
                      </div>
                    )}
                  </div>

                  <div className="pt-4 border-t border-border/60 flex items-center justify-between mt-4 gap-2">
                    <Button size="sm" variant="ghost" disabled={isPending} onClick={() => handleQuickTogglePaid(emp)} className="text-xs rounded-xl h-8 text-muted-foreground hover:text-foreground cursor-pointer">
                      {emp.isPaid === true ? "Switch to Unpaid" : "Mark as Paid"}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setProfileTarget(emp)} className="text-xs rounded-xl gap-1.5 h-8">
                      <Pencil className="h-3.5 w-3.5" />
                      Configure Payout
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          )}

          <PaginationNav
            page={employeesPage.page}
            pageCount={employeesPage.pageCount}
            total={employeesPage.total}
            hrefFor={(target) => buildHref({ dpage: target, tab: "profiles" })}
            label="Payout directory pages"
            itemLabel="employees"
          />
        </div>
      )}

      {/* ══════════════ TAB 3: CYCLES & PERIODS ══════════════ */}
      {activeTab === "periods" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h3 className="text-sm font-bold text-foreground">Operational Payroll Cycles</h3>
            <Button size="sm" onClick={() => setNewPeriodOpen(true)} className="text-xs rounded-xl gap-1.5">
              <PlusCircle className="h-3.5 w-3.5" />
              New Payroll Cycle
            </Button>
          </div>

          {data.periods.length === 0 ? (
            <div className="p-10 rounded-2xl border border-dashed border-border bg-card/50 text-center text-xs text-muted-foreground">
              No payroll cycles yet. Create one with &quot;New Payroll Cycle&quot;.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" aria-busy={isPending}>
              {data.periods.map((period) => {
                const isSelected = period.id === activePeriod?.id;
                const progressPct = period.totalRecords > 0 ? Math.round((period.paidRecords / period.totalRecords) * 100) : 0;
                return (
                  <Card key={period.id} className={`rounded-2xl border transition-all p-5 shadow-2xs flex flex-col justify-between ${isSelected ? "border-primary/60 bg-card ring-1 ring-primary/20 shadow-xs" : "border-border/80 bg-card/70 hover:border-border"}`}>
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-3">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-base font-extrabold text-foreground">{period.code}</span>
                          {isSelected && <Badge variant="outline" className="text-[10px] font-medium bg-primary/10 text-primary border-primary/20">Active</Badge>}
                        </div>
                        <PayrollStatusBadge status={period.status} />
                      </div>
                      <div className="text-xs text-muted-foreground flex items-center gap-1.5 mb-4">
                        <Calendar className="h-3.5 w-3.5" />
                        <span>{formatDate(period.startDate)} – {formatDate(period.endDate)}</span>
                      </div>
                      <div className="space-y-1.5 my-3">
                        <div className="flex justify-between text-[11px] font-medium">
                          <span className="text-muted-foreground">Disbursement Progress</span>
                          <span className="font-mono font-bold text-foreground">{period.paidRecords} / {period.totalRecords} ({progressPct}%)</span>
                        </div>
                        <div className="h-2 w-full bg-muted/60 rounded-full overflow-hidden" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progressPct} aria-label={`Disbursement progress for ${period.code}`}>
                          <div className="h-full bg-emerald-500 rounded-full transition-all duration-300" style={{ width: `${progressPct}%` }} />
                        </div>
                      </div>
                      {period.notes && <p className="text-[11px] text-muted-foreground/80 line-clamp-2 mt-2">{period.notes}</p>}
                    </div>

                    <div className="pt-4 border-t border-border/60 flex items-center justify-between gap-2 mt-4 flex-wrap">
                      <Button
                        size="sm"
                        variant={isSelected ? "secondary" : "outline"}
                        onClick={() => {
                          if (period.id !== activePeriod?.id) navigate(buildHref({ period: period.id, page: null, tab: "records" }));
                          switchTab("records");
                        }}
                        className="text-xs rounded-xl h-8 flex-1"
                      >
                        View Register
                      </Button>
                      {period.status === "DRAFT" && (
                        <Button size="sm" variant="outline" disabled={isPending} onClick={() => handlePeriodTransition(period, "FINALIZED")} className="text-xs rounded-xl h-8 text-blue-600 dark:text-blue-400 border-blue-500/30">
                          Finalize
                        </Button>
                      )}
                      {period.status === "FINALIZED" && period.paidRecords === 0 && (
                        <Button size="sm" variant="outline" disabled={isPending} onClick={() => handlePeriodTransition(period, "DRAFT")} className="text-xs rounded-xl h-8">
                          Reopen
                        </Button>
                      )}
                      {(period.status === "DRAFT" || period.status === "FINALIZED") && period.paidRecords === 0 && (
                        <Button size="sm" variant="outline" disabled={isPending} onClick={() => handlePeriodTransition(period, "VOID")} className="text-xs rounded-xl h-8 text-destructive border-destructive/30">
                          Void
                        </Button>
                      )}
                    </div>
                  </Card>
                );
              })}
            </div>
          )}

          <PaginationNav
            page={periodsPage.page}
            pageCount={periodsPage.pageCount}
            total={periodsPage.total}
            hrefFor={(target) => buildHref({ ppage: target, tab: "periods" })}
            label="Payroll cycle pages"
            itemLabel="cycles"
          />
        </div>
      )}

      {/* ══════════════ TAB 4: REGISTER EXPORT (MASKED, LOADED PAGE) ══════════════ */}
      {activeTab === "export" && (
        <Card className="rounded-2xl border border-border/80 bg-card p-6 shadow-2xs space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-border/60">
            <div>
              <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                <FileSpreadsheet className="h-4 w-4 text-primary" />
                Payroll Register Export
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Exports the loaded register page ({visibleRecords.length} of {recordsPage.total} records). Account numbers are masked. A bank upload file format has not been approved yet (OD-008).
              </p>
            </div>
            <Button onClick={downloadRegisterCsv} disabled={visibleRecords.length === 0} className="gap-2 text-xs rounded-xl bg-primary text-primary-foreground shadow-2xs">
              <Download className="h-4 w-4" />
              Download Register CSV
            </Button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-4 rounded-xl bg-muted/40 border border-border/60">
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider font-mono">Register Entries (page)</span>
              <div className="text-2xl font-bold font-mono text-foreground mt-1">{visibleRecords.length}</div>
            </div>
            <div className="p-4 rounded-xl bg-muted/40 border border-border/60">
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider font-mono">Disbursed Total (cycle)</span>
              <div className="text-2xl font-bold font-mono mt-1 text-emerald-600 dark:text-emerald-400">{formatCurrency(data.stats.totalDisbursedAmount)}</div>
              <div className="text-[11px] text-muted-foreground mt-1">Excludes {data.stats.paidRecordsWithoutAmount} paid record(s) without a recorded amount</div>
            </div>
            <div className="p-4 rounded-xl bg-muted/40 border border-border/60">
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider font-mono">Bank Upload Format</span>
              <div className="text-sm font-bold text-foreground mt-1 flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-muted-foreground" />
                Pending approval (OD-008)
              </div>
            </div>
          </div>
        </Card>
      )}

      {detailsRecord && (
        <PayrollRecordDetailsDialog
          record={detailsRecord}
          activePeriodStatus={activePeriod?.status ?? null}
          onClose={() => setDetailsRecord(null)}
          onCopy={copyToClipboard}
          onDisburse={(record) => {
            setDetailsRecord(null);
            setDisburseRecord(record);
          }}
        />
      )}
      {disburseRecord && (
        <RecordDisbursementDialog record={disburseRecord} isPending={isPending} onClose={() => setDisburseRecord(null)} onSubmit={handleRecordDisbursement} />
      )}
      {bulkOpen && activePeriod && (
        <BulkDisbursementDialog period={activePeriod} isPending={isPending} onClose={() => setBulkOpen(false)} onSubmit={handleBulkDisbursement} />
      )}
      {profileTarget && (
        <PayoutProfileDialog target={profileTarget} isPending={isPending} onClose={() => setProfileTarget(null)} onSubmit={handleSaveProfile} />
      )}
      {newPeriodOpen && <CreatePeriodDialog isPending={isPending} onClose={() => setNewPeriodOpen(false)} onSubmit={handleCreatePeriod} />}
    </div>
  );
}
