"use client";

import React, { useCallback, useEffect, useState, useTransition } from "react";
import dynamic from "next/dynamic";
import { usePathname, useRouter } from "next/navigation";
import { createSubAdminAction, updateSubAdminPermissionsAction, deleteSubAdminAction } from "../actions";
import type { PageInfo, SubAdminItem } from "../types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PaginationNav } from "@/components/ui/pagination-nav";
import { DialogFallback } from "@/components/ui/dialog-fallback";
import { Trash2, Settings2, AlertCircle, Search, X } from "lucide-react";
import { initialsOf, isStaffRole } from "./subadmin-ui";
import type { CreateSubAdminValues } from "./create-subadmin-dialog";
import { toast } from "@/components/ui/toast";

export type { SubAdminItem } from "../types";

// Dialogs are loaded on first use so the directory paints with less JS.
const CreateSubAdminDialog = dynamic(
  () => import("./create-subadmin-dialog").then((m) => m.CreateSubAdminDialog),
  { ssr: false, loading: () => <DialogFallback label="Loading sub-admin form" /> }
);
const EditSubAdminDialog = dynamic(
  () => import("./edit-subadmin-dialog").then((m) => m.EditSubAdminDialog),
  { ssr: false, loading: () => <DialogFallback label="Loading permissions editor" /> }
);

interface SubAdminManagementClientProps {
  /** One page of staff accounts (server-bounded). */
  items: SubAdminItem[];
  page: PageInfo;
  /** Server-rendered summary cards (`SubAdminStatsCards`). */
  statsSlot: React.ReactNode;
  search?: string;
}

