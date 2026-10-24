import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Placeholder block shown while content loads. Uses the border token so it stays
 * visible on cards in both themes, pulses only when the user allows motion, and is
 * hidden from assistive technology (the surrounding region announces the loading state).
 */
export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden="true"
      className={cn("rounded-md bg-border/70 motion-safe:animate-pulse", className)}
      {...props}
    />
  );
}
