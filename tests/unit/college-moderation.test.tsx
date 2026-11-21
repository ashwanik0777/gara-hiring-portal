import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

// ---------------------------------------------------------------------------
// Admin colleges: search, one-click approval, editing and merging duplicates (two clicks).
// ---------------------------------------------------------------------------

const { updateAction, mergeAction, refresh } = vi.hoisted(() => ({ updateAction: vi.fn(), mergeAction: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }));
vi.mock("@/features/colleges/actions", () => ({ updateCollegeAction: updateAction, mergeCollegesAction: mergeAction }));

import { CollegeModeration, type CollegeRow } from "@/features/colleges/components/college-moderation";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const COLLEGES: CollegeRow[] = [
  { id: "c1", name: "NIT Calicut", city: "Kozhikode", state: "Kerala", status: "APPROVED", students: 12, ambassadors: 2 },
  { id: "c2", name: "Nit calicut ", city: null, state: null, status: "PENDING", students: 1, ambassadors: 0 },
  { id: "c3", name: "IIT Madras", city: "Chennai", state: "Tamil Nadu", status: "APPROVED", students: 4, ambassadors: 1 },
];

const row = (name: string) => screen.getAllByText(name)[0].closest("li")!;

describe("CollegeModeration", () => {
  it("lists each college with its place, students and ambassadors, and searches by place", () => {
    render(<CollegeModeration colleges={COLLEGES} all={COLLEGES} />);
    const nit = row("NIT Calicut");
    expect(nit.textContent).toContain("Kozhikode, Kerala");
    expect(nit.textContent).toContain("12 students");
    expect(nit.textContent).toContain("2 ambassadors");
    expect(row("Nit calicut").textContent).toContain("Place not set");
    fireEvent.change(screen.getByRole("searchbox", { name: "Search colleges" }), { target: { value: "tamil" } });
    expect(within(screen.getByRole("list", { name: "Colleges" })).getAllByRole("listitem").filter((li) => li.parentElement?.getAttribute("aria-label") === "Colleges")).toHaveLength(1);
    expect(screen.getAllByText("IIT Madras").length).toBeGreaterThan(0);
    expect(screen.queryAllByText("NIT Calicut")).toHaveLength(0);
  });

  it("approves a pending college in one click, as entered", async () => {
    updateAction.mockResolvedValue({ success: true });
    render(<CollegeModeration colleges={COLLEGES} all={COLLEGES} />);
    expect(within(row("NIT Calicut")).queryByRole("button", { name: /^Approve/ })).toBeNull();
    await act(async () => {
      fireEvent.click(within(row("Nit calicut")).getByRole("button", { name: /^Approve/ }));
    });
    await waitFor(() => expect(updateAction).toHaveBeenCalledWith({ id: "c2", name: "Nit calicut ", city: null, state: null, approve: true }));
    expect(refresh).toHaveBeenCalled();
  });

  it("edits and approves from the review panel", async () => {
    updateAction.mockResolvedValue({ success: true });
    render(<CollegeModeration colleges={COLLEGES} all={COLLEGES} />);
    fireEvent.click(within(row("Nit calicut")).getByRole("button", { name: /^Review/ }));
    fireEvent.change(screen.getByLabelText("College name"), { target: { value: "NIT Calicut (Main Campus)" } });
    fireEvent.change(screen.getByLabelText("City (optional)"), { target: { value: "Kozhikode" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Save and approve/ }));
    });
    await waitFor(() =>
      expect(updateAction).toHaveBeenCalledWith({ id: "c2", name: "NIT Calicut (Main Campus)", city: "Kozhikode", state: null, approve: true })
    );
  });

  it("merges a duplicate only after a second click, explaining what moves", async () => {
    mergeAction.mockResolvedValue({ success: true });
    render(<CollegeModeration colleges={COLLEGES} all={COLLEGES} />);
    fireEvent.click(within(row("Nit calicut")).getByRole("button", { name: /^Review/ }));
    fireEvent.change(screen.getByLabelText("Merge this duplicate into"), { target: { value: "c1" } });
    fireEvent.click(screen.getByRole("button", { name: "Merge" }));
    expect(mergeAction).not.toHaveBeenCalled();
    expect(screen.getByRole("status").textContent).toMatch(/1 student and 0 ambassadors move to NIT Calicut/);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Confirm merge" }));
    });
    await waitFor(() => expect(mergeAction).toHaveBeenCalledWith({ sourceId: "c2", targetId: "c1" }));
  });
});
