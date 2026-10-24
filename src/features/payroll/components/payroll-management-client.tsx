"use client";

import React, { useState, useTransition, useMemo } from "react";
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
  Printer,
  Copy,
  CheckCheck,
  RefreshCw,
  Lock,
  ShieldCheck,
  FileSpreadsheet,
  UserX,
  UserCheck,
  Sparkles,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  PayrollDashboardData,
  PayrollRecordWithEmployee,
  PayrollPeriodDetail,
  EmployeePayoutProfile,
  PayrollStatus,
} from "../types";
import {
  createPayrollPeriodAction,
  updatePayrollPeriodStatusAction,
  generatePayrollRecordsAction,
  recordDisbursementAction,
  bulkDisburseAction,
  updateEmployeePayoutProfileAction,
} from "../actions";

interface PayrollManagementClientProps {
  /** Server-prepared data: account numbers and PANs are already masked. */
  initialData: PayrollDashboardData;
}

const NOT_CONFIGURED = "Not configured";

/** Neutralises spreadsheet formula injection and quotes a CSV cell. */
function csvCell(value: string | number | null | undefined): string {
  let text = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(text)) {
    text = `'${text}`;
  }
  return `"${text.replace(/"/g, '""')}"`;
}

function employmentLabel(type: "INTERN" | "FULL_TIME" | null): string {
  if (type === "INTERN") return "Intern";
  if (type === "FULL_TIME") return "Full-Time";
  return "Type not configured";
}

