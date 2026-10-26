"use client";

import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ShieldCheck, X, User, Mail, Lock, Loader2 } from "lucide-react";
import { PermissionToggleGrid } from "./permission-toggle-grid";
import { ROLE_PRESETS, STAFF_ROLE_OPTIONS, type StaffRole } from "./subadmin-ui";
import type { SubAdminPermissionFlags } from "../types";

export interface CreateSubAdminValues {
  name: string;
  email: string;
  password: string;
  role: StaffRole;
  permissions: SubAdminPermissionFlags;
}

interface CreateSubAdminDialogProps {
  isPending: boolean;
  errorMsg: string | null;
  onClose: () => void;
  onSubmit: (values: CreateSubAdminValues) => void;
}

/** Provision form for a new sub-admin account. Loaded on demand. */
export function CreateSubAdminDialog({ isPending, errorMsg, onClose, onSubmit }: CreateSubAdminDialogProps) {
  const [form, setForm] = useState<CreateSubAdminValues>({
    name: "",
    email: "",
    password: "",
    role: "HR",
    permissions: ROLE_PRESETS.HR,
  });

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

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in-50 duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isPending) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-subadmin-title"
    >
      <div className="relative w-full max-w-2xl bg-card border border-border/80 shadow-2xl rounded-2xl p-5 sm:p-6 overflow-hidden max-h-[90vh] overflow-y-auto animate-in zoom-in-95 duration-150 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-border/60">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <ShieldCheck className="h-4 w-4" />
            </div>
            <div>
              <h3 id="create-subadmin-title" className="text-sm font-bold text-foreground">Provision New Sub-Admin Account</h3>
              <p className="text-[11px] text-muted-foreground">Assign role and granular permissions for delegate access</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground h-8 w-8 rounded-lg hover:bg-muted/60 flex items-center justify-center transition-colors cursor-pointer"
            aria-label="Close form"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {errorMsg && (
          <div role="alert" className="p-3 rounded-xl border border-destructive/20 bg-destructive/10 text-destructive text-xs">
            {errorMsg}
          </div>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit(form);
          }}
          className="space-y-4 pt-1"
        >
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label htmlFor="sub-admin-management-client-create-full-name" className="text-[11px] font-semibold text-muted-foreground block mb-1">
                Full Name
              </label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <input
                  id="sub-admin-management-client-create-full-name"
                  type="text"
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. Priya Sharma"
                  className="w-full pl-8 pr-3 py-2 text-xs rounded-xl border border-border bg-background text-foreground focus:ring-1 focus:ring-primary focus:outline-hidden"
                />
              </div>
            </div>
            <div>
              <label htmlFor="sub-admin-management-client-create-email-address" className="text-[11px] font-semibold text-muted-foreground block mb-1">
                Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <input
                  id="sub-admin-management-client-create-email-address"
                  type="email"
                  required
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="e.g. priya.hr@gara.io"
                  className="w-full pl-8 pr-3 py-2 text-xs rounded-xl border border-border bg-background text-foreground focus:ring-1 focus:ring-primary focus:outline-hidden"
                />
              </div>
            </div>
            <div>
              <label htmlFor="sub-admin-management-client-create-temporary-password" className="text-[11px] font-semibold text-muted-foreground block mb-1">
                Temporary Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <input
                  id="sub-admin-management-client-create-temporary-password"
                  type="password"
                  required
                  minLength={10}
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  placeholder="Min 10 characters"
                  className="w-full pl-8 pr-3 py-2 text-xs rounded-xl border border-border bg-background text-foreground focus:ring-1 focus:ring-primary focus:outline-hidden"
                />
              </div>
            </div>
          </div>

          <div>
            <p id="subadmin-create-role-label" className="text-[11px] font-semibold text-muted-foreground block mb-1.5">
              Staff Role & Baseline Preset
            </p>
            <div role="group" aria-labelledby="subadmin-create-role-label" className="flex flex-wrap gap-2">
              {STAFF_ROLE_OPTIONS.map((r) => (
                <button
                  key={r}
                  type="button"
                  aria-pressed={form.role === r}
                  onClick={() => setForm({ ...form, role: r, permissions: ROLE_PRESETS[r] })}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                    form.role === r
                      ? "bg-primary text-primary-foreground border-primary shadow-xs"
                      : "bg-background text-muted-foreground border-border hover:bg-muted"
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p id="subadmin-create-permissions-label" className="text-[11px] font-semibold text-muted-foreground block mb-1.5">
              Granular Module Permissions
            </p>
            <PermissionToggleGrid
              labelledBy="subadmin-create-permissions-label"
              permissions={form.permissions}
              onToggle={(key) =>
                setForm({ ...form, permissions: { ...form.permissions, [key]: !form.permissions[key] } })
              }
            />
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-border/60">
            <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={isPending} className="text-xs">
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={isPending} className="text-xs">
              {isPending ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Provisioning...
                </>
              ) : (
                "Create Sub-Admin Account"
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
