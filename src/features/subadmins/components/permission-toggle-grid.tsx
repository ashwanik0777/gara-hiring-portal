"use client";

import React from "react";
import { Check, X } from "lucide-react";
import { MODULE_CONFIGS } from "./subadmin-ui";
import type { SubAdminPermissionFlags } from "../types";

/** Nine module toggles shared by the create and edit dialogs. */
export function PermissionToggleGrid({
  labelledBy,
  permissions,
  onToggle,
}: {
  labelledBy: string;
  permissions: SubAdminPermissionFlags;
  onToggle: (key: keyof SubAdminPermissionFlags) => void;
}) {
  return (
    <div role="group" aria-labelledby={labelledBy} className="grid grid-cols-1 sm:grid-cols-3 gap-2">
      {MODULE_CONFIGS.map(({ key, label, desc, icon: ModIcon }) => {
        const checked = permissions[key];
        return (
          <button
            key={key}
            type="button"
            aria-pressed={checked}
            onClick={() => onToggle(key)}
            className={`p-2.5 rounded-xl border text-left flex flex-col justify-between transition-all cursor-pointer ${
              checked
                ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-950 dark:text-emerald-200 shadow-2xs"
                : "bg-muted/20 border-border/70 text-muted-foreground hover:bg-muted/50"
            }`}
          >
            <div className="flex items-center justify-between w-full mb-1">
              <div className="flex items-center gap-1.5">
                <ModIcon className={`h-3.5 w-3.5 ${checked ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}`} />
                <span className="font-bold text-xs text-foreground">{label}</span>
              </div>
              <div
                className={`h-4 w-4 rounded-full flex items-center justify-center shrink-0 ${
                  checked ? "bg-emerald-500 text-white" : "bg-muted border border-border text-muted-foreground"
                }`}
              >
                {checked ? <Check className="h-2.5 w-2.5 stroke-[3]" /> : <X className="h-2.5 w-2.5 stroke-[2]" />}
              </div>
            </div>
            <span className="text-[10px] text-muted-foreground line-clamp-1">{desc}</span>
          </button>
        );
      })}
    </div>
  );
}
