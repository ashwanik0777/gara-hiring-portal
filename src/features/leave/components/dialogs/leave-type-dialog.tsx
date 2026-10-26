"use client";

import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Settings2, X, Loader2 } from "lucide-react";

export interface LeaveTypeDraft {
  code: string;
  name: string;
  description: string;
  isPaid: boolean;
  requiresApproval: boolean;
}

interface LeaveTypeDialogProps {
  isPending: boolean;
  onClose: () => void;
  onSubmit: (draft: LeaveTypeDraft) => void;
}

/** Create-category form (ADMIN, or HR with `canLeave`). Loaded on demand. */
export function LeaveTypeDialog({ isPending, onClose, onSubmit }: LeaveTypeDialogProps) {
  const [draft, setDraft] = useState<LeaveTypeDraft>({
    code: "",
    name: "",
    description: "",
    isPaid: true,
    requiresApproval: true,
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isPending) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isPending, onClose]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(draft);
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="leave-type-dialog-title"
    >
      <div className="bg-card border border-border/80 rounded-2xl w-full max-w-md shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="p-5 border-b border-border/60 flex items-center justify-between bg-muted/20">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
              <Settings2 className="h-4 w-4" />
            </div>
            <div>
              <h3 id="leave-type-dialog-title" className="font-semibold text-foreground text-sm">
                Create Leave Category
              </h3>
              <p className="text-xs text-muted-foreground">Define a new organization policy type</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground"
            aria-label="Close dialog"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="p-5 space-y-3.5 text-xs">
            <div>
              <label htmlFor="leave-management-client-create-type-category-code" className="block font-semibold text-foreground mb-1">
                Category Code <span className="text-destructive">*</span>
              </label>
              <Input
                id="leave-management-client-create-type-category-code"
                placeholder="e.g. COMP_OFF, STUDY, STUDY_LEAVE"
                value={draft.code}
                onChange={(e) => setDraft({ ...draft, code: e.target.value.toUpperCase() })}
                className="h-9 text-xs rounded-xl font-mono uppercase"
                required
              />
              <p className="text-[10px] text-muted-foreground mt-0.5">
                Unique uppercase key (A-Z, numbers, underscores).
              </p>
            </div>

            <div>
              <label htmlFor="leave-management-client-create-type-display-name" className="block font-semibold text-foreground mb-1">
                Display Name <span className="text-destructive">*</span>
              </label>
              <Input
                id="leave-management-client-create-type-display-name"
                placeholder="e.g. Compensatory Off, Sabbatical"
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                className="h-9 text-xs rounded-xl"
                required
              />
            </div>

            <div>
              <label htmlFor="leave-management-client-create-type-policy-description" className="block font-semibold text-foreground mb-1">
                Policy Description
              </label>
              <textarea
                id="leave-management-client-create-type-policy-description"
                rows={2}
                placeholder="Eligibility, purpose, or conditions for this leave..."
                value={draft.description}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                className="w-full p-2.5 rounded-xl border border-border/80 bg-background text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary placeholder:text-muted-foreground"
              />
            </div>

            <div className="flex items-center gap-4 pt-1">
              <label className="flex items-center gap-2 cursor-pointer font-medium text-foreground">
                <input
                  type="checkbox"
                  checked={draft.isPaid}
                  onChange={(e) => setDraft({ ...draft, isPaid: e.target.checked })}
                  className="rounded border-border text-primary focus:ring-primary h-4 w-4"
                />
                <span>Paid Leave</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer font-medium text-foreground">
                <input
                  type="checkbox"
                  checked={draft.requiresApproval}
                  onChange={(e) => setDraft({ ...draft, requiresApproval: e.target.checked })}
                  className="rounded border-border text-primary focus:ring-primary h-4 w-4"
                />
                <span>Requires Approval</span>
              </label>
            </div>
          </div>

          <div className="p-4 bg-muted/20 border-t border-border/60 flex items-center justify-end gap-2.5">
            <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={isPending} className="rounded-xl text-xs h-8">
              Cancel
            </Button>
            <Button type="submit" disabled={isPending} size="sm" className="rounded-xl text-xs h-8 shadow-xs">
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
  );
}
