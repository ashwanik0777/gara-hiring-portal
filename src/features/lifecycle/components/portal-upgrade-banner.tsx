"use client";

import React, { useCallback, useSyncExternalStore } from "react";
import { Sparkles, X } from "lucide-react";

interface PortalUpgradeBannerProps {
  stage: string;
  stageLabel: string;
  upgradedAt: string;
  unlocked: string[];
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

/**
 * Announces a lifecycle upgrade (e.g. candidate → intern) and the features it unlocked.
 * Dismissal is a per-browser convenience stored in localStorage; the banner also stops
 * appearing on its own after the announcement window chosen by the server.
 */
export function PortalUpgradeBanner({ stage, stageLabel, upgradedAt, unlocked }: PortalUpgradeBannerProps) {
  const storageKey = `gara_portal_upgrade_seen:${stage}:${upgradedAt}`;

  const dismissed = useSyncExternalStore(
    subscribe,
    () => {
      try {
        return window.localStorage.getItem(storageKey) === "1";
      } catch {
        return false;
      }
    },
    // Hidden during server rendering so a dismissed banner never flashes.
    () => true
  );

  const dismiss = useCallback(() => {
    try {
      window.localStorage.setItem(storageKey, "1");
    } catch {
      // Storage unavailable (private mode): the banner simply stays until reload.
    }
    window.dispatchEvent(new StorageEvent("storage", { key: storageKey }));
  }, [storageKey]);

  if (dismissed) {
    return null;
  }

  const title =
    stage === "EVALUATION"
      ? "You have been selected for the supervised internship evaluation"
      : `Welcome to the GARA team as ${stageLabel === "Intern" ? "an" : "a"} ${stageLabel}!`;

  return (
    <section
      aria-label="Portal upgrade"
      className="relative flex flex-col gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-50 p-4 pr-12 text-emerald-950 sm:flex-row sm:items-center dark:bg-emerald-950/40 dark:text-emerald-50"
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white">
        <Sparkles className="h-5 w-5" aria-hidden="true" />
      </div>
      <div className="min-w-0 space-y-1.5">
        <p className="text-sm font-bold">{title}</p>
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="font-medium text-emerald-800 dark:text-emerald-200">New in your portal:</span>
          {unlocked.map((feature) => (
            <span
              key={feature}
              className="rounded-full border border-emerald-600/30 bg-white/70 px-2 py-0.5 font-semibold dark:bg-emerald-900/60"
            >
              {feature}
            </span>
          ))}
        </div>
      </div>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss announcement"
        className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-lg text-emerald-800 hover:bg-emerald-600/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 dark:text-emerald-200"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </section>
  );
}
