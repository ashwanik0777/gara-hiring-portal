import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

// ---------------------------------------------------------------------------
// Ambassador payouts: an administrator decides which commissions to pay. Approve covers only
// the ticked enrollments, declining needs a reason, and only approved ones offer payment.
// ---------------------------------------------------------------------------

const { reviewAction, payAction, recordAction, refresh } = vi.hoisted(() => ({
  reviewAction: vi.fn(),
  payAction: vi.fn(),
  recordAction: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }));
vi.mock("@/features/ambassadors/actions", () => ({
  reviewCommissionsAction: reviewAction,
  payViaRazorpayXAction: payAction,
  recordManualPayoutAction: recordAction,
}));

import { CommissionReviewCard } from "@/features/ambassadors/components/payout-review";
import type { PayoutAmbassadorGroup } from "@/features/ambassadors/services/commission-service";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const group: PayoutAmbassadorGroup = {
  ambassador: { id: "amb-1", name: "Rahul Kumar", email: "r@example.test", college: "NIT Calicut", upiIdMasked: "ra•••@okaxis", status: "APPROVED" },
  amountPaise: 20_000,
  commissions: [
    { id: "c1", amountPaise: 10_000, createdAt: new Date("2027-01-05T06:00:00Z"), payableAt: new Date("2027-01-11T13:30:00Z"), reviewedAt: null, reviewNote: null, student: "Asha", programme: "Full-Stack", batch: "January" },
    { id: "c2", amountPaise: 10_000, createdAt: new Date("2027-01-06T06:00:00Z"), payableAt: new Date("2027-01-11T13:30:00Z"), reviewedAt: null, reviewNote: "Duplicate account", student: "Vikram", programme: "Full-Stack", batch: "January" },
  ],
};

describe("CommissionReviewCard", () => {
  it("approves only the ticked enrollments", async () => {
    reviewAction.mockResolvedValue({ success: true, data: { count: 1, amountPaise: 10_000 } });
    render(<CommissionReviewCard group={group} mode="review" />);
    fireEvent.click(screen.getByRole("checkbox", { name: /Vikram/ }));
    const approve = screen.getByRole("button", { name: /Approve ₹100/ });
    await act(async () => {
      fireEvent.click(approve);
    });
    await waitFor(() => expect(reviewAction).toHaveBeenCalledWith({ ambassadorId: "amb-1", commissionIds: ["c1"], decision: "APPROVE", note: "" }));
    expect(refresh).toHaveBeenCalled();
  });

  it("needs a reason before declining", async () => {
    reviewAction.mockResolvedValue({ success: true, data: { count: 2, amountPaise: 20_000 } });
    render(<CommissionReviewCard group={group} mode="review" />);
    fireEvent.click(screen.getByRole("button", { name: /^Decline/ }));
    const confirm = screen.getByRole("button", { name: "Confirm decline" });
    expect((confirm as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "Referrals were not genuine" } });
    expect((confirm as HTMLButtonElement).disabled).toBe(false);
    await act(async () => {
      fireEvent.click(confirm);
    });
    await waitFor(() => expect(reviewAction).toHaveBeenCalledWith(expect.objectContaining({ decision: "DECLINE", note: "Referrals were not genuine", commissionIds: ["c1", "c2"] })));
  });

  it("shows the decision error and does not refresh", async () => {
    reviewAction.mockResolvedValue({ success: false, error: "Some of these enrollments can no longer be decided." });
    render(<CommissionReviewCard group={group} mode="review" />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Approve/ }));
    });
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("offers payment only for approved commissions", () => {
    const { unmount } = render(<CommissionReviewCard group={group} mode="review" />);
    expect(screen.queryByRole("button", { name: /via RazorpayX/ })).toBeNull();
    unmount();
    render(<CommissionReviewCard group={group} mode="approved" payment={{ canUseRazorpayX: false, razorpayXReason: "RazorpayX not configured" }} />);
    expect((screen.getByRole("button", { name: /Pay ₹200 via RazorpayX/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("RazorpayX not configured")).toBeTruthy();
    expect(screen.getByText("Record a bank transfer")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Approve/ })).toBeNull();
  });

  it("lets a declined commission be approved later and shows its reason", () => {
    render(<CommissionReviewCard group={group} mode="declined" />);
    expect(screen.getByText("Reason: Duplicate account")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Approve/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Decline/ })).toBeNull();
  });

  it("has no decisions while the refund window is open", () => {
    render(<CommissionReviewCard group={group} mode="waiting" />);
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });
});
