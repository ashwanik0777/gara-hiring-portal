"use client";

import React, { useEffect, useRef, useState } from "react";
import { Check, X } from "lucide-react";
import { searchReportingManagersAction } from "../actions";
import type { ReportingManagerOption } from "../types";

/** The chosen manager (null = no manager). */
export interface ReportingManagerChoice {
  id: string;
  label: string;
}

/** Option data the picker needs (the designation is optional for preloaded options). */
export type ReportingManagerPickerOption = Pick<ReportingManagerOption, "id" | "employeeCode" | "name"> & {
  designation?: string;
};

interface ReportingManagerComboboxProps {
  /** Id of the text input; the visible `<label htmlFor>` points at it. */
  inputId: string;
  /** The employee being edited (never offered as their own manager). */
  excludeEmployeeId: string;
  value: ReportingManagerChoice | null;
  onChange: (choice: ReportingManagerChoice | null) => void;
  /** Options already loaded by the page, shown on focus without a round trip. */
  initialOptions?: ReportingManagerPickerOption[];
  disabled?: boolean;
}

export const REPORTING_MANAGER_MIN_QUERY = 2;
export const REPORTING_MANAGER_DEBOUNCE_MS = 250;
/** Options shown on focus before anything is typed. */
const FIRST_OPTIONS_LIMIT = 20;
const NO_MANAGER_LABEL = "No manager (direct / root)";

type SearchStatus = "idle" | "loading" | "ready" | "short" | "error";

type PickerEntry = { kind: "none" } | { kind: "manager"; option: ReportingManagerPickerOption };

export function formatReportingManagerLabel(option: Pick<ReportingManagerOption, "name" | "employeeCode">): string {
  return `${option.name} (${option.employeeCode})`;
}

/**
 * Accessible combobox (ARIA 1.2 list autocomplete) for the reporting manager: type at least
 * two characters to search the server (debounced), or focus the field to see the first
 * options. Arrow keys move through the list, Enter chooses, Escape closes; the result count
 * is announced in a polite live region. "No manager" is always the first option.
 */
