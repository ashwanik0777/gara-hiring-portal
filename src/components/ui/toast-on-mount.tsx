"use client";

import * as React from "react";
import { toast, type ToastKind } from "./toast";

/**
 * Shows one toast when a page opens after a redirect (e.g. `?paid=1`), then removes that query
 * parameter from the address bar so a refresh does not show it again. Renders nothing.
 */
export function ToastOnMount({ message, kind = "success", clearParam }: { message: string; kind?: ToastKind; clearParam?: string }) {
  const shown = React.useRef(false);
  React.useEffect(() => {
    if (shown.current) return;
    shown.current = true;
    toast[kind](message);
    if (clearParam) {
      const url = new URL(window.location.href);
      if (url.searchParams.has(clearParam)) {
        url.searchParams.delete(clearParam);
        window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
      }
    }
  }, [message, kind, clearParam]);
  return null;
}
