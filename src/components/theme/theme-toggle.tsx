"use client";

import { useEffect, useSyncExternalStore } from "react";
import { Sun, Moon, Monitor } from "lucide-react";

export type ThemeMode = "light" | "dark" | "system";

const STORAGE_KEY = "gara_theme";

function applyTheme(theme: ThemeMode) {
  if (typeof window === "undefined") return;

  const root = document.documentElement;
  const systemPrefersDark = window.matchMedia(
    "(prefers-color-scheme: dark)"
  ).matches;

  const isDark =
    theme === "dark" || (theme === "system" && systemPrefersDark);

  if (isDark) {
    root.classList.add("dark");
    root.classList.remove("light");
    root.style.colorScheme = "dark";
  } else {
    root.classList.add("light");
    root.classList.remove("dark");
    root.style.colorScheme = "light";
  }
}

function subscribeToTheme(callback: () => void) {
  window.addEventListener("storage", callback);
  const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
  mediaQuery.addEventListener("change", callback);

  return () => {
    window.removeEventListener("storage", callback);
    mediaQuery.removeEventListener("change", callback);
  };
}

function getThemeSnapshot(): ThemeMode {
  try {
    const saved = localStorage.getItem(STORAGE_KEY) as ThemeMode | null;
    if (saved === "light" || saved === "dark" || saved === "system") {
      return saved;
    }
  } catch {
    // Storage inaccessible
  }
  return "system";
}

function getSystemDarkSnapshot(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

const emptySubscribe = () => () => {};

export function ThemeToggle({ className }: { className?: string }) {
  const isMounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );

  const theme = useSyncExternalStore(
    subscribeToTheme,
    getThemeSnapshot,
    () => "system" as ThemeMode
  );

  const systemDark = useSyncExternalStore(
    subscribeToTheme,
    getSystemDarkSnapshot,
    () => false
  );

  const currentTheme: ThemeMode = isMounted ? theme : "system";
  const isDark =
    currentTheme === "dark" || (currentTheme === "system" && systemDark);

  // Sync DOM classes whenever theme changes on client
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  function handleSelectTheme(selected: ThemeMode) {
    try {
      localStorage.setItem(STORAGE_KEY, selected);
      window.dispatchEvent(new Event("storage"));
    } catch {
      // Storage unavailable fallback
    }
    applyTheme(selected);
  }

  // Active button style based on whether dark or light mode is visually active
  const activeBtnClass = isDark
    ? "bg-slate-900 text-white shadow-xs font-medium"
    : "bg-white text-slate-800 shadow-xs  font-medium";

  const inactiveBtnClass = isDark
    ? "text-slate-400 hover:text-slate-200"
    : "text-slate-500 hover:text-slate-800";

  const containerBg = isDark ? "bg-slate-800/90" : "bg-slate-100";

  return (
    <div
      role="radiogroup"
      aria-label="Theme selection"
      className={`inline-flex items-center h-8 p-0.5 rounded-xl ${containerBg} shadow-2xs gap-0.5 shrink-0 ${className ?? ""}`}
    >
      {/* Light Option */}
      <button
        type="button"
        role="radio"
        aria-checked={currentTheme === "light"}
        aria-label="Light mode"
        onClick={() => handleSelectTheme("light")}
        className={`relative flex items-center justify-center w-7 h-7 rounded-lg transition-all duration-150 cursor-pointer ${
          currentTheme === "light" ? activeBtnClass : inactiveBtnClass
        }`}
      >
        <Sun className="h-3.5 w-3.5" strokeWidth={2.2} />
      </button>

      {/* Dark Option */}
      <button
        type="button"
        role="radio"
        aria-checked={currentTheme === "dark"}
        aria-label="Dark mode"
        onClick={() => handleSelectTheme("dark")}
        className={`relative flex items-center justify-center w-7 h-7 rounded-lg transition-all duration-150 cursor-pointer ${
          currentTheme === "dark" ? activeBtnClass : inactiveBtnClass
        }`}
      >
        <Moon className="h-3.5 w-3.5" strokeWidth={2.2} />
      </button>

      {/* System Option */}
      <button
        type="button"
        role="radio"
        aria-checked={currentTheme === "system"}
        aria-label="System preference"
        onClick={() => handleSelectTheme("system")}
        className={`relative flex items-center justify-center w-7 h-7 rounded-lg transition-all duration-150 cursor-pointer ${
          currentTheme === "system" ? activeBtnClass : inactiveBtnClass
        }`}
      >
        <Monitor className="h-3.5 w-3.5" strokeWidth={2.2} />
      </button>
    </div>
  );
}
