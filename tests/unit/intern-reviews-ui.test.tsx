import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

// ---------------------------------------------------------------------------
// Intern Reviews: summary cards, view chips, review and decision cards, and the outcome dialog.
// ---------------------------------------------------------------------------

const { actions, toastSuccess, onClose } = vi.hoisted(() => ({
  actions: { recordInternReviewOutcomeAction: vi.fn() },
  toastSuccess: vi.fn(),
  onClose: vi.fn(),
}));
vi.mock("@/features/employees/actions", () => actions);
vi.mock("@/components/ui/toast", () => ({ toast: { success: toastSuccess, info: vi.fn(), error: vi.fn() } }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }), redirect: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: {} }));

import { ReviewBoardBody, reviewCountdown } from "@/features/employees/components/intern-reviews-view";
import { RecordReviewOutcomePanel } from "@/features/employees/components/record-review-outcome-panel";
import type { InternReviewBoard, InternReviewItem } from "@/features/employees/types";

const PATHS = { self: "/admin/intern-reviews", employees: "/admin/employees" };
const TODAY = "2026-11-21";

function item(overrides: Partial<InternReviewItem> = {}): InternReviewItem {
  return {
    id: "r1",
    employeeId: "e1",
    employeeCode: "GARA-EMP-0004",
    internName: "Test Intern One",
    internEmail: "intern@example.test",
    designation: "Software Engineering Intern",
    department: "Engineering",
    employeeStatus: "ACTIVE",
    employmentType: "INTERN",
    periodStartDate: new Date("2026-08-21T00:00:00.000Z"),
    reviewPeriodMonths: 3,
    scheduledFor: new Date("2026-11-18T00:00:00.000Z"),
    status: "SCHEDULED",
    dueState: "OVERDUE",
    outcome: null,
    decidedAt: null,
    reviewerName: null,
    sharedSummary: null,
    internalNotes: null,
    proposedDesignation: null,
    proposedDepartment: null,
    proposedEffectiveDate: null,
    proposedInitialStatus: null,
    offerStatus: null,
    offerRespondedAt: null,
    convertedAt: null,
    ...overrides,
  };
}

function board(overrides: Partial<InternReviewBoard> = {}): InternReviewBoard {
  return {
    view: "due",
    items: [item()],
    total: 1,
    page: 1,
    pageSize: 20,
    pageCount: 1,
    counts: { overdue: 1, dueThisWeek: 2, upcoming: 4, decided: 3 },
    canRecord: true,
    ...overrides,
  };
}

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("reviewCountdown", () => {
  it("says how far the review day is from today", () => {
    expect(reviewCountdown(new Date("2026-11-21T00:00:00.000Z"), TODAY)).toBe("today");
    expect(reviewCountdown(new Date("2026-11-22T00:00:00.000Z"), TODAY)).toBe("tomorrow");
    expect(reviewCountdown(new Date("2026-11-25T00:00:00.000Z"), TODAY)).toBe("in 4 days");
    expect(reviewCountdown(new Date("2026-11-20T00:00:00.000Z"), TODAY)).toBe("1 day overdue");
    expect(reviewCountdown(new Date("2026-11-18T00:00:00.000Z"), TODAY)).toBe("3 days overdue");
  });
});

describe("ReviewBoardBody", () => {
  it("shows the summary cards linking to each view and the chips with counts", () => {
    render(<ReviewBoardBody board={board()} paths={PATHS} todayKey={TODAY} />);
    const cards = screen.getByRole("group", { name: "Review summary" });
    expect(within(cards).getByRole("link", { name: /Overdue/ }).getAttribute("href")).toBe("/admin/intern-reviews?view=overdue");
    expect(within(cards).getByRole("link", { name: /Decisions/ }).getAttribute("href")).toBe("/admin/intern-reviews?view=decided");
    const chips = screen.getByRole("navigation", { name: "Review views" });
    expect(within(chips).getByRole("link", { name: /Due now/ }).textContent).toContain("3");
  });

  it("shows a scheduled review with its day, countdown, joining day and the record button", () => {
    render(<ReviewBoardBody board={board()} paths={PATHS} todayKey={TODAY} />);
    const card = within(screen.getByRole("list", { name: "Due now reviews" })).getAllByRole("listitem")[0];
    expect(within(card).getByRole("link", { name: "Test Intern One" }).getAttribute("href")).toBe("/admin/employees/e1");
    expect(card.textContent).toContain("Review 18 Nov 2026");
    expect(card.textContent).toContain("3 days overdue");
    expect(card.textContent).toContain("3-month review");
    expect(card.textContent).toContain("Joined 21 Aug 2026");
    expect(within(card).getByRole("button", { name: /Record review outcome/ })).toBeTruthy();
  });

  it("hides the record button and record links from staff who cannot record", () => {
    render(<ReviewBoardBody board={board({ canRecord: false })} paths={PATHS} todayKey={TODAY} />);
    const card = within(screen.getByRole("list", { name: "Due now reviews" })).getAllByRole("listitem")[0];
    expect(within(card).queryByRole("button")).toBeNull();
    expect(within(card).queryByRole("link")).toBeNull();
  });

  it("shows a decision with the full-time offer, both notes and the pending exit", () => {
    const decided = [
      item({
        id: "r2",
        status: "COMPLETED",
        dueState: null,
        outcome: "CONVERT",
        decidedAt: new Date("2026-11-20T06:00:00.000Z"),
        reviewerName: "Test HR",
        proposedDesignation: "Software Engineer",
        proposedDepartment: "Engineering",
        proposedEffectiveDate: new Date("2026-12-01T00:00:00.000Z"),
        proposedInitialStatus: "PROBATION",
        offerStatus: "PENDING",
        sharedSummary: "Great work",
        internalNotes: "Strong candidate",
      }),
      item({ id: "r3", status: "COMPLETED", dueState: null, outcome: "END_INTERNSHIP", decidedAt: new Date("2026-11-19T06:00:00.000Z") }),
    ];
    render(<ReviewBoardBody board={board({ view: "decided", items: decided, total: 2 })} paths={PATHS} todayKey={TODAY} />);
    const list = screen.getByRole("list", { name: "Decisions reviews" });
    const [convert, end] = Array.from(list.children) as HTMLElement[];
    expect(convert.textContent).toContain("Offer full-time role");
    expect(convert.textContent).toContain("Awaiting the intern's answer");
    expect(convert.textContent).toContain("Software Engineer");
    expect(convert.textContent).toContain("1 Dec 2026");
    expect(convert.textContent).toContain("Probation");
    expect(convert.textContent).toContain("Decided 20 Nov 2026 by Test HR");
    expect(convert.textContent).toContain("Great work");
    expect(convert.textContent).toContain("Strong candidate");
    expect(within(end).getByRole("link", { name: /Process exit/ }).getAttribute("href")).toBe("/admin/employees/e1?tab=exit#employee-administration");
  });

  it("shows a short empty state with no explanation line", () => {
    render(<ReviewBoardBody board={board({ view: "upcoming", items: [], total: 0 })} paths={PATHS} todayKey={TODAY} />);
    expect(screen.getByText("No upcoming reviews")).toBeTruthy();
    expect(screen.queryByText(/Reviews are scheduled when/)).toBeNull();
  });
});

