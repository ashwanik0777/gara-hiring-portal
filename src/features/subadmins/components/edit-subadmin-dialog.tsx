"use client";

import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck, X, Loader2, CheckCircle2 } from "lucide-react";
import { PermissionToggleGrid } from "./permission-toggle-grid";
import { ALL_MODULES, NO_MODULES, ROLE_PRESETS, STAFF_ROLE_OPTIONS, initialsOf, isStaffRole } from "./subadmin-ui";
import type { SubAdminItem } from "../types";

interface EditSubAdminDialogProps {
  subAdmin: SubAdminItem;
  isPending: boolean;
  onClose: () => void;
  onSave: (updated: SubAdminItem) => void;
}

/** Role and module permission editor for one sub-admin. Loaded on demand. */
export function EditSubAdminDialog({ subAdmin, isPending, onClose, onSave }: EditSubAdminDialogProps) {
  const [draft, setDraft] = useState<SubAdminItem>(subAdmin);

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
      aria-labelledby="edit-subadmin-title"
    >
      <div className="relative w-full max-w-xl bg-card border border-border/80 shadow-2xl rounded-2xl p-5 sm:p-6 overflow-hidden max-h-[90vh] overflow-y-auto animate-in zoom-in-95 duration-150 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-border/60">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <ShieldCheck className="h-4 w-4" />
            </div>
            <div>
              <h3 id="edit-subadmin-title" className="text-sm font-bold text-foreground">Configure Sub-Admin Permissions</h3>
              <p className="text-[11px] text-muted-foreground">Customize role and granular module authorizations</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground h-8 w-8 rounded-lg hover:bg-muted/60 flex items-center justify-center transition-colors cursor-pointer"
            aria-label="Close modal"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex items-center justify-between p-3 rounded-xl bg-muted/40 border border-border/60">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/60 dark:text-blue-300 font-bold text-xs flex items-center justify-center shrink-0 border border-blue-200 dark:border-blue-800">
              {initialsOf(draft.name)}
            </div>
            <div>
              <div className="font-bold text-xs text-foreground">{draft.name}</div>
              <div className="text-[10px] text-muted-foreground font-mono">{draft.email}</div>
            </div>
          </div>
          <Badge variant="outline" className="text-[10px] uppercase font-mono font-bold">{draft.role}</Badge>
        </div>

        <div>
          <p id="subadmin-edit-role-label" className="text-[11px] font-semibold text-muted-foreground block mb-1.5">
            Staff Role & Baseline Preset
          </p>
          <div role="group" aria-labelledby="subadmin-edit-role-label" className="flex flex-wrap gap-2">
            {STAFF_ROLE_OPTIONS.map((r) => (
              <button
                key={r}
                type="button"
                aria-pressed={draft.role === r}
                onClick={() => setDraft({ ...draft, role: r, permissions: ROLE_PRESETS[r] })}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                  draft.role === r
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
          <div className="flex items-center justify-between mb-1.5">
            <p id="subadmin-edit-permissions-label" className="text-[11px] font-semibold text-muted-foreground block">
              Active Module Permissions
            </p>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setDraft({ ...draft, permissions: ALL_MODULES })} className="text-[10px] text-primary hover:underline font-medium cursor-pointer">
                Select All
              </button>
              <span className="text-muted-foreground text-xs">•</span>
              <button type="button" onClick={() => setDraft({ ...draft, permissions: NO_MODULES })} className="text-[10px] text-muted-foreground hover:underline font-medium cursor-pointer">
                Clear All
              </button>
            </div>
          </div>
          <PermissionToggleGrid
            labelledBy="subadmin-edit-permissions-label"
            permissions={draft.permissions}
            onToggle={(key) => setDraft({ ...draft, permissions: { ...draft.permissions, [key]: !draft.permissions[key] } })}
          />
        </div>

        <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-border/60">
          <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={isPending} className="text-xs">
            Cancel
          </Button>
          <Button type="button" size="sm" onClick={() => onSave(draft)} disabled={isPending || !isStaffRole(draft.role)} className="text-xs">
            {isPending ? (
              <>
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Saving...
              </>
            ) : (
              <>
                <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" /> Save Permissions
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
