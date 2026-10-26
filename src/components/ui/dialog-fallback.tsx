import * as React from "react";

/**
 * Overlay shown while a lazily loaded dialog's code is fetched, so the trigger gives
 * immediate feedback. Announced as a busy status region.
 */
export function DialogFallback({ label = "Loading dialog" }: { label?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs"
    >
      <div className="flex items-center gap-3 rounded-2xl border border-border/80 bg-card px-6 py-5 text-xs text-muted-foreground shadow-xl">
        <span
          aria-hidden="true"
          className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
        />
        <span>{label}</span>
      </div>
    </div>
  );
}
