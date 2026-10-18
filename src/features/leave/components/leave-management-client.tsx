"use client";

import React, { useState, useTransition, useMemo, useEffect } from "react";
import {
  LeaveRequestItem,
  LeaveTypeItem,
  LeaveStats,
  EmployeeOption,
  LeaveRequestStatus,
} from "../types";
import {
  reviewLeaveRequestAction,
  createLeaveRequestAction,
  createLeaveTypeAction,
  toggleLeaveTypeAction,
} from "../actions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Calendar,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  PlusCircle,
  Search,
  Filter,
  UserCheck,
  Building,
  FileText,
  ShieldCheck,
  X,
  Loader2,
  Check,
  ChevronRight,
  Info,
  CalendarRange,
  Users,
  Settings2,
  ExternalLink,
  Eye,
  PieChart,
  CalendarCheck,
  ArrowRight,
} from "lucide-react";

interface LeaveManagementClientProps {
  initialRequests: LeaveRequestItem[];
  leaveTypes: LeaveTypeItem[];
  stats: LeaveStats;
  employees: EmployeeOption[];
  currentUserId: string;
  portalRole: "ADMIN" | "SUBADMIN" | "HRMS";
}

export function LeaveManagementClient({
  initialRequests,
  leaveTypes: initialLeaveTypes,
  stats: initialStats,
  employees,
  currentUserId,
  portalRole,
}: LeaveManagementClientProps) {
  const [requests, setRequests] = useState<LeaveRequestItem[]>(initialRequests);
  const [leaveTypes, setLeaveTypes] = useState<LeaveTypeItem[]>(initialLeaveTypes);
  const [stats, setStats] = useState<LeaveStats>(initialStats);
  const [isPending, startTransition] = useTransition();

  // Active Tab: "requests" | "calendar" | "types" | "apply"
  const [activeTab, setActiveTab] = useState<"requests" | "calendar" | "types" | "apply">("requests");

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [typeFilter, setTypeFilter] = useState<string>("ALL");

  // Modal States
  const [reviewModal, setReviewModal] = useState<{
    isOpen: boolean;
    target: LeaveRequestItem | null;
    action: "APPROVED" | "REJECTED";
    notes: string;
  }>({
    isOpen: false,
    target: null,
    action: "APPROVED",
    notes: "",
  });

  const [detailsModal, setDetailsModal] = useState<{
    isOpen: boolean;
    target: LeaveRequestItem | null;
  }>({
    isOpen: false,
    target: null,
  });

  const [newTypeModal, setNewTypeModal] = useState<{
    isOpen: boolean;
    code: string;
    name: string;
    description: string;
    isPaid: boolean;
    requiresApproval: boolean;
  }>({
    isOpen: false,
    code: "",
    name: "",
    description: "",
    isPaid: true,
    requiresApproval: true,
  });

  // Apply Leave Form State
  const [applyForm, setApplyForm] = useState({
    employeeId: employees[0]?.id || "",
    leaveTypeId: leaveTypes[0]?.id || "",
    startDate: new Date().toISOString().split("T")[0],
    endDate: new Date().toISOString().split("T")[0],
    reason: "",
  });

  // Feedback Toast
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const showFeedback = (type: "success" | "error", message: string) => {
    setFeedback({ type, message });
    setTimeout(() => setFeedback(null), 5000);
  };

  // Listen to navbar action buttons
  useEffect(() => {
    const handleCategoryEvent = () => {
      setNewTypeModal({
        isOpen: true,
        code: "",
        name: "",
        description: "",
        isPaid: true,
        requiresApproval: true,
      });
    };
    const handleApplyEvent = () => {
      setActiveTab("apply");
    };

    window.addEventListener("open-leave-category-modal", handleCategoryEvent);
    window.addEventListener("open-apply-leave-tab", handleApplyEvent);
    window.addEventListener("request-leave", handleApplyEvent);

    return () => {
      window.removeEventListener("open-leave-category-modal", handleCategoryEvent);
      window.removeEventListener("open-apply-leave-tab", handleApplyEvent);
      window.removeEventListener("request-leave", handleApplyEvent);
    };
  }, []);

  // Filtered requests computation
  const filteredRequests = useMemo(() => {
    return requests.filter((r) => {
      // Status filter
      if (statusFilter !== "ALL" && r.status !== statusFilter) {
        return false;
      }
      // Leave type filter
      if (typeFilter !== "ALL" && r.leaveTypeId !== typeFilter) {
        return false;
      }
      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = r.employeeName.toLowerCase().includes(q);
        const matchesCode = r.employeeCode.toLowerCase().includes(q);
        const matchesDept = r.employeeDepartment.toLowerCase().includes(q);
        const matchesReason = r.reason.toLowerCase().includes(q);
        const matchesType = r.leaveTypeName.toLowerCase().includes(q);
        return matchesName || matchesCode || matchesDept || matchesReason || matchesType;
      }
      return true;
    });
  }, [requests, statusFilter, typeFilter, searchQuery]);

  // People currently on leave today
  const currentlyOnLeave = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return requests.filter((r) => {
      if (r.status !== "APPROVED") return false;
      const start = new Date(r.startDate);
      start.setHours(0, 0, 0, 0);
      const end = new Date(r.endDate);
      end.setHours(23, 59, 59, 999);
      return today >= start && today <= end;
    });
  }, [requests]);

  // Upcoming approved leaves (next 14 days)
  const upcomingLeaves = useMemo(() => {
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    const fourteenDaysLater = new Date();
    fourteenDaysLater.setDate(fourteenDaysLater.getDate() + 14);

    return requests.filter((r) => {
      if (r.status !== "APPROVED") return false;
      const start = new Date(r.startDate);
      return start > today && start <= fourteenDaysLater;
    });
  }, [requests]);

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  const handleReviewSubmit = () => {
    if (!reviewModal.target) return;
    const { target, action, notes } = reviewModal;

    startTransition(async () => {
      const res = await reviewLeaveRequestAction({
        requestId: target.id,
        status: action,
        reviewNotes: notes,
      });

      if (!res.success) {
        showFeedback("error", res.error || "Failed to update leave request.");
        return;
      }

      // Optimistic update
      setRequests((prev) =>
        prev.map((r) =>
          r.id === target.id
            ? {
                ...r,
                status: action,
                reviewNotes: notes.trim() || null,
                reviewedAt: new Date().toISOString(),
              }
            : r
        )
      );

      // Update stats
      setStats((prev) => ({
        ...prev,
        pendingCount: Math.max(0, prev.pendingCount - 1),
        approvedCount: action === "APPROVED" ? prev.approvedCount + 1 : prev.approvedCount,
        rejectedCount: action === "REJECTED" ? prev.rejectedCount + 1 : prev.rejectedCount,
      }));

      setReviewModal({ isOpen: false, target: null, action: "APPROVED", notes: "" });
      showFeedback(
        "success",
        `Leave request for ${target.employeeName} has been ${action.toLowerCase()}.`
      );
    });
  };

  const handleApplyLeaveSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!applyForm.employeeId || !applyForm.leaveTypeId || !applyForm.reason.trim()) {
      showFeedback("error", "Please fill in all required fields.");
      return;
    }

    startTransition(async () => {
      const res = await createLeaveRequestAction({
        employeeId: applyForm.employeeId,
        leaveTypeId: applyForm.leaveTypeId,
        startDate: new Date(applyForm.startDate).toISOString(),
        endDate: new Date(applyForm.endDate).toISOString(),
        reason: applyForm.reason,
      });

      if (!res.success) {
        showFeedback("error", res.error || "Failed to submit leave request.");
        return;
      }

      const created = res.data as LeaveRequestItem;
      if (created) {
        setRequests((prev) => [created, ...prev]);
        setStats((prev) => ({
          ...prev,
          totalRequests: prev.totalRequests + 1,
          pendingCount: prev.pendingCount + 1,
        }));
      }

      setApplyForm({
        employeeId: employees[0]?.id || "",
        leaveTypeId: leaveTypes[0]?.id || "",
        startDate: new Date().toISOString().split("T")[0],
        endDate: new Date().toISOString().split("T")[0],
        reason: "",
      });

      setActiveTab("requests");
      showFeedback("success", "Leave request submitted successfully for approval.");
    });
  };

  const handleCreateTypeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTypeModal.code.trim() || !newTypeModal.name.trim()) {
      showFeedback("error", "Code and Name are required.");
      return;
    }

    startTransition(async () => {
      const res = await createLeaveTypeAction({
        code: newTypeModal.code.trim().toUpperCase(),
        name: newTypeModal.name.trim(),
        description: newTypeModal.description.trim() || null,
        isPaid: newTypeModal.isPaid,
        requiresApproval: newTypeModal.requiresApproval,
      });

      if (!res.success) {
        showFeedback("error", res.error || "Failed to create leave type.");
        return;
      }

      const created = res.data as LeaveTypeItem;
      if (created) {
        setLeaveTypes((prev) => [...prev, created]);
      }

      setNewTypeModal({
        isOpen: false,
        code: "",
        name: "",
        description: "",
        isPaid: true,
        requiresApproval: true,
      });

      showFeedback("success", `Leave category "${newTypeModal.name}" added successfully.`);
    });
  };

  const handleToggleType = (typeId: string, currentActive: boolean) => {
    startTransition(async () => {
      const res = await toggleLeaveTypeAction({
        id: typeId,
        isActive: !currentActive,
      });

      if (!res.success) {
        showFeedback("error", res.error || "Failed to toggle status.");
        return;
      }

      setLeaveTypes((prev) =>
        prev.map((t) => (t.id === typeId ? { ...t, isActive: !currentActive } : t))
      );

      showFeedback("success", `Leave type status updated.`);
    });
  };

  const formatDisplayDate = (isoStr: string) => {
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

  const getStatusBadge = (status: LeaveRequestStatus) => {
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
  };

  const getLeaveTypeBadge = (code: string, name: string, isPaid: boolean) => {
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
  };

  // Computed leave stats for the employee currently viewed in detailsModal
  const selectedEmployeeLeaveSummary = useMemo(() => {
    if (!detailsModal.target) return null;
    const empId = detailsModal.target.employeeId;
    const empRequests = requests.filter((r) => r.employeeId === empId);

    const approvedRequests = empRequests.filter((r) => r.status === "APPROVED");
    const totalApprovedDays = approvedRequests.reduce((sum, r) => sum + r.durationDays, 0);

    const pendingRequests = empRequests.filter((r) => r.status === "PENDING");
    const totalPendingDays = pendingRequests.reduce((sum, r) => sum + r.durationDays, 0);

    // Standard baseline policy quotas (annual)
    const quotas: Record<string, { label: string; quota: number }> = {
      CASUAL: { label: "Casual Leave (CL)", quota: 12 },
      SICK: { label: "Medical & Sick (SL)", quota: 10 },
      EARNED: { label: "Privilege / Earned (PL)", quota: 15 },
      PARENTAL: { label: "Parental Leave", quota: 30 },
      BEREAVEMENT: { label: "Bereavement Leave", quota: 5 },
      UNPAID: { label: "Leave Without Pay (LWP)", quota: 0 },
    };

    const usageByType: Record<string, { name: string; code: string; taken: number; quota: number; remaining: number }> = {};
    for (const [code, info] of Object.entries(quotas)) {
      usageByType[code] = {
        name: info.label,
        code,
        taken: 0,
        quota: info.quota,
        remaining: info.quota,
      };
    }

    leaveTypes.forEach((lt) => {
      const code = lt.code.toUpperCase();
      if (!usageByType[code]) {
        usageByType[code] = {
          name: lt.name,
          code,
          taken: 0,
          quota: lt.isPaid ? 12 : 0,
          remaining: lt.isPaid ? 12 : 0,
        };
      }
    });

    approvedRequests.forEach((req) => {
      const code = req.leaveTypeCode?.toUpperCase() || "CASUAL";
      if (!usageByType[code]) {
        usageByType[code] = {
          name: req.leaveTypeName,
          code,
          taken: 0,
          quota: 12,
          remaining: 12,
        };
      }
      usageByType[code].taken += req.durationDays;
      usageByType[code].remaining = Math.max(0, usageByType[code].quota - usageByType[code].taken);
    });

    const otherRequests = empRequests.filter((r) => r.id !== detailsModal.target?.id);

    return {
      totalApprovedDays,
      totalPendingDays,
      usageByType,
      allRequestsCount: empRequests.length,
      otherRequests,
    };
  }, [detailsModal.target, requests, leaveTypes]);

  return (
    <div className="space-y-6">
      {/* ─── Top Notification / Feedback Banner ─── */}
      {feedback && (
        <div
          className={`p-4 rounded-2xl flex items-center justify-between border shadow-sm transition-all duration-300 ${
            feedback.type === "success"
              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-400"
              : "bg-rose-500/10 border-rose-500/30 text-rose-700 dark:text-rose-400"
          }`}
        >
          <div className="flex items-center gap-2.5">
            {feedback.type === "success" ? (
              <CheckCircle2 className="h-5 w-5 shrink-0" />
            ) : (
              <AlertCircle className="h-5 w-5 shrink-0" />
            )}
            <span className="text-sm font-medium">{feedback.message}</span>
          </div>
          <button
            onClick={() => setFeedback(null)}
            className="p-1 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* ─── Metric Cards Grid ─── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5 sm:gap-4">
        {/* 1. Pending Requests */}
        <div className="bg-card border border-border/80 border-l-4 border-l-amber-500 rounded-2xl p-4 sm:p-5 shadow-2xs hover:shadow-xs hover:border-amber-500/40 transition-all flex flex-col justify-between">
          <div className="flex items-center justify-between gap-2 mb-2">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider font-mono">
              Pending Requests
            </span>
            <div className="h-8 w-8 rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
              <Clock className="h-4 w-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold font-mono text-foreground tracking-tight">
            {stats.pendingCount}
          </div>
          <div className="mt-2 flex items-center gap-1.5 text-[11px]">
            {stats.pendingCount > 0 ? (
              <span className="inline-flex items-center gap-1 font-semibold text-amber-700 dark:text-amber-400 bg-amber-500/15 px-2 py-0.5 rounded-md">
                <AlertCircle className="h-3 w-3" /> Action required
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400 bg-emerald-500/15 px-2 py-0.5 rounded-md font-medium">
                <CheckCircle2 className="h-3 w-3" /> Inbox cleared
              </span>
            )}
          </div>
        </div>

        {/* 2. Away Today */}
        <div className="bg-card border border-border/80 border-l-4 border-l-blue-500 rounded-2xl p-4 sm:p-5 shadow-2xs hover:shadow-xs hover:border-blue-500/40 transition-all flex flex-col justify-between">
          <div className="flex items-center justify-between gap-2 mb-2">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider font-mono">
              Away Today
            </span>
            <div className="h-8 w-8 rounded-xl bg-blue-500/15 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
              <CalendarRange className="h-4 w-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold font-mono text-foreground tracking-tight">
            {currentlyOnLeave.length}
          </div>
          <div className="mt-2 text-[11px] text-muted-foreground">
            Active out-of-office today
          </div>
        </div>

        {/* 3. Approved Leaves */}
        <div className="bg-card border border-border/80 border-l-4 border-l-emerald-500 rounded-2xl p-4 sm:p-5 shadow-2xs hover:shadow-xs hover:border-emerald-500/40 transition-all flex flex-col justify-between">
          <div className="flex items-center justify-between gap-2 mb-2">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider font-mono">
              Approved
            </span>
            <div className="h-8 w-8 rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
              <CheckCircle2 className="h-4 w-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold font-mono text-foreground tracking-tight">
            {stats.approvedCount}
          </div>
          <div className="mt-2 text-[11px] text-muted-foreground">
            Authorized time-off records
          </div>
        </div>

        {/* 4. Rejected / Declined */}
        <div className="bg-card border border-border/80 border-l-4 border-l-rose-500 rounded-2xl p-4 sm:p-5 shadow-2xs hover:shadow-xs hover:border-rose-500/40 transition-all flex flex-col justify-between">
          <div className="flex items-center justify-between gap-2 mb-2">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider font-mono">
              Rejected
            </span>
            <div className="h-8 w-8 rounded-xl bg-rose-500/15 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
              <XCircle className="h-4 w-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold font-mono text-foreground tracking-tight">
            {stats.rejectedCount}
          </div>
          <div className="mt-2 text-[11px] text-muted-foreground">
            Denied with review notes
          </div>
        </div>

        {/* 5. Policy Categories */}
        <div className="col-span-2 sm:col-span-1 bg-card border border-border/80 border-l-4 border-l-purple-500 rounded-2xl p-4 sm:p-5 shadow-2xs hover:shadow-xs hover:border-purple-500/40 transition-all flex flex-col justify-between">
          <div className="flex items-center justify-between gap-2 mb-2">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider font-mono">
              Policy Types
            </span>
            <div className="h-8 w-8 rounded-xl bg-purple-500/15 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0">
              <FileText className="h-4 w-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold font-mono text-foreground tracking-tight">
            {leaveTypes.filter((t) => t.isActive).length}
          </div>
          <div className="mt-2 text-[11px] text-muted-foreground">
            Active leave categories
          </div>
        </div>
      </div>

      {/* ─── Navigation Tabs ─── */}
      <div className="flex items-center gap-1.5 p-1 rounded-2xl bg-muted/60 border border-border/60 max-w-fit">
        <button
          onClick={() => setActiveTab("requests")}
          className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
            activeTab === "requests"
              ? "bg-background text-foreground shadow-xs border border-border/60"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <FileText className="h-3.5 w-3.5" />
          Leave Applications
          <span
            className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
              stats.pendingCount > 0
                ? "bg-amber-500/20 text-amber-700 dark:text-amber-400"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {requests.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab("calendar")}
          className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
            activeTab === "calendar"
              ? "bg-background text-foreground shadow-xs border border-border/60"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <CalendarRange className="h-3.5 w-3.5" />
          Out-of-Office & Calendar
          {currentlyOnLeave.length > 0 && (
            <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-blue-500/20 text-blue-700 dark:text-blue-400">
              {currentlyOnLeave.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab("types")}
          className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
            activeTab === "types"
              ? "bg-background text-foreground shadow-xs border border-border/60"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Settings2 className="h-3.5 w-3.5" />
          Policy Categories ({leaveTypes.length})
        </button>

        <button
          onClick={() => setActiveTab("apply")}
          className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
            activeTab === "apply"
              ? "bg-background text-foreground shadow-xs border border-border/60"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <PlusCircle className="h-3.5 w-3.5" />
          Apply / Grant Leave
        </button>
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          TAB 1: LEAVE APPLICATIONS LIST & FILTERS
          ══════════════════════════════════════════════════════════════════ */}
      {activeTab === "requests" && (
        <div className="space-y-4">
          {/* Search & Filter Bar */}
          <div className="p-4 rounded-2xl border border-border/80 bg-card/70 flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between shadow-2xs">
            {/* Search Input */}
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by employee, code, reason or department..."
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

            {/* Filter Pills / Dropdowns */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Status Selector */}
              <div className="flex items-center gap-1 p-1 rounded-xl bg-muted/60 border border-border/60 text-xs">
                {(["ALL", "PENDING", "APPROVED", "REJECTED"] as const).map((st) => (
                  <button
                    key={st}
                    onClick={() => setStatusFilter(st)}
                    className={`px-2.5 py-1 rounded-lg font-medium transition-all cursor-pointer ${
                      statusFilter === st
                        ? "bg-background text-foreground shadow-2xs font-semibold"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {st === "ALL" ? "All" : st.charAt(0) + st.slice(1).toLowerCase()}
                    {st === "PENDING" && stats.pendingCount > 0 && (
                      <span className="ml-1 px-1 rounded-full text-[9px] bg-amber-500 text-white font-bold">
                        {stats.pendingCount}
                      </span>
                    )}
                  </button>
                ))}
              </div>

              {/* Leave Type Dropdown */}
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                aria-label="Filter by leave category"
                className="h-9 px-3 rounded-xl border border-border/80 bg-background text-xs font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer"
              >
                <option value="ALL">All Categories</option>
                {leaveTypes.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>

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

          {/* Leave Requests Table */}
          <Card className="rounded-2xl border border-border/80 bg-card overflow-hidden shadow-2xs">
            <div className="w-full">
              <table className="w-full text-left text-xs border-collapse table-fixed">
                <thead>
                  <tr className="border-b border-border/80 bg-muted/40 text-muted-foreground text-[11px] uppercase tracking-wider font-mono font-bold">
                    <th className="py-3 px-4 w-[28%]">Employee</th>
                    <th className="py-3 px-4 w-[20%]">Leave Category</th>
                    <th className="py-3 px-4 w-[24%]">Duration & Dates</th>
                    <th className="py-3 px-4 w-[14%] text-center">Status</th>
                    <th className="py-3 px-4 w-[14%] text-right pr-4">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {filteredRequests.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-12 text-center text-muted-foreground">
                        <div className="flex flex-col items-center justify-center gap-2">
                          <FileText className="h-8 w-8 text-muted-foreground/60 mb-1" />
                          <p className="text-sm font-semibold text-foreground">
                            No leave applications found
                          </p>
                          <p className="text-xs text-muted-foreground max-w-sm">
                            {searchQuery || statusFilter !== "ALL" || typeFilter !== "ALL"
                              ? "Try adjusting your search terms or filters to view records."
                              : "No employee leave requests have been submitted yet."}
                          </p>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setActiveTab("apply")}
                            className="mt-2 text-xs rounded-xl"
                          >
                            <PlusCircle className="h-3.5 w-3.5 mr-1" /> Grant Leave
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filteredRequests.map((req) => (
                      <tr
                        key={req.id}
                        className="hover:bg-muted/30 transition-colors group"
                      >
                        {/* 1. Employee Details */}
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="h-9 w-9 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold text-xs shrink-0 border border-blue-500/20 shadow-2xs">
                              {req.employeeName.charAt(0).toUpperCase()}
                            </div>
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
                                <span className="truncate">{req.employeeDepartment}</span>
                                {req.employeeDesignation && req.employeeDesignation !== req.employeeDepartment && (
                                  <>
                                    <span className="opacity-40">•</span>
                                    <span className="truncate text-muted-foreground/80">{req.employeeDesignation}</span>
                                  </>
                                )}
                              </div>
                              {req.employeeEmail && (
                                <div className="text-[10px] text-muted-foreground/70 truncate mt-0.5 font-mono">
                                  {req.employeeEmail}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* 2. Leave Category */}
                        <td className="py-3.5 px-4">
                          <div className="space-y-1">
                            <div>{getLeaveTypeBadge(req.leaveTypeCode, req.leaveTypeName, req.isPaid)}</div>
                            <div className="text-[10px] text-muted-foreground/80 flex items-center gap-1.5 pl-0.5 font-medium">
                              <span className={req.isPaid ? "text-emerald-600 dark:text-emerald-400 font-semibold" : "text-amber-600 dark:text-amber-400 font-semibold"}>
                                {req.isPaid ? "Paid Leave" : "Unpaid Leave"}
                              </span>
                              <span>•</span>
                              <span>Standard Quota</span>
                            </div>
                          </div>
                        </td>

                        {/* 3. Duration & Dates */}
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-1.5 font-medium text-foreground text-xs">
                            <Calendar className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            <span className="truncate">
                              {formatDisplayDate(req.startDate)} – {formatDisplayDate(req.endDate)}
                            </span>
                          </div>
                          <div className="text-[11px] text-muted-foreground mt-1 flex items-center gap-2">
                            <span className="font-bold text-foreground font-mono bg-muted/80 border border-border/60 px-1.5 py-0.2 rounded text-[10px]">
                              {req.durationDays} {req.durationDays === 1 ? "day" : "days"}
                            </span>
                            {req.createdAt && (
                              <span className="text-[10px] text-muted-foreground/75 truncate">
                                Applied {formatDisplayDate(req.createdAt)}
                              </span>
                            )}
                          </div>
                        </td>

                        {/* 4. Status */}
                        <td className="py-3.5 px-4 text-center whitespace-nowrap">
                          <div className="inline-flex justify-center">
                            {getStatusBadge(req.status)}
                          </div>
                        </td>

                        {/* 5. Actions (Clean Icon Buttons Only) */}
                        <td className="py-3.5 px-4 text-right pr-4 whitespace-nowrap">
                          <div className="flex items-center justify-end gap-2">
                            {/* Eye Details Button */}
                            <button
                              type="button"
                              onClick={() => setDetailsModal({ isOpen: true, target: req })}
                              className="h-8 w-8 rounded-lg border border-border/80 bg-background hover:bg-muted text-muted-foreground hover:text-primary transition-all flex items-center justify-center shadow-2xs cursor-pointer group/eye"
                              title="View Full Details, Reason & Leave Balances"
                            >
                              <Eye className="h-4 w-4 group-hover/eye:scale-110 transition-transform" />
                            </button>

                            {/* Approve Icon Button (Only for PENDING) */}
                            {req.status === "PENDING" && (
                              <button
                                type="button"
                                onClick={() =>
                                  setReviewModal({
                                    isOpen: true,
                                    target: req,
                                    action: "APPROVED",
                                    notes: "",
                                  })
                                }
                                className="h-8 w-8 rounded-lg bg-emerald-50 hover:bg-emerald-600 text-emerald-600 hover:text-white dark:bg-emerald-950/50 dark:hover:bg-emerald-600 dark:text-emerald-400 dark:hover:text-white border border-emerald-500/30 hover:border-emerald-600 transition-all flex items-center justify-center shadow-2xs cursor-pointer"
                                title="Approve Leave Application"
                              >
                                <Check className="h-4 w-4 stroke-[2.5]" />
                              </button>
                            )}

                            {/* Reject Icon Button (Only for PENDING) */}
                            {req.status === "PENDING" && (
                              <button
                                type="button"
                                onClick={() =>
                                  setReviewModal({
                                    isOpen: true,
                                    target: req,
                                    action: "REJECTED",
                                    notes: "",
                                  })
                                }
                                className="h-8 w-8 rounded-lg bg-rose-50 hover:bg-rose-600 text-rose-600 hover:text-white dark:bg-rose-950/50 dark:hover:bg-rose-600 dark:text-rose-400 dark:hover:text-white border border-rose-500/30 hover:border-rose-600 transition-all flex items-center justify-center shadow-2xs cursor-pointer"
                                title="Reject Leave Application"
                              >
                                <X className="h-4 w-4 stroke-[2.5]" />
                              </button>
                            )}
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
          TAB 2: OUT-OF-OFFICE TODAY & CALENDAR OVERVIEW
          ══════════════════════════════════════════════════════════════════ */}
      {activeTab === "calendar" && (
        <div className="space-y-6">
          {/* Active Today Banner */}
          <Card className="rounded-2xl border-border/80 bg-card overflow-hidden">
            <CardHeader className="pb-3 border-b border-border/60 bg-muted/20">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
                  <Users className="h-4 w-4 text-primary" /> Employees Currently On Leave Today
                </CardTitle>
                <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20">
                  {currentlyOnLeave.length} Active Absences
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-5">
              {currentlyOnLeave.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <CheckCircle2 className="h-8 w-8 text-emerald-500 mx-auto mb-2" />
                  <p className="font-semibold text-foreground text-sm">Full Team Attendance Today</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    No approved leaves are active for the current working day.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {currentlyOnLeave.map((r) => (
                    <div
                      key={r.id}
                      className="p-4 rounded-xl border border-border/70 bg-background/80 hover:border-primary/40 transition-all space-y-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="font-semibold text-foreground text-sm">
                            {r.employeeName}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {r.employeeCode} • {r.employeeDepartment}
                          </div>
                        </div>
                        {getLeaveTypeBadge(r.leaveTypeCode, r.leaveTypeName, r.isPaid)}
                      </div>

                      <div className="p-2.5 rounded-lg bg-muted/40 text-xs space-y-1">
                        <div className="text-muted-foreground flex items-center justify-between">
                          <span>Leave Window:</span>
                          <span className="font-medium text-foreground">
                            {formatDisplayDate(r.startDate)} – {formatDisplayDate(r.endDate)}
                          </span>
                        </div>
                        <div className="text-muted-foreground flex items-center justify-between">
                          <span>Expected Return:</span>
                          <span className="font-bold text-emerald-600 dark:text-emerald-400">
                            {new Date(
                              new Date(r.endDate).getTime() + 24 * 60 * 60 * 1000
                            ).toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                            })}
                          </span>
                        </div>
                      </div>

                      <p className="text-xs text-muted-foreground italic truncate">
                        &ldquo;{r.reason}&rdquo;
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Upcoming Leaves in Next 14 Days */}
          <Card className="rounded-2xl border-border/80 bg-card overflow-hidden">
            <CardHeader className="pb-3 border-b border-border/60 bg-muted/20">
              <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
                <Calendar className="h-4 w-4 text-primary" /> Upcoming Scheduled Leaves (Next 14 Days)
              </CardTitle>
            </CardHeader>
            <CardContent className="p-5">
              {upcomingLeaves.length === 0 ? (
                <div className="text-center py-6 text-muted-foreground text-xs">
                  No upcoming approved leaves scheduled within the next 2 weeks.
                </div>
              ) : (
                <div className="divide-y divide-border/60">
                  {upcomingLeaves.map((r) => (
                    <div
                      key={r.id}
                      className="py-3 flex items-center justify-between gap-4 text-xs"
                    >
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold">
                          {r.employeeName.charAt(0)}
                        </div>
                        <div>
                          <div className="font-semibold text-foreground">{r.employeeName}</div>
                          <div className="text-muted-foreground text-[11px]">
                            {r.employeeCode} • {r.employeeDepartment}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-4">
                        {getLeaveTypeBadge(r.leaveTypeCode, r.leaveTypeName, r.isPaid)}
                        <div className="text-right">
                          <div className="font-medium text-foreground">
                            {formatDisplayDate(r.startDate)} – {formatDisplayDate(r.endDate)}
                          </div>
                          <div className="text-[11px] text-muted-foreground">
                            {r.durationDays} {r.durationDays === 1 ? "day" : "days"}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          TAB 3: POLICY & LEAVE CATEGORIES DIRECTORY
          ══════════════════════════════════════════════════════════════════ */}
      {activeTab === "types" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-foreground">
                Configured Leave Categories
              </h2>
              <p className="text-xs text-muted-foreground">
                Manage leave quotas, paid status, and approval prerequisites for each category.
              </p>
            </div>
            <Button
              size="sm"
              onClick={() => setNewTypeModal({ isOpen: true, code: "", name: "", description: "", isPaid: true, requiresApproval: true })}
              className="gap-1.5 rounded-xl text-xs"
            >
              <PlusCircle className="h-3.5 w-3.5" /> Add Category
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {leaveTypes.map((t) => (
              <Card
                key={t.id}
                className={`rounded-2xl border transition-all ${
                  t.isActive
                    ? "border-border/80 bg-card hover:border-primary/40 shadow-2xs"
                    : "border-border/40 bg-muted/30 opacity-70"
                }`}
              >
                <CardContent className="p-5 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="font-mono text-xs font-bold text-primary px-2 py-0.5 rounded-md bg-primary/10">
                        {t.code}
                      </span>
                      <h3 className="font-semibold text-foreground text-sm mt-1.5">
                        {t.name}
                      </h3>
                    </div>
                    <Badge variant={t.isActive ? "default" : "outline"} className="text-[10px]">
                      {t.isActive ? "Active" : "Disabled"}
                    </Badge>
                  </div>

                  <p className="text-xs text-muted-foreground line-clamp-2 min-h-[32px]">
                    {t.description || "No description provided for this policy type."}
                  </p>

                  <div className="pt-3 border-t border-border/60 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          t.isPaid
                            ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                            : "bg-amber-500/15 text-amber-700 dark:text-amber-400"
                        }`}
                      >
                        {t.isPaid ? "Paid Leave" : "Unpaid (LWP)"}
                      </span>

                      {t.requiresApproval && (
                        <span className="text-muted-foreground text-[10px]">
                          Approval required
                        </span>
                      )}
                    </div>

                    <button
                      onClick={() => handleToggleType(t.id, t.isActive)}
                      className={`text-[11px] font-medium hover:underline cursor-pointer ${
                        t.isActive ? "text-rose-600 dark:text-rose-400" : "text-primary"
                      }`}
                    >
                      {t.isActive ? "Deactivate" : "Activate"}
                    </button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          TAB 4: APPLY LEAVE ON BEHALF OF AN EMPLOYEE
          ══════════════════════════════════════════════════════════════════ */}
      {activeTab === "apply" && (
        <Card className="rounded-2xl border-border/80 bg-card w-full shadow-xs">
          <CardHeader className="pb-4 border-b border-border/60 bg-muted/20 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
                <PlusCircle className="h-4 w-4 text-primary" /> Apply / Grant Employee Leave
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                Submit a formal leave request on behalf of an active staff member or intern.
              </p>
            </div>
            <span className="text-[11px] font-mono font-medium px-2.5 py-1 rounded-full bg-primary/10 text-primary border border-primary/20 w-fit">
              {employees.length} Active {employees.length === 1 ? "Employee" : "Employees"} Available
            </span>
          </CardHeader>
          <CardContent className="p-6">
            <form onSubmit={handleApplyLeaveSubmit} className="space-y-5">
              {/* Row 1: Employee and Category Selection */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Employee Selection */}
                <div>
                  <label className="block text-xs font-semibold text-foreground mb-1.5">
                    Select Employee <span className="text-destructive">*</span>
                  </label>
                  {employees.length === 0 ? (
                    <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-700 dark:text-amber-400">
                      No active employees found in the system. Please ensure employee profiles exist.
                    </div>
                  ) : (
                    <select
                      value={applyForm.employeeId}
                      onChange={(e) => setApplyForm({ ...applyForm, employeeId: e.target.value })}
                      className="w-full h-10 px-3 rounded-xl border border-border/80 bg-background text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer"
                      required
                    >
                      {employees.map((emp) => (
                        <option key={emp.id} value={emp.id}>
                          {emp.name} ({emp.employeeCode}) — {emp.department} • {emp.designation}
                        </option>
                      ))}
                    </select>
                  )}
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Select the staff member or intern requesting time-off.
                  </p>
                </div>

                {/* Leave Category */}
                <div>
                  <label className="block text-xs font-semibold text-foreground mb-1.5">
                    Leave Category <span className="text-destructive">*</span>
                  </label>
                  <select
                    value={applyForm.leaveTypeId}
                    onChange={(e) => setApplyForm({ ...applyForm, leaveTypeId: e.target.value })}
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
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Select policy type for appropriate attendance & payroll handling.
                  </p>
                </div>
              </div>

              {/* Row 2: Date Range & Live Duration Preview */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                <div>
                  <label className="block text-xs font-semibold text-foreground mb-1.5">
                    Start Date <span className="text-destructive">*</span>
                  </label>
                  <Input
                    type="date"
                    value={applyForm.startDate}
                    onChange={(e) => setApplyForm({ ...applyForm, startDate: e.target.value })}
                    className="h-10 text-xs rounded-xl"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-foreground mb-1.5">
                    End Date <span className="text-destructive">*</span>
                  </label>
                  <Input
                    type="date"
                    value={applyForm.endDate}
                    onChange={(e) => setApplyForm({ ...applyForm, endDate: e.target.value })}
                    className="h-10 text-xs rounded-xl"
                    required
                  />
                </div>
                <div className="h-10 px-3.5 rounded-xl border border-border/70 bg-muted/30 flex items-center justify-between text-xs">
                  <span className="text-muted-foreground font-medium">Estimated Duration:</span>
                  <span className="font-bold text-foreground font-mono">
                    {(() => {
                      const s = new Date(applyForm.startDate).getTime();
                      const e = new Date(applyForm.endDate).getTime();
                      if (isNaN(s) || isNaN(e) || e < s) return "1 day";
                      const diff = Math.max(1, Math.round((e - s) / (1000 * 60 * 60 * 24)) + 1);
                      return `${diff} ${diff === 1 ? "day" : "days"}`;
                    })()}
                  </span>
                </div>
              </div>

              {/* Row 3: Reason for Absence */}
              <div>
                <label className="block text-xs font-semibold text-foreground mb-1.5">
                  Reason for Absence <span className="text-destructive">*</span>
                </label>
                <textarea
                  rows={4}
                  value={applyForm.reason}
                  onChange={(e) => setApplyForm({ ...applyForm, reason: e.target.value })}
                  placeholder="Provide clear reason or details for this absence (minimum 5 characters)..."
                  className="w-full p-3.5 rounded-xl border border-border/80 bg-background text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary placeholder:text-muted-foreground resize-y min-h-[90px]"
                  required
                />
              </div>

              {/* Form Action Buttons */}
              <div className="pt-2 border-t border-border/60 flex items-center justify-end gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setActiveTab("requests")}
                  className="rounded-xl text-xs h-9 px-4"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={isPending || employees.length === 0}
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
      )}

      {/* ══════════════════════════════════════════════════════════════════
          MODAL: APPROVE / REJECT CONFIRMATION
          ══════════════════════════════════════════════════════════════════ */}
      {reviewModal.isOpen && reviewModal.target && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-card border border-border/80 rounded-2xl w-full max-w-md shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-5 border-b border-border/60 flex items-center justify-between">
              <div className="flex items-center gap-2">
                {reviewModal.action === "APPROVED" ? (
                  <div className="h-8 w-8 rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                    <CheckCircle2 className="h-4 w-4" />
                  </div>
                ) : (
                  <div className="h-8 w-8 rounded-xl bg-rose-500/15 text-rose-600 dark:text-rose-400 flex items-center justify-center">
                    <XCircle className="h-4 w-4" />
                  </div>
                )}
                <div>
                  <h3 className="font-semibold text-foreground text-sm">
                    {reviewModal.action === "APPROVED" ? "Approve Leave Request" : "Reject Leave Request"}
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    For {reviewModal.target.employeeName} ({reviewModal.target.employeeCode})
                  </p>
                </div>
              </div>
              <button
                onClick={() => setReviewModal({ isOpen: false, target: null, action: "APPROVED", notes: "" })}
                className="p-1 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              {/* Summary box */}
              <div className="p-3 rounded-xl bg-muted/40 border border-border/60 space-y-1.5">
                <div className="flex justify-between text-muted-foreground">
                  <span>Category:</span>
                  <span className="font-semibold text-foreground">
                    {reviewModal.target.leaveTypeName}
                  </span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Dates:</span>
                  <span className="font-medium text-foreground">
                    {formatDisplayDate(reviewModal.target.startDate)} – {formatDisplayDate(reviewModal.target.endDate)}
                  </span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Duration:</span>
                  <span className="font-bold text-foreground">
                    {reviewModal.target.durationDays} days
                  </span>
                </div>
                <div className="pt-1.5 border-t border-border/40 text-muted-foreground">
                  <span>Reason:</span>
                  <p className="text-foreground italic mt-0.5">&ldquo;{reviewModal.target.reason}&rdquo;</p>
                </div>
              </div>

              {/* Review notes textarea */}
              <div>
                <label className="block font-semibold text-foreground mb-1">
                  {reviewModal.action === "APPROVED" ? "Approval Notes (Optional):" : "Rejection Reason / Notes (Recommended):"}
                </label>
                <textarea
                  rows={3}
                  value={reviewModal.notes}
                  onChange={(e) => setReviewModal({ ...reviewModal, notes: e.target.value })}
                  placeholder={
                    reviewModal.action === "APPROVED"
                      ? "e.g. Approved. Team coverage confirmed with department manager."
                      : "e.g. Peak release window; please reschedule or consult manager."
                  }
                  className="w-full p-2.5 rounded-xl border border-border/80 bg-background text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary placeholder:text-muted-foreground"
                />
              </div>

              {reviewModal.action === "APPROVED" && (
                <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-300 text-[11px] flex items-start gap-2">
                  <Info className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>
                    Approving this leave will automatically mark the employee as <strong>ON LEAVE</strong> in the Attendance Module for the specified date window.
                  </span>
                </div>
              )}
            </div>

            <div className="p-4 bg-muted/20 border-t border-border/60 flex items-center justify-end gap-2.5">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setReviewModal({ isOpen: false, target: null, action: "APPROVED", notes: "" })}
                className="rounded-xl text-xs h-8"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                variant={reviewModal.action === "APPROVED" ? "primary" : "destructive"}
                onClick={handleReviewSubmit}
                disabled={isPending}
                className="rounded-xl text-xs h-8 shadow-xs"
              >
                {isPending ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Processing...
                  </>
                ) : reviewModal.action === "APPROVED" ? (
                  "Confirm Approval"
                ) : (
                  "Confirm Rejection"
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          MODAL: FULL LEAVE DETAILS & EMPLOYEE LEAVE BALANCES
          ══════════════════════════════════════════════════════════════════ */}
      {detailsModal.isOpen && detailsModal.target && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-card border border-border/80 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="p-4 sm:p-5 border-b border-border/60 flex items-center justify-between bg-muted/20 shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <div className="h-10 w-10 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold text-sm shrink-0 border border-blue-500/20 shadow-2xs">
                  {detailsModal.target.employeeName.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-bold text-foreground text-sm sm:text-base truncate">
                      {detailsModal.target.employeeName}
                    </h3>
                    <span className="font-mono text-[11px] font-semibold text-primary px-2 py-0.5 rounded-md bg-primary/10 border border-primary/20">
                      {detailsModal.target.employeeCode}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">
                    {detailsModal.target.employeeDepartment} • {detailsModal.target.employeeDesignation}
                    {detailsModal.target.employeeEmail && ` • ${detailsModal.target.employeeEmail}`}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDetailsModal({ isOpen: false, target: null })}
                className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors shrink-0 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Scrollable Modal Body */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-5 text-xs">
              {/* ── SECTION 1: THIS LEAVE APPLICATION DETAILS ── */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-foreground text-xs uppercase tracking-wider font-mono flex items-center gap-1.5">
                    <FileText className="h-3.5 w-3.5 text-primary" /> Application Details
                  </span>
                  <div>{getStatusBadge(detailsModal.target.status)}</div>
                </div>

                {/* Info Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 p-3.5 rounded-xl bg-muted/30 border border-border/60">
                  <div>
                    <span className="text-muted-foreground block text-[10px] uppercase font-mono font-medium">Category</span>
                    <div className="mt-1">
                      {getLeaveTypeBadge(
                        detailsModal.target.leaveTypeCode,
                        detailsModal.target.leaveTypeName,
                        detailsModal.target.isPaid
                      )}
                    </div>
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-[10px] uppercase font-mono font-medium">Duration</span>
                    <span className="font-bold text-foreground block mt-1 font-mono text-xs">
                      {detailsModal.target.durationDays} {detailsModal.target.durationDays === 1 ? "Day" : "Days"}
                    </span>
                  </div>
                  <div className="col-span-2">
                    <span className="text-muted-foreground block text-[10px] uppercase font-mono font-medium">Date Range</span>
                    <span className="font-semibold text-foreground block mt-1">
                      {formatDisplayDate(detailsModal.target.startDate)} – {formatDisplayDate(detailsModal.target.endDate)}
                    </span>
                  </div>
                </div>

                {/* Reason */}
                <div>
                  <span className="font-semibold text-foreground block mb-1 text-xs">
                    Reason for Absence:
                  </span>
                  <div className="p-3.5 rounded-xl bg-muted/20 border border-border/60 text-foreground text-xs leading-relaxed">
                    &ldquo;{detailsModal.target.reason}&rdquo;
                  </div>
                </div>

                {/* Audit & Review Info */}
                <div className="p-3.5 rounded-xl bg-muted/40 border border-border/60 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Submitted On:</span>
                    <span className="text-foreground font-medium">
                      {formatDisplayDate(detailsModal.target.createdAt)}
                    </span>
                  </div>

                  {detailsModal.target.reviewedByName && (
                    <div className="flex items-center justify-between text-xs pt-1.5 border-t border-border/40">
                      <span className="text-muted-foreground">Reviewed By:</span>
                      <span className="text-foreground font-semibold flex items-center gap-1">
                        <ShieldCheck className="h-3.5 w-3.5 text-primary" />
                        {detailsModal.target.reviewedByName}
                      </span>
                    </div>
                  )}

                  {detailsModal.target.reviewedAt && (
                    <div className="flex items-center justify-between text-xs pt-1.5 border-t border-border/40">
                      <span className="text-muted-foreground">Reviewed At:</span>
                      <span className="text-foreground font-medium">
                        {formatDisplayDate(detailsModal.target.reviewedAt)}
                      </span>
                    </div>
                  )}

                  {detailsModal.target.reviewNotes && (
                    <div className="pt-2 border-t border-border/40">
                      <span className="text-muted-foreground block text-[11px] font-medium">Reviewer Remarks:</span>
                      <p className="text-foreground italic mt-0.5 bg-background/60 p-2 rounded-lg border border-border/40">
                        &ldquo;{detailsModal.target.reviewNotes}&rdquo;
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* ── SECTION 2: EMPLOYEE LEAVE BALANCES (KITNI BAKI HAI / KITNI LE CHUKA) ── */}
              <div className="pt-3 border-t border-border/60 space-y-3">
                <div>
                  <h4 className="font-bold text-foreground text-xs uppercase tracking-wider font-mono flex items-center gap-1.5">
                    <PieChart className="h-3.5 w-3.5 text-primary" /> Leave Balance & Entitlements Overview
                  </h4>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Total leaves taken and remaining allowances for {detailsModal.target.employeeName}.
                  </p>
                </div>

                {/* 3 Summary Pills */}
                <div className="grid grid-cols-3 gap-2.5">
                  <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-center">
                    <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400 uppercase font-mono block">
                      Leaves Taken
                    </span>
                    <span className="text-lg sm:text-xl font-extrabold font-mono text-emerald-700 dark:text-emerald-300 block mt-0.5">
                      {selectedEmployeeLeaveSummary?.totalApprovedDays || 0}{" "}
                      <span className="text-xs font-normal">days</span>
                    </span>
                  </div>

                  <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-center">
                    <span className="text-[10px] font-bold text-amber-700 dark:text-amber-400 uppercase font-mono block">
                      Pending Approvals
                    </span>
                    <span className="text-lg sm:text-xl font-extrabold font-mono text-amber-700 dark:text-amber-300 block mt-0.5">
                      {selectedEmployeeLeaveSummary?.totalPendingDays || 0}{" "}
                      <span className="text-xs font-normal">days</span>
                    </span>
                  </div>

                  <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 text-center">
                    <span className="text-[10px] font-bold text-blue-700 dark:text-blue-400 uppercase font-mono block">
                      Total Applications
                    </span>
                    <span className="text-lg sm:text-xl font-extrabold font-mono text-blue-700 dark:text-blue-300 block mt-0.5">
                      {selectedEmployeeLeaveSummary?.allRequestsCount || 1}
                    </span>
                  </div>
                </div>

                {/* Category-by-Category Quota & Remaining Balance Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  {selectedEmployeeLeaveSummary &&
                    Object.entries(selectedEmployeeLeaveSummary.usageByType)
                      .slice(0, 3)
                      .map(([code, item]) => {
                        const percentUsed = item.quota > 0 ? Math.min(100, Math.round((item.taken / item.quota) * 100)) : 0;
                        return (
                          <div
                            key={code}
                            className="p-3 rounded-xl border border-border/70 bg-card flex flex-col justify-between shadow-2xs"
                          >
                            <div>
                              <div className="flex items-center justify-between text-xs">
                                <span className="font-semibold text-foreground truncate">{item.name}</span>
                                <span className="font-mono text-[10px] font-bold text-primary">
                                  {item.remaining} left
                                </span>
                              </div>
                              <div className="text-[11px] text-muted-foreground mt-1 flex justify-between">
                                <span>Used: <strong className="text-foreground">{item.taken}</strong>d</span>
                                <span>Quota: {item.quota}d</span>
                              </div>
                            </div>

                            {/* Mini progress bar */}
                            <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden mt-2">
                              <div
                                className={`h-full rounded-full transition-all ${
                                  percentUsed > 80
                                    ? "bg-rose-500"
                                    : percentUsed > 50
                                    ? "bg-amber-500"
                                    : "bg-emerald-500"
                                }`}
                                style={{ width: `${percentUsed}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                </div>
              </div>

              {/* ── SECTION 3: OTHER LEAVE REQUESTS OF THIS EMPLOYEE ── */}
              <div className="pt-3 border-t border-border/60 space-y-2.5">
                <span className="font-bold text-foreground text-xs uppercase tracking-wider font-mono flex items-center gap-1.5">
                  <CalendarCheck className="h-3.5 w-3.5 text-primary" /> Other Leave Applications
                </span>

                {selectedEmployeeLeaveSummary && selectedEmployeeLeaveSummary.otherRequests.length > 0 ? (
                  <div className="space-y-2">
                    {selectedEmployeeLeaveSummary.otherRequests.slice(0, 3).map((hist) => (
                      <div
                        key={hist.id}
                        className="p-2.5 rounded-xl border border-border/60 bg-muted/20 flex items-center justify-between gap-3 text-xs"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-foreground">
                              {formatDisplayDate(hist.startDate)} – {formatDisplayDate(hist.endDate)}
                            </span>
                            <span className="text-[10px] text-muted-foreground font-mono font-bold">
                              ({hist.durationDays}d)
                            </span>
                          </div>
                          <p className="text-[11px] text-muted-foreground truncate max-w-xs mt-0.5">
                            {hist.reason}
                          </p>
                        </div>
                        <div className="shrink-0">{getStatusBadge(hist.status)}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-3 rounded-xl bg-muted/20 border border-border/50 text-[11px] text-muted-foreground">
                    No other leave records found for this employee.
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer Actions */}
            <div className="p-4 bg-muted/20 border-t border-border/60 flex items-center justify-between gap-2 shrink-0">
              {/* Quick in-modal review buttons if still pending */}
              {detailsModal.target.status === "PENDING" ? (
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      const t = detailsModal.target;
                      setDetailsModal({ isOpen: false, target: null });
                      if (t) {
                        setReviewModal({
                          isOpen: true,
                          target: t,
                          action: "REJECTED",
                          notes: "",
                        });
                      }
                    }}
                    className="rounded-xl text-xs h-8 text-rose-600 border-rose-500/30 hover:bg-rose-500/10 gap-1"
                  >
                    <X className="h-3.5 w-3.5" /> Reject
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => {
                      const t = detailsModal.target;
                      setDetailsModal({ isOpen: false, target: null });
                      if (t) {
                        setReviewModal({
                          isOpen: true,
                          target: t,
                          action: "APPROVED",
                          notes: "",
                        });
                      }
                    }}
                    className="rounded-xl text-xs h-8 bg-emerald-600 hover:bg-emerald-700 text-white gap-1 shadow-xs"
                  >
                    <Check className="h-3.5 w-3.5" /> Approve
                  </Button>
                </div>
              ) : (
                <div className="text-[11px] text-muted-foreground italic">
                  Status: {detailsModal.target.status}
                </div>
              )}

              <Button
                variant="outline"
                size="sm"
                onClick={() => setDetailsModal({ isOpen: false, target: null })}
                className="rounded-xl text-xs h-8 ml-auto"
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          MODAL: CREATE NEW LEAVE TYPE
          ══════════════════════════════════════════════════════════════════ */}
      {newTypeModal.isOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-card border border-border/80 rounded-2xl w-full max-w-md shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-5 border-b border-border/60 flex items-center justify-between bg-muted/20">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                  <Settings2 className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="font-semibold text-foreground text-sm">Create Leave Category</h3>
                  <p className="text-xs text-muted-foreground">Define a new organization policy type</p>
                </div>
              </div>
              <button
                onClick={() => setNewTypeModal({ ...newTypeModal, isOpen: false })}
                className="p-1 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleCreateTypeSubmit}>
              <div className="p-5 space-y-3.5 text-xs">
                <div>
                  <label className="block font-semibold text-foreground mb-1">
                    Category Code <span className="text-destructive">*</span>
                  </label>
                  <Input
                    placeholder="e.g. COMP_OFF, STUDY, STUDY_LEAVE"
                    value={newTypeModal.code}
                    onChange={(e) =>
                      setNewTypeModal({ ...newTypeModal, code: e.target.value.toUpperCase() })
                    }
                    className="h-9 text-xs rounded-xl font-mono uppercase"
                    required
                  />
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    Unique uppercase key (A-Z, numbers, underscores).
                  </p>
                </div>

                <div>
                  <label className="block font-semibold text-foreground mb-1">
                    Display Name <span className="text-destructive">*</span>
                  </label>
                  <Input
                    placeholder="e.g. Compensatory Off, Sabbatical"
                    value={newTypeModal.name}
                    onChange={(e) => setNewTypeModal({ ...newTypeModal, name: e.target.value })}
                    className="h-9 text-xs rounded-xl"
                    required
                  />
                </div>

                <div>
                  <label className="block font-semibold text-foreground mb-1">
                    Policy Description
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Eligibility, purpose, or conditions for this leave..."
                    value={newTypeModal.description}
                    onChange={(e) =>
                      setNewTypeModal({ ...newTypeModal, description: e.target.value })
                    }
                    className="w-full p-2.5 rounded-xl border border-border/80 bg-background text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary placeholder:text-muted-foreground"
                  />
                </div>

                <div className="flex items-center gap-4 pt-1">
                  <label className="flex items-center gap-2 cursor-pointer font-medium text-foreground">
                    <input
                      type="checkbox"
                      checked={newTypeModal.isPaid}
                      onChange={(e) =>
                        setNewTypeModal({ ...newTypeModal, isPaid: e.target.checked })
                      }
                      className="rounded border-border text-primary focus:ring-primary h-4 w-4"
                    />
                    <span>Paid Leave</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer font-medium text-foreground">
                    <input
                      type="checkbox"
                      checked={newTypeModal.requiresApproval}
                      onChange={(e) =>
                        setNewTypeModal({ ...newTypeModal, requiresApproval: e.target.checked })
                      }
                      className="rounded border-border text-primary focus:ring-primary h-4 w-4"
                    />
                    <span>Requires Approval</span>
                  </label>
                </div>
              </div>

              <div className="p-4 bg-muted/20 border-t border-border/60 flex items-center justify-end gap-2.5">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setNewTypeModal({ ...newTypeModal, isOpen: false })}
                  className="rounded-xl text-xs h-8"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={isPending}
                  size="sm"
                  className="rounded-xl text-xs h-8 shadow-xs"
                >
                  {isPending ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Creating...
                    </>
                  ) : (
                    "Save Category"
                  )}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
