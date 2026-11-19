"use client";

import { useEffect } from "react";

const SESSION_TRACKED_KEY = "gara_visit_tracked";

function readSessionFlag(): boolean {
  try {
    return window.sessionStorage.getItem(SESSION_TRACKED_KEY) === "1";
  } catch {
    return false;
  }
}

function writeSessionFlag(): void {
  try {
    window.sessionStorage.setItem(SESSION_TRACKED_KEY, "1");
  } catch {
    // Ignore storage errors (private mode).
  }
}

/**
 * Records the visit for the admin visitor report, at most once per browser session.
 * Renders nothing: the count is internal analytics and is not shown on the public site.
 */
export function VisitorBeacon() {
  useEffect(() => {
    if (readSessionFlag()) return;
    fetch("/api/analytics/visitors", { method: "POST", keepalive: true })
      .then((response) => {
        if (response.ok) writeSessionFlag();
      })
      .catch(() => {
        // Analytics must never affect the page.
      });
  }, []);

  return null;
}
