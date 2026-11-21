import React from "react";
import type { LucideIcon } from "lucide-react";
import { PAGE_GUTTER } from "@/components/layout/page-gutter";
import { cn } from "@/lib/utils";

/*
 * Building blocks of the public programme pages (Industrial Training, Campus Ambassador, Help),
 * in the same visual language as the home page: pill eyebrow, display heading, soft background.
 */

export function Eyebrow({ icon: Icon, children, className }: { icon?: LucideIcon; children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3.5 py-1 text-xs font-semibold text-primary ring-1 ring-primary/20 dark:bg-primary/15",
        className
      )}
    >
      {Icon && <Icon className="h-3.5 w-3.5" aria-hidden="true" />}
      {children}
    </span>
  );
}

/** Page hero: eyebrow, h1 and optional actions, over the home page's soft background. */
export function PageHero({
  eyebrow,
  title,
  actions,
  children,
}: {
  eyebrow: { icon: LucideIcon; label: string };
  title: React.ReactNode;
  actions?: React.ReactNode;
  /** Extra content under the actions (e.g. quick links). */
  children?: React.ReactNode;
}) {
  return (
    <section className="relative overflow-hidden pb-14 pt-14 lg:pb-20 lg:pt-20">
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        <div className="absolute -right-32 -top-32 h-[520px] w-[520px] rounded-full bg-primary/[0.07] blur-[100px]" />
        <div className="absolute -bottom-24 -left-24 h-[360px] w-[360px] rounded-full bg-primary/[0.05] blur-[80px]" />
        <div
          className="absolute inset-0 opacity-[0.03] dark:opacity-[0.06]"
          style={{ backgroundImage: "radial-gradient(circle, currentColor 1px, transparent 1px)", backgroundSize: "32px 32px" }}
        />
      </div>
      <div className={cn("relative space-y-7 text-center", PAGE_GUTTER)}>
        <Eyebrow icon={eyebrow.icon}>{eyebrow.label}</Eyebrow>
        <h1 className="mx-auto max-w-4xl font-[family-name:var(--font-display)] text-4xl font-bold leading-[1.1] tracking-tight text-foreground sm:text-5xl lg:text-6xl">
          {title}
        </h1>
        {actions && <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">{actions}</div>}
        {children}
      </div>
    </section>
  );
}

export interface Highlight {
  icon: LucideIcon;
  value: string;
  label: string;
  /** Icon colour classes. */
  tone: string;
}

/** The home page's highlights bar: four short facts with icons. */
export function HighlightsBar({ items, label }: { items: Highlight[]; label: string }) {
  return (
    <section aria-label={label} className="border-y border-border/60 bg-muted/30 dark:bg-muted/10">
      <ul className={cn("grid grid-cols-1 gap-5 py-5 sm:grid-cols-2 lg:grid-cols-4 lg:py-6", PAGE_GUTTER)}>
        {items.map((item) => (
          <li key={item.value} className="flex items-center gap-4">
            <span aria-hidden="true" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-border/60 bg-card shadow-xs">
              <item.icon className={cn("h-5 w-5", item.tone)} />
            </span>
            <span>
              <span className="block font-[family-name:var(--font-display)] text-lg font-bold text-foreground">{item.value}</span>
              <span className="block text-xs text-muted-foreground">{item.label}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Centered section heading with a pill eyebrow (as on the home page). */
export function SectionHeading({ id, eyebrow, title }: { id?: string; eyebrow: { icon: LucideIcon; label: string }; title: string }) {
  return (
    <div className="mb-6 text-center">
      <span className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-secondary px-3.5 py-1 text-xs font-semibold text-foreground">
        <eyebrow.icon className="h-3.5 w-3.5" aria-hidden="true" />
        {eyebrow.label}
      </span>
      <h2 id={id} className="font-[family-name:var(--font-display)] text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
        {title}
      </h2>
    </div>
  );
}

export interface Step {
  icon: LucideIcon;
  title: string;
  text: React.ReactNode;
}

/** Numbered steps in a row of cards. */
export function StepCards({ steps, label, columns = 4 }: { steps: Step[]; label: string; columns?: 3 | 4 }) {
  return (
    <ol aria-label={label} className={cn("grid grid-cols-1 gap-5", columns === 3 ? "md:grid-cols-3" : "sm:grid-cols-2 lg:grid-cols-4")}>
      {steps.map((step, index) => (
        <li key={step.title} className="relative rounded-2xl border border-border/70 bg-card p-6 shadow-xs transition-shadow hover:shadow-md">
          <div className="flex items-center justify-between">
            <span aria-hidden="true" className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <step.icon className="h-5 w-5" />
            </span>
            <span className="font-mono text-xs font-semibold text-muted-foreground">{String(index + 1).padStart(2, "0")}</span>
          </div>
          <h3 className="mt-5 font-[family-name:var(--font-display)] text-lg font-bold text-foreground">{step.title}</h3>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{step.text}</p>
        </li>
      ))}
    </ol>
  );
}

export const primaryCta =
  "inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-primary px-6 text-sm font-semibold text-primary-foreground shadow-sm transition-all hover:-translate-y-0.5 hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";
export const secondaryCta =
  "inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-border bg-card px-6 text-sm font-semibold text-foreground shadow-xs transition-all hover:-translate-y-0.5 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";