export function ReportingManagerCombobox({
  inputId,
  excludeEmployeeId,
  value,
  onChange,
  initialOptions,
  disabled = false,
}: ReportingManagerComboboxProps) {
  const listboxId = `${inputId}-listbox`;
  const statusId = `${inputId}-status`;
  const optionId = (index: number) => `${inputId}-option-${index}`;

  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestSeqRef = useRef(0);
  const firstOptionsRef = useRef<ReportingManagerPickerOption[] | null>(
    initialOptions
      ? initialOptions.filter((option) => option.id !== excludeEmployeeId).slice(0, FIRST_OPTIONS_LIMIT)
      : null
  );

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ReportingManagerPickerOption[]>([]);
  const [status, setStatus] = useState<SearchStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [showingFirstOptions, setShowingFirstOptions] = useState(false);

  const entries: PickerEntry[] = [
    { kind: "none" },
    ...results.map((option) => ({ kind: "manager" as const, option })),
  ];

  useEffect(
    () => () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    },
    []
  );

  // Keep the active option visible while moving through a long list.
  useEffect(() => {
    if (!open) return;
    const element = document.getElementById(`${inputId}-option-${activeIndex}`);
    if (element && typeof element.scrollIntoView === "function") {
      element.scrollIntoView({ block: "nearest" });
    }
  }, [activeIndex, open, inputId]);

  const runSearch = async (term: string, isFirstOptions: boolean) => {
    const seq = ++requestSeqRef.current;
    setStatus("loading");
    setErrorMessage(null);
    try {
      const response = await searchReportingManagersAction({ query: term, excludeEmployeeId });
      if (seq !== requestSeqRef.current) return; // a newer search replaced this one
      if (!response.success) {
        setResults([]);
        setStatus("error");
        setErrorMessage(response.error);
        return;
      }
      if (isFirstOptions) firstOptionsRef.current = response.data;
      setResults(response.data);
      setShowingFirstOptions(isFirstOptions);
      setStatus("ready");
      setActiveIndex(0);
    } catch {
      if (seq !== requestSeqRef.current) return;
      setResults([]);
      setStatus("error");
      setErrorMessage("We couldn't reach the server. Check your connection and try again.");
    }
  };

  const showFirstOptions = () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (firstOptionsRef.current) {
      requestSeqRef.current += 1; // ignore any search still in flight
      setResults(firstOptionsRef.current);
      setShowingFirstOptions(true);
      setStatus("ready");
      setErrorMessage(null);
      return;
    }
    void runSearch("", true);
  };

  const openList = () => {
    if (disabled) return;
    setOpen(true);
    setActiveIndex(0);
    if (!editing || query.trim().length === 0) {
      showFirstOptions();
    }
  };

  const closeList = () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    requestSeqRef.current += 1;
    setOpen(false);
    setEditing(false);
    setQuery("");
  };

  const choose = (entry: PickerEntry) => {
    onChange(
      entry.kind === "none"
        ? null
        : { id: entry.option.id, label: formatReportingManagerLabel(entry.option) }
    );
    closeList();
  };

  /** Clicks on an option (delegated from the listbox; the option carries its index). */
  const handleListClick = (event: React.MouseEvent<HTMLUListElement>) => {
    const target = (event.target as HTMLElement).closest<HTMLElement>("[data-option-index]");
    if (!target) return;
    const entry = entries[Number(target.dataset.optionIndex)];
    if (entry) choose(entry);
  };

  const handleQueryChange = (next: string) => {
    setQuery(next);
    setEditing(true);
    setOpen(true);
    setActiveIndex(0);
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const term = next.trim();
    if (term.length === 0) {
      showFirstOptions();
      return;
    }
    if (term.length < REPORTING_MANAGER_MIN_QUERY) {
      requestSeqRef.current += 1;
      setResults([]);
      setShowingFirstOptions(false);
      setStatus("short");
      setErrorMessage(null);
      return;
    }
    setStatus("loading");
    debounceRef.current = setTimeout(() => {
      void runSearch(term, false);
    }, REPORTING_MANAGER_DEBOUNCE_MS);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        if (!open) {
          openList();
        } else {
          setActiveIndex((index) => Math.min(entries.length - 1, index + 1));
        }
        break;
      case "ArrowUp":
        event.preventDefault();
        if (!open) {
          openList();
        } else {
          setActiveIndex((index) => Math.max(0, index - 1));
        }
        break;
      case "Enter":
        if (open) {
          // Choose the highlighted option instead of submitting the form.
          event.preventDefault();
          const entry = entries[activeIndex];
          if (entry) choose(entry);
        }
        break;
      case "Escape":
        if (open || editing) {
          event.preventDefault();
          closeList();
        }
        break;
      default:
        break;
    }
  };

  const statusText = (() => {
    if (!open) return "";
    switch (status) {
      case "loading":
        return "Searching…";
      case "short":
        return `Type at least ${REPORTING_MANAGER_MIN_QUERY} characters to search.`;
      case "error":
        return errorMessage ?? "Search failed.";
      case "ready":
        if (results.length === 0) {
          return showingFirstOptions
            ? "No active employees to choose from. You can keep No manager."
            : "No matching employees. Try another name or code, or choose No manager.";
        }
        return showingFirstOptions
          ? `Showing the first ${results.length} employee${results.length === 1 ? "" : "s"}. Type at least ${REPORTING_MANAGER_MIN_QUERY} characters to search.`
          : `${results.length} employee${results.length === 1 ? "" : "s"} found.`;
      default:
        return "";
    }
  })();

  const activeDescendant = open && entries[activeIndex] ? optionId(activeIndex) : undefined;

  return (
    <div className="relative">
      <div className="relative">
        <input
          ref={inputRef}
          id={inputId}
          type="text"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-activedescendant={activeDescendant}
          autoComplete="off"
          spellCheck={false}
          disabled={disabled}
          value={editing ? query : value?.label ?? ""}
          placeholder={value ? undefined : `${NO_MANAGER_LABEL}: type to search`}
          onFocus={openList}
          onClick={() => {
            if (!open) openList();
          }}
          onBlur={closeList}
          onChange={(event) => handleQueryChange(event.target.value)}
          onKeyDown={handleKeyDown}
          className="w-full px-3 py-2 pr-9 rounded-md border border-input bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        />
        {value && !disabled && (
          <button
            type="button"
            onClick={() => {
              onChange(null);
              inputRef.current?.focus();
            }}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            aria-label="Clear the reporting manager (no manager)"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        )}
      </div>

      <ul
        id={listboxId}
        role="listbox"
        aria-label="Reporting manager options"
        hidden={!open}
        // Keep the focus in the input so the click is not lost to a blur.
        onMouseDown={(event) => event.preventDefault()}
        onClick={handleListClick}
        className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md"
      >
        {open &&
          entries.map((entry, index) => {
            const isActive = index === activeIndex;
            const isCurrent = entry.kind === "none" ? value === null : value?.id === entry.option.id;
            return (
              <li
                key={entry.kind === "none" ? "none" : entry.option.id}
                id={optionId(index)}
                role="option"
                aria-selected={isActive}
                data-option-index={index}
                onMouseEnter={() => setActiveIndex(index)}
                className={`flex cursor-pointer items-center justify-between gap-2 rounded px-2.5 py-1.5 ${
                  isActive ? "bg-accent text-accent-foreground" : ""
                }`}
              >
                <span className="min-w-0">
                  {entry.kind === "none" ? (
                    <span className="italic">{NO_MANAGER_LABEL}</span>
                  ) : (
                    <>
                      <span className="block truncate font-medium">{formatReportingManagerLabel(entry.option)}</span>
                      {entry.option.designation && (
                        <span className="block truncate text-[11px] text-muted-foreground">
                          {entry.option.designation}
                        </span>
                      )}
                    </>
                  )}
                </span>
                {isCurrent && (
                  <span className="flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground">
                    <Check className="h-3.5 w-3.5" aria-hidden="true" />
                    Current
                  </span>
                )}
              </li>
            );
          })}
      </ul>

      <p
        id={statusId}
        role="status"
        aria-live="polite"
        className={`mt-1 min-h-[1rem] text-[11px] ${status === "error" ? "text-destructive" : "text-muted-foreground"}`}
      >
        {statusText}
      </p>
    </div>
  );
}
