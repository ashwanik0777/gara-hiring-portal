import type { DashboardNavItem } from "./dashboard-shell";

/** One block of the sidebar: a titled group, or a run of standalone links. */
export interface DashboardNavSection {
  /** The group heading; null for standalone links that belong to no group. */
  label: string | null;
  items: DashboardNavItem[];
}

/**
 * Splits the sidebar list into sections, keeping the configured order. Consecutive items
 * that share a `group` form one titled section; consecutive items without a group form an
 * untitled section, so a standalone link never appears under a group heading.
 */
export function buildNavSections(items: readonly DashboardNavItem[]): DashboardNavSection[] {
  const sections: DashboardNavSection[] = [];
  for (const item of items) {
    const label = item.group ?? null;
    const last = sections.at(-1);
    if (last && last.label === label) {
      last.items.push(item);
    } else {
      sections.push({ label, items: [item] });
    }
  }
  return sections;
}

/** A stable id for a group heading, used by aria-labelledby. */
export function navSectionHeadingId(label: string): string {
  return `nav-group-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}`;
}
