import React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

interface FilterChipLinkProps {
  href: string;
  active: boolean;
  label: string;
  count?: number;
  icon?: React.ReactNode;
  /** Draws attention to the count (e.g. overdue items). */
  emphasis?: boolean;
}

/** A filter as a link (server-rendered, keyboard reachable); the active one carries aria-current. */
export function FilterChipLink({ href, active, label, count, icon, emphasis = false }: FilterChipLinkProps) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-card text-foreground hover:bg-accent hover:text-accent-foreground"
      )}
    >
      {icon && (
        <span aria-hidden="true" className="flex items-center">
          {icon}
        </span>
      )}
      {label}
      {count !== undefined && (
        <span
          className={cn(
            "rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums",
            active
              ? "bg-primary-foreground/20 text-primary-foreground"
              : emphasis && count > 0
                ? "bg-destructive/10 text-destructive"
                : "bg-muted text-muted-foreground"
          )}
        >
          {count}
        </span>
      )}
    </Link>
  );
}
