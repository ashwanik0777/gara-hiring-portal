import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { Role } from "@prisma/client";
import type { AuthenticatedUser } from "@/lib/auth/guards";

// ---------------------------------------------------------------------------
// Industrial Training admin: the overview query (database counts, seat-taking enrollments
// only), the overview and programme screens, the batch cards and the programme form.
// ---------------------------------------------------------------------------

const { db } = vi.hoisted(() => ({
  db: {
    trainingProgram: { findMany: vi.fn(), findUnique: vi.fn() },
    trainingBatch: { findMany: vi.fn() },
    trainingRefund: { count: vi.fn() },
  },
}));

vi.mock("@/lib/db", () => ({ prisma: db }));
vi.mock("next/cache", () => ({ cacheLife: vi.fn(), cacheTag: vi.fn(), revalidateTag: vi.fn(), updateTag: vi.fn() }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/admin/training",
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
}));
vi.mock("@/features/training/actions", () => ({
  createTrainingProgramAction: vi.fn(),
  updateTrainingProgramAction: vi.fn(),
  saveTrainingBatchAction: vi.fn(),
}));
vi.mock("@/lib/auth/auth-client", () => ({ authClient: { signOut: vi.fn() } }));

import { getProgramForStaff, getTrainingOverviewForStaff, STAFF_BATCHES_LIMIT, STAFF_PROGRAMS_LIMIT } from "@/features/training/services/program-service";
import { TrainingOverviewView, parseProgramStatusFilter } from "@/features/training/components/training-overview";
import { BatchManager, formatDateKey, formatLocalDateTime, type BatchRow } from "@/features/training/components/batch-manager";
import { TrainingProgramForm } from "@/features/training/components/program-form";
import { resolveRouteMeta } from "@/components/dashboard/dashboard-shell";
import { ForbiddenError } from "@/lib/errors";

const admin = { id: "admin-1", roles: [Role.ADMIN] } as unknown as AuthenticatedUser;
const hr = { id: "hr-1", roles: [Role.HR] } as unknown as AuthenticatedUser;
const SEAT_TAKING = ["ACTIVE", "REFUND_REQUESTED", "COMPLETED", "FAILED"];

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(cleanup);

function programRow(id: string, title: string, status: "DRAFT" | "PUBLISHED" | "ARCHIVED", batches = 0) {
  return { id, slug: id, title, feePaise: 499_900, durationWeeks: 8, status, updatedAt: new Date(), track: null, _count: { batches } };
}

describe("getTrainingOverviewForStaff", () => {
  it("counts open batches, seat-taking students and the next start per programme, plus pending refunds", async () => {
    db.trainingProgram.findMany.mockResolvedValue([programRow("p1", "Full-Stack", "PUBLISHED", 3), programRow("p2", "Design", "DRAFT", 0)]);
    db.trainingBatch.findMany.mockResolvedValue([
      { programId: "p1", status: "UPCOMING", startDate: new Date("2027-02-01T00:00:00Z"), _count: { enrollments: 4 } },
      { programId: "p1", status: "UPCOMING", startDate: new Date("2027-01-10T00:00:00Z"), _count: { enrollments: 2 } },
      { programId: "p1", status: "COMPLETED", startDate: new Date("2026-06-01T00:00:00Z"), _count: { enrollments: 9 } },
    ]);
    db.trainingRefund.count.mockResolvedValue(2);

    const overview = await getTrainingOverviewForStaff(admin);
    const p1 = overview.programs.find((program) => program.id === "p1")!;
    expect(p1).toMatchObject({ openBatches: 2, enrolled: 15 });
    expect(p1.nextStart?.toISOString()).toBe("2027-01-10T00:00:00.000Z");
    expect(overview.programs.find((program) => program.id === "p2")).toMatchObject({ openBatches: 0, enrolled: 0, nextStart: null });
    expect(overview.totals).toEqual({ programs: 2, openBatches: 2, enrolled: 15, pendingRefunds: 2 });

    // Bounded queries; only seat-taking enrollments are counted, in the database.
    expect(db.trainingProgram.findMany.mock.calls[0][0].take).toBe(STAFF_PROGRAMS_LIMIT);
    const batchArgs = db.trainingBatch.findMany.mock.calls[0][0];
    expect(batchArgs.take).toBe(STAFF_BATCHES_LIMIT);
    expect(batchArgs.select._count.select.enrollments.where.status.in).toEqual(SEAT_TAKING);
    expect(db.trainingRefund.count).toHaveBeenCalledWith({ where: { status: "REQUESTED" } });
  });

  it("is for administrators only", async () => {
    await expect(getTrainingOverviewForStaff(hr)).rejects.toBeInstanceOf(ForbiddenError);
    expect(db.trainingProgram.findMany).not.toHaveBeenCalled();
  });

  it("programme detail counts only seat-taking enrollments per batch", async () => {
    db.trainingProgram.findUnique.mockResolvedValue({ id: "p1", syllabus: [], batches: [] });
    await getProgramForStaff("p1", admin);
    const args = db.trainingProgram.findUnique.mock.calls[0][0];
    expect(args.include.batches.include._count.select.enrollments.where.status.in).toEqual(SEAT_TAKING);
    expect(args.include.track).toEqual({ select: { name: true, slug: true } });
  });
});

