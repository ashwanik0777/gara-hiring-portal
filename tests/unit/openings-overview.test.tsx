import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { OpeningStatus, OpeningType, WorkplaceType } from "@prisma/client";

// ---------------------------------------------------------------------------
// Openings workspace (admin and staff): summary cards, status filters, the openings list and
// the career tracks, with no description lines.
// ---------------------------------------------------------------------------

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("@/features/openings/actions", () => ({ createTrackAction: vi.fn(), updateTrackAction: vi.fn() }));

import { OpeningsOverview, parseOpeningStatusFilter } from "@/features/openings/components/openings-overview";
import type { TrackManagerRow } from "@/features/openings/components/track-manager";

afterEach(cleanup);

const NOW = new Date("2026-11-21T06:00:00.000Z");

function opening(overrides: Partial<Parameters<typeof OpeningsOverview>[0]["openings"][number]> & { id: string; title: string }) {
  return {
    slug: overrides.id,
    department: "Engineering",
    type: OpeningType.INTERNSHIP,
    status: OpeningStatus.PUBLISHED,
    location: "Bengaluru",
    workplaceType: WorkplaceType.HYBRID,
    applyDeadline: null,
    track: null,
    _count: { applications: 0 },
    formVersions: [],
    ...overrides,
  };
}

const OPENINGS = [
  opening({ id: "o1", title: "Backend Intern", track: { name: "Cloud & Backend", slug: "cloud-backend" }, _count: { applications: 7 }, formVersions: [{ id: "f1", versionNumber: 2, isPublished: true }], applyDeadline: new Date("2026-12-31T18:29:59.999Z") }),
  opening({ id: "o2", title: "Design Intern", status: OpeningStatus.DRAFT, _count: { applications: 0 } }),
  opening({ id: "o3", title: "Data Analyst", status: OpeningStatus.PUBLISHED, type: OpeningType.FULL_TIME, _count: { applications: 3 }, applyDeadline: new Date("2026-11-01T18:29:59.999Z") }),
];

const TRACKS: TrackManagerRow[] = [
  { id: "t1", slug: "software", name: "Software Engineering", description: null, sortOrder: 10, isActive: true, openingsCount: 2, programmesCount: 1 },
  { id: "t2", slug: "ui-ux", name: "UI/UX & Product Design", description: null, sortOrder: 30, isActive: false, openingsCount: 0, programmesCount: 0 },
];

const renderOverview = (status: OpeningStatus | null = null) =>
  render(<OpeningsOverview openings={OPENINGS} tracks={TRACKS} basePath="/admin/openings" status={status} now={NOW} />);

function statCard(label: string) {
  const summary = screen.getByLabelText("Openings summary");
  const labelEl = within(summary).getByText(label);
  return labelEl.closest("a") ?? labelEl.closest("div")!.parentElement!;
}

describe("openings summary", () => {
  it("counts openings by status and sums applications; cards open their filter", () => {
    renderOverview();
    expect(statCard("Total Openings").textContent).toContain("3");
    expect(statCard("Total Openings").getAttribute("href")).toBe("/admin/openings");
    expect(statCard("Published").textContent).toContain("2");
    expect(statCard("Published").getAttribute("href")).toBe("/admin/openings?status=PUBLISHED");
    expect(statCard("Drafts").textContent).toContain("1");
    expect(statCard("Drafts").getAttribute("href")).toBe("/admin/openings?status=DRAFT");
    expect(statCard("Applications").textContent).toContain("10");
  });

  it("offers filter chips only for statuses in use and filters the list", () => {
    renderOverview(OpeningStatus.DRAFT);
    const chips = screen.getByRole("navigation", { name: "Filter openings by status" });
    expect(within(chips).getAllByRole("link").map((a) => a.textContent)).toEqual(["All3", "Published2", "Draft1"]);
    expect(within(chips).getByRole("link", { name: /Draft/ }).getAttribute("aria-current")).toBe("page");
    const list = screen.getByRole("list", { name: "Openings" });
    expect(within(list).getAllByRole("listitem").filter((li) => li.parentElement === list)).toHaveLength(1);
    expect(within(list).getByText("Design Intern")).toBeTruthy();
  });

  it("reads only known statuses from the URL", () => {
    expect(parseOpeningStatusFilter("PAUSED")).toBe("PAUSED");
    expect(parseOpeningStatusFilter(["CLOSED"])).toBe("CLOSED");
    expect(parseOpeningStatusFilter("drop table")).toBeNull();
    expect(parseOpeningStatusFilter(undefined)).toBeNull();
  });
});

describe("openings list", () => {
  it("shows status, type, track, deadline, applications and the live form for each opening", () => {
    renderOverview();
    const row = screen.getByText("Backend Intern").closest("li")!;
    expect(row.textContent).toContain("Published");
    expect(row.textContent).toContain("Internship");
    expect(row.textContent).toContain("Cloud & Backend");
    expect(row.textContent).toContain("Apply by 31 Dec 2026");
    expect(row.textContent).toContain("7 applications");
    expect(row.textContent).toContain("Form v2");
    expect(within(row).getByRole("link", { name: /Live/ }).getAttribute("href")).toBe("/careers/o1");
    expect(within(row).getByRole("link", { name: "Edit" }).getAttribute("href")).toBe("/admin/openings/o1/edit");

    const past = screen.getByText("Data Analyst").closest("li")!;
    expect(past.textContent).toContain("Closed 1 Nov 2026");

    const draft = screen.getByText("Design Intern").closest("li")!;
    expect(within(draft).queryByRole("link", { name: /Live/ })).toBeNull();
    expect(draft.textContent).toContain("Form not published");
  });

  it("has no description lines", () => {
    renderOverview();
    expect(document.body.textContent).not.toMatch(/Browse published vacancies|shown on the track page/);
  });
});

describe("career tracks", () => {
  it("lists each track with its openings and programmes, links active tracks and marks hidden ones", () => {
    renderOverview();
    const software = screen.getAllByText("Software Engineering")[0].closest("li")!;
    expect(software.textContent).toContain("/careers/tracks/software");
    expect(software.textContent).toContain("2 openings");
    expect(software.textContent).toContain("1 programme");
    expect(within(software).getByRole("link", { name: /View/ }).getAttribute("href")).toBe("/careers/tracks/software");

    const hidden = screen.getAllByText("UI/UX & Product Design")[0].closest("li")!;
    expect(hidden.textContent).toContain("Hidden");
    expect(within(hidden).queryByRole("link", { name: /View/ })).toBeNull();
  });

  it("opens a labelled form to add a track", () => {
    renderOverview();
    fireEvent.click(screen.getByRole("button", { name: "Add track" }));
    expect(screen.getByLabelText("Name")).toBeTruthy();
    expect(screen.getByLabelText("URL slug")).toBeTruthy();
    expect(screen.getByLabelText("Description (optional)")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Data & Analytics" } });
    expect((screen.getByLabelText("URL slug") as HTMLInputElement).value).toBe("data-analytics");
  });
});
