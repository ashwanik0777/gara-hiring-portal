"use client";

import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";

/*
 * Which sidebar groups the viewer has collapsed, remembered in this browser (a per-viewer
 * convenience, never shared or read by the server). Every group starts open, and the server
 * render shows them open, so hydration always matches; the remembered state applies right
 * after. If browser storage is blocked, the choice still works for the rest of the visit.
 */

const CHANGE_EVENT = "dashboard-nav-groups-change";
const fallbackStore = new Map<string, string>();

function readStored(key: string): string {
  try {
    return window.localStorage.getItem(key) ?? "";
  } catch {
    return fallbackStore.get(key) ?? "";
  }
}

function writeStored(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    fallbackStore.set(key, value);
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, onChange);
  // Another tab of the same portal changed its groups.
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

function parseGroups(raw: string): string[] {
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
  } catch {
    return [];
  }
}

export function navGroupsStorageKey(portal: string): string {
  return `gara:sidebar-collapsed-groups:${portal.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
}

/**
 * Open/closed state of the sidebar's titled groups for one portal. When the current page
 * moves into a collapsed group, that group opens so the page's link is visible.
 */
export function useCollapsedNavGroups(portal: string, activeGroup: string | null) {
  const key = navGroupsStorageKey(portal);
  const raw = useSyncExternalStore(subscribe, () => readStored(key), () => "");
  const collapsed = useMemo(() => new Set(parseGroups(raw)), [raw]);

  const setGroupOpen = useCallback(
    (group: string, open: boolean) => {
      const next = new Set(parseGroups(readStored(key)));
      if (open) {
        next.delete(group);
      } else {
        next.add(group);
      }
      writeStored(key, JSON.stringify([...next]));
    },
    [key]
  );

  useEffect(() => {
    if (activeGroup && parseGroups(readStored(key)).includes(activeGroup)) {
      setGroupOpen(activeGroup, true);
    }
  }, [activeGroup, key, setGroupOpen]);

  const isOpen = useCallback((group: string) => !collapsed.has(group), [collapsed]);
  const toggle = useCallback((group: string) => setGroupOpen(group, collapsed.has(group)), [collapsed, setGroupOpen]);

  return { isOpen, toggle };
}