describe("RecordReviewOutcomePanel", () => {
  const props = {
    open: true,
    onClose,
    reviewId: "11111111-1111-4111-8111-111111111111",
    internName: "Test Intern One",
    defaultDesignation: "Software Engineering Intern",
    defaultDepartment: "Engineering",
    todayKey: TODAY,
  };

  it("offers the three outcomes as tiles without explanation lines", () => {
    render(<RecordReviewOutcomePanel {...props} />);
    expect(screen.getAllByRole("radio", { hidden: true }).slice(0, 3).map((radio) => radio.closest("label")?.textContent)).toEqual([
      "Offer full-time role",
      "Extend internship",
      "End internship",
    ]);
    expect(screen.queryByText(/Creates a full-time offer/)).toBeNull();
    expect(screen.queryByText(/Shown to the intern in their workspace/)).toBeNull();
  });

  it("asks for the offer details and sends them", async () => {
    actions.recordInternReviewOutcomeAction.mockResolvedValue({ success: true, data: { nextReviewDate: null } });
    render(<RecordReviewOutcomePanel {...props} />);
    fireEvent.click(screen.getByRole("radio", { name: "Offer full-time role", hidden: true }));
    fireEvent.click(screen.getByRole("button", { name: "Record outcome", hidden: true }));
    expect(screen.getByText("Choose the date the full-time role starts")).toBeTruthy();
    expect(actions.recordInternReviewOutcomeAction).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Full-time designation"), { target: { value: "Software Engineer" } });
    fireEvent.change(screen.getByLabelText("Effective date"), { target: { value: "2026-12-01" } });
    fireEvent.click(screen.getByRole("radio", { name: "Probation", hidden: true }));
    fireEvent.change(screen.getByLabelText(/Summary shared with the intern/), { target: { value: "Great work" } });
    fireEvent.click(screen.getByRole("button", { name: "Record outcome", hidden: true }));
    await waitFor(() => expect(actions.recordInternReviewOutcomeAction).toHaveBeenCalled());
    const form = actions.recordInternReviewOutcomeAction.mock.calls[0][0] as FormData;
    expect(Object.fromEntries(form.entries())).toMatchObject({
      outcome: "CONVERT",
      proposedDesignation: "Software Engineer",
      proposedDepartment: "Engineering",
      effectiveDate: "2026-12-01",
      initialStatus: "PROBATION",
      sharedSummary: "Great work",
    });
    // The board refresh removes the dialog with its card, so the confirmation is a toast.
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith("Full-time offer sent to Test Intern One."));
    expect(onClose).toHaveBeenCalled();
  });

  it("confirms an extension with the next review day", async () => {
    actions.recordInternReviewOutcomeAction.mockResolvedValue({ success: true, data: { nextReviewDate: "2027-02-21T00:00:00.000Z" } });
    render(<RecordReviewOutcomePanel {...props} />);
    fireEvent.click(screen.getByRole("radio", { name: "Extend internship", hidden: true }));
    fireEvent.click(screen.getByRole("radio", { name: "3 months", hidden: true }));
    fireEvent.click(screen.getByRole("button", { name: "Record outcome", hidden: true }));
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith("Internship extended. Next review on 21 Feb 2027."));
    expect((actions.recordInternReviewOutcomeAction.mock.calls[0][0] as FormData).get("nextReviewAfterMonths")).toBe("3");
  });
});
