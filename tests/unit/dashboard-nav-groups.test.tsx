import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { ADMIN_NAV_ITEMS } from "@/config/dashboard-nav";
import { buildNavSections, navSectionHeadingId } from "@/components/dashboard/nav-sections";
import type { DashboardNavItem } from "@/components/dashboard/dashboard-shell";

// ---------------------------------------------------------------------------
// Admin sidebar grouping: links of the same kind sit under one heading; links that fit no
// group stand alone, never under a heading.
// ---------------------------------------------------------------------------

const { mockPathname } = vi.hoisted(() => ({ mockPathname: vi.fn(() => "/admin/interviews") }));
vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));
const { mockSignOut, mockHardNavigate } = vi.hoisted(() => ({ mockSignOut: vi.fn(), mockHardNavigate: vi.fn() }));
vi.mock("@/lib/auth/auth-client", () => ({ authClient: { signOut: mockSignOut } }));
vi.mock("@/lib/navigation/hard-navigate", () => ({ hardNavigate: mockHardNavigate }));
vi.mock("@/components/dashboard/dashboard-notifications", () => ({ DashboardNotifications: () => null }));
vi.mock("@/components/theme/theme-toggle", () => ({ ThemeToggle: () => null }));

import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { navGroupsStorageKey } from "@/components/dashboard/use-collapsed-nav-groups";

afterEach(cleanup);

const item = (label: string, group?: string): DashboardNavItem => ({ label, href: `/x/${label}`, iconName: "FileText", group });

describe("buildNavSections", () => {
  it("keeps the order, groups consecutive items and leaves ungrouped items untitled", () => {
    const sections = buildNavSections([item("a"), item("b", "G1"), item("c", "G1"), item("d", "G2"), item("e"), item("f")]);
    expect(sections.map((s) => [s.label, s.items.map((i) => i.label)])).toEqual([
      [null, ["a"]],
      ["G1", ["b", "c"]],
      ["G2", ["d"]],
      [null, ["e", "f"]],
    ]);
  });

  it("returns one untitled section for a list without groups (other portals unchanged)", () => {
    const sections = buildNavSections([item("a"), item("b")]);
    expect(sections).toHaveLength(1);
    expect(sections[0].label).toBeNull();
  });

  it("makes stable heading ids", () => {
    expect(navSectionHeadingId("Training & Outreach")).toBe("nav-group-training-outreach");
    expect(navSectionHeadingId("People & HR")).toBe("nav-group-people-hr");
  });
});