export function PayrollManagementClient({ initialData }: PayrollManagementClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [data, setData] = useState<PayrollDashboardData>(initialData);
  const [selectedPeriodId, setSelectedPeriodId] = useState<string>(
    initialData.activePeriod?.id || (initialData.periods[0]?.id ?? "")
  );
  const [activeTab, setActiveTab] = useState<"records" | "periods" | "profiles" | "export">("records");

  // Filters for Records Table
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | PayrollStatus>("ALL");
  const [typeFilter, setTypeFilter] = useState<"ALL" | "INTERN" | "FULL_TIME">("ALL");

  // Feedback notifications
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  // Modals state
  const [detailsModal, setDetailsModal] = useState<{
    isOpen: boolean;
    record: PayrollRecordWithEmployee | null;
  }>({ isOpen: false, record: null });

  const [disburseModal, setDisburseModal] = useState<{
    isOpen: boolean;
    record: PayrollRecordWithEmployee | null;
    reference: string;
    notes: string;
  }>({ isOpen: false, record: null, reference: "", notes: "" });

  const [bulkModal, setBulkModal] = useState<{
    isOpen: boolean;
    reference: string;
    notes: string;
  }>({
    isOpen: false,
    reference: "",
    notes: "",
  });

  // Account number and PAN inputs start empty: the browser only ever receives masked
  // values, and an empty input keeps the stored value.
  const [profileModal, setProfileModal] = useState<{
    isOpen: boolean;
    profile: EmployeePayoutProfile | null;
    isPaid: boolean;
    employmentType: "INTERN" | "FULL_TIME" | null;
    stipendAmount: string;
    bankName: string;
    accountNumber: string;
    ifscCode: string;
    accountHolderName: string;
    panNumber: string;
  }>({
    isOpen: false,
    profile: null,
    isPaid: false,
    employmentType: null,
    stipendAmount: "",
    bankName: "",
    accountNumber: "",
    ifscCode: "",
    accountHolderName: "",
    panNumber: "",
  });

  const openProfileModal = (profile: EmployeePayoutProfile | null) => {
    if (!profile) {
      showFeedback("error", "Employee payout profile could not be found. Reload and try again.");
      return;
    }
    setProfileModal({
      isOpen: true,
      profile,
      isPaid: profile.isPaid === true,
      employmentType: profile.employmentType,
      stipendAmount: profile.stipendAmount !== null ? String(profile.stipendAmount) : "",
      bankName: profile.bankName ?? "",
      accountNumber: "",
      ifscCode: profile.ifscCode ?? "",
      accountHolderName: profile.accountHolderName ?? "",
      panNumber: "",
    });
  };

  const [newPeriodModal, setNewPeriodModal] = useState<{
    isOpen: boolean;
    code: string;
    startDate: string;
    endDate: string;
    notes: string;
  }>({
    isOpen: false,
    code: "",
    startDate: "",
    endDate: "",
    notes: "",
  });

  const [copiedUtr, setCopiedUtr] = useState<string | null>(null);

  const showFeedback = (type: "success" | "error", message: string) => {
    setFeedback({ type, message });
    setTimeout(() => setFeedback(null), 5000);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedUtr(text);
    setTimeout(() => setCopiedUtr(null), 2000);
  };

  // Currently active period details
  const activePeriod = useMemo(() => {
    return (
      data.periods.find((p) => p.id === selectedPeriodId) ||
      data.activePeriod ||
      data.periods[0] ||
      null
    );
  }, [data.periods, data.activePeriod, selectedPeriodId]);

  // Filtered records for the selected period
  const filteredRecords = useMemo(() => {
    return data.records.filter((r) => {
      // Period filter
      if (activePeriod && r.payrollPeriodId !== activePeriod.id) return false;

      // Status filter
      if (statusFilter !== "ALL" && r.status !== statusFilter) return false;

      // Type filter (Intern vs Full-Time)
      if (typeFilter !== "ALL" && r.employmentType !== typeFilter) return false;

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = r.employeeName.toLowerCase().includes(q);
        const matchesCode = r.employeeCode.toLowerCase().includes(q);
        const matchesDept = r.department.toLowerCase().includes(q);
        const matchesUtr = r.disbursementReference?.toLowerCase().includes(q) ?? false;
        if (!matchesName && !matchesCode && !matchesDept && !matchesUtr) return false;
      }

      return true;
    });
  }, [data.records, activePeriod, statusFilter, typeFilter, searchQuery]);

  // Helper date formatter
  const formatDate = (isoStr?: string | null) => {
    if (!isoStr) return "—";
    try {
      const d = new Date(isoStr);
      return d.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    } catch {
      return isoStr;
    }
  };

  // Helper currency formatter (Indian Rupee). Unset amounts are never shown as ₹0.
  const formatCurrency = (amount?: number | null) => {
    if (amount === undefined || amount === null) return NOT_CONFIGURED;
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(amount);
  };

  // Status Badge generator
  const getStatusBadge = (status: PayrollStatus) => {
    switch (status) {
      case "PAID":
        return (
          <Badge
            variant="default"
            className="gap-1.5 bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30 px-2.5 py-0.5 text-[11px] font-semibold whitespace-nowrap"
          >
            <CheckCircle2 className="h-3 w-3" /> Paid
          </Badge>
        );
      case "FINALIZED":
        return (
          <Badge
            variant="default"
            className="gap-1.5 bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30 px-2.5 py-0.5 text-[11px] font-semibold whitespace-nowrap"
          >
            <Lock className="h-3 w-3" /> Finalized
          </Badge>
        );
      case "DRAFT":
        return (
          <Badge
            variant="warning"
            className="gap-1.5 bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30 px-2.5 py-0.5 text-[11px] font-semibold whitespace-nowrap"
          >
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
  };

  // ─── ACTION HANDLERS ────────────────────────────────────────────────────────

  const handleRecordDisbursement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!disburseModal.record) return;

    const ref = disburseModal.reference.trim();
    if (!ref) {
      showFeedback("error", "Please enter the bank UTR / payment reference from your bank.");
      return;
    }

    const record = disburseModal.record;
    startTransition(async () => {
      const res = await recordDisbursementAction({
        payrollRecordId: record.id,
        disbursementReference: ref,
        notes: disburseModal.notes.trim() || null,
      });

      if (!res.success) {
        showFeedback("error", res.error || "Failed to record disbursement.");
        return;
      }

      const periodPaid = res.data.periodPaid;
      setData((prev) => {
        const updatedRecords = prev.records.map((r) =>
          r.id === record.id
            ? {
                ...r,
                status: "PAID" as PayrollStatus,
                disbursementReference: ref,
                disbursedAt: new Date().toISOString(),
                notes: disburseModal.notes.trim() || r.notes,
              }
            : r
        );

        const paidRecords = updatedRecords.filter((r) => r.status === "PAID");
        const total = updatedRecords.length;

        return {
          ...prev,
          periods: periodPaid
            ? prev.periods.map((p) =>
                p.id === record.payrollPeriodId ? { ...p, status: "PAID" as PayrollStatus } : p
              )
            : prev.periods,
          records: updatedRecords,
          stats: {
            ...prev.stats,
            paidCount: paidRecords.length,
            draftCount: updatedRecords.filter((r) => r.status === "DRAFT").length,
            finalizedCount: updatedRecords.filter((r) => r.status === "FINALIZED").length,
            completionRate: total > 0 ? Math.round((paidRecords.length / total) * 100) : 0,
            totalDisbursedAmount: paidRecords.reduce(
              (sum, r) => sum + (typeof r.stipendAmount === "number" ? r.stipendAmount : 0),
              0
            ),
            paidRecordsWithoutAmount: paidRecords.filter(
              (r) => typeof r.stipendAmount !== "number"
            ).length,
          },
        };
      });

      setDisburseModal({ isOpen: false, record: null, reference: "", notes: "" });
      showFeedback("success", `Disbursement logged with reference ${ref}`);
    });
  };

  const handleBulkDisbursement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activePeriod) return;

    const reference = bulkModal.reference.trim();
    if (!reference) {
      showFeedback("error", "Please enter the batch reference from your bank.");
      return;
    }

    startTransition(async () => {
      const res = await bulkDisburseAction({
        periodId: activePeriod.id,
        disbursementReference: reference,
        notes: bulkModal.notes.trim() || null,
      });

      if (!res.success) {
        showFeedback("error", res.error || "Failed to record bulk disbursement.");
        return;
      }

      setBulkModal({ isOpen: false, reference: "", notes: "" });
      const skipped = res.data.skippedNotPaidCount;
      showFeedback(
        "success",
        `Recorded reference ${reference} for ${res.data.updatedCount} finalized record(s).` +
          (skipped > 0 ? ` ${skipped} record(s) skipped: employee not configured as paid.` : "")
      );
      window.location.reload();
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
          (skippedUnconfiguredCount > 0
            ? ` ${skippedUnconfiguredCount} employee(s) skipped: payout profile not configured.`
            : "")
      );
      if (enrolledCount > 0) {
        window.location.reload();
      }
    });
  };

  const handlePeriodTransition = (
    period: PayrollPeriodDetail,
    status: "DRAFT" | "FINALIZED" | "VOID"
  ) => {
    if (status === "VOID" && !window.confirm(`Void payroll cycle ${period.code}? This cannot be undone.`)) {
      return;
    }
    if (
      status === "DRAFT" &&
      !window.confirm(`Reopen payroll cycle ${period.code} as a draft?`)
    ) {
      return;
    }

    startTransition(async () => {
      const res = await updatePayrollPeriodStatusAction({
        periodId: period.id,
        status,
      });

      if (!res.success) {
        showFeedback("error", res.error || "Failed to update payroll cycle status.");
        return;
      }

      const recordStatusFrom: PayrollStatus[] =
        status === "FINALIZED" ? ["DRAFT"] : status === "DRAFT" ? ["FINALIZED"] : ["DRAFT", "FINALIZED"];
      setData((prev) => ({
        ...prev,
        periods: prev.periods.map((p) =>
          p.id === period.id ? { ...p, status } : p
        ),
        records: prev.records.map((r) =>
          r.payrollPeriodId === period.id && recordStatusFrom.includes(r.status)
            ? { ...r, status }
            : r
        ),
      }));

      const verb = status === "FINALIZED" ? "finalized" : status === "DRAFT" ? "reopened as draft" : "voided";
      showFeedback("success", `Payroll cycle ${period.code} ${verb}.`);
    });
  };

  const handleSelectPeriod = (periodId: string) => {
    setSelectedPeriodId(periodId);
    router.push(`${pathname}?period=${encodeURIComponent(periodId)}`);
  };

  const handleCreatePeriod = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPeriodModal.code.trim() || !newPeriodModal.startDate || !newPeriodModal.endDate) {
      showFeedback("error", "Period code, start date, and end date are required.");
      return;
    }

    startTransition(async () => {
      const res = await createPayrollPeriodAction({
        code: newPeriodModal.code.trim(),
        startDate: new Date(newPeriodModal.startDate).toISOString(),
        endDate: new Date(newPeriodModal.endDate).toISOString(),
        notes: newPeriodModal.notes.trim() || null,
      });

      if (!res.success) {
        showFeedback("error", res.error || "Failed to create payroll period.");
        return;
      }

      showFeedback("success", `Payroll cycle ${newPeriodModal.code} created.`);
      setNewPeriodModal({ isOpen: false, code: "", startDate: "", endDate: "", notes: "" });
      router.push(`${pathname}?period=${encodeURIComponent(res.data.id)}`);
    });
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profileModal.profile) return;

    const profile = profileModal.profile;
    const isPaid = profileModal.isPaid;
    const amountText = profileModal.stipendAmount.trim();
    const amount = amountText === "" ? null : Number(amountText);
    if (amount !== null && (!Number.isFinite(amount) || amount < 0)) {
      showFeedback("error", "Configured amount must be a non-negative number, or left empty.");
      return;
    }

    startTransition(async () => {
      const res = await updateEmployeePayoutProfileAction({
        employeeId: profile.employeeId,
        isPaid,
        employmentType: profileModal.employmentType,
        // Fields left untouched for unpaid employees keep their stored values.
        ...(isPaid
          ? {
              stipendAmount: amount,
              bankName: profileModal.bankName.trim() || null,
              ifscCode: profileModal.ifscCode.trim() || null,
              accountHolderName: profileModal.accountHolderName.trim() || null,
              // Empty means "keep the stored value" (the browser never has the full number).
              accountNumber: profileModal.accountNumber.trim() || undefined,
              panNumber: profileModal.panNumber.trim() || undefined,
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
        `Updated ${profile.employeeName}: marked as ${isPaid ? "Paid" : "Unpaid"}.` +
          (!isPaid && open > 0
            ? ` ${open} open payroll record(s) remain and cannot be disbursed while unpaid.`
            : "")
      );
      setProfileModal({ ...profileModal, isOpen: false, profile: null });
      window.location.reload();
    });
  };

  // Toggle quick paid/unpaid from card. Other payout fields keep their stored values.
  const handleQuickTogglePaid = (emp: EmployeePayoutProfile) => {
    startTransition(async () => {
      const newPaid = emp.isPaid !== true;
      const res = await updateEmployeePayoutProfileAction({
        employeeId: emp.employeeId,
        isPaid: newPaid,
      });

      if (!res.success) {
        showFeedback("error", res.error || "Failed to toggle status.");
        return;
      }

      showFeedback(
        "success",
        `${emp.employeeName} is now marked as ${newPaid ? "PAID" : "UNPAID"}.`
      );
      window.location.reload();
    });
  };

  // Register export. Account numbers are masked (the browser never receives full
  // numbers); a bank upload file format is pending approval (OD-008).
  const downloadRegisterCsv = () => {
    if (!filteredRecords.length) return;

    const headers = [
      "Employee Code",
      "Employee Name",
      "Account Holder",
      "Bank",
      "Account Number (masked)",
      "IFSC Code",
      "Configured Amount",
      "Employment Type",
      "Reference",
      "Status",
    ];

    const rows = filteredRecords.map((r) => [
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

    const csvContent = [headers.map(csvCell).join(","), ...rows.map((row) => row.join(","))].join(
      "\n"
    );
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `Payroll_Register_${activePeriod?.code || "Current"}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handlePrintSlip = () => {
    window.print();
  };

  return (
    <div className="w-full space-y-6">
      {/* ─── Global Notification Banner ─── */}
      {feedback && (
        <div
          className={`p-3.5 rounded-2xl flex items-center justify-between text-xs font-medium border shadow-xs animate-in fade-in duration-200 ${
            feedback.type === "success"
              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-800 dark:text-emerald-300"
              : "bg-destructive/10 border-destructive/30 text-destructive"
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === "success" ? (
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            ) : (
              <AlertCircle className="h-4 w-4 shrink-0 text-destructive" />
            )}
            <span>{feedback.message}</span>
          </div>
          <button
            onClick={() => setFeedback(null)}
            className="hover:opacity-75 transition-opacity p-1"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* ─── REDESIGNED TOP HEADER BANNER (NO UGLY WRAPPING) ─── */}
      <Card className="rounded-2xl border border-border/80 bg-card/80 backdrop-blur-xs p-4 sm:p-5 shadow-2xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          {/* Left: Cycle Details (No hyphen breaking) */}
          <div className="flex items-center gap-3.5 min-w-0">
            {/* <div className="h-11 w-11 rounded-2xl bg-primary/10 text-primary flex items-center justify-center font-bold shrink-0 border border-primary/20 shadow-2xs">
              <CreditCard className="h-5 w-5" />
            </div> */}
            <div className="min-w-0">
              <div className="flex items-center gap-2.5 flex-wrap">
                <h2 className="text-base sm:text-lg font-bold text-foreground whitespace-nowrap tracking-tight">
                  Payroll Cycle:{" "}
                  <span className="font-mono text-primary font-extrabold">
                    {activePeriod?.code || "No Cycle"}
                  </span>
                </h2>
                {/* {activePeriod && getStatusBadge(activePeriod.status)} */}
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5 flex-wrap">
                <span className="font-medium">
                  {activePeriod
                    ? `${formatDate(activePeriod.startDate)} – ${formatDate(activePeriod.endDate)}`
                    : "No period active"}
                </span>
                {/* <span>•</span>
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.2 rounded-md border border-emerald-500/20">
                  <ShieldCheck className="h-3 w-3" /> Paid Members Only
                </span> */}
              </div>
            </div>
          </div>

          {/* Right: Clean Multi-Group Actions Toolbar */}
          <div className="flex flex-wrap items-center gap-2 justify-start lg:justify-end">
            {/* Cycle Selector Dropdown */}
            <select
              value={selectedPeriodId}
              onChange={(e) => handleSelectPeriod(e.target.value)}
              aria-label="Select payroll cycle"
              className="h-9 px-3 text-xs rounded-xl border border-border/80 bg-background text-foreground font-mono font-medium cursor-pointer shadow-2xs hover:border-primary/50 transition-colors"
            >
              {data.periods.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code} ({formatDate(p.startDate)})
                </option>
              ))}
            </select>

            {/* New Period Button */}
            <Button
              size="sm"
              variant="outline"
              onClick={() => setNewPeriodModal({ ...newPeriodModal, isOpen: true })}
              className="h-9 rounded-xl text-xs gap-1.5"
            >
              <PlusCircle className="h-3.5 w-3.5" />
              New Cycle
            </Button>

            {/* Enroll Paid Workforce Button (explicit staff action, DRAFT cycles only) */}
            {activePeriod && activePeriod.status === "DRAFT" && (
              <Button
                size="sm"
                variant="outline"
                disabled={isPending}
                onClick={handleGenerateRecords}
                className="h-9 rounded-xl text-xs gap-1.5 font-medium"
                title="Enroll active employees whose payout profile is configured as paid"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isPending ? "animate-spin" : ""}`} />
                Enroll Paid Workforce
              </Button>
            )}

            {/* Finalize Button */}
            {activePeriod && activePeriod.status === "DRAFT" && (
              <Button
                size="sm"
                variant="outline"
                disabled={isPending}
                onClick={() => handlePeriodTransition(activePeriod, "FINALIZED")}
                className="h-9 rounded-xl text-xs gap-1.5 text-blue-600 dark:text-blue-400 border-blue-500/30 hover:bg-blue-500/10"
              >
                <Lock className="h-3.5 w-3.5" />
                Finalize
              </Button>
            )}

            {/* Bulk Disburse Button (FINALIZED cycles only) */}
            {activePeriod && activePeriod.status === "FINALIZED" && (
              <Button
                size="sm"
                onClick={() => setBulkModal({ ...bulkModal, isOpen: true })}
                className="h-9 rounded-xl text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white shadow-2xs font-semibold"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                Bulk Disburse
              </Button>
            )}

            {/* Bank CSV Export */}
            <Button
              size="sm"
              variant="outline"
              onClick={downloadRegisterCsv}
              className="h-9 rounded-xl text-xs gap-1.5"
              title="Download the payroll register (account numbers masked)"
            >
              <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
              Register CSV
            </Button>
          </div>
        </div>
      </Card>

      {/* ─── Metric Cards Grid ─── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5 sm:gap-4">
        {/* 1. Active Cycle */}
        <div className="bg-card border border-border/80 border-l-4 border-l-blue-500 rounded-2xl p-4 sm:p-5 shadow-2xs hover:shadow-xs hover:border-blue-500/40 transition-all flex flex-col justify-between">
          <div className="flex items-center justify-between gap-2 mb-2">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider font-mono">
              Active Cycle
            </span>
            <div className="h-8 w-8 rounded-xl bg-blue-500/15 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
              <Calendar className="h-4 w-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold font-mono text-foreground tracking-tight whitespace-nowrap">
            {activePeriod?.code || "—"}
          </div>
          <div className="mt-2 text-[11px] text-muted-foreground truncate">
            {activePeriod ? `${formatDate(activePeriod.startDate)}` : "No cycle"}
          </div>
        </div>

        {/* 2. Paid Workforce Enrolled */}
        <div className="bg-card border border-border/80 border-l-4 border-l-purple-500 rounded-2xl p-4 sm:p-5 shadow-2xs hover:shadow-xs hover:border-purple-500/40 transition-all flex flex-col justify-between">
          <div className="flex items-center justify-between gap-2 mb-2">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider font-mono">
              Enrolled Records
            </span>
            <div className="h-8 w-8 rounded-xl bg-purple-500/15 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0">
              <Users className="h-4 w-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold font-mono text-foreground tracking-tight">
            {data.stats.totalEnrolled}
          </div>
          <div className="mt-2 text-[11px] text-purple-700 dark:text-purple-300 font-medium flex items-center gap-1">
            <Sparkles className="h-3 w-3" />
            {data.stats.totalPaidWorkforce} configured as paid
          </div>
        </div>

        {/* 3. Disbursed & Paid */}
        <div className="bg-card border border-border/80 border-l-4 border-l-emerald-500 rounded-2xl p-4 sm:p-5 shadow-2xs hover:shadow-xs hover:border-emerald-500/40 transition-all flex flex-col justify-between">
          <div className="flex items-center justify-between gap-2 mb-2">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider font-mono">
              Disbursed & Paid
            </span>
            <div className="h-8 w-8 rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
              <CheckCircle2 className="h-4 w-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold font-mono text-foreground tracking-tight">
            {data.stats.paidCount}
          </div>
          <div className="mt-2 flex items-center gap-1.5 text-[11px]">
            <span className="font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-500/15 px-2 py-0.5 rounded-md font-mono">
              {data.stats.completionRate}% Done
            </span>
          </div>
        </div>

        {/* 4. Pending Payouts */}
        <div className="bg-card border border-border/80 border-l-4 border-l-amber-500 rounded-2xl p-4 sm:p-5 shadow-2xs hover:shadow-xs hover:border-amber-500/40 transition-all flex flex-col justify-between">
          <div className="flex items-center justify-between gap-2 mb-2">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider font-mono">
              Pending Payouts
            </span>
            <div className="h-8 w-8 rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
              <Clock className="h-4 w-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold font-mono text-foreground tracking-tight">
            {data.stats.draftCount + data.stats.finalizedCount}
          </div>
          <div className="mt-2 text-[11px] text-muted-foreground">
            Awaiting bank disbursement
          </div>
        </div>

        {/* 5. Unpaid / Non-Stipendiary Excluded */}
        <div className="col-span-2 sm:col-span-1 bg-card border border-border/80 border-l-4 border-l-zinc-500 rounded-2xl p-4 sm:p-5 shadow-2xs hover:shadow-xs hover:border-zinc-500/40 transition-all flex flex-col justify-between">
          <div className="flex items-center justify-between gap-2 mb-2">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider font-mono">
              Unpaid Workforce
            </span>
            <div className="h-8 w-8 rounded-xl bg-muted text-muted-foreground flex items-center justify-center shrink-0">
              <UserX className="h-4 w-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold font-mono text-muted-foreground tracking-tight">
            {data.stats.totalUnpaidWorkforce}
          </div>
          <div className="mt-2 text-[11px] text-muted-foreground">
            {data.stats.totalUnconfiguredWorkforce} payout {NOT_CONFIGURED.toLowerCase()}
          </div>
        </div>
      </div>

      {/* ─── Navigation Tabs ─── */}
      <div className="flex items-center gap-1.5 p-1 rounded-2xl bg-muted/60 border border-border/60 max-w-fit">
        <button
          onClick={() => setActiveTab("records")}
          className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
            activeTab === "records"
              ? "bg-background text-foreground shadow-xs border border-border/60"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <CreditCard className="h-3.5 w-3.5" />
          Payout Register
          <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">
            {data.records.length} Enrolled
          </span>
        </button>

        <button
          onClick={() => setActiveTab("profiles")}
          className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
            activeTab === "profiles"
              ? "bg-background text-foreground shadow-xs border border-border/60"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Building className="h-3.5 w-3.5" />
          Paid & Unpaid Directory ({data.employees.length})
        </button>

        <button
          onClick={() => setActiveTab("periods")}
          className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
            activeTab === "periods"
              ? "bg-background text-foreground shadow-xs border border-border/60"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Calendar className="h-3.5 w-3.5" />
          Cycles & Periods ({data.periods.length})
        </button>

        <button
          onClick={() => setActiveTab("export")}
          className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
            activeTab === "export"
              ? "bg-background text-foreground shadow-xs border border-border/60"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Download className="h-3.5 w-3.5" />
          Register Export
        </button>
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          TAB 1: PAID PAYOUT REGISTER (ONLY PAID EMPLOYEES)
          ══════════════════════════════════════════════════════════════════ */}
      {activeTab === "records" && (
        <div className="space-y-4">
          {/* Info pill about paid-only inclusion */}
          {/* <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 text-xs text-blue-800 dark:text-blue-300 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />
              <span>
                <strong>Paid Payout Policy Active:</strong> This register strictly manages{" "}
                <strong>Paid Interns</strong> and <strong>Paid Full-Time</strong> employees with verified
                bank details. Unpaid / volunteer members are excluded.
              </span>
            </div>
            <button
              onClick={() => setActiveTab("profiles")}
              className="font-semibold underline hover:opacity-80 shrink-0 text-xs cursor-pointer ml-3"
            >
              Configure Paid Status →
            </button>
          </div> */}

          {/* Search & Filter Bar */}
          <div className="p-4 rounded-2xl border border-border/80 bg-card/70 flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between shadow-2xs">
            {/* Search Input */}
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, code, dept, or UTR..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 pr-8 h-9 rounded-xl border-border/80 bg-background/80 text-xs"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* Filter Pills */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Type Selector (All vs Intern vs Full-Time) */}
              <div className="flex items-center gap-1 p-1 rounded-xl bg-muted/60 border border-border/60 text-xs">
                {(["ALL", "INTERN", "FULL_TIME"] as const).map((tp) => (
                  <button
                    key={tp}
                    onClick={() => setTypeFilter(tp)}
                    className={`px-2.5 py-1 rounded-lg font-medium transition-all cursor-pointer ${
                      typeFilter === tp
                        ? "bg-background text-foreground shadow-2xs font-semibold"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {tp === "ALL" ? "All Types" : tp === "INTERN" ? "Interns" : "Full-Time"}
                  </button>
                ))}
              </div>

              {/* Status Selector */}
              <div className="flex items-center gap-1 p-1 rounded-xl bg-muted/60 border border-border/60 text-xs">
                {(["ALL", "PAID", "FINALIZED", "DRAFT"] as const).map((st) => (
                  <button
                    key={st}
                    onClick={() => setStatusFilter(st)}
                    className={`px-2.5 py-1 rounded-lg font-medium transition-all cursor-pointer ${
                      statusFilter === st
                        ? "bg-background text-foreground shadow-2xs font-semibold"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {st === "ALL" ? "All Status" : st.charAt(0) + st.slice(1).toLowerCase()}
                  </button>
                ))}
              </div>

              {(statusFilter !== "ALL" || typeFilter !== "ALL" || searchQuery) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setStatusFilter("ALL");
                    setTypeFilter("ALL");
                    setSearchQuery("");
                  }}
                  className="text-xs text-muted-foreground hover:text-foreground h-9 px-2.5"
                >
                  Reset
                </Button>
              )}
            </div>
          </div>

          {/* Payroll Records Table */}
          <Card className="rounded-2xl border border-border/80 bg-card overflow-hidden shadow-2xs">
            <div className="w-full">
              <table className="w-full text-left text-xs border-collapse table-fixed">
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
                  {filteredRecords.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-12 text-center text-muted-foreground">
                        <div className="flex flex-col items-center justify-center gap-2">
                          <CreditCard className="h-8 w-8 text-muted-foreground/60 mb-1" />
                          <p className="text-sm font-semibold text-foreground">
                            {activePeriod ? "No payroll records found in this cycle" : "No payroll cycle yet"}
                          </p>
                          <p className="text-xs text-muted-foreground max-w-sm">
                            {!activePeriod
                              ? "Create a payroll cycle with 'New Cycle' to start recording disbursements."
                              : searchQuery || statusFilter !== "ALL" || typeFilter !== "ALL"
                                ? "Try adjusting search or status filters."
                                : "Configure employees as Paid in the Directory, then use 'Enroll Paid Workforce' on a draft cycle."}
                          </p>
                          {activePeriod && activePeriod.status === "DRAFT" && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={handleGenerateRecords}
                              className="mt-2 text-xs rounded-xl"
                            >
                              <RefreshCw className="h-3.5 w-3.5 mr-1" /> Enroll Paid Workforce
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filteredRecords.map((req) => (
                      <tr
                        key={req.id}
                        className="hover:bg-muted/30 transition-colors group"
                      >
                        {/* 1. Employee Details */}
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-3 min-w-0">
                            {/* <div className="h-9 w-9 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold text-xs shrink-0 border border-blue-500/20 shadow-2xs">
                              {req.employeeName.charAt(0).toUpperCase()}
                            </div> */}
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-foreground truncate text-xs" title={req.employeeName}>
                                  {req.employeeName}
                                </span>
                                <span className="font-mono text-[10px] bg-primary/10 text-primary px-1.5 py-0.2 rounded font-medium border border-primary/20 shrink-0">
                                  {req.employeeCode}
                                </span>
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
                          </div>
                        </td>

                        {/* 2. Compensation & Net Amount */}
                        <td className="py-3.5 px-4">
                          <div className="space-y-1">
                            <div className="font-mono font-bold text-foreground text-sm">
                              {formatCurrency(req.stipendAmount)}
                            </div>
                            <div className="text-[10px] text-muted-foreground/80 font-medium">
                              {req.isPaid === true
                                ? "From payout profile"
                                : req.isPaid === false
                                  ? "Employee marked unpaid"
                                  : "Payout profile not configured"}
                            </div>
                          </div>
                        </td>

                        {/* 3. Bank Account & IFSC */}
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-1.5 font-medium text-foreground text-xs">
                            <Building className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            <span className="truncate">{req.bankName ?? NOT_CONFIGURED}</span>
                          </div>
                          <div className="text-[11px] text-muted-foreground mt-1 flex items-center gap-2">
                            <span className="font-mono text-foreground font-semibold bg-muted/80 border border-border/60 px-1.5 py-0.2 rounded text-[10px]">
                              A/C {req.accountNumberMasked ?? NOT_CONFIGURED}
                            </span>
                            <span className="text-[10px] font-mono text-muted-foreground/75 truncate">
                              IFSC: {req.ifscCode ?? NOT_CONFIGURED}
                            </span>
                          </div>
                        </td>

                        {/* 4. Status & UTR */}
                        <td className="py-3.5 px-4">
                          <div className="space-y-1">
                            <div className="flex items-center gap-1.5">
                              {getStatusBadge(req.status)}
                            </div>
                            {req.disbursementReference ? (
                              <button
                                onClick={() => copyToClipboard(req.disbursementReference!)}
                                className="group/utr flex items-center gap-1 text-[10px] font-mono text-muted-foreground hover:text-foreground transition-colors cursor-pointer bg-muted/40 hover:bg-muted px-1.5 py-0.5 rounded border border-border/60 truncate max-w-full"
                                title="Click to copy UTR reference"
                              >
                                <span className="truncate">{req.disbursementReference}</span>
                                {copiedUtr === req.disbursementReference ? (
                                  <CheckCheck className="h-3 w-3 text-emerald-500 shrink-0" />
                                ) : (
                                  <Copy className="h-3 w-3 opacity-60 group-hover/utr:opacity-100 shrink-0" />
                                )}
                              </button>
                            ) : (
                              <div className="text-[10px] text-muted-foreground/70">
                                {req.status === "FINALIZED"
                                  ? "Ready for disbursement"
                                  : req.status === "VOID"
                                    ? "Voided"
                                    : "Draft: finalize the cycle first"}
                              </div>
                            )}
                          </div>
                        </td>

                        {/* 5. Actions (Clean Icon Buttons) */}
                        <td className="py-3.5 px-4 text-right pr-4 whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1.5">
                            {/* Eye Details / Payslip Button */}
                            <button
                              type="button"
                              onClick={() => setDetailsModal({ isOpen: true, record: req })}
                              className="h-8 w-8 rounded-lg border border-border/80 bg-background hover:bg-muted text-muted-foreground hover:text-primary transition-all flex items-center justify-center shadow-2xs cursor-pointer group/eye"
                              title="View Full Payslip & Disbursement Details"
                            >
                              <Eye className="h-4 w-4 group-hover/eye:scale-110 transition-transform" />
                            </button>

                            {/* Record Disbursement Button (FINALIZED records of a FINALIZED cycle) */}
                            {req.status === "FINALIZED" && activePeriod?.status === "FINALIZED" && (
                              <button
                                type="button"
                                onClick={() =>
                                  setDisburseModal({
                                    isOpen: true,
                                    record: req,
                                    reference: "",
                                    notes: "",
                                  })
                                }
                                className="h-8 w-8 rounded-lg bg-emerald-50 hover:bg-emerald-600 text-emerald-600 hover:text-white dark:bg-emerald-950/50 dark:hover:bg-emerald-600 dark:text-emerald-400 dark:hover:text-white border border-emerald-500/30 hover:border-emerald-600 transition-all flex items-center justify-center shadow-2xs cursor-pointer group/pay"
                                title="Record Disbursement & Bank UTR"
                              >
                                <Check className="h-4 w-4 stroke-[2.5]" />
                              </button>
                            )}

                            {/* Edit Bank & Compensation */}
                            <button
                              type="button"
                              onClick={() =>
                                openProfileModal(
                                  data.employees.find((e) => e.employeeId === req.employeeId) ?? null
                                )
                              }
                              className="h-8 w-8 rounded-lg border border-border/80 bg-background hover:bg-muted text-muted-foreground hover:text-foreground transition-all flex items-center justify-center shadow-2xs cursor-pointer"
                              title="Edit Employee Bank & Stipend Settings"
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
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          TAB 2: EMPLOYEE DIRECTORY (PAID VS UNPAID CONFIGURATION)
          ══════════════════════════════════════════════════════════════════ */}
      {activeTab === "profiles" && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl bg-card border border-border/80 shadow-2xs">
            <div>
              <h3 className="text-sm font-bold text-foreground">
                Employee Compensation & Payout Directory
              </h3>
              {/* <p className="text-xs text-muted-foreground mt-0.5">
                Designate who is <strong>Paid</strong> (Stipend/Salary eligible) vs{" "}
                <strong>Unpaid</strong> (Non-stipendiary interns/volunteers). Only Paid members receive
                payroll disbursements.
              </p> */}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-xl border border-emerald-500/20">
                {data.stats.totalPaidWorkforce} Paid Eligible
              </span>
              <span className="text-xs font-mono font-bold text-muted-foreground bg-muted/60 px-2.5 py-1 rounded-xl border border-border/60">
                {data.stats.totalUnpaidWorkforce} Unpaid
              </span>
              <span className="text-xs font-mono font-bold text-amber-700 dark:text-amber-400 bg-amber-500/10 px-2.5 py-1 rounded-xl border border-amber-500/20">
                {data.stats.totalUnconfiguredWorkforce} {NOT_CONFIGURED}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {data.employees.map((emp) => (
              <Card
                key={emp.employeeId}
                className={`rounded-2xl border p-5 shadow-2xs hover:shadow-xs transition-all flex flex-col justify-between ${
                  emp.isPaid !== false
                    ? "border-border/80 bg-card"
                    : "border-border/60 bg-muted/20 opacity-90"
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-2xl bg-primary/10 text-primary flex items-center justify-center font-bold text-sm shrink-0 border border-primary/20">
                        {emp.employeeName.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-foreground text-sm">{emp.employeeName}</span>
                          <span className="font-mono text-[10px] bg-primary/10 text-primary px-1.5 py-0.2 rounded font-medium border border-primary/20">
                            {emp.employeeCode}
                          </span>
                        </div>
                        <div className="text-[11px] text-muted-foreground mt-0.5">
                          {emp.department} • {emp.designation}
                        </div>
                      </div>
                    </div>

                    {/* Paid / Unpaid Status Badge */}
                    <div className="text-right">
                      {emp.isPaid === true ? (
                        <div>
                          <div className="font-mono font-extrabold text-foreground text-base">
                            {formatCurrency(emp.stipendAmount)}
                          </div>
                          <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 font-mono">
                            Paid · {employmentLabel(emp.employmentType)}
                          </span>
                        </div>
                      ) : emp.isPaid === false ? (
                        <div>
                          <div className="font-mono font-bold text-muted-foreground text-sm">
                            Unpaid
                          </div>
                          <span className="text-[10px] font-bold text-muted-foreground font-mono bg-muted/60 px-2 py-0.5 rounded">
                            Non-Stipendiary
                          </span>
                        </div>
                      ) : (
                        <div>
                          <div className="font-mono font-bold text-amber-700 dark:text-amber-400 text-sm">
                            {NOT_CONFIGURED}
                          </div>
                          <span className="text-[10px] font-bold text-muted-foreground font-mono bg-muted/60 px-2 py-0.5 rounded">
                            Payout profile missing
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Bank Details Box (Paid / not configured) or Non-Stipendiary Note (Unpaid) */}
                  {emp.isPaid !== false ? (
                    <div className="p-3 rounded-xl bg-muted/40 border border-border/60 text-xs space-y-1.5">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Bank Name:</span>
                        <span className="font-medium text-foreground">{emp.bankName ?? NOT_CONFIGURED}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Account Number:</span>
                        <span className="font-mono font-medium text-foreground">
                          {emp.accountNumberMasked ?? NOT_CONFIGURED}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">IFSC Code:</span>
                        <span className="font-mono font-medium text-foreground">{emp.ifscCode ?? NOT_CONFIGURED}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">PAN:</span>
                        <span className="font-mono font-medium text-foreground">{emp.panMasked ?? NOT_CONFIGURED}</span>
                      </div>
                    </div>
                  ) : (
                    <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-800 dark:text-amber-300 flex items-center gap-2">
                      <UserX className="h-4 w-4 shrink-0 text-amber-600" />
                      <span>
                        Non-stipendiary employee. This member does not receive monthly bank disbursements or tax receipts.
                      </span>
                    </div>
                  )}
                </div>

                {/* Footer Actions */}
                <div className="pt-4 border-t border-border/60 flex items-center justify-between mt-4 gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleQuickTogglePaid(emp)}
                    className="text-xs rounded-xl h-8 text-muted-foreground hover:text-foreground cursor-pointer"
                  >
                    {emp.isPaid === true ? "Switch to Unpaid" : "Mark as Paid"}
                  </Button>

                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => openProfileModal(emp)}
                    className="text-xs rounded-xl gap-1.5 h-8"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Configure Payout
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          TAB 3: CYCLES & PERIODS LIST
          ══════════════════════════════════════════════════════════════════ */}
      {activeTab === "periods" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-foreground">Operational Payroll Cycles</h3>
              {/* <p className="text-xs text-muted-foreground mt-0.5">
                Manage monthly disbursement windows, lock cycles, and track historical disbursements.
              </p> */}
            </div>
            <Button
              size="sm"
              onClick={() => setNewPeriodModal({ ...newPeriodModal, isOpen: true })}
              className="text-xs rounded-xl gap-1.5"
            >
              <PlusCircle className="h-3.5 w-3.5" />
              New Payroll Cycle
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {data.periods.map((period) => {
              const isSelected = period.id === activePeriod?.id;
              const progressPct =
                period.totalRecords > 0
                  ? Math.round((period.paidRecords / period.totalRecords) * 100)
                  : 0;

              return (
                <Card
                  key={period.id}
                  className={`rounded-2xl border transition-all p-5 shadow-2xs flex flex-col justify-between ${
                    isSelected
                      ? "border-primary/60 bg-card ring-1 ring-primary/20 shadow-xs"
                      : "border-border/80 bg-card/70 hover:border-border"
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-3">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-base font-extrabold text-foreground">
                          {period.code}
                        </span>
                        {isSelected && (
                          <Badge variant="outline" className="text-[10px] font-medium bg-primary/10 text-primary border-primary/20">
                            Active
                          </Badge>
                        )}
                      </div>
                      {getStatusBadge(period.status)}
                    </div>

                    <div className="text-xs text-muted-foreground flex items-center gap-1.5 mb-4">
                      <Calendar className="h-3.5 w-3.5" />
                      <span>
                        {formatDate(period.startDate)} – {formatDate(period.endDate)}
                      </span>
                    </div>

                    {/* Progress Bar */}
                    <div className="space-y-1.5 my-3">
                      <div className="flex justify-between text-[11px] font-medium">
                        <span className="text-muted-foreground">Disbursement Progress</span>
                        <span className="font-mono font-bold text-foreground">
                          {period.paidRecords} / {period.totalRecords} ({progressPct}%)
                        </span>
                      </div>
                      <div className="h-2 w-full bg-muted/60 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-emerald-500 rounded-full transition-all duration-300"
                          style={{ width: `${progressPct}%` }}
                        />
                      </div>
                    </div>

                    {period.notes && (
                      <p className="text-[11px] text-muted-foreground/80 line-clamp-2 mt-2">
                        {period.notes}
                      </p>
                    )}
                  </div>

                  <div className="pt-4 border-t border-border/60 flex items-center justify-between gap-2 mt-4">
                    <Button
                      size="sm"
                      variant={isSelected ? "secondary" : "outline"}
                      onClick={() => {
                        setActiveTab("records");
                        if (period.id !== activePeriod?.id) {
                          handleSelectPeriod(period.id);
                        }
                      }}
                      className="text-xs rounded-xl h-8 flex-1"
                    >
                      View Register
                    </Button>

                    {period.status === "DRAFT" && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={isPending}
                        onClick={() => handlePeriodTransition(period, "FINALIZED")}
                        className="text-xs rounded-xl h-8 text-blue-600 dark:text-blue-400 border-blue-500/30"
                      >
                        Finalize
                      </Button>
                    )}
                    {period.status === "FINALIZED" && period.paidRecords === 0 && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={isPending}
                        onClick={() => handlePeriodTransition(period, "DRAFT")}
                        className="text-xs rounded-xl h-8"
                      >
                        Reopen
                      </Button>
                    )}
                    {(period.status === "DRAFT" || period.status === "FINALIZED") &&
                      period.paidRecords === 0 && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={isPending}
                          onClick={() => handlePeriodTransition(period, "VOID")}
                          className="text-xs rounded-xl h-8 text-destructive border-destructive/30"
                        >
                          Void
                        </Button>
                      )}
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          TAB 4: PAYROLL REGISTER EXPORT (MASKED)
          ══════════════════════════════════════════════════════════════════ */}
      {activeTab === "export" && (
        <Card className="rounded-2xl border border-border/80 bg-card p-6 shadow-2xs space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-border/60">
            <div>
              <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                <FileSpreadsheet className="h-4 w-4 text-primary" />
                Payroll Register Export
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Account numbers are masked. A bank upload file format has not been approved yet (OD-008).
              </p>
            </div>
            <Button
              onClick={downloadRegisterCsv}
              className="gap-2 text-xs rounded-xl bg-primary text-primary-foreground shadow-2xs"
            >
              <Download className="h-4 w-4" />
              Download Register CSV
            </Button>
          </div>

          {/* Batch Summary */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-4 rounded-xl bg-muted/40 border border-border/60">
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider font-mono">
                Register Entries
              </span>
              <div className="text-2xl font-bold font-mono text-foreground mt-1">
                {filteredRecords.length}
              </div>
            </div>
            <div className="p-4 rounded-xl bg-muted/40 border border-border/60">
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider font-mono">
                Configured Amount Total
              </span>
              <div className="text-2xl font-bold font-mono text-foreground mt-1 text-emerald-600 dark:text-emerald-400">
                {formatCurrency(
                  filteredRecords.reduce(
                    (sum, r) => sum + (typeof r.stipendAmount === "number" ? r.stipendAmount : 0),
                    0
                  )
                )}
              </div>
              <div className="text-[11px] text-muted-foreground mt-1">
                Excludes{" "}
                {filteredRecords.filter((r) => typeof r.stipendAmount !== "number").length}{" "}
                record(s) without a configured amount
              </div>
            </div>
            <div className="p-4 rounded-xl bg-muted/40 border border-border/60">
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider font-mono">
                Bank Upload Format
              </span>
              <div className="text-sm font-bold text-foreground mt-1 flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-muted-foreground" />
                Pending approval (OD-008)
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          MODAL 1: FULL PAYSLIP & DISBURSEMENT RECEIPT
          ══════════════════════════════════════════════════════════════════ */}
      {detailsModal.isOpen && detailsModal.record && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-card border border-border/80 rounded-3xl w-full max-w-2xl max-h-[92vh] overflow-y-auto shadow-2xl p-6 sm:p-7 space-y-6 print:p-0 print:border-none print:shadow-none">
            {/* Header / Brand */}
            <div className="flex items-start justify-between border-b border-border/80 pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-xl bg-primary text-primary-foreground flex items-center justify-center font-bold text-sm">
                    G
                  </div>
                  <div>
                    <h3 className="font-extrabold text-foreground text-sm tracking-tight">
                      GARA INNOVATION
                    </h3>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-mono">
                      Payroll Record Details (not a payslip)
                    </p>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 print:hidden">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handlePrintSlip}
                  className="h-8 text-xs gap-1.5 rounded-xl"
                >
                  <Printer className="h-3.5 w-3.5" />
                  Print Record
                </Button>
                <button
                  onClick={() => setDetailsModal({ isOpen: false, record: null })}
                  className="h-8 w-8 rounded-xl border border-border/80 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Payslip Metadata Banner */}
            <div className="p-4 rounded-2xl bg-muted/40 border border-border/60 flex flex-wrap items-center justify-between gap-4">
              <div>
                <span className="text-[10px] text-muted-foreground font-mono uppercase tracking-wider font-bold">
                  Payroll Cycle
                </span>
                <div className="text-base font-extrabold font-mono text-foreground">
                  {detailsModal.record.payrollPeriodCode}
                </div>
              </div>
              <div>
                <span className="text-[10px] text-muted-foreground font-mono uppercase tracking-wider font-bold">
                  Employment Status
                </span>
                <div className="mt-0.5">
                  <Badge variant="outline" className="font-mono text-xs">
                    {employmentLabel(detailsModal.record.employmentType)}
                  </Badge>
                </div>
              </div>
              <div>
                <span className="text-[10px] text-muted-foreground font-mono uppercase tracking-wider font-bold">
                  Payout Status
                </span>
                <div className="mt-0.5">{getStatusBadge(detailsModal.record.status)}</div>
              </div>
            </div>

            {/* Employee Information Grid */}
            <div className="grid grid-cols-2 gap-4 text-xs">
              <div className="space-y-1">
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider font-mono">
                  Employee Name
                </span>
                <div className="font-bold text-foreground text-sm">
                  {detailsModal.record.employeeName}
                </div>
                <div className="text-muted-foreground text-[11px]">
                  {detailsModal.record.employeeEmail}
                </div>
              </div>
              <div className="space-y-1">
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider font-mono">
                  Employee ID & Role
                </span>
                <div className="font-mono font-semibold text-primary">
                  {detailsModal.record.employeeCode}
                </div>
                <div className="text-muted-foreground text-[11px]">
                  {detailsModal.record.department} • {detailsModal.record.designation}
                </div>
              </div>
            </div>

            {/* Banking Details Box */}
            <div className="p-4 rounded-2xl bg-card border border-border/80 space-y-2 text-xs">
              <div className="font-bold text-foreground text-xs uppercase tracking-wider font-mono border-b border-border/60 pb-2">
                Disbursement & Banking Destination
              </div>
              <div className="grid grid-cols-2 gap-3 pt-1">
                <div>
                  <span className="text-muted-foreground text-[11px]">Beneficiary Bank:</span>
                  <div className="font-medium text-foreground">
                    {detailsModal.record.bankName ?? NOT_CONFIGURED}
                  </div>
                </div>
                <div>
                  <span className="text-muted-foreground text-[11px]">Account Number:</span>
                  <div className="font-mono font-medium text-foreground">
                    {detailsModal.record.accountNumberMasked ?? NOT_CONFIGURED}
                  </div>
                </div>
                <div>
                  <span className="text-muted-foreground text-[11px]">IFSC Code:</span>
                  <div className="font-mono font-medium text-foreground">
                    {detailsModal.record.ifscCode ?? NOT_CONFIGURED}
                  </div>
                </div>
                <div>
                  <span className="text-muted-foreground text-[11px]">Account Holder:</span>
                  <div className="font-medium text-foreground">
                    {detailsModal.record.accountHolderName ?? NOT_CONFIGURED}
                  </div>
                </div>
              </div>
            </div>

            {/* Compensation & Net Amount */}
            <div className="p-5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-between">
              <div>
                <span className="text-[10px] font-bold text-emerald-800 dark:text-emerald-300 uppercase tracking-wider font-mono">
                  Configured Amount
                </span>
                <div className="text-2xl sm:text-3xl font-extrabold font-mono text-emerald-700 dark:text-emerald-400 mt-0.5">
                  {formatCurrency(detailsModal.record.stipendAmount)}
                </div>
                <span className="text-[11px] text-emerald-700/80 dark:text-emerald-400/80">
                  As entered in the employee payout profile. No salary calculation is performed (OD-008).
                </span>
              </div>
              <ShieldCheck className="h-10 w-10 text-emerald-600 dark:text-emerald-400/50" />
            </div>

            {/* Bank Reference & Audit Stamp */}
            {detailsModal.record.disbursementReference && (
              <div className="p-3.5 rounded-xl bg-muted/40 border border-border/60 text-xs flex items-center justify-between">
                <div>
                  <span className="text-[10px] text-muted-foreground font-mono uppercase tracking-wider font-bold">
                    Bank UTR Reference
                  </span>
                  <div className="font-mono font-bold text-foreground text-sm">
                    {detailsModal.record.disbursementReference}
                  </div>
                  {detailsModal.record.disbursedAt && (
                    <div className="text-[10px] text-muted-foreground mt-0.5">
                      Transferred on {formatDate(detailsModal.record.disbursedAt)}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => copyToClipboard(detailsModal.record!.disbursementReference!)}
                  className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                  title="Copy UTR"
                >
                  <Copy className="h-4 w-4" />
                </button>
              </div>
            )}

            {/* Quick Action inside modal for finalized, not yet disbursed records */}
            {detailsModal.record.status === "FINALIZED" && activePeriod?.status === "FINALIZED" && (
              <div className="pt-2 flex items-center justify-end gap-2 print:hidden">
                <Button
                  onClick={() => {
                    const rec = detailsModal.record!;
                    setDetailsModal({ isOpen: false, record: null });
                    setDisburseModal({
                      isOpen: true,
                      record: rec,
                      reference: "",
                      notes: "",
                    });
                  }}
                  className="text-xs rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
                >
                  <Check className="h-4 w-4" />
                  Mark Disbursed Now
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          MODAL 2: RECORD DISBURSEMENT & BANK UTR
          ══════════════════════════════════════════════════════════════════ */}
      {disburseModal.isOpen && disburseModal.record && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <form
            onSubmit={handleRecordDisbursement}
            className="bg-card border border-border/80 rounded-3xl w-full max-w-md shadow-2xl p-6 space-y-5"
          >
            <div className="flex items-center justify-between border-b border-border/80 pb-3">
              <div>
                <h3 className="font-bold text-foreground text-sm">
                  Record Payout Disbursement
                </h3>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Confirm bank transfer and log UTR reference
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDisburseModal({ isOpen: false, record: null, reference: "", notes: "" })}
                className="h-8 w-8 rounded-xl border border-border/80 flex items-center justify-center text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-3.5 rounded-2xl bg-muted/40 border border-border/60 text-xs space-y-1">
              <div className="font-bold text-foreground">{disburseModal.record.employeeName}</div>
              <div className="text-muted-foreground">
                {disburseModal.record.employeeCode} • {disburseModal.record.department}
              </div>
              <div className="font-mono font-bold text-emerald-600 dark:text-emerald-400 pt-1">
                Amount: {formatCurrency(disburseModal.record.stipendAmount)}
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-muted-foreground uppercase font-mono">
                Bank Transfer / UTR Reference *
              </label>
              <Input
                required
                aria-label="Bank transfer or UTR reference"
                placeholder="Reference issued by your bank"
                value={disburseModal.reference}
                onChange={(e) => setDisburseModal({ ...disburseModal, reference: e.target.value })}
                className="font-mono text-xs rounded-xl h-9"
              />
              <p className="text-[10px] text-muted-foreground">
                Enter the reference exactly as issued by the bank. The system never generates references.
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-muted-foreground uppercase font-mono">
                Audit Notes (Optional)
              </label>
              <Input
                placeholder="e.g. Verified via corporate netbanking"
                value={disburseModal.notes}
                onChange={(e) => setDisburseModal({ ...disburseModal, notes: e.target.value })}
                className="text-xs rounded-xl h-9"
              />
            </div>

            <div className="pt-2 flex items-center justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setDisburseModal({ isOpen: false, record: null, reference: "", notes: "" })}
                className="text-xs rounded-xl"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={isPending}
                className="text-xs rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {isPending ? "Recording..." : "Confirm & Mark as Paid"}
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          MODAL 3: BULK DISBURSEMENT
          ══════════════════════════════════════════════════════════════════ */}
      {bulkModal.isOpen && activePeriod && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <form
            onSubmit={handleBulkDisbursement}
            className="bg-card border border-border/80 rounded-3xl w-full max-w-md shadow-2xl p-6 space-y-5"
          >
            <div className="flex items-center justify-between border-b border-border/80 pb-3">
              <div>
                <h3 className="font-bold text-foreground text-sm">
                  Bulk Payout & Batch Disbursement
                </h3>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Record one bank batch reference for {activePeriod.code}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setBulkModal({ ...bulkModal, isOpen: false })}
                className="h-8 w-8 rounded-xl border border-border/80 flex items-center justify-center text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-xs space-y-1">
              <div className="font-bold text-amber-800 dark:text-amber-300">
                Action Summary:
              </div>
              <div className="text-amber-700 dark:text-amber-400">
                Every <strong>FINALIZED</strong> record in cycle <strong>{activePeriod.code}</strong>{" "}
                whose employee is configured as paid will be marked <strong>PAID</strong> with the
                reference below. Records of employees not configured as paid are skipped.
              </div>
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="bulk-disbursement-reference"
                className="text-[11px] font-bold text-muted-foreground uppercase font-mono"
              >
                Bank Batch Reference *
              </label>
              <Input
                id="bulk-disbursement-reference"
                required
                placeholder="Batch reference issued by your bank"
                value={bulkModal.reference}
                onChange={(e) => setBulkModal({ ...bulkModal, reference: e.target.value })}
                className="font-mono text-xs rounded-xl h-9"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-muted-foreground uppercase font-mono">
                Audit Notes
              </label>
              <Input
                placeholder="e.g. Authorized by CFO for monthly bank payout"
                value={bulkModal.notes}
                onChange={(e) => setBulkModal({ ...bulkModal, notes: e.target.value })}
                className="text-xs rounded-xl h-9"
              />
            </div>

            <div className="pt-2 flex items-center justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setBulkModal({ ...bulkModal, isOpen: false })}
                className="text-xs rounded-xl"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={isPending}
                className="text-xs rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {isPending ? "Recording..." : "Record Bulk Disbursement"}
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          MODAL 4: EDIT EMPLOYEE PAID/UNPAID & BANK DETAILS
          ══════════════════════════════════════════════════════════════════ */}
      {profileModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <form
            onSubmit={handleSaveProfile}
            className="bg-card border border-border/80 rounded-3xl w-full max-w-lg shadow-2xl p-6 space-y-4"
          >
            <div className="flex items-center justify-between border-b border-border/80 pb-3">
              <div>
                <h3 className="font-bold text-foreground text-sm">
                  Configure Compensation & Payout Status
                </h3>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Set whether {profileModal.profile?.employeeName} is Paid or Unpaid
                </p>
              </div>
              <button
                type="button"
                onClick={() => setProfileModal({ ...profileModal, isOpen: false, profile: null })}
                className="h-8 w-8 rounded-xl border border-border/80 flex items-center justify-center text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Paid vs Unpaid Toggle Box */}
            <div className="p-3.5 rounded-2xl bg-muted/40 border border-border/60 space-y-3">
              <label className="text-[11px] font-bold text-muted-foreground uppercase font-mono">
                Compensation Status *
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setProfileModal({ ...profileModal, isPaid: true })}
                  className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                    profileModal.isPaid
                      ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-900 dark:text-emerald-300 ring-1 ring-emerald-500/30"
                      : "bg-background border-border/60 text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <div className="flex items-center gap-2 font-bold text-xs">
                    <UserCheck className="h-4 w-4 text-emerald-600" />
                    Paid (Stipend/Salary)
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-1">
                    Can be enrolled into payroll cycles.
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setProfileModal({ ...profileModal, isPaid: false })}
                  className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                    !profileModal.isPaid
                      ? "bg-zinc-500/10 border-zinc-500/40 text-foreground ring-1 ring-zinc-500/30"
                      : "bg-background border-border/60 text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <div className="flex items-center gap-2 font-bold text-xs">
                    <UserX className="h-4 w-4 text-zinc-500" />
                    Unpaid (Non-stipendiary)
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-1">
                    Not enrolled; existing open records cannot be disbursed.
                  </div>
                </button>
              </div>
            </div>

            {/* Employment Nature (Intern vs Full-Time) */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-muted-foreground uppercase font-mono">
                Employment Category {profileModal.employmentType === null && `(${NOT_CONFIGURED})`}
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setProfileModal({ ...profileModal, employmentType: "INTERN" })}
                  className={`flex-1 py-2 px-3 rounded-xl border text-xs font-semibold cursor-pointer transition-all ${
                    profileModal.employmentType === "INTERN"
                      ? "bg-purple-500/15 border-purple-500/30 text-purple-700 dark:text-purple-300"
                      : "bg-background border-border/60 text-muted-foreground"
                  }`}
                >
                  Internship
                </button>
                <button
                  type="button"
                  onClick={() => setProfileModal({ ...profileModal, employmentType: "FULL_TIME" })}
                  className={`flex-1 py-2 px-3 rounded-xl border text-xs font-semibold cursor-pointer transition-all ${
                    profileModal.employmentType === "FULL_TIME"
                      ? "bg-blue-500/15 border-blue-500/30 text-blue-700 dark:text-blue-300"
                      : "bg-background border-border/60 text-muted-foreground"
                  }`}
                >
                  Full-Time Staff
                </button>
              </div>
            </div>

            {/* If Paid: Bank & Stipend Inputs */}
            {profileModal.isPaid ? (
              <div className="grid grid-cols-2 gap-3 pt-1">
                <div className="space-y-1.5 col-span-2">
                  <label
                    htmlFor="payout-amount"
                    className="text-[11px] font-bold text-muted-foreground uppercase font-mono"
                  >
                    Configured Amount (₹)
                  </label>
                  <Input
                    id="payout-amount"
                    type="number"
                    min="0"
                    step="any"
                    placeholder={NOT_CONFIGURED}
                    value={profileModal.stipendAmount}
                    onChange={(e) =>
                      setProfileModal({ ...profileModal, stipendAmount: e.target.value })
                    }
                    className="font-mono text-xs rounded-xl h-9"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-muted-foreground uppercase font-mono">
                    Bank Name
                  </label>
                  <Input
                    placeholder={NOT_CONFIGURED}
                    value={profileModal.bankName}
                    onChange={(e) =>
                      setProfileModal({ ...profileModal, bankName: e.target.value })
                    }
                    className="text-xs rounded-xl h-9"
                  />
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor="payout-account-number"
                    className="text-[11px] font-bold text-muted-foreground uppercase font-mono"
                  >
                    Account Number
                  </label>
                  <Input
                    id="payout-account-number"
                    autoComplete="off"
                    placeholder={
                      profileModal.profile?.accountNumberMasked
                        ? `Current ${profileModal.profile.accountNumberMasked}; leave blank to keep`
                        : NOT_CONFIGURED
                    }
                    value={profileModal.accountNumber}
                    onChange={(e) =>
                      setProfileModal({ ...profileModal, accountNumber: e.target.value })
                    }
                    className="font-mono text-xs rounded-xl h-9"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-muted-foreground uppercase font-mono">
                    IFSC Code
                  </label>
                  <Input
                    placeholder={NOT_CONFIGURED}
                    value={profileModal.ifscCode}
                    onChange={(e) =>
                      setProfileModal({ ...profileModal, ifscCode: e.target.value.toUpperCase() })
                    }
                    className="font-mono text-xs rounded-xl h-9 uppercase"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-muted-foreground uppercase font-mono">
                    Account Holder Name
                  </label>
                  <Input
                    placeholder="Name as per passbook"
                    value={profileModal.accountHolderName}
                    onChange={(e) =>
                      setProfileModal({ ...profileModal, accountHolderName: e.target.value })
                    }
                    className="text-xs rounded-xl h-9"
                  />
                </div>

                <div className="space-y-1.5 col-span-2">
                  <label
                    htmlFor="payout-pan"
                    className="text-[11px] font-bold text-muted-foreground uppercase font-mono"
                  >
                    PAN
                  </label>
                  <Input
                    id="payout-pan"
                    autoComplete="off"
                    placeholder={
                      profileModal.profile?.panMasked
                        ? `Current ${profileModal.profile.panMasked}; leave blank to keep`
                        : NOT_CONFIGURED
                    }
                    value={profileModal.panNumber}
                    onChange={(e) =>
                      setProfileModal({ ...profileModal, panNumber: e.target.value.toUpperCase() })
                    }
                    className="font-mono text-xs rounded-xl h-9 uppercase"
                  />
                </div>
              </div>
            ) : (
              <div className="p-3.5 rounded-xl bg-muted/60 text-xs text-muted-foreground space-y-1">
                <p className="font-semibold text-foreground">
                  Unpaid status active:
                </p>
                <p>
                  This member will not be enrolled into payroll cycles. Stored banking details are kept
                  unchanged; existing payroll records are kept for the audit trail.
                </p>
              </div>
            )}

            <div className="pt-2 flex items-center justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setProfileModal({ ...profileModal, isOpen: false, profile: null })}
                className="text-xs rounded-xl"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={isPending}
                className="text-xs rounded-xl"
              >
                {isPending ? "Saving..." : "Save Settings"}
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          MODAL 5: NEW PAYROLL CYCLE
          ══════════════════════════════════════════════════════════════════ */}
      {newPeriodModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <form
            onSubmit={handleCreatePeriod}
            className="bg-card border border-border/80 rounded-3xl w-full max-w-md shadow-2xl p-6 space-y-4"
          >
            <div className="flex items-center justify-between border-b border-border/80 pb-3">
              <div>
                <h3 className="font-bold text-foreground text-sm">
                  Create Operational Payroll Cycle
                </h3>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Set cycle code and start/end dates
                </p>
              </div>
              <button
                type="button"
                onClick={() => setNewPeriodModal({ ...newPeriodModal, isOpen: false })}
                className="h-8 w-8 rounded-xl border border-border/80 flex items-center justify-center text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-muted-foreground uppercase font-mono">
                Cycle Code (e.g. 2026-11) *
              </label>
              <Input
                required
                placeholder="2026-11"
                value={newPeriodModal.code}
                onChange={(e) => setNewPeriodModal({ ...newPeriodModal, code: e.target.value })}
                className="font-mono text-xs rounded-xl h-9"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-muted-foreground uppercase font-mono">
                  Start Date *
                </label>
                <Input
                  required
                  type="date"
                  value={newPeriodModal.startDate}
                  onChange={(e) => setNewPeriodModal({ ...newPeriodModal, startDate: e.target.value })}
                  className="text-xs rounded-xl h-9"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-muted-foreground uppercase font-mono">
                  End Date *
                </label>
                <Input
                  required
                  type="date"
                  value={newPeriodModal.endDate}
                  onChange={(e) => setNewPeriodModal({ ...newPeriodModal, endDate: e.target.value })}
                  className="text-xs rounded-xl h-9"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-muted-foreground uppercase font-mono">
                Notes (Optional)
              </label>
              <Input
                placeholder="e.g. November 2026 monthly cycle"
                value={newPeriodModal.notes}
                onChange={(e) => setNewPeriodModal({ ...newPeriodModal, notes: e.target.value })}
                className="text-xs rounded-xl h-9"
              />
            </div>

            <div className="pt-2 flex items-center justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setNewPeriodModal({ ...newPeriodModal, isOpen: false })}
                className="text-xs rounded-xl"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={isPending}
                className="text-xs rounded-xl"
              >
                {isPending ? "Creating..." : "Create Cycle"}
              </Button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