const MODULE_BADGES: Array<{ key: keyof SubAdminItem["permissions"]; label: string; className: string }> = [
  { key: "canApplications", label: "Apps", className: "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300" },
  { key: "canOpenings", label: "Openings", className: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300" },
  { key: "canInterviews", label: "Interviews", className: "bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300" },
  { key: "canEvaluations", label: "Evaluations", className: "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300" },
  { key: "canEmployees", label: "Employees", className: "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300" },
  { key: "canAttendance", label: "Attendance", className: "bg-teal-50 text-teal-700 dark:bg-teal-950/40 dark:text-teal-300" },
  { key: "canLeave", label: "Leave", className: "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300" },
  { key: "canPayroll", label: "Payroll", className: "bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-300" },
  { key: "canReports", label: "Reports", className: "bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300" },
];

export function SubAdminManagementClient({ items, page, statsSlot, search }: SubAdminManagementClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [isCreating, setIsCreating] = useState(false);
  const [editingSubAdmin, setEditingSubAdmin] = useState<SubAdminItem | null>(null);
  const [searchInput, setSearchInput] = useState(search ?? "");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Listen for open-subadmin-modal event from navbar button
  useEffect(() => {
    const handleOpen = () => setIsCreating(true);
    window.addEventListener("open-subadmin-modal", handleOpen);
    return () => window.removeEventListener("open-subadmin-modal", handleOpen);
  }, []);

  const buildHref = useCallback(
    (overrides: { q?: string | null; page?: number | null }) => {
      const params = new URLSearchParams();
      const q = overrides.q === undefined ? search : overrides.q ?? undefined;
      const target = overrides.page === undefined ? page.page : overrides.page ?? undefined;
      if (q) params.set("q", q);
      if (target && target > 1) params.set("page", String(target));
      const query = params.toString();
      return query ? `${pathname}?${query}` : pathname;
    },
    [search, page.page, pathname]
  );

  const navigate = (href: string) => {
    startTransition(() => {
      router.push(href, { scroll: false });
    });
  };

  const closeCreate = useCallback(() => {
    setIsCreating(false);
    setErrorMsg(null);
  }, []);

  const handleCreateSubmit = (values: CreateSubAdminValues) => {
    setErrorMsg(null);
    startTransition(async () => {
      const res = await createSubAdminAction({
        name: values.name,
        email: values.email,
        password: values.password,
        role: values.role,
        permissions: values.permissions,
      });
      if (!res.success) {
        setErrorMsg(res.error || "Failed to create Sub-Admin");
        return;
      }
      toast.success(res.message || "Sub-Admin successfully created!");
      setIsCreating(false);
    });
  };

  const handleUpdatePermissions = (subAdmin: SubAdminItem) => {
    const role = subAdmin.role;
    if (!isStaffRole(role)) {
      setErrorMsg("Select a staff role before saving.");
      return;
    }
    setErrorMsg(null);
    startTransition(async () => {
      const res = await updateSubAdminPermissionsAction({
        subAdminId: subAdmin.id,
        role,
        permissions: subAdmin.permissions,
      });
      if (!res.success) {
        setErrorMsg(res.error || "Failed to update permissions");
        return;
      }
      toast.success(`Permissions updated successfully for ${subAdmin.name}.`);
      setEditingSubAdmin(null);
    });
  };

  const handleDelete = (id: string, name: string) => {
    if (!confirm(`Revoke staff access for ${name}? Their account and history are kept, but they lose all sub-admin roles and are signed out.`)) return;
    setErrorMsg(null);
    startTransition(async () => {
      const res = await deleteSubAdminAction(id);
      if (!res.success) {
        setErrorMsg(res.error || "Failed to revoke Sub-Admin access");
        return;
      }
      toast.success(`Staff access for ${name} revoked.`);
      if (editingSubAdmin?.id === id) setEditingSubAdmin(null);
    });
  };

  return (
    <div className="space-y-6">
      {errorMsg && !isCreating && (
        <div role="alert" className="p-3.5 rounded-xl border border-destructive/20 bg-destructive/10 text-destructive text-xs flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Summary figures, rendered on the server (subadmin-stats-cards.tsx). */}
      {statsSlot}

      {isCreating && (
        <CreateSubAdminDialog isPending={isPending} errorMsg={errorMsg} onClose={closeCreate} onSubmit={handleCreateSubmit} />
      )}
      {editingSubAdmin && (
        <EditSubAdminDialog subAdmin={editingSubAdmin} isPending={isPending} onClose={() => setEditingSubAdmin(null)} onSave={handleUpdatePermissions} />
      )}

      {/* Search (navigates through the URL) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <form
          className="relative flex-1 max-w-md"
          onSubmit={(e) => {
            e.preventDefault();
            navigate(buildHref({ q: searchInput.trim() || null, page: null }));
          }}
        >
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="search"
            aria-label="Search sub-admins by name or email"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search by name or email..."
            className="w-full pl-8 pr-8 py-1.5 text-xs rounded-xl border border-border bg-card text-foreground placeholder:text-muted-foreground"
          />
          {(searchInput || search) && (
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
        <Button type="button" size="sm" onClick={() => setIsCreating(true)} className="text-xs">
          + Create Sub-Admin
        </Button>
      </div>

      {/* Sub-Admins Directory Table */}
      <div className="rounded-2xl border border-border/70 bg-card overflow-hidden shadow-2xs" aria-busy={isPending}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-xs text-left">
            <thead className="bg-muted/50 border-b border-border/70 text-muted-foreground font-semibold">
              <tr>
                <th scope="col" className="py-3 px-4">Sub-Admin Member</th>
                <th scope="col" className="py-3 px-4">Assigned Role</th>
                <th scope="col" className="py-3 px-4">Active Module Access</th>
                <th scope="col" className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {items.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-muted-foreground">
                    {search
                      ? "No sub-admins match this search."
                      : 'No Sub-Admins provisioned yet. Click "+ Create Sub-Admin" to add HR, Managers, or Interviewers.'}
                  </td>
                </tr>
              ) : (
                items.map((subAdmin) => (
                  <tr key={subAdmin.id} className="hover:bg-muted/20 transition-colors">
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-2.5">
                        <div className="h-7 w-7 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/60 dark:text-blue-300 font-bold text-[10px] flex items-center justify-center shrink-0 border border-blue-200 dark:border-blue-800">
                          {initialsOf(subAdmin.name)}
                        </div>
                        <div>
                          <div className="font-bold text-foreground">{subAdmin.name}</div>
                          <div className="text-[11px] text-muted-foreground font-mono">{subAdmin.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      <Badge variant="outline" className="text-[10px] uppercase font-mono font-bold">{subAdmin.role}</Badge>
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="flex flex-wrap gap-1 max-w-md">
                        {MODULE_BADGES.filter((m) => subAdmin.permissions[m.key]).map((m) => (
                          <span key={m.key} className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${m.className}`}>
                            {m.label}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <Button size="sm" variant="outline" onClick={() => setEditingSubAdmin(subAdmin)} className="text-[11px] h-7 px-2.5">
                          <Settings2 className="h-3 w-3 mr-1" /> Permissions
                        </Button>
                        <Button size="sm" variant="destructive" onClick={() => handleDelete(subAdmin.id, subAdmin.name)} disabled={isPending} className="text-[11px] h-7 px-2" title="Revoke Sub-Admin access" aria-label={`Revoke access for ${subAdmin.name}`}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <PaginationNav
        page={page.page}
        pageCount={page.pageCount}
        total={page.total}
        hrefFor={(target) => buildHref({ page: target })}
        label="Sub-admin pages"
        itemLabel="accounts"
      />

    </div>
  );
}
