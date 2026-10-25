"use client";

import React, { useSyncExternalStore } from "react";

function subscribe(): () => void {
  return () => {};
}

const DATE_OPTIONS: Intl.DateTimeFormatOptions = { year: "numeric", month: "short", day: "numeric" };
const DATE_TIME_OPTIONS: Intl.DateTimeFormatOptions = {
  weekday: "short",
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
};

/**
 * Renders a timestamp in the viewer's own time zone. The server (and the first client
 * render, so hydration matches) shows the value in UTC, labelled as such.
 */
export function LocalDateTime({ iso, mode = "datetime" }: { iso: string; mode?: "date" | "datetime" }) {
  const isClient = useSyncExternalStore(
    subscribe,
    () => true,
    () => false
  );
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return <span>Not set</span>;
  }

  const options = mode === "date" ? DATE_OPTIONS : DATE_TIME_OPTIONS;
  const text = isClient
    ? new Intl.DateTimeFormat(undefined, mode === "date" ? options : { ...options, timeZoneName: "short" }).format(date)
    : `${new Intl.DateTimeFormat("en-US", { ...options, timeZone: "UTC" }).format(date)}${mode === "date" ? "" : " UTC"}`;

  return <time dateTime={iso}>{text}</time>;
}
