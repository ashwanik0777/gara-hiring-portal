"use client";

import * as React from "react";
import { useLinkStatus } from "next/link";
import { cn } from "@/lib/utils";

/*
 * Route-transition feedback for the public site.
 *
 * `useLinkStatus` only works inside a <Link>, so each main link renders a
 * <LinkPendingReporter /> child that reports its pending state to a tiny shared store, and
 * <NavigationProgressBar /> (mounted once by the Navbar) shows a thin bar at the top of the
 * viewport while any navigation is still waiting on the server. Prefetched and cached
 * routes skip the pending state entirely, so the bar only appears when a transition really
 * takes time; the store delays it briefly to hide near-instant ones.
 */

type Phase = "idle" | "loading" | "done";

/** Transitions shorter than this never show the bar. */
const SHOW_DELAY_MS = 120;
/** The completed bar stays visible this long before it disappears. */
const DONE_VISIBLE_MS = 240;

const listeners = new Set<() => void>();
let pendingLinks = 0;
let phase: Phase = "idle";
let showTimer: ReturnType<typeof setTimeout> | undefined;
let hideTimer: ReturnType<typeof setTimeout> | undefined;

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getPhase(): Phase {
  return phase;
}

function getServerPhase(): Phase {
  return "idle";
}

function setPhase(next: Phase): void {
  if (phase === next) return;
  phase = next;
  listeners.forEach((listener) => listener());
}

function changePending(delta: 1 | -1): void {
  pendingLinks = Math.max(0, pendingLinks + delta);

  if (pendingLinks > 0) {
    clearTimeout(hideTimer);
    hideTimer = undefined;
    if (phase === "done") {
      setPhase("loading");
    } else if (phase === "idle" && showTimer === undefined) {
      showTimer = setTimeout(() => {
        showTimer = undefined;
        if (pendingLinks > 0) setPhase("loading");
      }, SHOW_DELAY_MS);
    }
    return;
  }

  clearTimeout(showTimer);
  showTimer = undefined;
  if (phase === "loading") {
    setPhase("done");
    hideTimer = setTimeout(() => {
      hideTimer = undefined;
      setPhase("idle");
    }, DONE_VISIBLE_MS);
  }
}

/** Current state of the shared progress indicator. */
export function useNavigationPhase(): Phase {
  return React.useSyncExternalStore(subscribe, getPhase, getServerPhase);
}

/** Renders nothing; place it inside a <Link> so the progress bar knows about that link. */
export function LinkPendingReporter() {
  const { pending } = useLinkStatus();

  React.useEffect(() => {
    if (!pending) return;
    changePending(1);
    return () => changePending(-1);
  }, [pending]);

  return null;
}

export function NavigationProgressBar() {
  const current = useNavigationPhase();

  if (current === "idle") {
    return null;
  }

  const loading = current === "loading";

  return (
    <div
      role="progressbar"
      aria-label="Loading page"
      aria-busy={loading}
      aria-valuetext={loading ? "Loading" : "Loaded"}
      className="pointer-events-none fixed inset-x-0 top-0 z-[60] h-0.5"
    >
      <div
        className={cn(
          "h-full w-full bg-primary transition-opacity duration-200",
          loading &&
            "bg-[linear-gradient(90deg,transparent_0%,var(--primary)_40%,var(--primary)_60%,transparent_100%)] bg-[length:200%_100%] motion-safe:animate-shimmer"
        )}
      />
    </div>
  );
}
