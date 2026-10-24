"use client";

import React, { useEffect, useState } from "react";
import { Users } from "lucide-react";

interface VisitorCounterProps {
  className?: string;
}

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
    // Ignore storage errors (private mode)
  }
}

async function fetchCount(method: "GET" | "POST"): Promise<number | null> {
  const res = await fetch("/api/analytics/visitors", { method });
  if (!res.ok) return null;
  const data = (await res.json()) as { count?: unknown };
  return typeof data.count === "number" ? data.count : null;
}

/**
 * Shows the number of distinct visitors recorded by the site. The figure is an
 * approximation (cookie / hashed-IP deduplication, bots excluded) and is hidden
 * entirely when it cannot be loaded — no fallback number is ever displayed.
 */
export function VisitorCounter({ className = "" }: VisitorCounterProps) {
  const [count, setCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    async function recordAndFetchVisitors() {
      try {
        // Record the visit at most once per browser session; otherwise just read.
        let value: number | null = null;
        if (!readSessionFlag()) {
          value = await fetchCount("POST");
          if (value !== null) writeSessionFlag();
        }
        if (value === null) {
          value = await fetchCount("GET");
        }
        if (isMounted) setCount(value);
      } catch {
        if (isMounted) setCount(null);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    recordAndFetchVisitors();

    return () => {
      isMounted = false;
    };
  }, []);

  if (!loading && count === null) {
    return null;
  }

  return (
    <div
      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-card border border-border/80 shadow-2xs w-fit ${className}`}
      title="Approximate number of distinct visitors recorded by this site (automated traffic excluded)"
    >
      <Users className="h-3.5 w-3.5 text-primary shrink-0" />
      <span className="text-[11px] text-muted-foreground font-medium select-none">
        Recorded visitors:
      </span>
      <span className="text-xs font-bold font-mono text-foreground tracking-tight">
        {loading || count === null ? (
          <span className="inline-block w-8 h-3 bg-muted/60 rounded animate-pulse" />
        ) : (
          count.toLocaleString()
        )}
      </span>
    </div>
  );
}
