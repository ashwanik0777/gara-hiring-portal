"use client";

import React, { useCallback, useEffect, useState, useTransition } from "react";
import dynamic from "next/dynamic";
import { usePathname, useRouter } from "next/navigation";
import type { LeavePageData, LeaveRequestItem, LeaveTab } from "../types";
import {
  reviewLeaveRequestAction,
  createLeaveRequestAction,
  createLeaveTypeAction,
  toggleLeaveTypeAction,
  seedDefaultLeaveTypesAction,
} from "../actions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PaginationNav } from "@/components/ui/pagination-nav";
import { DialogFallback } from "@/components/ui/dialog-fallback";
import {
  Calendar,
  CheckCircle2,
  AlertCircle,
  PlusCircle,
  Search,
  FileText,
  X,
  Check,
  CalendarRange,
  Users,
  Settings2,
  Eye,
} from "lucide-react";
import { formatDisplayDate, LeaveStatusBadge, LeaveTypeBadge } from "./leave-ui";
import type { ApplyLeaveValues } from "./apply-leave-form";
import type { LeaveTypeDraft } from "./dialogs/leave-type-dialog";

// Dialogs and the apply form are loaded on first use so the list paints with less JS.
const LeaveReviewDialog = dynamic(
  () => import("./dialogs/leave-review-dialog").then((m) => m.LeaveReviewDialog),
  { ssr: false, loading: () => <DialogFallback label="Loading review dialog" /> }
);
const LeaveDetailsDialog = dynamic(
  () => import("./dialogs/leave-details-dialog").then((m) => m.LeaveDetailsDialog),
  { ssr: false, loading: () => <DialogFallback label="Loading leave details" /> }
);
const LeaveTypeDialog = dynamic(
  () => import("./dialogs/leave-type-dialog").then((m) => m.LeaveTypeDialog),
  { ssr: false, loading: () => <DialogFallback label="Loading category form" /> }
);
const ApplyLeaveForm = dynamic(
  () => import("./apply-leave-form").then((m) => m.ApplyLeaveForm),
  {
    loading: () => (
      <div role="status" aria-live="polite" aria-busy="true" className="rounded-2xl border border-border/80 bg-card p-6">
        <span className="sr-only">Loading leave form</span>
        <div className="h-48 rounded-xl bg-border/70 motion-safe:animate-pulse" aria-hidden="true" />
      </div>
    ),
  }
);

interface LeaveManagementClientProps {
  pageData: Exclude<LeavePageData, { view: "forbidden" }>;
  /** Tab from the URL (`?tab=`), so links and the back button restore it. */
  initialTab?: LeaveTab;
  /** Server-rendered summary cards. */
  statsSlot: React.ReactNode;
}

type StatusPill = "ALL" | "PENDING" | "APPROVED" | "REJECTED";

