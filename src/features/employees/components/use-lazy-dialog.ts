"use client";

import { useState, useTransition } from "react";

/**
 * State for a dialog whose panel is loaded on first use (`React.lazy`). `show` runs inside a
 * transition, so while the panel's chunk downloads the trigger shows a pending state instead of
 * the page falling back to its loading skeleton. Once requested, the panel stays mounted so a
 * second open is instant and the native <dialog> returns focus to the trigger on close.
 */
export function useLazyDialog() {
  const [open, setOpen] = useState(false);
  const [requested, setRequested] = useState(false);
  const [isPending, startTransition] = useTransition();

  const show = () => {
    startTransition(() => {
      setRequested(true);
      setOpen(true);
    });
  };
  const close = () => setOpen(false);

  return { open, requested, isPending, show, close };
}
