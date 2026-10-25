"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ApplicationStatus } from "@/types/enums";

/** One application of the current list page that can be selected for a bulk action. */
export interface BulkSelectableApplication {
  id: string;
  referenceCode: string;
  candidateName: string;
  status: ApplicationStatus;
  /** Stages staff may set by hand from the current stage (computed on the server). */
  manualTargets: ApplicationStatus[];
}

interface BulkSelectionContextValue {
  items: BulkSelectableApplication[];
  selectedItems: BulkSelectableApplication[];
  isSelected: (id: string) => boolean;
  toggle: (id: string) => void;
  selectPage: () => void;
  clear: () => void;
}

const BulkSelectionContext = createContext<BulkSelectionContextValue | null>(null);

export function useBulkSelection(): BulkSelectionContextValue {
  const value = useContext(BulkSelectionContext);
  if (!value) {
    throw new Error("useBulkSelection must be used inside BulkSelectionProvider.");
  }
  return value;
}

/**
 * Holds the checkbox selection for the applications shown on the current page. The
 * selection is always intersected with the page's items, so changing the page or the
 * filters never keeps applications the user can no longer see selected.
 */
export function BulkSelectionProvider({
  items,
  children,
}: {
  items: BulkSelectableApplication[];
  children: React.ReactNode;
}) {
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(() => new Set());

  const selectedItems = useMemo(
    () => items.filter((item) => selectedIds.has(item.id)),
    [items, selectedIds]
  );

  const toggle = useCallback((id: string) => {
    setSelectedIds((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectPage = useCallback(() => {
    setSelectedIds(new Set(items.map((item) => item.id)));
  }, [items]);

  const clear = useCallback(() => setSelectedIds(new Set()), []);

  const value = useMemo<BulkSelectionContextValue>(
    () => ({
      items,
      selectedItems,
      isSelected: (id: string) => selectedItems.some((item) => item.id === id),
      toggle,
      selectPage,
      clear,
    }),
    [items, selectedItems, toggle, selectPage, clear]
  );

  return <BulkSelectionContext.Provider value={value}>{children}</BulkSelectionContext.Provider>;
}

/** Row checkbox; `label` names the application for screen readers. */
export function BulkSelectCheckbox({ applicationId, label }: { applicationId: string; label: string }) {
  const { isSelected, toggle } = useBulkSelection();
  return (
    <input
      type="checkbox"
      checked={isSelected(applicationId)}
      onChange={() => toggle(applicationId)}
      aria-label={label}
      className="h-4 w-4 shrink-0 cursor-pointer rounded border-border accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
    />
  );
}

/** "Select all on this page" (tri-state) plus a clear button. */
export function BulkSelectPageToggle() {
  const { items, selectedItems, selectPage, clear } = useBulkSelection();
  const checkboxRef = useRef<HTMLInputElement>(null);
  const allSelected = items.length > 0 && selectedItems.length === items.length;
  const someSelected = selectedItems.length > 0 && !allSelected;

  useEffect(() => {
    if (checkboxRef.current) {
      checkboxRef.current.indeterminate = someSelected;
    }
  }, [someSelected]);

  if (items.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-3 text-xs">
      <label className="inline-flex cursor-pointer items-center gap-2 font-semibold text-foreground">
        <input
          ref={checkboxRef}
          type="checkbox"
          checked={allSelected}
          onChange={() => (allSelected ? clear() : selectPage())}
          className="h-4 w-4 cursor-pointer rounded border-border accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
        />
        Select all on this page ({items.length})
      </label>
      {selectedItems.length > 0 && (
        <button
          type="button"
          onClick={clear}
          className="rounded-lg px-2 py-1 font-semibold text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          Clear selection
        </button>
      )}
    </div>
  );
}