export function LeaveManagementClient({ pageData, initialTab, statsSlot }: LeaveManagementClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const isTeamView = pageData.view === "team";
  const canManageTypes = pageData.view === "team" && pageData.canManageTypes;
  const canSeedDefaultTypes = pageData.view === "team" && pageData.canSeedDefaultTypes;
  const { requests, page, filters, calendar, leaveTypes, stats, employees, employeesTotal } = pageData;

  const [isPending, startTransition] = useTransition();
  const [activeTab, setActiveTab] = useState<LeaveTab>(initialTab ?? "requests");
  const [searchInput, setSearchInput] = useState(filters.search ?? "");

  const [reviewModal, setReviewModal] = useState<{
    target: LeaveRequestItem;
    action: "APPROVED" | "REJECTED";
  } | null>(null);
  const [detailsTarget, setDetailsTarget] = useState<LeaveRequestItem | null>(null);
  const [typeDialogOpen, setTypeDialogOpen] = useState(false);

  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const showFeedback = useCallback((type: "success" | "error", message: string) => {
    setFeedback({ type, message });
    window.setTimeout(() => setFeedback(null), 6000);
  }, []);

  // Every filter and the page live in the URL so links, reloads and the back button work.
  const buildHref = useCallback(
    (overrides: {
      status?: string | null;
      type?: string | null;
      q?: string | null;
      page?: number | null;
      tab?: LeaveTab | null;
    } = {}) => {
      const params = new URLSearchParams();
      const status = overrides.status === undefined ? filters.status : overrides.status;
      const type = overrides.type === undefined ? filters.leaveTypeId : overrides.type;
      const q = overrides.q === undefined ? filters.search : overrides.q;
      const target = overrides.page === undefined ? page.page : overrides.page;
      const tab = overrides.tab === undefined ? activeTab : overrides.tab;
      if (status) params.set("status", status);
      if (type) params.set("type", type);
      if (q) params.set("q", q);
      if (target && target > 1) params.set("page", String(target));
      if (tab && tab !== "requests") params.set("tab", tab);
      const query = params.toString();
      return query ? `${pathname}?${query}` : pathname;
    },
    [filters, page.page, activeTab, pathname]
  );

  const navigate = (href: string) => {
    startTransition(() => {
      router.push(href, { scroll: false });
    });
  };

  const switchTab = useCallback(
    (tab: LeaveTab) => {
      setActiveTab(tab);
      // Reflect the tab in the URL without a server round trip.
      const params = new URLSearchParams(window.location.search);
      if (tab === "requests") params.delete("tab");
      else params.set("tab", tab);
      const query = params.toString();
      window.history.replaceState(null, "", query ? `${pathname}?${query}` : pathname);
    },
    [pathname]
  );

  // Listen to navbar action buttons
  useEffect(() => {
    const handleCategoryEvent = () => {
      if (canManageTypes) setTypeDialogOpen(true);
    };
    const handleApplyEvent = () => switchTab("apply");

    window.addEventListener("open-leave-category-modal", handleCategoryEvent);
    window.addEventListener("open-apply-leave-tab", handleApplyEvent);
    window.addEventListener("request-leave", handleApplyEvent);
    return () => {
      window.removeEventListener("open-leave-category-modal", handleCategoryEvent);
      window.removeEventListener("open-apply-leave-tab", handleApplyEvent);
      window.removeEventListener("request-leave", handleApplyEvent);
    };
  }, [canManageTypes, switchTab]);

  // ---------------------------------------------------------------------------
  // Handlers (the server re-renders stats and rows after each successful action)
  // ---------------------------------------------------------------------------

  const handleReviewConfirm = (notes: string) => {
    if (!reviewModal) return;
    const { target, action } = reviewModal;
    startTransition(async () => {
      const res = await reviewLeaveRequestAction({ requestId: target.id, status: action, reviewNotes: notes });
      if (!res.success) {
        showFeedback("error", res.error);
        return;
      }
      const { skippedDates, attendanceDaysMarked } = res.data;
      setReviewModal(null);
      let message = `Leave request for ${target.employeeName} has been ${action.toLowerCase()}.`;
      if (action === "APPROVED") {
        message += ` ${attendanceDaysMarked} attendance ${attendanceDaysMarked === 1 ? "day" : "days"} marked on leave.`;
        if (skippedDates.length > 0) {
          message += ` Left unchanged because attendance is already recorded: ${skippedDates.join(", ")}.`;
        }
      }
      showFeedback("success", message);
      router.refresh();
    });
  };

  const handleApplyLeaveSubmit = (values: ApplyLeaveValues) => {
    startTransition(async () => {
      // Dates are UTC calendar days; the server re-validates range, overlap and leave type.
      const res = await createLeaveRequestAction({
        employeeId: values.employeeId,
        leaveTypeId: values.leaveTypeId,
        startDate: `${values.startDate}T00:00:00.000Z`,
        endDate: `${values.endDate}T00:00:00.000Z`,
        reason: values.reason,
      });
      if (!res.success) {
        showFeedback("error", res.error);
        return;
      }
      switchTab("requests");
      showFeedback("success", "Leave request submitted successfully for approval.");
      router.refresh();
    });
  };

  const handleCreateType = (draft: LeaveTypeDraft) => {
    if (!draft.code.trim() || !draft.name.trim()) {
      showFeedback("error", "Code and Name are required.");
      return;
    }
    startTransition(async () => {
      const res = await createLeaveTypeAction({
        code: draft.code.trim().toUpperCase(),
        name: draft.name.trim(),
        description: draft.description.trim() || null,
        isPaid: draft.isPaid,
        requiresApproval: draft.requiresApproval,
      });
      if (!res.success) {
        showFeedback("error", res.error);
        return;
      }
      setTypeDialogOpen(false);
      showFeedback("success", `Leave category "${draft.name}" added successfully.`);
      router.refresh();
    });
  };

  const handleToggleType = (typeId: string, currentActive: boolean) => {
    startTransition(async () => {
      const res = await toggleLeaveTypeAction({ id: typeId, isActive: !currentActive });
      if (!res.success) {
        showFeedback("error", res.error);
        return;
      }
      showFeedback("success", "Leave type status updated.");
      router.refresh();
    });
  };

  const handleSeedDefaultTypes = () => {
    startTransition(async () => {
      const res = await seedDefaultLeaveTypesAction();
      if (!res.success) {
        showFeedback("error", res.error);
        return;
      }
      showFeedback(
        "success",
        `${res.data.created} suggested leave categories loaded. They remain pending product-owner approval (OD-007).`
      );
      router.refresh();
    });
  };

  const canReview = (req: LeaveRequestItem) => isTeamView && req.status === "PENDING" && !req.isOwnRequest;
  const hasActiveFilters = Boolean(filters.status || filters.leaveTypeId || filters.search);
  const statusPill: StatusPill =
    filters.status === "PENDING" || filters.status === "APPROVED" || filters.status === "REJECTED"
      ? filters.status
      : "ALL";

  const tabClass = (tab: LeaveTab) =>
    `flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
      activeTab === tab
        ? "bg-background text-foreground shadow-xs border border-border/60"
        : "text-muted-foreground hover:text-foreground"
    }`;

  return (
    <div className="space-y-6">
      {feedback && (
        <div
          role={feedback.type === "error" ? "alert" : "status"}
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
            type="button"
            onClick={() => setFeedback(null)}
            className="p-1 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
            aria-label="Dismiss message"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {statsSlot}

      {/* ─── Navigation Tabs ─── */}
      <div
        role="tablist"
        aria-label="Leave sections"
        className="flex items-center gap-1.5 p-1 rounded-2xl bg-muted/60 border border-border/60 max-w-full overflow-x-auto"
      >
        <button type="button" role="tab" aria-selected={activeTab === "requests"} onClick={() => switchTab("requests")} className={tabClass("requests")}>
          <FileText className="h-3.5 w-3.5" />
          {isTeamView ? "Leave Applications" : "My Leave Requests"}
          <span
            className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
              stats.pendingCount > 0
                ? "bg-amber-500/20 text-amber-700 dark:text-amber-400"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {page.total}
          </span>
        </button>
        <button type="button" role="tab" aria-selected={activeTab === "calendar"} onClick={() => switchTab("calendar")} className={tabClass("calendar")}>
          <CalendarRange className="h-3.5 w-3.5" />
          Out-of-Office & Calendar
          {stats.onLeaveTodayCount > 0 && (
            <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-blue-500/20 text-blue-700 dark:text-blue-400">
              {stats.onLeaveTodayCount}
            </span>
          )}
        </button>
        <button type="button" role="tab" aria-selected={activeTab === "types"} onClick={() => switchTab("types")} className={tabClass("types")}>
          <Settings2 className="h-3.5 w-3.5" />
          Leave Categories ({leaveTypes.length})
        </button>
        <button type="button" role="tab" aria-selected={activeTab === "apply"} onClick={() => switchTab("apply")} className={tabClass("apply")}>
          <PlusCircle className="h-3.5 w-3.5" />
          {isTeamView ? "Apply / Grant Leave" : "Request Leave"}
        </button>
      </div>

      {/* ══════════════ TAB 1: LEAVE APPLICATIONS LIST & FILTERS ══════════════ */}
      {activeTab === "requests" && (
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
                aria-label="Search leave applications"
                placeholder="Search by employee, code, reason or department..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="pl-9 pr-8 h-9 rounded-xl border-border/80 bg-background/80 text-xs"
              />
              {(searchInput || filters.search) && (
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
              <div className="flex items-center gap-1 p-1 rounded-xl bg-muted/60 border border-border/60 text-xs" role="group" aria-label="Filter by status">
                {(["ALL", "PENDING", "APPROVED", "REJECTED"] as const).map((st) => (
                  <button
                    key={st}
                    type="button"
                    aria-pressed={statusPill === st}
                    onClick={() => navigate(buildHref({ status: st === "ALL" ? null : st, page: null }))}
                    className={`px-2.5 py-1 rounded-lg font-medium transition-all cursor-pointer ${
                      statusPill === st
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

              <select
                value={filters.leaveTypeId ?? "ALL"}
                onChange={(e) => navigate(buildHref({ type: e.target.value === "ALL" ? null : e.target.value, page: null }))}
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

              {hasActiveFilters && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSearchInput("");
                    navigate(buildHref({ status: null, type: null, q: null, page: null }));
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
              <table className="w-full min-w-[720px] text-left text-xs border-collapse table-fixed">
                <thead>
                  <tr className="border-b border-border/80 bg-muted/40 text-muted-foreground text-[11px] uppercase tracking-wider font-mono font-bold">
                    <th scope="col" className="py-3 px-4 w-[28%]">Employee</th>
                    <th scope="col" className="py-3 px-4 w-[20%]">Leave Category</th>
                    <th scope="col" className="py-3 px-4 w-[24%]">Duration & Dates</th>
                    <th scope="col" className="py-3 px-4 w-[14%] text-center">Status</th>
                    <th scope="col" className="py-3 px-4 w-[14%] text-right pr-4">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {requests.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-12 text-center text-muted-foreground">
                        <div className="flex flex-col items-center justify-center gap-2">
                          <FileText className="h-8 w-8 text-muted-foreground/60 mb-1" />
                          <p className="text-sm font-semibold text-foreground">No leave applications found</p>
                          <p className="text-xs text-muted-foreground max-w-sm">
                            {hasActiveFilters
                              ? "Try adjusting your search terms or filters to view records."
                              : isTeamView
                                ? "No employee leave requests have been submitted yet."
                                : "You have not submitted any leave requests yet."}
                          </p>
                          <Button variant="outline" size="sm" onClick={() => switchTab("apply")} className="mt-2 text-xs rounded-xl">
                            <PlusCircle className="h-3.5 w-3.5 mr-1" /> {isTeamView ? "Grant Leave" : "Request Leave"}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    requests.map((req) => (
                      <tr key={req.id} className="hover:bg-muted/30 transition-colors group">
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
                        <td className="py-3.5 px-4">
                          <div className="space-y-1">
                            <div>
                              <LeaveTypeBadge code={req.leaveTypeCode} name={req.leaveTypeName} isPaid={req.isPaid} />
                            </div>
                            <div className="text-[10px] text-muted-foreground/80 flex items-center gap-1.5 pl-0.5 font-medium">
                              <span className={req.isPaid ? "text-emerald-600 dark:text-emerald-400 font-semibold" : "text-amber-600 dark:text-amber-400 font-semibold"}>
                                {req.isPaid ? "Marked paid" : "Marked unpaid"}
                              </span>
                            </div>
                          </div>
                        </td>
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
                            <span className="text-[10px] text-muted-foreground/75 truncate">
                              Applied {formatDisplayDate(req.createdAt)}
                            </span>
                          </div>
                        </td>
                        <td className="py-3.5 px-4 text-center whitespace-nowrap">
                          <div className="inline-flex justify-center">
                            <LeaveStatusBadge status={req.status} />
                          </div>
                        </td>
                        <td className="py-3.5 px-4 text-right pr-4 whitespace-nowrap">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => setDetailsTarget(req)}
                              className="h-8 w-8 rounded-lg border border-border/80 bg-background hover:bg-muted text-muted-foreground hover:text-primary transition-all flex items-center justify-center shadow-2xs cursor-pointer group/eye"
                              title="View full details"
                              aria-label="View full details"
                            >
                              <Eye className="h-4 w-4 group-hover/eye:scale-110 transition-transform" />
                            </button>
                            {canReview(req) && (
                              <button
                                type="button"
                                onClick={() => setReviewModal({ target: req, action: "APPROVED" })}
                                className="h-8 w-8 rounded-lg bg-emerald-50 hover:bg-emerald-600 text-emerald-600 hover:text-white dark:bg-emerald-950/50 dark:hover:bg-emerald-600 dark:text-emerald-400 dark:hover:text-white border border-emerald-500/30 hover:border-emerald-600 transition-all flex items-center justify-center shadow-2xs cursor-pointer"
                                title="Approve Leave Application"
                                aria-label="Approve leave application"
                              >
                                <Check className="h-4 w-4 stroke-[2.5]" />
                              </button>
                            )}
                            {canReview(req) && (
                              <button
                                type="button"
                                onClick={() => setReviewModal({ target: req, action: "REJECTED" })}
                                className="h-8 w-8 rounded-lg bg-rose-50 hover:bg-rose-600 text-rose-600 hover:text-white dark:bg-rose-950/50 dark:hover:bg-rose-600 dark:text-rose-400 dark:hover:text-white border border-rose-500/30 hover:border-rose-600 transition-all flex items-center justify-center shadow-2xs cursor-pointer"
                                title="Reject Leave Application"
                                aria-label="Reject leave application"
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

          <PaginationNav
            page={page.page}
            pageCount={page.pageCount}
            total={page.total}
            hrefFor={(target) => buildHref({ page: target })}
            label="Leave application pages"
            itemLabel="requests"
          />
        </div>
      )}

      {/* ══════════════ TAB 2: OUT-OF-OFFICE TODAY & CALENDAR OVERVIEW ══════════════ */}
      {activeTab === "calendar" && (
        <div className="space-y-6">
          <Card className="rounded-2xl border-border/80 bg-card overflow-hidden">
            <CardHeader className="pb-3 border-b border-border/60 bg-muted/20">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
                  <Users className="h-4 w-4 text-primary" /> Employees Currently On Leave Today
                </CardTitle>
                <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20">
                  {stats.onLeaveTodayCount} Active Absences
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-5">
              {calendar.onLeaveToday.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <CheckCircle2 className="h-8 w-8 text-emerald-500 mx-auto mb-2" />
                  <p className="font-semibold text-foreground text-sm">Full Team Attendance Today</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    No approved leaves are active for the current working day.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {calendar.onLeaveToday.map((r) => (
                    <div key={r.id} className="p-4 rounded-xl border border-border/70 bg-background/80 hover:border-primary/40 transition-all space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="font-semibold text-foreground text-sm">{r.employeeName}</div>
                          <div className="text-xs text-muted-foreground">
                            {r.employeeCode} • {r.employeeDepartment}
                          </div>
                        </div>
                        <LeaveTypeBadge code={r.leaveTypeCode} name={r.leaveTypeName} isPaid={r.isPaid} />
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
                            {new Date(new Date(r.endDate).getTime() + 24 * 60 * 60 * 1000).toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                              timeZone: "UTC",
                            })}
                          </span>
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground italic truncate">&ldquo;{r.reason}&rdquo;</p>
                    </div>
                  ))}
                </div>
              )}
              {stats.onLeaveTodayCount > calendar.onLeaveToday.length && (
                <p className="text-[11px] text-muted-foreground mt-4">
                  Showing the first {calendar.onLeaveToday.length} of {stats.onLeaveTodayCount}. Use the
                  applications list with the Approved filter to see the rest.
                </p>
              )}
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-border/80 bg-card overflow-hidden">
            <CardHeader className="pb-3 border-b border-border/60 bg-muted/20">
              <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
                <Calendar className="h-4 w-4 text-primary" /> Upcoming Scheduled Leaves (Next 14 Days)
              </CardTitle>
            </CardHeader>
            <CardContent className="p-5">
              {calendar.upcoming.length === 0 ? (
                <div className="text-center py-6 text-muted-foreground text-xs">
                  No upcoming approved leaves scheduled within the next 2 weeks.
                </div>
              ) : (
                <div className="divide-y divide-border/60">
                  {calendar.upcoming.map((r) => (
                    <div key={r.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="h-8 w-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold shrink-0">
                          {r.employeeName.charAt(0)}
                        </div>
                        <div className="min-w-0">
                          <div className="font-semibold text-foreground truncate">{r.employeeName}</div>
                          <div className="text-muted-foreground text-[11px] truncate">
                            {r.employeeCode} • {r.employeeDepartment}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 flex-wrap">
                        <LeaveTypeBadge code={r.leaveTypeCode} name={r.leaveTypeName} isPaid={r.isPaid} />
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

      {/* ══════════════ TAB 3: POLICY & LEAVE CATEGORIES DIRECTORY ══════════════ */}
      {activeTab === "types" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h2 className="text-base font-semibold text-foreground">Configured Leave Categories</h2>
              <p className="text-xs text-muted-foreground">
                Leave entitlements, balances, accrual and approval-chain rules are pending
                product-owner approval (OD-007). No balances are calculated.
              </p>
            </div>
            {canManageTypes && (
              <Button size="sm" onClick={() => setTypeDialogOpen(true)} className="gap-1.5 rounded-xl text-xs">
                <PlusCircle className="h-3.5 w-3.5" /> Add Category
              </Button>
            )}
          </div>

          {leaveTypes.length === 0 && (
            <div className="p-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 text-xs text-amber-800 dark:text-amber-300 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <span>
                No leave categories are configured.
                {canSeedDefaultTypes
                  ? " A suggested catalogue (casual, sick, earned, parental, bereavement, unpaid) can be loaded; its names and paid flags are pending product-owner approval (OD-007)."
                  : " An administrator must configure leave categories before leave can be requested."}
              </span>
              {canSeedDefaultTypes && (
                <Button size="sm" variant="outline" onClick={handleSeedDefaultTypes} disabled={isPending} className="rounded-xl text-xs shrink-0">
                  Load suggested categories (pending approval)
                </Button>
              )}
            </div>
          )}

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
                      <h3 className="font-semibold text-foreground text-sm mt-1.5">{t.name}</h3>
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
                        <span className="text-muted-foreground text-[10px]">Approval required</span>
                      )}
                    </div>
                    {canManageTypes && (
                      <button
                        type="button"
                        onClick={() => handleToggleType(t.id, t.isActive)}
                        disabled={isPending}
                        className={`text-[11px] font-medium hover:underline cursor-pointer ${
                          t.isActive ? "text-rose-600 dark:text-rose-400" : "text-primary"
                        }`}
                      >
                        {t.isActive ? "Deactivate" : "Activate"}
                      </button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* ══════════════ TAB 4: APPLY LEAVE ══════════════ */}
      {activeTab === "apply" && (
        <ApplyLeaveForm
          isTeamView={isTeamView}
          employees={employees}
          employeesTotal={employeesTotal}
          leaveTypes={leaveTypes}
          isPending={isPending}
          onSubmit={handleApplyLeaveSubmit}
          onCancel={() => switchTab("requests")}
          onValidationError={(message) => showFeedback("error", message)}
        />
      )}

      {reviewModal && (
        <LeaveReviewDialog
          target={reviewModal.target}
          action={reviewModal.action}
          isPending={isPending}
          onClose={() => setReviewModal(null)}
          onConfirm={handleReviewConfirm}
        />
      )}

      {detailsTarget && (
        <LeaveDetailsDialog
          target={detailsTarget}
          canReview={canReview(detailsTarget)}
          onClose={() => setDetailsTarget(null)}
          onReview={(action) => {
            const target = detailsTarget;
            setDetailsTarget(null);
            setReviewModal({ target, action });
          }}
        />
      )}

      {typeDialogOpen && (
        <LeaveTypeDialog isPending={isPending} onClose={() => setTypeDialogOpen(false)} onSubmit={handleCreateType} />
      )}
    </div>
  );
}
