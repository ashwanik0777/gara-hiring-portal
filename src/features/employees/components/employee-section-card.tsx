import React from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/** One titled section of the employee record. */
export function EmployeeSectionCard({
  title,
  icon: Icon,
  action,
  children,
  className,
  bodyClassName,
  id,
}: {
  title: string;
  icon: LucideIcon;
  /** Shown at the right of the title row (a badge, tabs). */
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  id?: string;
}) {
  return (
    <section id={id} aria-label={title} className={cn("rounded-2xl border border-border bg-card shadow-sm", className)}>
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 px-5 py-4">
        <h2 className="flex items-center gap-2.5 text-sm font-semibold text-foreground">
          <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Icon className="h-4 w-4" />
          </span>
          {title}
        </h2>
        {action}
      </header>
      <div className={cn("p-5", bodyClassName)}>{children}</div>
    </section>
  );
}

/** A small label/value tile inside a section. */
export function InfoTile({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-xl border border-border/60 bg-muted/30 p-4", className)}>
      <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      <div className="mt-1.5 text-sm text-foreground">{children}</div>
    </div>
  );
}
