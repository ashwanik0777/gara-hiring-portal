import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { StrictMode } from "react";
import { Toaster, toast } from "@/components/ui/toast";
import { ToastOnMount } from "@/components/ui/toast-on-mount";

// ---------------------------------------------------------------------------
// App-wide toasts: confirmations appear top-right in a polite live region, disappear on
// their own or when dismissed, and never pile up.
// ---------------------------------------------------------------------------

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function clearAll() {
  for (const button of screen.queryAllByRole("button", { name: "Dismiss notification" })) fireEvent.click(button);
}

describe("toast", () => {
  it("shows a confirmation in a polite live region and removes it after a few seconds", () => {
    vi.useFakeTimers();
    render(<Toaster />);
    const region = screen.getByRole("region", { name: "Notifications" });
    expect(region.getAttribute("aria-live")).toBe("polite");
    act(() => {
      toast.success("Programme saved.");
    });
    expect(region.textContent).toContain("Success: Programme saved.");
    act(() => {
      vi.advanceTimersByTime(4100);
    });
    expect(region.textContent).not.toContain("Programme saved.");
  });

  it("can be dismissed and keeps at most four on screen", () => {
    render(<Toaster />);
    act(() => {
      for (let i = 1; i <= 6; i++) toast.info(`Notice ${i}`);
    });
    const region = screen.getByRole("region", { name: "Notifications" });
    expect(region.textContent).not.toContain("Notice 2");
    expect(region.textContent).toContain("Notice 6");
    expect(screen.getAllByRole("button", { name: "Dismiss notification" })).toHaveLength(4);
    fireEvent.click(screen.getAllByRole("button", { name: "Dismiss notification" })[0]);
    expect(screen.getAllByRole("button", { name: "Dismiss notification" })).toHaveLength(3);
    clearAll();
  });

  it("labels errors for screen readers", () => {
    render(<Toaster />);
    act(() => {
      toast.error("We couldn't reach the server.");
    });
    expect(screen.getByRole("region", { name: "Notifications" }).textContent).toContain("Error: We couldn't reach the server.");
    clearAll();
  });
});

describe("ToastOnMount", () => {
  it("shows its toast once, even in strict mode, and removes the query parameter", () => {
    window.history.replaceState(null, "", "/candidate/training?paid=1&tab=all");
    render(
      <StrictMode>
        <Toaster />
        <ToastOnMount message="Payment received." clearParam="paid" />
      </StrictMode>
    );
    const region = screen.getByRole("region", { name: "Notifications" });
    expect(region.textContent?.match(/Payment received\./g)).toHaveLength(1);
    expect(window.location.pathname + window.location.search).toBe("/candidate/training?tab=all");
    clearAll();
  });
});