describe("TrainingOverviewView", () => {
  const overview = {
    programs: [
      { ...programRow("p1", "Full-Stack Web", "PUBLISHED", 3), track: { name: "Full Stack & Web" }, openBatches: 2, enrolled: 15, nextStart: new Date("2027-01-09T18:30:00Z") },
      { ...programRow("p2", "UI Design", "DRAFT", 0), openBatches: 0, enrolled: 0, nextStart: null },
    ],
    totals: { programs: 2, openBatches: 2, enrolled: 15, pendingRefunds: 3 },
  };

  it("shows the summary cards, filters and one card per programme", () => {
    render(<TrainingOverviewView overview={overview} status={null} />);
    const summary = screen.getByLabelText("Training summary");
    expect(summary.textContent).toContain("Programmes2");
    expect(summary.textContent).toContain("Open Batches2");
    expect(summary.textContent).toContain("Enrolled Students15");
    const refunds = within(summary).getByText("Refund Requests").closest("a")!;
    expect(refunds.getAttribute("href")).toBe("/admin/training/refunds");
    expect(refunds.textContent).toContain("3");

    const chips = screen.getByRole("navigation", { name: "Filter programmes by status" });
    expect(within(chips).getAllByRole("link").map((a) => a.textContent)).toEqual(["All2", "Published1", "Draft1"]);
    expect(screen.getByRole("link", { name: /Enrollments CSV/ }).getAttribute("href")).toBe("/api/admin/exports/training-enrollments");

    const fullStack = screen.getByText("Full-Stack Web").closest("li")!;
    expect(fullStack.textContent).toContain("₹4,999");
    expect(fullStack.textContent).toContain("8 weeks");
    expect(fullStack.textContent).toContain("2 open of 3 batches");
    expect(fullStack.textContent).toContain("15 students");
    expect(fullStack.textContent).toContain("Next batch 10 Jan 2027");
    expect(within(fullStack).getByRole("link", { name: /Live/ }).getAttribute("href")).toBe("/training/p1");
    const draft = screen.getByText("UI Design").closest("li")!;
    expect(within(draft).queryByRole("link", { name: /Live/ })).toBeNull();
    expect(within(draft).getByRole("link", { name: "Manage" }).getAttribute("href")).toBe("/admin/training/p2");
  });

  it("filters by status from the URL", () => {
    render(<TrainingOverviewView overview={overview} status="DRAFT" />);
    const list = screen.getByRole("list", { name: "Programmes" });
    expect(list.querySelectorAll(":scope > li")).toHaveLength(1);
    expect(parseProgramStatusFilter("ARCHIVED")).toBe("ARCHIVED");
    expect(parseProgramStatusFilter("nope")).toBeNull();
  });
});

