import React from "react";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Honest fallback for a streamed section whose query failed: no fake zeros or empty lists,
 * just a friendly notice (the technical error is logged on the server by `toActionError`).
 */
export function SectionUnavailable({
  title,
  message,
  className,
}: {
  title?: string;
  message: string;
  className?: string;
}) {
  return (
    <div
      role="status"
      className={cn(
        "flex items-start gap-3 rounded-xl border border-warning/30 bg-warning/5 p-4 text-xs text-foreground",
        className
      )}
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
      <div className="space-y-0.5">
        {title && <p className="font-semibold">{title}</p>}
        <p className="text-muted-foreground">{message}</p>
      </div>
    </div>
  );
}
