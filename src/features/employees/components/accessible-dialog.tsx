"use client";

import React, { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

interface AccessibleDialogProps {
  open: boolean;
  onClose: () => void;
  /** Id of the heading that names the dialog. */
  labelledBy: string;
  /** Optional id of the text that describes the dialog. */
  describedBy?: string;
  /** While true (e.g. a request is running) Escape does not close the dialog. */
  busy?: boolean;
  className?: string;
  children: React.ReactNode;
}

/**
 * Modal dialog built on the native `<dialog>` element: `showModal()` makes the rest of the
 * page inert, keeps keyboard focus inside the dialog, closes on Escape and returns focus to
 * the element that opened it.
 */
export function AccessibleDialog({
  open,
  onClose,
  labelledBy,
  describedBy,
  busy = false,
  className,
  children,
}: AccessibleDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      if (typeof dialog.showModal === "function") {
        dialog.showModal();
      } else {
        dialog.setAttribute("open", "");
      }
    } else if (!open && dialog.open) {
      if (typeof dialog.close === "function") {
        dialog.close();
      } else {
        dialog.removeAttribute("open");
      }
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      onCancel={(event) => {
        // Escape: keep React in control of the open state.
        event.preventDefault();
        if (!busy) onClose();
      }}
      className={cn(
        "m-auto w-[calc(100%-2rem)] max-w-xl max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-xl border border-border bg-card p-0 text-foreground shadow-lg backdrop:bg-black/60",
        className
      )}
    >
      {open ? children : null}
    </dialog>
  );
}