describe("BatchManager", () => {
  const batch: BatchRow = {
    id: "b1",
    name: "January 2027",
    startDate: "2027-01-10",
    firstClassAt: "2027-01-10T19:00",
    endDate: "2027-03-07",
    scheduleText: "Mon, Wed, Fri, 7–9 pm",
    seats: 30,
    enrollmentDeadline: "2027-01-05",
    status: "UPCOMING",
    enrollments: 12,
  };

  it("formats India dates without shifting them", () => {
    expect(formatDateKey("2027-01-10")).toBe("10 Jan 2027");
    expect(formatLocalDateTime("2027-01-10T19:00")).toMatch(/10 Jan, 7:00\s?pm/i);
  });

  it("shows each batch with its dates, schedule, status and seats taken", () => {
    render(<BatchManager programId="p1" programSlug="full-stack" batches={[batch]} />);
    const row = screen.getAllByText("January 2027")[0].closest("li")!;
    expect(row.textContent).toContain("Upcoming");
    expect(row.textContent).toContain("Starts 10 Jan 2027 · ends 7 Mar 2027");
    expect(row.textContent).toContain("Enrol by 5 Jan 2027");
    expect(row.textContent).toContain("Mon, Wed, Fri, 7–9 pm");
    const meter = within(row).getByRole("meter", { name: "Seats taken" });
    expect(meter.getAttribute("aria-valuenow")).toBe("12");
    expect(meter.getAttribute("aria-valuemax")).toBe("30");
    expect(within(row).getByRole("link", { name: /Learning area/ }).getAttribute("href")).toBe("/admin/training/batches/b1");
  });

  it("opens a labelled batch form", () => {
    render(<BatchManager programId="p1" programSlug="full-stack" batches={[]} />);
    fireEvent.click(screen.getByRole("button", { name: "Add batch" }));
    for (const label of ["Batch name", "Status", "Seats", "Start date", "First live class (IST) (optional)", "End date (optional)", "Last date to enrol (optional)", "Schedule (optional)"]) {
      expect(screen.getByLabelText(label)).toBeTruthy();
    }
  });
});

describe("TrainingProgramForm", () => {
  it("has labelled controls, status tiles and no description lines", () => {
    const { container } = render(<TrainingProgramForm tracks={[{ id: "t1", name: "Software Engineering" }]} />);
    expect(container.querySelectorAll("p")).toHaveLength(0);
    for (const label of ["Programme title", "URL slug", "Track (optional)", "Fee", "Duration", "Summary", "Description", "Prerequisites (optional)", "Learning outcomes (optional)"]) {
      expect(screen.getByLabelText(label)).toBeTruthy();
    }
    expect((screen.getByRole("radio", { name: "Draft" }) as HTMLInputElement).checked).toBe(true);
    fireEvent.click(screen.getByRole("radio", { name: "Published" }));
    expect((screen.getByRole("radio", { name: "Published" }) as HTMLInputElement).checked).toBe(true);
    expect(screen.getByRole("link", { name: "Cancel" }).getAttribute("href")).toBe("/admin/training");
  });

  it("fills the slug from the title and adds and removes syllabus weeks", () => {
    render(<TrainingProgramForm tracks={[]} />);
    fireEvent.change(screen.getByLabelText("Programme title"), { target: { value: "Data & Analytics Bootcamp" } });
    expect((screen.getByLabelText("URL slug") as HTMLInputElement).value).toBe("data-analytics-bootcamp");
    fireEvent.click(screen.getByRole("button", { name: "Add week" }));
    expect(screen.getByLabelText("Week 2 title")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Remove week 1" }));
    expect(screen.queryByLabelText("Week 2 title")).toBeNull();
    expect(screen.getByLabelText("Week 1 title")).toBeTruthy();
  });
});

describe("portal header for training pages", () => {
  it.each([
    ["/admin/training", "Industrial Training", "New Programme", "/admin/training/new"],
    ["/admin/training/new", "New Programme", "Back to Training", "/admin/training"],
    ["/admin/training/7d23e9d4-3c44-47a5-9941-8c9ac36b0886", "Manage Programme", "Back to Training", "/admin/training"],
    ["/admin/training/refunds", "Training Refunds", "Back to Training", "/admin/training"],
  ])("%s → %s", (pathname, label, actionLabel, href) => {
    const meta = resolveRouteMeta(pathname);
    expect(meta?.label).toBe(label);
    expect(meta?.action).toMatchObject({ label: actionLabel, href });
  });
});
