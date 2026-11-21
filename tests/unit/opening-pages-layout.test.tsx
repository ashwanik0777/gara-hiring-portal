import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

// ---------------------------------------------------------------------------
// Opening pages inside the admin and staff portals: the portal shell is the only chrome
// (no public website navbar), the header names each page, and the form reads clearly.
// ---------------------------------------------------------------------------

vi.mock("next/navigation", () => ({
  usePathname: () => "/admin/openings/new",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
}));
vi.mock("@/lib/auth/auth-client", () => ({ authClient: { signOut: vi.fn() } }));
vi.mock("@/components/dashboard/dashboard-notifications", () => ({ DashboardNotifications: () => null }));
vi.mock("@/components/theme/theme-toggle", () => ({ ThemeToggle: () => null }));
vi.mock("@/features/openings/actions", () => ({ createOpeningAction: vi.fn(), updateOpeningAction: vi.fn() }));

import { resolveRouteMeta } from "@/components/dashboard/dashboard-shell";
import { OpeningForm } from "@/features/openings/components/opening-form";

afterEach(cleanup);

const APP = path.resolve(__dirname, "../../src/app");

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

describe("portal pages", () => {
  it("never render the public website navbar (the portal shell is their only navigation)", () => {
    const offenders = ["admin", "subadmin", "hrms", "intern", "candidate"]
      .flatMap((portal) => sourceFiles(path.join(APP, portal)))
      .filter((file) => /components\/navigation\/navbar/.test(fs.readFileSync(file, "utf8")))
      .map((file) => path.relative(APP, file));
    expect(offenders).toEqual([]);
  });

  it("leave the page's single h1 to the portal shell on the opening pages", () => {
    const files = [
      "admin/openings/new/page.tsx",
      "admin/openings/[id]/edit/page.tsx",
      "admin/openings/[id]/preview/page.tsx",
      "subadmin/openings/new/page.tsx",
      "admin/openings/page.tsx",
      "subadmin/openings/page.tsx",
    ].map((file) => fs.readFileSync(path.join(APP, file), "utf8"));
    const components = ["opening-form.tsx", "opening-editor-view.tsx", "opening-preview-view.tsx", "openings-overview.tsx", "track-manager.tsx"].map((file) =>
      fs.readFileSync(path.resolve(__dirname, "../../src/features/openings/components", file), "utf8")
    );
    for (const source of [...files, ...components]) {
      expect(source).not.toMatch(/<h1[\s>]/);
    }
  });
});

describe("portal header for opening pages", () => {
  it.each([
    ["/admin/openings", "Job Openings", "Create Opening", "/admin/openings/new"],
    ["/admin/openings/new", "Create Opening", "Back to Openings", "/admin/openings"],
    ["/subadmin/openings/new", "Create Opening", "Back to Openings", "/subadmin/openings"],
    ["/admin/openings/0b9c/edit", "Edit Opening", "Back to Openings", "/admin/openings"],
    ["/subadmin/openings/0b9c/edit", "Edit Opening", "Back to Openings", "/subadmin/openings"],
    ["/admin/openings/0b9c/preview", "Opening Preview", "Back to Openings", "/admin/openings"],
    ["/subadmin/openings/0b9c/preview", "Opening Preview", "Back to Openings", "/subadmin/openings"],
  ])("%s → %s with %s", (pathname, label, actionLabel, actionHref) => {
    const meta = resolveRouteMeta(pathname);
    expect(meta?.label).toBe(label);
    expect(meta?.action).toMatchObject({ label: actionLabel, href: actionHref });
  });

  it("still uses prefix matches for other nested pages", () => {
    expect(resolveRouteMeta("/admin/applications/123")?.label).toBe("Applications");
  });
});

describe("OpeningForm", () => {
  it("groups the fields into labelled sections", () => {
    render(<OpeningForm basePath="/admin/openings" />);
    for (const name of ["Basics", "Location and timing", "Careers listing", "Role description"]) {
      expect(screen.getByRole("group", { name })).toBeTruthy();
    }
  });

  it("labels every control, marks optional fields and offers Cancel back to the list", () => {
    render(<OpeningForm basePath="/subadmin/openings" />);
    for (const label of ["Opening title", "URL slug", "Department", "Location", "Job description", "Requirements and qualifications"]) {
      expect(screen.getByLabelText(label)).toBeTruthy();
    }
    for (const label of ["Track (optional)", "Duration (optional)", "Skills (optional)", "Key responsibilities (optional)"]) {
      expect(screen.getByLabelText(label)).toBeTruthy();
    }
    expect(screen.getByRole("link", { name: "Cancel" }).getAttribute("href")).toBe("/subadmin/openings");
    expect(screen.getByRole("button", { name: "Create draft opening" })).toBeTruthy();
  });

  it("has no subtitles or hint lines, only labels and controls", () => {
    const { container } = render(<OpeningForm basePath="/admin/openings" />);
    expect(container.querySelectorAll("p")).toHaveLength(0);
    expect(screen.queryByRole("heading")).toBeNull();
  });

  it("offers program type and workplace as choice tiles", () => {
    render(<OpeningForm basePath="/admin/openings" />);
    const program = screen.getByRole("group", { name: "Program type" });
    const workplace = screen.getByRole("group", { name: "Workplace model" });
    expect(program).toBeTruthy();
    expect(workplace).toBeTruthy();
    expect((screen.getByRole("radio", { name: "Internship" }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole("radio", { name: "Remote" }) as HTMLInputElement).checked).toBe(true);
    fireEvent.click(screen.getByRole("radio", { name: "Full-time" }));
    fireEvent.click(screen.getByRole("radio", { name: "On-site" }));
    expect((screen.getByRole("radio", { name: "Full-time" }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole("radio", { name: "Internship" }) as HTMLInputElement).checked).toBe(false);
    expect((screen.getByRole("radio", { name: "On-site" }) as HTMLInputElement).checked).toBe(true);
  });

  it("fills the slug from the title, next to a /careers/ prefix", () => {
    render(<OpeningForm basePath="/admin/openings" />);
    fireEvent.change(screen.getByLabelText("Opening title"), { target: { value: "Data Analyst Intern" } });
    expect((screen.getByLabelText("URL slug") as HTMLInputElement).value).toBe("data-analyst-intern");
    expect(screen.getByText("/careers/")).toBeTruthy();
  });

  it("shows skills as chips and counts characters in limited fields", async () => {
    render(<OpeningForm basePath="/admin/openings" />);
    fireEvent.change(screen.getByLabelText("Skills (optional)"), { target: { value: "React, SQL" } });
    const chips = await screen.findByRole("list", { name: "Skills added" });
    expect(Array.from(chips.querySelectorAll("li")).map((li) => li.textContent)).toEqual(["React", "SQL"]);
    expect(screen.getByText("Optional · 2/20")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Card summary (optional)"), { target: { value: "Twelve chars" } });
    expect(await screen.findByText("Optional · 12/300")).toBeTruthy();
  });

  it("links each error to its field after a failed submit", async () => {
    render(<OpeningForm basePath="/admin/openings" />);
    fireEvent.click(screen.getByRole("button", { name: "Create draft opening" }));
    const title = screen.getByLabelText("Opening title");
    await vi.waitFor(() => expect(title.getAttribute("aria-invalid")).toBe("true"));
    const errorId = title.getAttribute("aria-describedby") ?? "";
    expect(document.getElementById(errorId)?.textContent).toMatch(/Title must be at least 3 characters/);
  });
});
