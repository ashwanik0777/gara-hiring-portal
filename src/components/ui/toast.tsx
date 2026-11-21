"use client";

import * as React from "react";
import { CheckCircle2, Info, X, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

/*
 * Small app-wide toasts for confirmations ("Programme saved.", "Interview scheduled.").
 * `toast.success(message)` can be called from any client component; <Toaster /> (mounted once in
 * the root layout) shows them top-right, announces them politely to screen readers and removes
 * them after a few seconds. Form validation errors stay next to the form, not in toasts.
 */

export type ToastKind = "success" | "error" | "info";

export interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
}

const MAX_VISIBLE = 4;
const DURATION_MS: Record<ToastKind, number> = { success: 4000, info: 5000, error: 7000 };

let items: ToastItem[] = [];
let nextId = 0;
const listeners = new Set<() => void>();
const EMPTY: ToastItem[] = [];

function emit() {
  for (const listener of listeners) listener();
}

function dismiss(id: number) {
  if (!items.some((item) => item.id === id)) return;
  items = items.filter((item) => item.id !== id);
  emit();
}

function push(kind: ToastKind, message: string): number {
  const id = ++nextId;
  items = [...items, { id, kind, message }].slice(-MAX_VISIBLE);
  emit();
  if (typeof window !== "undefined") {
    window.setTimeout(() => dismiss(id), DURATION_MS[kind]);
  }
  return id;
}

export const toast = {
  success: (message: string) => push("success", message),
  info: (message: string) => push("info", message),
  error: (message: string) => push("error", message),
  dismiss,
};

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const KIND_STYLE: Record<ToastKind, { icon: typeof CheckCircle2; iconClass: string; label: string }> = {
  success: { icon: CheckCircle2, iconClass: "text-emerald-600 dark:text-emerald-400", label: "Success" },
  info: { icon: Info, iconClass: "text-primary", label: "Notice" },
  error: { icon: XCircle, iconClass: "text-destructive", label: "Error" },
};

/** The toast stack; mounted once in the root layout. */
export function Toaster() {
  const list = React.useSyncExternalStore(subscribe, () => items, () => EMPTY);
  return (
    <section
      aria-label="Notifications"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 top-20 z-[100] flex flex-col items-center gap-2 px-3 sm:inset-x-auto sm:right-6 sm:top-24 sm:items-end"
    >
      {list.map((item) => {
        const style = KIND_STYLE[item.kind];
        const Icon = style.icon;
        return (
          <div
            key={item.id}
            className={cn(
              "pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border bg-card p-3.5 text-sm text-foreground shadow-lg motion-safe:animate-fade-in-down",
              item.kind === "error" ? "border-destructive/30" : "border-border"
            )}
          >
            <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", style.iconClass)} aria-hidden="true" />
            <p className="min-w-0 flex-1 leading-snug">
              <span className="sr-only">{style.label}: </span>
              {item.message}
            </p>
            <button
              type="button"
              onClick={() => dismiss(item.id)}
              className="-m-1 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="sr-only">Dismiss notification</span>
            </button>
          </div>
        );
      })}
    </section>
  );
}