describe("ADMIN_NAV_ITEMS", () => {
  it("has the agreed groups and standalone links, in order", () => {
    expect(buildNavSections(ADMIN_NAV_ITEMS).map((s) => [s.label, s.items.map((i) => i.label)])).toEqual([
      [null, ["Overview"]],
      ["Hiring", ["Job Openings", "Registrations", "Applications", "Interviews", "Evaluations"]],
      ["Training & Outreach", ["Industrial Training", "Campus Ambassadors", "Colleges"]],
      ["Certificates", ["Issued Certificates", "Print Orders"]],
      ["People & HR", ["Employees", "Intern Reviews", "Attendance", "Leave Management", "Payroll"]],
      [null, ["Analytics & Reports", "Sub-Admins", "Chatbot Support"]],
    ]);
  });

  it("keeps every group in one contiguous block and every link unique", () => {
    const titled = buildNavSections(ADMIN_NAV_ITEMS).flatMap((s) => (s.label ? [s.label] : []));
    expect(new Set(titled).size).toBe(titled.length);
    const hrefs = ADMIN_NAV_ITEMS.map((i) => i.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it("links every top-level admin page", () => {
    const adminDir = path.resolve(__dirname, "../../src/app/admin");
    const pages = fs
      .readdirSync(adminDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith("_") && fs.existsSync(path.join(adminDir, entry.name, "page.tsx")))
      .map((entry) => `/admin/${entry.name}`);
    const hrefs = new Set(ADMIN_NAV_ITEMS.map((i) => i.href));
    expect(pages.filter((page) => !hrefs.has(page))).toEqual([]);
  });
});

describe("DashboardShell sidebar", () => {
  const renderShell = () =>
    render(
      <DashboardShell portalName="ADMIN PANEL" user={{ name: "Admin", email: "admin@example.com", role: "ADMIN" }} navItems={ADMIN_NAV_ITEMS}>
        <p>content</p>
      </DashboardShell>
    );

  it("renders each group as a labelled group with its links, and standalone links outside groups", () => {
    renderShell();
    const nav = screen.getByRole("navigation", { name: "ADMIN PANEL navigation" });
    const groups = within(nav).getAllByRole("group");
    expect(groups.map((g) => g.getAttribute("aria-labelledby"))).toEqual([
      "nav-group-hiring",
      "nav-group-training-outreach",
      "nav-group-certificates",
      "nav-group-people-hr",
    ]);
    const hiring = within(nav).getByRole("group", { name: "Hiring" });
    expect(within(hiring).getAllByRole("link").map((a) => a.textContent)).toEqual([
      "Job Openings",
      "Registrations",
      "Applications",
      "Interviews",
      "Evaluations",
    ]);
    for (const standalone of ["Overview", "Analytics & Reports", "Sub-Admins", "Chatbot Support"]) {
      const link = within(nav).getByRole("link", { name: standalone });
      expect(link.closest("[role=group]")).toBeNull();
    }
  });

  it("keeps absolutely positioned page content inside the scroll area (the dashboard itself never scrolls)", () => {
    renderShell();
    // Without `relative`, sr-only legends/labels deep in a long page escape <main>'s
    // overflow and lengthen the document, so the whole dashboard scrolls after the page ends.
    expect(document.querySelector("main")?.className.split(/\s+/)).toEqual(
      expect.arrayContaining(["relative", "overflow-y-auto"])
    );
  });

  it("signs out with a full page load of the sign-in page (it opens at email and password)", async () => {
    mockSignOut.mockResolvedValue({ data: { success: true } });
    renderShell();
    fireEvent.click(screen.getByTitle("Sign out"));
    await waitFor(() => expect(mockHardNavigate).toHaveBeenCalledWith("/login"));
    expect(mockSignOut).toHaveBeenCalled();
  });

  it("still leaves for the sign-in page when signing out fails", async () => {
    mockHardNavigate.mockClear();
    mockSignOut.mockRejectedValue(new Error("network"));
    renderShell();
    fireEvent.click(screen.getByTitle("Sign out"));
    await waitFor(() => expect(mockHardNavigate).toHaveBeenCalledWith("/login"));
  });

  it("marks only the current page's link as current", () => {
    renderShell();
    const current = screen.getAllByRole("link").filter((a) => a.getAttribute("aria-current") === "page");
    expect(current.map((a) => a.textContent)).toEqual(["Interviews"]);
  });

  it("keeps group names for screen readers when the sidebar is collapsed", () => {
    renderShell();
    fireEvent.click(screen.getByTitle("Collapse sidebar"));
    const heading = document.getElementById("nav-group-hiring");
    expect(heading?.className).toContain("sr-only");
    expect(screen.getByRole("group", { name: "Hiring" })).toBeTruthy();
  });
});

describe("collapsible sidebar groups", () => {
  const storageKey = navGroupsStorageKey("ADMIN PANEL");
  const renderShell = () =>
    render(
      <DashboardShell portalName="ADMIN PANEL" user={{ name: "Admin", email: "admin@example.com", role: "ADMIN" }} navItems={ADMIN_NAV_ITEMS}>
        <p>content</p>
      </DashboardShell>
    );
  const heading = (name: string) => screen.getByRole("button", { name });
  const linksOf = (id: string) => document.getElementById(`${id}-links`) as HTMLElement;

  afterEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
    mockPathname.mockReturnValue("/admin/interviews");
  });

  it("starts with every group open", () => {
    renderShell();
    for (const name of ["Hiring", "Training & Outreach", "People & HR"]) {
      expect(heading(name).getAttribute("aria-expanded")).toBe("true");
    }
    expect(linksOf("nav-group-people-hr").hasAttribute("inert")).toBe(false);
  });

  it("closes and reopens a group from its heading, hiding closed links from keyboard and screen readers", () => {
    renderShell();
    fireEvent.click(heading("People & HR"));
    expect(heading("People & HR").getAttribute("aria-expanded")).toBe("false");
    expect(linksOf("nav-group-people-hr").hasAttribute("inert")).toBe(true);
    expect(linksOf("nav-group-people-hr").className).toContain("invisible");
    expect(heading("People & HR").getAttribute("aria-controls")).toBe("nav-group-people-hr-links");
    // Other groups are not affected.
    expect(heading("Hiring").getAttribute("aria-expanded")).toBe("true");

    fireEvent.click(heading("People & HR"));
    expect(heading("People & HR").getAttribute("aria-expanded")).toBe("true");
    expect(linksOf("nav-group-people-hr").hasAttribute("inert")).toBe(false);
  });

  it("remembers closed groups in this browser", () => {
    const first = renderShell();
    fireEvent.click(heading("Training & Outreach"));
    expect(JSON.parse(window.localStorage.getItem(storageKey) ?? "[]")).toEqual(["Training & Outreach"]);
    first.unmount();

    renderShell();
    expect(heading("Training & Outreach").getAttribute("aria-expanded")).toBe("false");
    expect(heading("Hiring").getAttribute("aria-expanded")).toBe("true");
  });

  it("opens the group of the current page when that page is opened", () => {
    window.localStorage.setItem(storageKey, JSON.stringify(["Hiring", "People & HR"]));
    renderShell();
    expect(heading("Hiring").getAttribute("aria-expanded")).toBe("true");
    expect(heading("People & HR").getAttribute("aria-expanded")).toBe("false");
    expect(screen.getByRole("link", { name: "Interviews" }).getAttribute("aria-current")).toBe("page");
  });

  it("marks a closed group that holds the current page", () => {
    renderShell();
    fireEvent.click(heading("Hiring"));
    expect(heading("Hiring").getAttribute("aria-expanded")).toBe("false");
    expect(heading("Hiring").className).toContain("text-blue-600");
    expect(heading("People & HR").className).not.toContain("text-blue-600");
  });

  it("still works for the visit when browser storage is blocked", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    mockPathname.mockReturnValue("/admin");
    renderShell();
    fireEvent.click(heading("Hiring"));
    expect(heading("Hiring").getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(heading("Hiring"));
    expect(heading("Hiring").getAttribute("aria-expanded")).toBe("true");
  });

  it("shows every icon when the sidebar itself is collapsed, with no group toggles", () => {
    window.localStorage.setItem(storageKey, JSON.stringify(["Training & Outreach"]));
    renderShell();
    fireEvent.click(screen.getByTitle("Collapse sidebar"));
    expect(screen.queryByRole("button", { name: "Training & Outreach" })).toBeNull();
    const nav = screen.getByRole("navigation", { name: "ADMIN PANEL navigation" });
    expect(within(nav).getAllByRole("link")).toHaveLength(ADMIN_NAV_ITEMS.length);
  });

  it("leaves portals without groups as a plain list", () => {
    render(
      <DashboardShell portalName="STAFF" user={{ name: "Staff", email: "staff@example.com" }} navItems={[item("one"), item("two")]}>
        <p>content</p>
      </DashboardShell>
    );
    const nav = screen.getByRole("navigation", { name: "STAFF navigation" });
    expect(within(nav).queryAllByRole("button")).toHaveLength(0);
    expect(within(nav).queryAllByRole("group")).toHaveLength(0);
    expect(within(nav).getAllByRole("link")).toHaveLength(2);
  });
});
